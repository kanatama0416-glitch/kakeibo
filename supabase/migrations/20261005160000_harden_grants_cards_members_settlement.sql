-- 2026-10-05 問題点修正
-- 1) 権限の整理：anon から家計テーブルの権限をすべて外し、authenticated からも
--    TRUNCATE / REFERENCES / TRIGGER を外す（TRUNCATE は RLS を通らないため）。
-- 2) カードの名前・下4桁の修正と、取込履歴のないカードの削除を許可する。
-- 3) メンバー（にゃち / うー）の対応表を private.allowed_users に持たせ、
--    コードにメールアドレスを書かずに表示名を引けるようにする。
-- 4) 精算額をDBでも再計算し、画面の金額と一致しない場合は記録しない。
-- 5) 運用開始（2026年10月）前のカード明細はDBでも受け付けない。

-- 1) grants -----------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings','audit_logs','cards','categories','import_batches',
    'initial_expenses','loans','merchant_rules','monthly_carryovers',
    'monthly_repayment_amounts','monthly_settlements','repayment_plans',
    'repayments','transactions'
  ] loop
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', t);
  end loop;
end;
$$;

revoke all on function public.kakeibo_mark_settlement_paid(date, integer, bigint, integer) from public, anon;
grant execute on function public.kakeibo_mark_settlement_paid(date, integer, bigint, integer) to authenticated;
revoke all on function public.kakeibo_undo_settlement_paid(date) from public, anon;
grant execute on function public.kakeibo_undo_settlement_paid(date) to authenticated;

-- 2) cards: rename / delete -------------------------------------------------
grant update (name, last4) on table public.cards to authenticated;
grant delete on table public.cards to authenticated;

drop policy if exists "authorized user cards update" on public.cards;
create policy "authorized user cards update"
  on public.cards for update to authenticated
  using ((select private.kakeibo_is_allowed()))
  with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user cards delete" on public.cards;
create policy "authorized user cards delete"
  on public.cards for delete to authenticated
  using ((select private.kakeibo_is_allowed()));

-- カード名の変更を取込済み明細の表示にも反映する。
create or replace function private.kakeibo_sync_card_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.transactions
       set card_label = new.name
     where card_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.kakeibo_sync_card_label() from public, anon, authenticated;

drop trigger if exists kakeibo_sync_card_label on public.cards;
create trigger kakeibo_sync_card_label
after update of name on public.cards
for each row execute function private.kakeibo_sync_card_label();

drop trigger if exists kakeibo_audit_row_changes on public.cards;
create trigger kakeibo_audit_row_changes
after insert or update or delete on public.cards
for each row execute function private.kakeibo_capture_audit();

-- 3) members ------------------------------------------------------------------
alter table private.allowed_users
  add column if not exists member_key text,
  add column if not exists display_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'allowed_users_member_key_check'
      and conrelid = 'private.allowed_users'::regclass
  ) then
    alter table private.allowed_users
      add constraint allowed_users_member_key_check
      check (member_key is null or member_key in ('me','partner'));
  end if;
end;
$$;

create unique index if not exists allowed_users_member_key_uidx
  on private.allowed_users (member_key)
  where member_key is not null and active = true;

create or replace function public.kakeibo_members()
returns table (member_key text, display_name text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.member_key, a.display_name, lower(a.email)
  from private.allowed_users a
  where a.active = true
    and a.member_key is not null
    and private.kakeibo_is_allowed()
  order by a.member_key;
$$;
revoke all on function public.kakeibo_members() from public, anon;
grant execute on function public.kakeibo_members() to authenticated;

-- 4) settlement recalculation ------------------------------------------------
-- app.js の calculateSummary() と同じ計算。JS の Math.round(x) は floor(x + 0.5)。
create or replace function private.kakeibo_living_current(p_month date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with share as (
    select coalesce((select me_share_percent from public.app_settings where id = 1), 50) as pct
  ), tx as (
    select
      coalesce(sum(t.amount), 0)::numeric as total,
      coalesce(sum(t.amount) filter (where t.payer = 'me'), 0)::numeric as paid_by_me
    from public.transactions t
    where t.is_demo = false
      and t.scope = 'shared'
      and t.status in ('confirmed','refunded')
      and date_trunc('month', t.transaction_date)::date = p_month
  )
  select (tx.paid_by_me - floor(tx.total * share.pct / 100.0 + 0.5))::integer
  from tx, share;
$$;

create or replace function private.kakeibo_effective_carry_out(p_month date)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month date := date '2026-10-01';
  v_carry_in integer := 0;
  v_settlement integer;
  v_raw integer;
  v_out integer := 0;
begin
  if p_month < date '2026-10-01' then
    return 0;
  end if;

  while v_month <= p_month loop
    v_settlement := private.kakeibo_living_current(v_month) + v_carry_in;
    select c.amount into v_raw
      from public.monthly_carryovers c
     where c.category = 'living' and c.from_month = v_month;

    if v_raw is null or v_raw = 0 or v_settlement = 0
       or sign(v_raw) <> sign(v_settlement) then
      v_out := 0;
    else
      v_out := sign(v_settlement)::integer * least(abs(v_raw), abs(v_settlement));
    end if;

    v_carry_in := v_out;
    v_raw := null;
    v_month := (v_month + interval '1 month')::date;
  end loop;

  return v_out;
end;
$$;

create or replace function private.kakeibo_settlement_breakdown(p_month date)
returns table (
  plan_id bigint,
  repayment_amount integer,
  final_amount integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_carry_in integer := 0;
  v_living_pay_now integer;
  v_plan public.repayment_plans%rowtype;
  v_recorded integer;
  v_setting integer;
  v_monthly integer;
  v_original integer;
  v_repaid_before integer;
  v_repayment integer := 0;
  v_has_plan boolean := false;
begin
  if not private.kakeibo_is_allowed() then
    raise exception 'KAKEIBO_NOT_ALLOWED';
  end if;

  if v_month > date '2026-10-01' then
    v_carry_in := private.kakeibo_effective_carry_out((v_month - interval '1 month')::date);
  end if;

  v_living_pay_now := private.kakeibo_living_current(v_month)
    + v_carry_in
    - private.kakeibo_effective_carry_out(v_month);

  select * into v_plan
    from public.repayment_plans
   where is_demo = false
   order by id
   limit 1;
  v_has_plan := found;

  if v_has_plan and v_month >= date '2026-10-01' then
    select r.amount into v_recorded
      from public.repayments r
     where r.repayment_plan_id = v_plan.id
       and r.repayment_month = v_month
       and r.is_demo = false
     limit 1;

    if v_recorded is not null then
      v_repayment := v_recorded;
    else
      select m.amount into v_setting
        from public.monthly_repayment_amounts m
       where m.repayment_plan_id = v_plan.id
         and m.repayment_month = v_month;

      v_monthly := greatest(0, coalesce(v_setting, v_plan.monthly_amount, 0));
      v_original := greatest(0, coalesce(v_plan.original_amount, 0));

      if v_monthly > 0 and v_original > 0 then
        select coalesce(sum(r.amount), 0)::integer into v_repaid_before
          from public.repayments r
         where r.repayment_plan_id = v_plan.id
           and r.is_demo = false
           and r.repayment_month < v_month;
        v_repayment := least(v_monthly, greatest(0, v_original - v_repaid_before));
      end if;
    end if;
  end if;

  plan_id := case when v_has_plan then v_plan.id else null end;
  repayment_amount := v_repayment;
  final_amount := v_living_pay_now
    + case when v_plan.lender = 'me' then v_repayment else -v_repayment end;
  return next;
end;
$$;

revoke all on function private.kakeibo_living_current(date) from public, anon, authenticated;
revoke all on function private.kakeibo_effective_carry_out(date) from public, anon, authenticated;
revoke all on function private.kakeibo_settlement_breakdown(date) from public, anon;
grant execute on function private.kakeibo_settlement_breakdown(date) to authenticated;

create or replace function public.kakeibo_mark_settlement_paid(
  p_settlement_month date,
  p_settlement_amount integer,
  p_plan_id bigint,
  p_repayment_amount integer
)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_settlement_id bigint;
  v_repayment_id bigint;
  v_actual_repayment integer := 0;
  v_month date := date_trunc('month', p_settlement_month)::date;
  v_current_month date :=
    date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;
  v_expected record;
begin
  if not private.kakeibo_is_allowed() then
    raise exception 'KAKEIBO_NOT_ALLOWED';
  end if;

  if v_month < date '2026-10-01' then
    raise exception 'OPERATION_NOT_STARTED';
  end if;

  if v_month >= v_current_month then
    raise exception 'FUTURE_SETTLEMENT_NOT_ALLOWED';
  end if;

  -- 二人が同時に操作しても、再計算と記録の間に明細が変わらないようにする。
  perform pg_advisory_xact_lock(hashtext('kakeibo_settlement'));

  select * into v_expected from private.kakeibo_settlement_breakdown(v_month);

  if coalesce(p_settlement_amount, 0) <> v_expected.final_amount
     or coalesce(p_repayment_amount, 0) <> v_expected.repayment_amount then
    raise exception 'SETTLEMENT_AMOUNT_MISMATCH'
      using detail = format(
        'client=%s/%s server=%s/%s',
        coalesce(p_settlement_amount, 0), coalesce(p_repayment_amount, 0),
        v_expected.final_amount, v_expected.repayment_amount
      );
  end if;

  insert into public.monthly_settlements (
    settlement_month, amount, paid_at, updated_at
  )
  values (v_month, v_expected.final_amount, now(), now())
  on conflict (settlement_month) do nothing
  returning id into v_settlement_id;

  if v_settlement_id is null then
    return;
  end if;

  if v_expected.plan_id is not null and v_expected.repayment_amount > 0 then
    select least(v_expected.repayment_amount, remaining_amount)
      into v_actual_repayment
    from public.repayment_plans
    where id = v_expected.plan_id
      and is_demo = false
    for update;

    if coalesce(v_actual_repayment, 0) > 0 then
      insert into public.repayments (
        repayment_plan_id, repayment_date, repayment_month, amount, is_demo
      )
      values (
        v_expected.plan_id,
        (now() at time zone 'Asia/Tokyo')::date,
        v_month,
        v_actual_repayment,
        false
      )
      on conflict (repayment_plan_id, repayment_month) do nothing
      returning id into v_repayment_id;

      if v_repayment_id is not null then
        update public.repayment_plans
        set remaining_amount = greatest(0, remaining_amount - v_actual_repayment)
        where id = v_expected.plan_id
          and is_demo = false;
      end if;
    end if;
  end if;
end;
$$;

revoke all on function public.kakeibo_mark_settlement_paid(date, integer, bigint, integer) from public, anon;
grant execute on function public.kakeibo_mark_settlement_paid(date, integer, bigint, integer) to authenticated;

-- 5) pre-operation card statements ---------------------------------------
alter table public.transactions
  drop constraint if exists transactions_card_import_after_start_check;
alter table public.transactions
  add constraint transactions_card_import_after_start_check
  check (source not in ('csv','pdf') or transaction_date >= date '2026-10-01');

-- 利用月（分析）と精算月（お金）を分ける。
-- ・その月の分はその月末に精算できるようにする（当月の精算を許可、未来月は不可のまま）。
-- ・精算済みの月の明細が後から追加されたら、次の未精算月の精算に入れる（利用日はそのまま）。
-- ・精算済みのロックは精算月で判定する。

alter table public.transactions
  add column if not exists settlement_month date;

update public.transactions
   set settlement_month = date_trunc('month', transaction_date)::date
 where settlement_month is null;

alter table public.transactions
  alter column settlement_month set not null;

alter table public.transactions
  drop constraint if exists transactions_settlement_month_check;
alter table public.transactions
  add constraint transactions_settlement_month_check check (
    settlement_month = date_trunc('month', settlement_month)::date
    and settlement_month >= date_trunc('month', transaction_date)::date
  );

create index if not exists transactions_settlement_month_idx
  on public.transactions (settlement_month);

-- 利用日の月から見て最初の未精算月。lib/settlement.js の openSettlementMonth() と同じ判定。
create or replace function private.kakeibo_open_settlement_month(p_date date)
returns date
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_month date := date_trunc('month', p_date)::date;
  v_guard integer := 0;
begin
  while exists (
    select 1 from public.monthly_settlements s where s.settlement_month = v_month
  ) and v_guard < 240 loop
    v_month := (v_month + interval '1 month')::date;
    v_guard := v_guard + 1;
  end loop;
  return v_month;
end;
$function$;

revoke all on function private.kakeibo_open_settlement_month(date) from public, anon;

-- 精算月の決定と、精算済みの月のロック。
create or replace function private.kakeibo_guard_transaction_settlement()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- 精算処理（kakeibo_mark_settlement_paid）と同時に走っても、
  -- 精算済みの月に明細が紛れ込まないよう同じロックを取る。
  perform pg_advisory_xact_lock(hashtext('kakeibo_settlement'));

  if tg_op = 'INSERT' then
    -- 画面から送られた値は使わず、DB で決める。
    new.settlement_month := private.kakeibo_open_settlement_month(new.transaction_date);
    return new;
  elsif tg_op = 'DELETE' then
    if private.kakeibo_month_is_settled(old.settlement_month) then
      raise exception 'SETTLED_MONTH_LOCKED';
    end if;
    return old;
  end if;

  if old.transaction_date is distinct from new.transaction_date
     or old.amount is distinct from new.amount
     or old.scope is distinct from new.scope
     or old.payer is distinct from new.payer
     or old.status is distinct from new.status
     or old.me_share_amount is distinct from new.me_share_amount then
    if private.kakeibo_month_is_settled(old.settlement_month) then
      raise exception 'SETTLED_MONTH_LOCKED';
    end if;
  end if;

  -- 精算月は直接変更させない。利用日の月が変わったときだけ決め直す。
  if date_trunc('month', old.transaction_date) is distinct from date_trunc('month', new.transaction_date) then
    new.settlement_month := private.kakeibo_open_settlement_month(new.transaction_date);
  else
    new.settlement_month := old.settlement_month;
  end if;

  return new;
end;
$function$;

-- 精算額の計算を精算月で集計する（lib/settlement.js と同じ計算）。
create or replace function private.kakeibo_living_current(p_month date)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  with share as (
    select coalesce((select me_share_percent from public.app_settings where id = 1), 50) as pct
  ), tx as (
    select
      coalesce(sum(t.amount) filter (where t.scope = 'shared' and t.me_share_amount is null), 0)::numeric as default_total,
      coalesce(sum(t.me_share_amount) filter (where t.scope = 'shared' and t.me_share_amount is not null), 0)::numeric as custom_me_share,
      coalesce(sum(t.amount) filter (where t.scope = 'shared' and t.payer = 'me'), 0)::numeric as paid_by_me,
      coalesce(sum(t.amount) filter (where t.scope = 'advance' and t.payer = 'me'), 0)::numeric as advance_by_me,
      coalesce(sum(t.amount) filter (where t.scope = 'advance' and t.payer = 'partner'), 0)::numeric as advance_by_partner
    from public.transactions t
    where t.is_demo = false
      and t.scope in ('shared', 'advance')
      and t.status in ('confirmed','refunded')
      and t.settlement_month = p_month
  )
  select (
    tx.paid_by_me
    - floor(tx.default_total * share.pct / 100.0 + 0.5)
    - tx.custom_me_share
    + tx.advance_by_me - tx.advance_by_partner
  )::integer
  from tx, share;
$function$;

-- その月の分をその月末に精算できるようにする（未来月は不可）。
create or replace function public.kakeibo_mark_settlement_paid(p_settlement_month date, p_settlement_amount integer, p_plan_id bigint, p_repayment_amount integer)
returns void
language plpgsql
set search_path to 'public'
as $function$
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

  if v_month > v_current_month then
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
$function$;

-- Applied to production: 20260927101926_fix_ledger_integrity_and_rls

alter table public.transactions drop constraint if exists transactions_amount_check;
alter table public.transactions
  add constraint transactions_amount_check check (amount <> 0);

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source = any (array[
    'manual'::text,
    'epos_email'::text,
    'rakuten_email'::text,
    'csv'::text,
    'pdf'::text
  ]));

create unique index if not exists merchant_rules_live_name_ci_uidx
  on public.merchant_rules ((lower(btrim(merchant_name))))
  where is_demo = false;

create or replace function private.kakeibo_is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.allowed_users a
    where a.active = true
      and lower(a.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

revoke all on function private.kakeibo_is_allowed() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.kakeibo_is_allowed() to authenticated;

drop policy if exists "authorized user categories" on public.categories;
create policy "authorized user categories" on public.categories
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user merchant rules" on public.merchant_rules;
create policy "authorized user merchant rules" on public.merchant_rules
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user transactions" on public.transactions;
create policy "authorized user transactions" on public.transactions
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user loans" on public.loans;
create policy "authorized user loans" on public.loans
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user repayment plans" on public.repayment_plans;
create policy "authorized user repayment plans" on public.repayment_plans
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user repayments" on public.repayments;
create policy "authorized user repayments" on public.repayments
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user initial expenses" on public.initial_expenses;
create policy "authorized user initial expenses" on public.initial_expenses
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user monthly carryovers" on public.monthly_carryovers;
create policy "authorized user monthly carryovers" on public.monthly_carryovers
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user app settings" on public.app_settings;
create policy "authorized user app settings" on public.app_settings
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user monthly settlements" on public.monthly_settlements;
create policy "authorized user monthly settlements" on public.monthly_settlements
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user monthly repayment amounts" on public.monthly_repayment_amounts;
create policy "authorized user monthly repayment amounts" on public.monthly_repayment_amounts
for all to authenticated
using ((select private.kakeibo_is_allowed()))
with check ((select private.kakeibo_is_allowed()));

drop policy if exists "authorized user audit logs" on public.audit_logs;
create policy "authorized user audit logs" on public.audit_logs
for select to authenticated
using ((select private.kakeibo_is_allowed()));

create or replace function private.kakeibo_month_is_settled(p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.monthly_settlements s
    where s.settlement_month = date_trunc('month', p_date)::date
  );
$$;

revoke all on function private.kakeibo_month_is_settled(date)
from public, anon, authenticated;

create or replace function private.kakeibo_guard_transaction_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if private.kakeibo_month_is_settled(new.transaction_date) then
      raise exception 'SETTLED_MONTH_LOCKED';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if private.kakeibo_month_is_settled(old.transaction_date) then
      raise exception 'SETTLED_MONTH_LOCKED';
    end if;
    return old;
  end if;

  if old.transaction_date is distinct from new.transaction_date
     or old.amount is distinct from new.amount
     or old.scope is distinct from new.scope
     or old.payer is distinct from new.payer
     or old.status is distinct from new.status then
    if private.kakeibo_month_is_settled(old.transaction_date)
       or private.kakeibo_month_is_settled(new.transaction_date) then
      raise exception 'SETTLED_MONTH_LOCKED';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists kakeibo_guard_settled_transaction on public.transactions;
create trigger kakeibo_guard_settled_transaction
before insert or update or delete on public.transactions
for each row execute function private.kakeibo_guard_transaction_settlement();

create or replace function private.kakeibo_guard_carryover_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_month date;
  v_new_month date;
begin
  v_old_month := case when tg_op in ('UPDATE','DELETE') then old.from_month else null end;
  v_new_month := case when tg_op in ('UPDATE','INSERT') then new.from_month else null end;

  if (v_old_month is not null and private.kakeibo_month_is_settled(v_old_month))
     or (v_new_month is not null and private.kakeibo_month_is_settled(v_new_month)) then
    raise exception 'SETTLED_MONTH_LOCKED';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists kakeibo_guard_settled_carryover on public.monthly_carryovers;
create trigger kakeibo_guard_settled_carryover
before insert or update or delete on public.monthly_carryovers
for each row execute function private.kakeibo_guard_carryover_settlement();

create or replace function private.kakeibo_guard_repayment_setting_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_month date;
  v_new_month date;
begin
  v_old_month := case when tg_op in ('UPDATE','DELETE') then old.repayment_month else null end;
  v_new_month := case when tg_op in ('UPDATE','INSERT') then new.repayment_month else null end;

  if (v_old_month is not null and private.kakeibo_month_is_settled(v_old_month))
     or (v_new_month is not null and private.kakeibo_month_is_settled(v_new_month)) then
    raise exception 'SETTLED_MONTH_LOCKED';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists kakeibo_guard_settled_repayment_setting
on public.monthly_repayment_amounts;
create trigger kakeibo_guard_settled_repayment_setting
before insert or update or delete on public.monthly_repayment_amounts
for each row execute function private.kakeibo_guard_repayment_setting_settlement();

create or replace function private.kakeibo_recalculate_repayment_plan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_paid_by_me integer := 0;
  v_share integer := 50;
  v_my_share integer := 0;
  v_net integer := 0;
  v_original integer := 0;
  v_lender text;
  v_borrower text;
  v_plan public.repayment_plans%rowtype;
  v_repaid integer := 0;
begin
  select
    coalesce(sum(amount), 0)::integer,
    coalesce(sum(amount) filter (where payer = 'me'), 0)::integer
  into v_total, v_paid_by_me
  from public.initial_expenses;

  select coalesce(me_share_percent, 50)
  into v_share
  from public.app_settings
  where id = 1;

  v_share := coalesce(v_share, 50);
  v_my_share := round(v_total * v_share / 100.0);
  v_net := v_paid_by_me - v_my_share;
  v_original := abs(v_net);
  v_lender := case when v_net >= 0 then 'me' else 'partner' end;
  v_borrower := case when v_net >= 0 then 'partner' else 'me' end;

  select *
  into v_plan
  from public.repayment_plans
  where is_demo = false
  order by id
  limit 1
  for update;

  if not found then
    insert into public.repayment_plans (
      title, original_amount, remaining_amount, monthly_amount,
      lender, borrower, is_demo
    )
    values (
      '立替金', v_original, v_original, 0,
      v_lender, v_borrower, false
    );
    return;
  end if;

  select coalesce(sum(amount), 0)::integer
  into v_repaid
  from public.repayments
  where repayment_plan_id = v_plan.id
    and is_demo = false;

  if v_repaid > 0
     and (
       v_plan.lender is distinct from v_lender
       or v_plan.borrower is distinct from v_borrower
     ) then
    raise exception 'REPAYMENT_DIRECTION_LOCKED';
  end if;

  if v_original < v_repaid then
    raise exception 'REPAYMENT_PRINCIPAL_BELOW_PAID';
  end if;

  update public.repayment_plans
  set original_amount = v_original,
      remaining_amount = greatest(0, v_original - v_repaid),
      lender = v_lender,
      borrower = v_borrower
  where id = v_plan.id
    and is_demo = false;
end;
$$;

revoke all on function private.kakeibo_recalculate_repayment_plan()
from public, anon, authenticated;

create or replace function private.kakeibo_sync_repayment_plan_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.kakeibo_recalculate_repayment_plan();
  return new;
end;
$$;

drop trigger if exists kakeibo_sync_repayment_plan_initial_expenses
on public.initial_expenses;
create trigger kakeibo_sync_repayment_plan_initial_expenses
after insert or update or delete on public.initial_expenses
for each statement execute function private.kakeibo_sync_repayment_plan_trigger();

drop trigger if exists kakeibo_sync_repayment_plan_app_settings
on public.app_settings;
create trigger kakeibo_sync_repayment_plan_app_settings
after insert or update of me_share_percent on public.app_settings
for each statement execute function private.kakeibo_sync_repayment_plan_trigger();

select private.kakeibo_recalculate_repayment_plan();

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
  v_actual_repayment integer := 0;
  v_month date := date_trunc('month', p_settlement_month)::date;
  v_current_month date :=
    date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;
begin
  if v_month < date '2026-10-01' then
    raise exception 'OPERATION_NOT_STARTED';
  end if;

  if v_month >= v_current_month then
    raise exception 'FUTURE_SETTLEMENT_NOT_ALLOWED';
  end if;

  insert into public.monthly_settlements (
    settlement_month, amount, paid_at, updated_at
  )
  values (v_month, p_settlement_amount, now(), now())
  on conflict (settlement_month) do nothing
  returning id into v_settlement_id;

  if v_settlement_id is null then
    return;
  end if;

  if p_plan_id is not null and coalesce(p_repayment_amount, 0) > 0 then
    select least(greatest(p_repayment_amount, 0), remaining_amount)
      into v_actual_repayment
    from public.repayment_plans
    where id = p_plan_id
      and is_demo = false
    for update;

    if coalesce(v_actual_repayment, 0) > 0 then
      insert into public.repayments (
        repayment_plan_id,
        repayment_date,
        repayment_month,
        amount,
        is_demo
      )
      values (
        p_plan_id,
        (now() at time zone 'Asia/Tokyo')::date,
        v_month,
        v_actual_repayment,
        false
      )
      on conflict (repayment_plan_id, repayment_month) do nothing;

      update public.repayment_plans
      set remaining_amount = greatest(0, remaining_amount - v_actual_repayment)
      where id = p_plan_id
        and is_demo = false;
    end if;
  end if;
end;
$$;

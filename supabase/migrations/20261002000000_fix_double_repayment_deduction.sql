-- Fix: kakeibo_mark_settlement_paid decremented repayment_plans.remaining_amount
-- even when the repayments insert was skipped by ON CONFLICT DO NOTHING
-- (a repayment row already existed for that month). That reduced the balance twice.
-- Now the balance is reduced only when a repayment row was actually inserted.

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
      on conflict (repayment_plan_id, repayment_month) do nothing
      returning id into v_repayment_id;

      if v_repayment_id is not null then
        update public.repayment_plans
        set remaining_amount = greatest(0, remaining_amount - v_actual_repayment)
        where id = p_plan_id
          and is_demo = false;
      end if;
    end if;
  end if;
end;
$$;

-- ワリカン式の分け方：共同（scope = 'shared'）の支出を、にゃちの負担額を指定して分けられるようにする。
-- me_share_amount が null の共同支出は従来どおり基本負担率で按分する（月の合計に対して丸める）。
-- me_share_amount を指定した共同支出は、にゃち = me_share_amount、うー = amount - me_share_amount を負担する。
-- 画面側の lib/settlement.js（splitBreakdown / livingCurrent）と同じ計算。

alter table public.transactions
  add column if not exists me_share_amount integer;

alter table public.transactions drop constraint if exists transactions_me_share_amount_check;
alter table public.transactions add constraint transactions_me_share_amount_check
  check (
    me_share_amount is null
    or (
      scope = 'shared'
      and me_share_amount between least(0, amount) and greatest(0, amount)
    )
  );

comment on column public.transactions.me_share_amount is
  '共同支出のうち、にゃち（member_key = me）の負担額。null は基本負担率で按分。';

create or replace function private.kakeibo_living_current(p_month date)
 returns integer
 language sql
 stable security definer
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
      and date_trunc('month', t.transaction_date)::date = p_month
  )
  select (
    tx.paid_by_me
    - floor(tx.default_total * share.pct / 100.0 + 0.5)
    - tx.custom_me_share
    + tx.advance_by_me - tx.advance_by_partner
  )::integer
  from tx, share;
$function$;

-- 精算済み月は分け方の変更もロックする。
create or replace function private.kakeibo_guard_transaction_settlement()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
     or old.status is distinct from new.status
     or old.me_share_amount is distinct from new.me_share_amount then
    if private.kakeibo_month_is_settled(old.transaction_date)
       or private.kakeibo_month_is_settled(new.transaction_date) then
      raise exception 'SETTLED_MONTH_LOCKED';
    end if;
  end if;

  return new;
end;
$function$;

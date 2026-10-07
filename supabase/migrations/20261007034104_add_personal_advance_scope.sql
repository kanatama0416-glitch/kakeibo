-- 個人間の立替（scope = 'advance'）を追加する。
-- 支払った人（payer）が相手の分を全額立て替えた明細で、その月の精算に全額を反映する。
-- 共同費の合計・負担額には含めない。画面側の lib/settlement.js（advanceBreakdown / livingCurrent）と同じ計算。

alter table public.transactions drop constraint if exists transactions_scope_check;
alter table public.transactions add constraint transactions_scope_check
  check (scope = any (array['shared'::text, 'mine'::text, 'partner'::text, 'advance'::text]));

-- 店舗ルール（merchant_rules_scope_check）は対象外のまま変更しない。

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
      coalesce(sum(t.amount) filter (where t.scope = 'shared'), 0)::numeric as total,
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
    tx.paid_by_me - floor(tx.total * share.pct / 100.0 + 0.5)
    + tx.advance_by_me - tx.advance_by_partner
  )::integer
  from tx, share;
$function$;

-- Applied to production: 20260927102705_fix_repayment_trigger_and_lock_share_history

create or replace function private.kakeibo_sync_repayment_plan_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.kakeibo_recalculate_repayment_plan();
  return null;
end;
$$;

create or replace function private.kakeibo_guard_share_setting_after_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.me_share_percent is distinct from new.me_share_percent
     and exists (select 1 from public.monthly_settlements) then
    raise exception 'SETTLED_HISTORY_SHARE_LOCKED';
  end if;
  return new;
end;
$$;

drop trigger if exists kakeibo_guard_share_setting_after_settlement
on public.app_settings;
create trigger kakeibo_guard_share_setting_after_settlement
before update of me_share_percent on public.app_settings
for each row execute function private.kakeibo_guard_share_setting_after_settlement();

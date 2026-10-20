-- 毎月の固定費：権限・RLS・変更履歴（20261020130013 の続き）

revoke all on table public.recurring_expenses from anon, authenticated;
-- last_generated_month は生成関数だけが進める（画面からは書き換えない）。
grant select, delete on table public.recurring_expenses to authenticated;
grant insert (name, amount, day_of_month, category_id, scope, payer, me_share_amount, memo, start_month, active)
  on table public.recurring_expenses to authenticated;
grant update (name, amount, day_of_month, category_id, scope, payer, me_share_amount, memo, active)
  on table public.recurring_expenses to authenticated;
grant usage, select on sequence public.recurring_expenses_id_seq to authenticated;

create policy "authorized user recurring expenses"
  on public.recurring_expenses for all to authenticated
  using ((select private.kakeibo_is_allowed()))
  with check ((select private.kakeibo_is_allowed()));

create trigger kakeibo_audit_row_changes
  after insert or delete or update on public.recurring_expenses
  for each row execute function private.kakeibo_capture_audit();

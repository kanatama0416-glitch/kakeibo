-- 2026-10-09: private の許可ユーザー一覧を多層防御する。
-- 本番 Supabase migration version 20261009101542 と同じ内容。
-- 一覧への直接アクセスは許さず、postgres 所有の SECURITY DEFINER
-- 関数 (private.kakeibo_is_allowed / private.nyachimaru_is_allowed 等)
-- による照合だけを継続する。RLS policy は意図的に作らない。

alter table private.allowed_users enable row level security;
alter table private.nyachimaru_allowed_users enable row level security;

revoke all on table private.allowed_users from public, anon, authenticated;
revoke all on table private.nyachimaru_allowed_users from public, anon, authenticated;

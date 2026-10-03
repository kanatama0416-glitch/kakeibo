-- Dedicated read-only RPC for scheduled Supabase activity.
-- It exposes no household data and only returns the current database timestamp.
create or replace function public.keepalive()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;

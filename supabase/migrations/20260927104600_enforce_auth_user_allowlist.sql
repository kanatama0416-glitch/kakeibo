-- Applied to production: enforce_auth_user_allowlist
-- Prevent creation of Auth users whose email is not active in private.allowed_users.

create or replace function private.kakeibo_enforce_auth_user_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from private.allowed_users a
    where a.active = true
      and lower(a.email) = lower(coalesce(new.email, ''))
  ) then
    raise exception 'KAKEIBO_EMAIL_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

revoke all on function private.kakeibo_enforce_auth_user_allowlist()
from public, anon, authenticated;

drop trigger if exists kakeibo_enforce_auth_user_allowlist on auth.users;
create trigger kakeibo_enforce_auth_user_allowlist
before insert on auth.users
for each row execute function private.kakeibo_enforce_auth_user_allowlist();

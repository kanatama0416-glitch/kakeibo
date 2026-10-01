-- authenticated users no longer need to read the allow-list directly.
-- private.kakeibo_is_allowed() is SECURITY DEFINER, so RLS checks keep working
-- without this grant, and the allowed email addresses are no longer readable via the API.

revoke select on private.allowed_users from authenticated;

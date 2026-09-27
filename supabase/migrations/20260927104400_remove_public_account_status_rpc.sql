-- Applied to production: remove_public_account_status_rpc
-- The frontend no longer probes allow-list/auth-user state before authentication.
-- Access to household data is enforced by authenticated RLS after sign-in.

drop function if exists public.kakeibo_account_status(text);

-- =====================================================================
-- invite-account-state.sql
-- Activation state of the auth account behind an invite email.
--
-- Why this exists: the team page can hand an admin a real Supabase
-- action link (one-time login link) for a pending invite, so onboarding
-- no longer depends on transactional email delivery. Such a link is a
-- bearer credential — whoever holds it lands inside that account — so the
-- backend may only ever issue one for an account that has never been
-- activated: no password set AND no sign-in on record. Such an account is
-- an empty shell whose only privilege is the pending invite itself.
--
-- Without this gate an admin could ask for a magic link for an existing
-- teammate's (or the owner's) email and take over their session, which is
-- straight privilege escalation. auth.users is not reachable through
-- PostgREST, hence this SECURITY DEFINER probe.
--
-- Consumer: netlify/functions/create-workspace-invite.ts (service role).
-- Idempotent: safe to run multiple times.
-- =====================================================================

create or replace function tosho.invite_account_state(_email text)
returns jsonb
language sql
stable
security definer
set search_path to 'tosho', 'public'
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'userId', u.id,
        'accountExists', true,
        -- "Activated" = the human has proven they hold this account.
        -- Either state alone is enough to refuse issuing a login link.
        'activated',
          (u.encrypted_password is not null and u.encrypted_password <> '')
          or u.last_sign_in_at is not null
      )
      from auth.users u
      where lower(u.email) = lower(_email)
      order by u.created_at asc
      limit 1
    ),
    jsonb_build_object('userId', null, 'accountExists', false, 'activated', false)
  );
$$;

comment on function tosho.invite_account_state(text) is
  'Activation state of the auth account for an email: {userId, accountExists, activated}. Gate for issuing invite login links — only never-activated accounts may get one. service_role only.';

-- Functions are executable by PUBLIC by default. Left open this would be an
-- account-enumeration oracle for anon, so lock it to the service role that
-- runs the invite function.
revoke all on function tosho.invite_account_state(text) from public;
revoke all on function tosho.invite_account_state(text) from anon;
revoke all on function tosho.invite_account_state(text) from authenticated;
grant execute on function tosho.invite_account_state(text) to service_role;

-- =====================================================================
-- employment-status-guard.sql
-- Make offboarding "sticky".
--
-- Problem: employment_status lives in team_member_profiles alongside the rest
-- of the profile. The generic profile upsert on the Team page
-- (upsertWorkspaceMemberProfile) sends employment_status from possibly-stale
-- client state, so a page reload / profile save / availability toggle could
-- resurrect a just-deactivated member back to 'active'.
--
-- Fix: a BEFORE UPDATE trigger that refuses to lift a member OUT of
-- 'inactive'/'rejected' when the write comes from the SPA (role=authenticated).
-- The dedicated reactivation path (netlify/functions/team-member-employment.ts)
-- runs as service_role and is allowed through, so "Повернути в штат" still works.
--
-- Idempotent.
-- =====================================================================

create or replace function tosho.guard_employment_status_resurrection()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.employment_status in ('inactive', 'rejected')
     and coalesce(new.employment_status, '') not in ('inactive', 'rejected')
     and current_user = 'authenticated'
  then
    -- A client tried to un-block an offboarded member via a generic profile
    -- write. Keep them blocked; only the service-role reactivation path may lift.
    new.employment_status := old.employment_status;
  end if;
  return new;
end;
$$;

comment on function tosho.guard_employment_status_resurrection() is
  'Prevents the SPA (authenticated role) from resurrecting an inactive/rejected member via a generic profile upsert. Service-role reactivation is unaffected.';

drop trigger if exists guard_employment_status_resurrection on tosho.team_member_profiles;
create trigger guard_employment_status_resurrection
  before update on tosho.team_member_profiles
  for each row
  execute function tosho.guard_employment_status_resurrection();

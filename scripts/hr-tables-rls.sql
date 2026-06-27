-- Close unauthenticated (anon) + non-admin read access to HR/PII tables.
-- Before: RLS OFF + GRANT SELECT to anon/authenticated => anyone with the public
--   anon key could read user_profiles / team_member_*_events without logging in.
-- Writes go through service-role Netlify functions (team-member-employment.ts,
--   team-member-probation.ts) which bypass RLS, so enabling RLS does not affect them.
-- Frontend does not read these tables directly (verified), so no read path breaks.
--
-- Model:
--   user_profiles (name/email directory) -> readable by any workspace member, anon denied
--   team_member_employment_events / team_member_probation_events (HR) -> owner/admin only

BEGIN;

-- user_profiles
ALTER TABLE tosho.user_profiles ENABLE ROW LEVEL SECURITY;
REVOKE SELECT ON tosho.user_profiles FROM anon;
DROP POLICY IF EXISTS user_profiles_select_members ON tosho.user_profiles;
CREATE POLICY user_profiles_select_members ON tosho.user_profiles
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM tosho.memberships m WHERE m.user_id = auth.uid()));

-- team_member_employment_events
ALTER TABLE tosho.team_member_employment_events ENABLE ROW LEVEL SECURITY;
REVOKE SELECT ON tosho.team_member_employment_events FROM anon;
DROP POLICY IF EXISTS employment_events_select_admin ON tosho.team_member_employment_events;
CREATE POLICY employment_events_select_admin ON tosho.team_member_employment_events
  FOR SELECT TO authenticated
  USING (tosho.is_workspace_admin(workspace_id));

-- team_member_probation_events
ALTER TABLE tosho.team_member_probation_events ENABLE ROW LEVEL SECURITY;
REVOKE SELECT ON tosho.team_member_probation_events FROM anon;
DROP POLICY IF EXISTS probation_events_select_admin ON tosho.team_member_probation_events;
CREATE POLICY probation_events_select_admin ON tosho.team_member_probation_events
  FOR SELECT TO authenticated
  USING (tosho.is_workspace_admin(workspace_id));

COMMIT;

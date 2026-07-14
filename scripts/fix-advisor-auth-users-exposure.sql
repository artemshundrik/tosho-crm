-- Resolve Supabase advisor findings on the tosho-crm project (fayna-saas / nqqabedngnndtltzvqyi):
--   * auth_users_exposed  — views referencing auth.users, readable via the API
--   * rls_disabled_in_public — public.design_task_number_counters (anon had full R/W incl TRUNCATE)
-- All changes proven safe before applying (see commit message). anon was already revoked on both
-- views by scripts/fix-anon-view-leak.sql; these findings are the authenticated-side remainder.

-- 1) public.team_members_view — the app reads this ONLY server-side via the service-role client
--    (netlify/functions/quote-comments.ts, mention resolution); no frontend/authenticated reader
--    exists (grep-verified). Drop the authenticated grant so the auth.users-referencing view is no
--    longer API-exposed. Data/behaviour unchanged (service_role keeps its grant).
revoke select on public.team_members_view from authenticated;

-- 2) tosho.workspace_member_directory — canonical member directory, read by authenticated users, so
--    it must stay readable. Its auth.users join was a DEAD COALESCE fallback: profile tables
--    (user_profiles email, team_member_profiles name/avatar) cover every member, proven by a full
--    row-diff (old vs new output = 0 differences across all 18 rows / all columns). Recreate it
--    WITHOUT auth.users — identical output, no longer flagged.
create or replace view tosho.workspace_member_directory as
select mv.workspace_id, mv.user_id,
  nullif(trim(both from mv.email), '') as email,
  nullif(trim(both from p.first_name), '') as first_name,
  nullif(trim(both from p.last_name), '') as last_name,
  coalesce(nullif(trim(both from p.full_name),''),
           nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)),''),
           nullif(trim(both from mv.full_name),'')) as full_name,
  nullif(trim(both from p.avatar_url), '') as avatar_url,
  nullif(trim(both from p.avatar_path), '') as avatar_path,
  mv.access_role, mv.job_role,
  p.birth_date, p.phone,
  coalesce(nullif(trim(both from p.availability_status),''), 'available') as availability_status,
  p.start_date, p.probation_end_date, p.employment_status,
  p.probation_review_notified_at, p.probation_reviewed_at, p.probation_reviewed_by,
  p.probation_extension_count, p.manager_user_id, p.module_access,
  p.availability_start_date, p.availability_end_date
from tosho.memberships_view mv
left join tosho.team_member_profiles p on p.workspace_id = mv.workspace_id and p.user_id = mv.user_id;

-- 3) public.design_task_number_counters — RLS off and anon held FULL privileges (incl. TRUNCATE).
--    Not read/written directly by app code (grep-verified; managed by triggers/definer paths).
--    Revoke anon entirely, enable RLS, keep authenticated working via a permissive policy.
revoke all on public.design_task_number_counters from anon;
alter table public.design_task_number_counters enable row level security;
drop policy if exists design_task_number_counters_authenticated on public.design_task_number_counters;
create policy design_task_number_counters_authenticated
  on public.design_task_number_counters
  for all to authenticated using (true) with check (true);

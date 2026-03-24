-- team-member-probation-workflow.sql
-- Adds employment/probation workflow fields and event log.
-- Run in Supabase SQL Editor.

begin;

alter table tosho.team_member_profiles
  add column if not exists employment_status text,
  add column if not exists probation_review_notified_at timestamptz,
  add column if not exists probation_reviewed_at timestamptz,
  add column if not exists probation_reviewed_by uuid,
  add column if not exists probation_extension_count integer not null default 0;

update tosho.team_member_profiles
set employment_status = case
  when probation_end_date is not null then 'probation'
  else 'active'
end
where employment_status is null;

alter table tosho.team_member_profiles
  alter column employment_status set not null,
  alter column employment_status set default 'active';

update tosho.team_member_profiles
set probation_extension_count = 0
where probation_extension_count is null;

alter table tosho.team_member_profiles
  drop constraint if exists team_member_profiles_employment_status_check;

alter table tosho.team_member_profiles
  add constraint team_member_profiles_employment_status_check
  check (employment_status in ('probation', 'active', 'rejected'));

create table if not exists tosho.team_member_probation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  decision text not null,
  previous_probation_end_date date,
  next_probation_end_date date,
  decided_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

alter table tosho.team_member_probation_events
  drop constraint if exists team_member_probation_events_decision_check;

alter table tosho.team_member_probation_events
  add constraint team_member_probation_events_decision_check
  check (decision in ('active', 'extend', 'rejected'));

create index if not exists team_member_probation_events_workspace_idx
  on tosho.team_member_probation_events (workspace_id, created_at desc);

create index if not exists team_member_probation_events_user_idx
  on tosho.team_member_probation_events (user_id, created_at desc);

grant select, insert on tosho.team_member_probation_events to authenticated;

notify pgrst, 'reload schema';

commit;

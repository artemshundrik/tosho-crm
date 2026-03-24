-- team-member-employment-inactive.sql
-- Extends employment workflow with inactive status and event log.
-- Run in Supabase SQL Editor.

begin;

alter table tosho.team_member_profiles
  drop constraint if exists team_member_profiles_employment_status_check;

alter table tosho.team_member_profiles
  add constraint team_member_profiles_employment_status_check
  check (employment_status in ('probation', 'active', 'inactive', 'rejected'));

create table if not exists tosho.team_member_employment_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  decision text not null,
  previous_employment_status text,
  next_employment_status text not null,
  decided_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

alter table tosho.team_member_employment_events
  drop constraint if exists team_member_employment_events_decision_check;

alter table tosho.team_member_employment_events
  add constraint team_member_employment_events_decision_check
  check (decision in ('inactive', 'reactivate'));

create index if not exists team_member_employment_events_workspace_idx
  on tosho.team_member_employment_events (workspace_id, created_at desc);

create index if not exists team_member_employment_events_user_idx
  on tosho.team_member_employment_events (user_id, created_at desc);

grant select, insert on tosho.team_member_employment_events to authenticated;

notify pgrst, 'reload schema';

commit;

-- design-task-assignment.sql
-- Adds assignment support for Design Kanban tasks stored in public.activity_log (action = 'design_task').
-- Run in Supabase SQL Editor after deploying frontend updates.

begin;

-- 1) Ensure metadata exists for design tasks.
update public.activity_log
set metadata = '{}'::jsonb
where action = 'design_task'
  and metadata is null;

-- 2) Backfill required metadata keys.
-- status is required by kanban grouping.
update public.activity_log
set metadata = jsonb_set(metadata, '{status}', to_jsonb('new'::text), true)
where action = 'design_task'
  and coalesce(metadata->>'status', '') = '';

-- assignee/assigned_at are optional but key presence keeps payload predictable.
update public.activity_log
set metadata = jsonb_set(metadata, '{assignee_user_id}', 'null'::jsonb, true)
where action = 'design_task'
  and not (metadata ? 'assignee_user_id');

-- Normalize legacy/unexpected assignee representations to JSON null.
update public.activity_log
set metadata = jsonb_set(metadata, '{assignee_user_id}', 'null'::jsonb, true)
where action = 'design_task'
  and (
    btrim(coalesce(metadata->>'assignee_user_id', '')) = ''
    or lower(coalesce(metadata->>'assignee_user_id', '')) in ('null', 'undefined', 'none')
  );

update public.activity_log
set metadata = jsonb_set(metadata, '{assigned_at}', 'null'::jsonb, true)
where action = 'design_task'
  and not (metadata ? 'assigned_at');

-- 3) Indexes for kanban filtering and assignment workflows.
create index if not exists activity_log_design_task_team_created_idx
  on public.activity_log(team_id, created_at desc)
  where action = 'design_task';

create index if not exists activity_log_design_task_team_status_idx
  on public.activity_log(team_id, (metadata->>'status'))
  where action = 'design_task';

create index if not exists activity_log_design_task_team_assignee_idx
  on public.activity_log(team_id, (metadata->>'assignee_user_id'))
  where action = 'design_task';

-- 4) Ensure team members can update/delete design tasks.
alter table public.activity_log enable row level security;

do $$ begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_log'
      and policyname = 'activity_log_design_task_update'
  ) then
    create policy activity_log_design_task_update
      on public.activity_log
      for update
      using (action = 'design_task' and is_team_member(team_id))
      with check (action = 'design_task' and is_team_member(team_id));
  end if;
end $$;

drop policy if exists activity_log_design_task_delete on public.activity_log;
create policy activity_log_design_task_delete
  on public.activity_log
  for delete
  using ((action = 'design_task' or entity_type = 'design_task') and is_team_member(team_id));

commit;

-- 5) Smoke checks (optional)
-- select count(*) from public.activity_log where action = 'design_task';
-- select id, team_id, metadata->>'status' as status, metadata->>'assignee_user_id' as assignee
-- from public.activity_log
-- where action = 'design_task'
-- order by created_at desc
-- limit 20;

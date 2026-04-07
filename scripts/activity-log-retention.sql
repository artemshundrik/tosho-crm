-- Activity log archive + retention rules for CRM.
-- Safe to run multiple times.

begin;

create table if not exists tosho.activity_log_archive (
  id uuid primary key,
  team_id uuid,
  user_id uuid,
  actor_name text,
  action text not null,
  entity_type text,
  entity_id text,
  title text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  archived_at timestamptz not null default timezone('utc', now()),
  archive_reason text
);

create index if not exists activity_log_archive_team_action_created_idx
  on tosho.activity_log_archive (team_id, action, created_at desc);

create index if not exists activity_log_archive_team_entity_created_idx
  on tosho.activity_log_archive (team_id, entity_type, entity_id, created_at desc);

create index if not exists activity_log_archive_archived_at_idx
  on tosho.activity_log_archive (archived_at desc);

alter table tosho.activity_log_archive enable row level security;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'tosho'
      and tablename = 'activity_log_archive'
      and policyname = 'activity_log_archive_select'
  ) then
    if has_member_fn then
      create policy activity_log_archive_select
      on tosho.activity_log_archive
      for select
      using (public.is_team_member(team_id));
    else
      create policy activity_log_archive_select
      on tosho.activity_log_archive
      for select
      using (false);
    end if;
  end if;
end $$;

grant select on tosho.activity_log_archive to authenticated;

create or replace function tosho.archive_activity_log(
  p_batch_limit integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, extensions
as $$
declare
  v_batch_limit integer := greatest(coalesce(p_batch_limit, 5000), 1);
  v_archived_count integer := 0;
begin
  with retention_rules as (
    select *
    from (
      values
        ('design_task_timer'::text, interval '30 days', 'timer_noise'),
        ('app_runtime_error'::text, interval '30 days', 'runtime_errors_short_retention'),
        ('design_output_upload'::text, interval '90 days', 'file_event_archive'),
        ('design_task_attachment'::text, interval '90 days', 'file_event_archive'),
        ('design_task_status'::text, interval '180 days', 'workflow_history_archive'),
        ('design_task_assignment'::text, interval '180 days', 'workflow_history_archive'),
        ('design_task_deadline'::text, interval '180 days', 'workflow_history_archive'),
        ('design_task_estimate'::text, interval '180 days', 'workflow_history_archive'),
        ('design_task_manager'::text, interval '180 days', 'workflow_history_archive'),
        ('design_task_title'::text, interval '180 days', 'workflow_history_archive'),
        ('design_task_type'::text, interval '180 days', 'workflow_history_archive'),
        ('create_training'::text, interval '30 days', 'legacy_non_crm'),
        ('update_training'::text, interval '30 days', 'legacy_non_crm'),
        ('delete_training'::text, interval '30 days', 'legacy_non_crm'),
        ('create_match'::text, interval '30 days', 'legacy_non_crm'),
        ('update_match'::text, interval '30 days', 'legacy_non_crm')
    ) as t(action, keep_for, archive_reason)
  ),
  candidates as (
    select
      a.id,
      a.team_id,
      a.user_id,
      a.actor_name,
      a.action,
      a.entity_type,
      a.entity_id,
      a.title,
      a.href,
      a.metadata,
      a.created_at,
      timezone('utc', now()) as archived_at,
      r.archive_reason
    from public.activity_log a
    join retention_rules r on r.action = a.action
    where a.created_at < timezone('utc', now()) - r.keep_for
    order by a.created_at asc
    limit v_batch_limit
  ),
  archived as (
    insert into tosho.activity_log_archive (
      id,
      team_id,
      user_id,
      actor_name,
      action,
      entity_type,
      entity_id,
      title,
      href,
      metadata,
      created_at,
      archived_at,
      archive_reason
    )
    select
      id,
      team_id,
      user_id,
      actor_name,
      action,
      entity_type,
      entity_id,
      title,
      href,
      metadata,
      created_at,
      archived_at,
      archive_reason
    from candidates
    on conflict (id) do update
    set
      archived_at = excluded.archived_at,
      archive_reason = excluded.archive_reason
    returning id
  ),
  deleted as (
    delete from public.activity_log a
    where a.id in (select id from archived)
    returning 1
  )
  select count(*)::int into v_archived_count
  from deleted;

  return jsonb_build_object(
    'archived_count', v_archived_count,
    'batch_limit', v_batch_limit,
    'ran_at', timezone('utc', now())
  );
end;
$$;

create or replace function tosho.archive_activity_log_all(
  p_batch_limit integer default 5000,
  p_max_rounds integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, extensions
as $$
declare
  v_batch_limit integer := greatest(coalesce(p_batch_limit, 5000), 1);
  v_max_rounds integer := greatest(coalesce(p_max_rounds, 50), 1);
  v_round integer := 0;
  v_total integer := 0;
  v_step jsonb;
  v_step_count integer;
begin
  loop
    exit when v_round >= v_max_rounds;
    v_round := v_round + 1;
    v_step := tosho.archive_activity_log(v_batch_limit);
    v_step_count := coalesce((v_step ->> 'archived_count')::integer, 0);
    v_total := v_total + v_step_count;
    exit when v_step_count = 0;
  end loop;

  return jsonb_build_object(
    'archived_total', v_total,
    'rounds', v_round,
    'batch_limit', v_batch_limit,
    'ran_at', timezone('utc', now())
  );
end;
$$;

notify pgrst, 'reload schema';

commit;

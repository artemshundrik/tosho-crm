-- Time tracking sessions for design tasks.
-- Safe to run multiple times.

create table if not exists public.design_task_timer_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  design_task_id uuid not null,
  user_id uuid not null,
  started_at timestamptz not null default now(),
  paused_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists design_task_timer_sessions_team_task_idx
  on public.design_task_timer_sessions (team_id, design_task_id, started_at desc);

create index if not exists design_task_timer_sessions_user_idx
  on public.design_task_timer_sessions (team_id, user_id, started_at desc);

create unique index if not exists design_task_timer_sessions_one_active_per_task_idx
  on public.design_task_timer_sessions (design_task_id)
  where paused_at is null;

alter table public.design_task_timer_sessions enable row level security;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'design_task_timer_sessions'
      and policyname = 'design_task_timer_sessions_select'
  ) then
    if has_member_fn then
      create policy design_task_timer_sessions_select
      on public.design_task_timer_sessions
      for select
      using (public.is_team_member(team_id));
    else
      create policy design_task_timer_sessions_select
      on public.design_task_timer_sessions
      for select
      using (true);
    end if;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'design_task_timer_sessions'
      and policyname = 'design_task_timer_sessions_insert'
  ) then
    if has_member_fn then
      create policy design_task_timer_sessions_insert
      on public.design_task_timer_sessions
      for insert
      with check (user_id = auth.uid() and public.is_team_member(team_id));
    else
      create policy design_task_timer_sessions_insert
      on public.design_task_timer_sessions
      for insert
      with check (user_id = auth.uid());
    end if;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'design_task_timer_sessions'
      and policyname = 'design_task_timer_sessions_update'
  ) then
    if has_member_fn then
      create policy design_task_timer_sessions_update
      on public.design_task_timer_sessions
      for update
      using (public.is_team_member(team_id))
      with check (public.is_team_member(team_id));
    else
      create policy design_task_timer_sessions_update
      on public.design_task_timer_sessions
      for update
      using (true)
      with check (true);
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

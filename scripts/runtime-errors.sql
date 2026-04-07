-- Dedicated runtime errors store for frontend crashes.
-- Safe to run multiple times.

begin;

create table if not exists tosho.runtime_errors (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  user_id uuid,
  actor_name text,
  source text not null,
  title text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists runtime_errors_team_created_idx
  on tosho.runtime_errors (team_id, created_at desc);

create index if not exists runtime_errors_team_source_created_idx
  on tosho.runtime_errors (team_id, source, created_at desc);

alter table tosho.runtime_errors enable row level security;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'tosho'
      and tablename = 'runtime_errors'
      and policyname = 'runtime_errors_select_admin'
  ) then
    create policy runtime_errors_select_admin
      on tosho.runtime_errors
      for select
      using (
        exists (
          select 1
          from tosho.memberships_view mv
          where mv.workspace_id = runtime_errors.team_id
            and mv.user_id = auth.uid()
            and mv.access_role in ('owner', 'admin')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'tosho'
      and tablename = 'runtime_errors'
      and policyname = 'runtime_errors_insert_member'
  ) then
    if has_member_fn then
      create policy runtime_errors_insert_member
        on tosho.runtime_errors
        for insert
        with check (
          user_id = auth.uid()
          and public.is_team_member(team_id)
        );
    else
      create policy runtime_errors_insert_member
        on tosho.runtime_errors
        for insert
        with check (user_id = auth.uid());
    end if;
  end if;
end $$;

grant select, insert on tosho.runtime_errors to authenticated;

insert into tosho.runtime_errors (
  id,
  team_id,
  user_id,
  actor_name,
  source,
  title,
  href,
  metadata,
  created_at
)
select
  al.id,
  al.team_id,
  al.user_id,
  al.actor_name,
  coalesce(nullif(trim(al.metadata->>'source'), ''), 'unknown'),
  al.title,
  al.href,
  al.metadata,
  al.created_at
from public.activity_log al
where al.action = 'app_runtime_error'
on conflict (id) do nothing;

delete from public.activity_log
where action = 'app_runtime_error';

notify pgrst, 'reload schema';

commit;

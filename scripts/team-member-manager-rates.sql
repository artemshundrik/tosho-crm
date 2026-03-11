begin;

create table if not exists tosho.team_member_manager_rates (
  workspace_id uuid not null,
  user_id uuid not null,
  manager_rate numeric not null default 10,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid,
  primary key (workspace_id, user_id)
);

create index if not exists team_member_manager_rates_workspace_idx
  on tosho.team_member_manager_rates (workspace_id);

create index if not exists team_member_manager_rates_user_idx
  on tosho.team_member_manager_rates (user_id);

create or replace function tosho.touch_team_member_manager_rates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists team_member_manager_rates_touch_updated_at on tosho.team_member_manager_rates;
create trigger team_member_manager_rates_touch_updated_at
before update on tosho.team_member_manager_rates
for each row execute function tosho.touch_team_member_manager_rates_updated_at();

alter table tosho.team_member_manager_rates enable row level security;

drop policy if exists "team_member_manager_rates_select" on tosho.team_member_manager_rates;
create policy "team_member_manager_rates_select"
on tosho.team_member_manager_rates
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_member_manager_rates.workspace_id
      and mv.user_id = auth.uid()
      and (
        mv.user_id = team_member_manager_rates.user_id
        or mv.access_role = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "team_member_manager_rates_insert" on tosho.team_member_manager_rates;
create policy "team_member_manager_rates_insert"
on tosho.team_member_manager_rates
for insert
to authenticated
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_member_manager_rates.workspace_id
      and mv.user_id = auth.uid()
      and (
        mv.access_role = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "team_member_manager_rates_update" on tosho.team_member_manager_rates;
create policy "team_member_manager_rates_update"
on tosho.team_member_manager_rates
for update
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_member_manager_rates.workspace_id
      and mv.user_id = auth.uid()
      and (
        mv.access_role = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
)
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_member_manager_rates.workspace_id
      and mv.user_id = auth.uid()
      and (
        mv.access_role = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

grant select, insert, update on tosho.team_member_manager_rates to authenticated;

notify pgrst, 'reload schema';

commit;

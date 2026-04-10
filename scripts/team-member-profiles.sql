-- Team member profile storage for CRM (birth date, phone, names).
-- Run in Supabase SQL Editor.
-- Safe to run multiple times.

begin;

create table if not exists tosho.team_member_profiles (
  workspace_id uuid not null,
  user_id uuid not null,
  first_name text,
  last_name text,
  full_name text,
  birth_date date,
  phone text,
  availability_status text not null default 'available',
  availability_start_date date,
  availability_end_date date,
  start_date date,
  probation_end_date date,
  manager_user_id uuid,
  module_access jsonb not null default '{"overview": true, "orders": true, "finance": false, "design": true, "logistics": false, "catalog": false, "contractors": false}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid,
  primary key (workspace_id, user_id)
);

alter table tosho.team_member_profiles
  add column if not exists availability_status text,
  add column if not exists availability_start_date date,
  add column if not exists availability_end_date date,
  add column if not exists start_date date,
  add column if not exists probation_end_date date,
  add column if not exists manager_user_id uuid,
  add column if not exists module_access jsonb;

update tosho.team_member_profiles
set availability_status = coalesce(nullif(trim(availability_status), ''), 'available')
where availability_status is null
   or trim(availability_status) = '';

alter table tosho.team_member_profiles
  alter column availability_status set default 'available',
  alter column availability_status set not null;

update tosho.team_member_profiles
set module_access = coalesce(
  module_access,
  '{"overview": true, "orders": true, "finance": false, "design": true, "logistics": false, "catalog": false}'::jsonb
)
where module_access is null;

alter table tosho.team_member_profiles
  alter column module_access set default '{"overview": true, "orders": true, "finance": false, "design": true, "logistics": false, "catalog": false, "contractors": false}'::jsonb,
  alter column module_access set not null;

alter table tosho.team_member_profiles
  drop constraint if exists team_member_profiles_availability_status_check;

alter table tosho.team_member_profiles
  add constraint team_member_profiles_availability_status_check
  check (availability_status in ('available', 'vacation', 'sick_leave', 'offline'));

create index if not exists team_member_profiles_workspace_idx
  on tosho.team_member_profiles (workspace_id);

create index if not exists team_member_profiles_user_idx
  on tosho.team_member_profiles (user_id);

insert into tosho.team_member_profiles (
  workspace_id,
  user_id,
  first_name,
  last_name,
  full_name,
  birth_date,
  phone
)
select
  mv.workspace_id,
  mv.user_id,
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'first_name', '')), ''),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'last_name', '')), ''),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'birth_date', '')), '')::date,
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'phone', '')), '')
from tosho.memberships_view mv
join auth.users u on u.id = mv.user_id
where mv.workspace_id is not null
on conflict (workspace_id, user_id) do update
set
  first_name = coalesce(tosho.team_member_profiles.first_name, excluded.first_name),
  last_name = coalesce(tosho.team_member_profiles.last_name, excluded.last_name),
  full_name = coalesce(tosho.team_member_profiles.full_name, excluded.full_name),
  birth_date = coalesce(tosho.team_member_profiles.birth_date, excluded.birth_date),
  phone = coalesce(tosho.team_member_profiles.phone, excluded.phone);

create or replace function tosho.touch_team_member_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists team_member_profiles_touch_updated_at on tosho.team_member_profiles;
create trigger team_member_profiles_touch_updated_at
before update on tosho.team_member_profiles
for each row execute function tosho.touch_team_member_profiles_updated_at();

alter table tosho.team_member_profiles enable row level security;

drop policy if exists "team_member_profiles_select" on tosho.team_member_profiles;
create policy "team_member_profiles_select"
on tosho.team_member_profiles
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_member_profiles.workspace_id
      and mv.user_id = auth.uid()
  )
);

drop policy if exists "team_member_profiles_insert" on tosho.team_member_profiles;
create policy "team_member_profiles_insert"
on tosho.team_member_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from tosho.memberships_view self_mv
    where self_mv.workspace_id = team_member_profiles.workspace_id
      and self_mv.user_id = auth.uid()
      and (
        self_mv.user_id = team_member_profiles.user_id
        or self_mv.access_role = 'owner'
        or lower(coalesce(self_mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "team_member_profiles_update" on tosho.team_member_profiles;
create policy "team_member_profiles_update"
on tosho.team_member_profiles
for update
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view self_mv
    where self_mv.workspace_id = team_member_profiles.workspace_id
      and self_mv.user_id = auth.uid()
      and (
        self_mv.user_id = team_member_profiles.user_id
        or self_mv.access_role = 'owner'
        or lower(coalesce(self_mv.job_role::text, '')) = 'seo'
      )
  )
)
with check (
  exists (
    select 1
    from tosho.memberships_view self_mv
    where self_mv.workspace_id = team_member_profiles.workspace_id
      and self_mv.user_id = auth.uid()
      and (
        self_mv.user_id = team_member_profiles.user_id
        or self_mv.access_role = 'owner'
        or lower(coalesce(self_mv.job_role::text, '')) = 'seo'
      )
  )
);

grant select, insert, update on tosho.team_member_profiles to authenticated;

notify pgrst, 'reload schema';

commit;

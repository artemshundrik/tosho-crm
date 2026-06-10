-- Team absences log (журнал відсутностей) for CRM.
-- One row = one person absent over a date range [start_date, end_date] with a
-- reason ("Сергій У. — 03.06–05.06 — отруївся"). A one-day absence has
-- start_date = end_date. Surfaced on the Team page (/team).
-- Read: any workspace member. Write: workspace owner / SEO only.
-- Run in Supabase SQL Editor. Safe to run multiple times (idempotent).

begin;

create table if not exists tosho.team_absences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null, -- the absent member
  start_date date not null,
  end_date date not null,
  kind text not null default 'other'
    check (kind in ('sick_leave', 'day_off', 'vacation', 'other')),
  comment text,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Migrate older installs that used a single absence_date column ----------------
alter table tosho.team_absences add column if not exists start_date date;
alter table tosho.team_absences add column if not exists end_date date;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'tosho'
      and table_name = 'team_absences'
      and column_name = 'absence_date'
  ) then
    update tosho.team_absences
      set start_date = coalesce(start_date, absence_date),
          end_date = coalesce(end_date, absence_date);
    alter table tosho.team_absences drop column absence_date;
  end if;
end
$$;

alter table tosho.team_absences alter column start_date set not null;
alter table tosho.team_absences alter column end_date set not null;

-- end_date is inclusive and never before start_date (one-day => equal).
alter table tosho.team_absences drop constraint if exists team_absences_range_chk;
alter table tosho.team_absences
  add constraint team_absences_range_chk check (end_date >= start_date);

drop index if exists tosho.team_absences_workspace_date_idx;
create index if not exists team_absences_workspace_range_idx
  on tosho.team_absences (workspace_id, start_date, end_date);

-- updated_at touch trigger
create or replace function tosho.touch_team_absences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists team_absences_touch_updated_at on tosho.team_absences;
create trigger team_absences_touch_updated_at
before update on tosho.team_absences
for each row execute function tosho.touch_team_absences_updated_at();

alter table tosho.team_absences enable row level security;

-- Any workspace member can read the log ("who is out" is useful to everyone).
drop policy if exists "team_absences_select" on tosho.team_absences;
create policy "team_absences_select"
on tosho.team_absences
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absences.workspace_id
      and mv.user_id = auth.uid()
  )
);

-- Only workspace owner or SEO may write.
drop policy if exists "team_absences_insert" on tosho.team_absences;
create policy "team_absences_insert"
on tosho.team_absences
for insert
to authenticated
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absences.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "team_absences_update" on tosho.team_absences;
create policy "team_absences_update"
on tosho.team_absences
for update
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absences.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
)
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absences.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "team_absences_delete" on tosho.team_absences;
create policy "team_absences_delete"
on tosho.team_absences
for delete
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absences.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

grant select, insert, update, delete on tosho.team_absences to authenticated;

notify pgrst, 'reload schema';

commit;

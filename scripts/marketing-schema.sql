-- Marketing gallery: per-visual marketing state layered on top of design-task output files.
-- The visuals themselves live in activity_log (design_task).metadata->design_output_files;
-- this table only stores marketer-owned state keyed by (design_task_id, output_file_id).
-- Safe to run multiple times.

create table if not exists tosho.marketing_visuals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  design_task_id uuid not null,
  output_file_id uuid not null,
  status text not null default 'new',
  tags jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  is_favorite boolean not null default false,
  is_hidden boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_visuals_status_check check (
    status in ('new', 'in_progress', 'review', 'ready', 'shot')
  ),
  constraint marketing_visuals_identity unique (team_id, design_task_id, output_file_id)
);

alter table if exists tosho.marketing_visuals
  add column if not exists notes text,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists marketing_visuals_team_status_idx
  on tosho.marketing_visuals (team_id, status);

create index if not exists marketing_visuals_team_task_idx
  on tosho.marketing_visuals (team_id, design_task_id);

alter table tosho.marketing_visuals enable row level security;

-- No anonymous access: the gallery is an internal team surface.
revoke all on tosho.marketing_visuals from anon;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'marketing_visuals' and policyname = 'marketing_visuals_select'
  ) then
    if has_member_fn then
      create policy marketing_visuals_select on tosho.marketing_visuals
      for select using (public.is_team_member(team_id));
    else
      create policy marketing_visuals_select on tosho.marketing_visuals
      for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'marketing_visuals' and policyname = 'marketing_visuals_insert'
  ) then
    if has_member_fn then
      create policy marketing_visuals_insert on tosho.marketing_visuals
      for insert with check (public.is_team_member(team_id));
    else
      create policy marketing_visuals_insert on tosho.marketing_visuals
      for insert with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'marketing_visuals' and policyname = 'marketing_visuals_update'
  ) then
    if has_member_fn then
      create policy marketing_visuals_update on tosho.marketing_visuals
      for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
    else
      create policy marketing_visuals_update on tosho.marketing_visuals
      for update using (true) with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'marketing_visuals' and policyname = 'marketing_visuals_delete'
  ) then
    if has_member_fn then
      create policy marketing_visuals_delete on tosho.marketing_visuals
      for delete using (public.is_team_member(team_id));
    else
      create policy marketing_visuals_delete on tosho.marketing_visuals
      for delete using (true);
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

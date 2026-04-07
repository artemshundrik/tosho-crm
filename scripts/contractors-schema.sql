-- Contractors table for CRM.
-- Safe to run multiple times.

create table if not exists tosho.contractors (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  name text not null,
  services text,
  contact_name text,
  phone text,
  address text,
  delivery_info text,
  reminder_at timestamptz,
  reminder_comment text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists tosho.contractors
  add column if not exists services text,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists delivery_info text,
  add column if not exists reminder_at timestamptz,
  add column if not exists reminder_comment text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists contractors_team_name_idx
  on tosho.contractors (team_id, name);

create index if not exists contractors_team_services_idx
  on tosho.contractors (team_id, services);

alter table tosho.contractors enable row level security;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'contractors' and policyname = 'contractors_select'
  ) then
    if has_member_fn then
      create policy contractors_select on tosho.contractors
      for select using (public.is_team_member(team_id));
    else
      create policy contractors_select on tosho.contractors
      for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'contractors' and policyname = 'contractors_insert'
  ) then
    if has_member_fn then
      create policy contractors_insert on tosho.contractors
      for insert with check (public.is_team_member(team_id));
    else
      create policy contractors_insert on tosho.contractors
      for insert with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'contractors' and policyname = 'contractors_update'
  ) then
    if has_member_fn then
      create policy contractors_update on tosho.contractors
      for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
    else
      create policy contractors_update on tosho.contractors
      for update using (true) with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'contractors' and policyname = 'contractors_delete'
  ) then
    if has_member_fn then
      create policy contractors_delete on tosho.contractors
      for delete using (public.is_team_member(team_id));
    else
      create policy contractors_delete on tosho.contractors
      for delete using (true);
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

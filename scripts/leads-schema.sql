-- Leads table for CRM.
-- Safe to run multiple times.

create table if not exists tosho.leads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  company_name text not null,
  legal_name text,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone_numbers text[] not null default '{}'::text[],
  source text not null,
  website text,
  manager text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_team_company_name_idx
  on tosho.leads (team_id, company_name);

create index if not exists leads_team_email_idx
  on tosho.leads (team_id, email);

alter table tosho.leads enable row level security;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'leads' and policyname = 'leads_select'
  ) then
    if has_member_fn then
      create policy leads_select on tosho.leads
      for select using (public.is_team_member(team_id));
    else
      create policy leads_select on tosho.leads
      for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'leads' and policyname = 'leads_insert'
  ) then
    if has_member_fn then
      create policy leads_insert on tosho.leads
      for insert with check (public.is_team_member(team_id));
    else
      create policy leads_insert on tosho.leads
      for insert with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'leads' and policyname = 'leads_update'
  ) then
    if has_member_fn then
      create policy leads_update on tosho.leads
      for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
    else
      create policy leads_update on tosho.leads
      for update using (true) with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'leads' and policyname = 'leads_delete'
  ) then
    if has_member_fn then
      create policy leads_delete on tosho.leads
      for delete using (public.is_team_member(team_id));
    else
      create policy leads_delete on tosho.leads
      for delete using (true);
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

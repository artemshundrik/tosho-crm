-- Quote sets (bundles) for grouping multiple quotes of a single customer.
-- Safe to run multiple times.

create table if not exists tosho.quote_sets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  customer_id uuid not null,
  name text not null,
  kind text not null default 'set',
  created_by uuid null,
  created_at timestamptz not null default now()
);

alter table if exists tosho.quote_sets
  add column if not exists kind text not null default 'set';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quote_sets_kind_check'
      and conrelid = 'tosho.quote_sets'::regclass
  ) then
    alter table tosho.quote_sets
      add constraint quote_sets_kind_check
      check (kind in ('set', 'kp'));
  end if;
end $$;

create table if not exists tosho.quote_set_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  quote_set_id uuid not null references tosho.quote_sets(id) on delete cascade,
  quote_id uuid not null references tosho.quotes(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (quote_set_id, quote_id)
);

create index if not exists quote_sets_team_customer_idx
  on tosho.quote_sets (team_id, customer_id, created_at desc);

create index if not exists quote_set_items_set_idx
  on tosho.quote_set_items (quote_set_id, sort_order, created_at);

create index if not exists quote_set_items_quote_idx
  on tosho.quote_set_items (quote_id);

alter table tosho.quote_sets enable row level security;
alter table tosho.quote_set_items enable row level security;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'quote_sets' and policyname = 'quote_sets_select'
  ) then
    if has_member_fn then
      create policy quote_sets_select on tosho.quote_sets
      for select using (public.is_team_member(team_id));
    else
      create policy quote_sets_select on tosho.quote_sets
      for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'quote_sets' and policyname = 'quote_sets_insert'
  ) then
    if has_member_fn then
      create policy quote_sets_insert on tosho.quote_sets
      for insert with check (public.is_team_member(team_id));
    else
      create policy quote_sets_insert on tosho.quote_sets
      for insert with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'quote_sets' and policyname = 'quote_sets_update'
  ) then
    if has_member_fn then
      create policy quote_sets_update on tosho.quote_sets
      for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
    else
      create policy quote_sets_update on tosho.quote_sets
      for update using (true) with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'quote_sets' and policyname = 'quote_sets_delete'
  ) then
    if has_member_fn then
      create policy quote_sets_delete on tosho.quote_sets
      for delete using (public.is_team_member(team_id));
    else
      create policy quote_sets_delete on tosho.quote_sets
      for delete using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'quote_set_items' and policyname = 'quote_set_items_select'
  ) then
    if has_member_fn then
      create policy quote_set_items_select on tosho.quote_set_items
      for select using (public.is_team_member(team_id));
    else
      create policy quote_set_items_select on tosho.quote_set_items
      for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'quote_set_items' and policyname = 'quote_set_items_insert'
  ) then
    if has_member_fn then
      create policy quote_set_items_insert on tosho.quote_set_items
      for insert with check (public.is_team_member(team_id));
    else
      create policy quote_set_items_insert on tosho.quote_set_items
      for insert with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'quote_set_items' and policyname = 'quote_set_items_update'
  ) then
    if has_member_fn then
      create policy quote_set_items_update on tosho.quote_set_items
      for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
    else
      create policy quote_set_items_update on tosho.quote_set_items
      for update using (true) with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'quote_set_items' and policyname = 'quote_set_items_delete'
  ) then
    if has_member_fn then
      create policy quote_set_items_delete on tosho.quote_set_items
      for delete using (public.is_team_member(team_id));
    else
      create policy quote_set_items_delete on tosho.quote_set_items
      for delete using (true);
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

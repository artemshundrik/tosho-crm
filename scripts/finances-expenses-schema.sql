-- Finance module — Phase 2 schema (витрати, статті, алокація на замовлення).
-- See docs/FINANCES_DESIGN.md §6. Schema: tosho. Team-scoped RLS.
-- Depends on finances-schema.sql (finance_legal_entities, finance_accounts).
-- Safe to run multiple times.

begin;

-- =====================================================================
-- finance_expense_categories — статті витрат
-- =====================================================================
create table if not exists tosho.finance_expense_categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  name text not null,
  kind text not null default 'variable',            -- variable | fixed | tax | payroll
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.finance_expense_categories
  drop constraint if exists finance_expense_categories_kind_check;
alter table tosho.finance_expense_categories
  add constraint finance_expense_categories_kind_check
  check (kind in ('variable', 'fixed', 'tax', 'payroll'));

create index if not exists finance_expense_categories_team_idx
  on tosho.finance_expense_categories (team_id, sort_order);

drop trigger if exists finance_expense_categories_touch on tosho.finance_expense_categories;
create trigger finance_expense_categories_touch
before update on tosho.finance_expense_categories
for each row execute function tosho.finance_touch_updated_at();

-- =====================================================================
-- finance_expenses — витрати (гроші з гаманця)
-- =====================================================================
create table if not exists tosho.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  legal_entity_id uuid references tosho.finance_legal_entities (id) on delete set null,
  account_id uuid references tosho.finance_accounts (id) on delete set null,
  category_id uuid references tosho.finance_expense_categories (id) on delete set null,
  supplier_name text,
  amount numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  expense_date date not null default current_date,
  is_recurring boolean not null default false,      -- сталі (щомісячні) витрати
  recurrence text,                                  -- 'monthly' | null
  notes text,
  file text,
  entered_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists finance_expenses_team_idx
  on tosho.finance_expenses (team_id, expense_date desc);
create index if not exists finance_expenses_category_idx
  on tosho.finance_expenses (category_id);

drop trigger if exists finance_expenses_touch on tosho.finance_expenses;
create trigger finance_expenses_touch
before update on tosho.finance_expenses
for each row execute function tosho.finance_touch_updated_at();

-- =====================================================================
-- finance_expense_allocations — розподіл 1 витрати на N замовлень
-- =====================================================================
create table if not exists tosho.finance_expense_allocations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  expense_id uuid not null references tosho.finance_expenses (id) on delete cascade,
  quote_id uuid not null,
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists finance_expense_allocations_expense_idx
  on tosho.finance_expense_allocations (expense_id);
create index if not exists finance_expense_allocations_quote_idx
  on tosho.finance_expense_allocations (quote_id);
create index if not exists finance_expense_allocations_team_idx
  on tosho.finance_expense_allocations (team_id);

-- =====================================================================
-- RLS — team-scoped, with permissive fallback like finances-schema.sql.
-- =====================================================================
do $$
declare
  has_member_fn boolean := to_regprocedure('public.is_team_member(uuid)') is not null;
  tbl text;
  op text;
  policy_name text;
begin
  foreach tbl in array array[
    'finance_expense_categories',
    'finance_expenses',
    'finance_expense_allocations'
  ] loop
    execute format('alter table tosho.%I enable row level security', tbl);

    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      policy_name := tbl || '_' || op;
      execute format('drop policy if exists %I on tosho.%I', policy_name, tbl);

      if op = 'select' then
        if has_member_fn then
          execute format('create policy %I on tosho.%I for select using (public.is_team_member(team_id))', policy_name, tbl);
        else
          execute format('create policy %I on tosho.%I for select using (true)', policy_name, tbl);
        end if;
      elsif op = 'insert' then
        if has_member_fn then
          execute format('create policy %I on tosho.%I for insert with check (public.is_team_member(team_id))', policy_name, tbl);
        else
          execute format('create policy %I on tosho.%I for insert with check (true)', policy_name, tbl);
        end if;
      elsif op = 'update' then
        if has_member_fn then
          execute format('create policy %I on tosho.%I for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id))', policy_name, tbl);
        else
          execute format('create policy %I on tosho.%I for update using (true) with check (true)', policy_name, tbl);
        end if;
      else
        if has_member_fn then
          execute format('create policy %I on tosho.%I for delete using (public.is_team_member(team_id))', policy_name, tbl);
        else
          execute format('create policy %I on tosho.%I for delete using (true)', policy_name, tbl);
        end if;
      end if;
    end loop;

    execute format('grant select, insert, update, delete on tosho.%I to authenticated', tbl);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

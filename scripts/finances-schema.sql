-- Finance module — Phase 1 schema (контури/канали, рахунки, оплати).
-- See docs/FINANCES_DESIGN.md for the architecture.
-- Schema: tosho. Team-scoped via public.is_team_member(team_id), like leads/customers.
-- Safe to run multiple times.

begin;

-- Shared updated_at trigger for all finance_* tables.
create or replace function tosho.finance_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- =====================================================================
-- 1. finance_legal_entities — НАШІ юрособи (ТОВ, ФОП1, ФОП2, фізособа)
-- =====================================================================
create table if not exists tosho.finance_legal_entities (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  name text not null,
  kind text not null default 'sole_prop',          -- llc | sole_prop | individual
  vat_payer boolean not null default false,
  tax_group text,                                   -- напр. '3' для ФОП 3 групи; null для ТОВ/фіз
  edrpou text,                                      -- ЄДРПОУ (ТОВ)
  ipn text,                                         -- ІПН
  iban text,
  requisites jsonb not null default '{}'::jsonb,    -- банк, адреса, підписант тощо
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.finance_legal_entities
  drop constraint if exists finance_legal_entities_kind_check;
alter table tosho.finance_legal_entities
  add constraint finance_legal_entities_kind_check
  check (kind in ('llc', 'sole_prop', 'individual'));

create index if not exists finance_legal_entities_team_idx
  on tosho.finance_legal_entities (team_id, sort_order);

drop trigger if exists finance_legal_entities_touch on tosho.finance_legal_entities;
create trigger finance_legal_entities_touch
before update on tosho.finance_legal_entities
for each row execute function tosho.finance_touch_updated_at();

-- =====================================================================
-- 2. finance_accounts — каси/гаманці (контури з балансом)
-- =====================================================================
create table if not exists tosho.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  legal_entity_id uuid references tosho.finance_legal_entities (id) on delete set null,
  name text not null,
  kind text not null default 'bank',                -- bank | cash | crypto | personal_card
  currency text not null default 'UAH',
  bank_provider text,                               -- raiffeisen | mono | manual | null
  is_sensitive boolean not null default false,      -- true для фіз/готівка/крипта (тільки топ-ролі)
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.finance_accounts
  drop constraint if exists finance_accounts_kind_check;
alter table tosho.finance_accounts
  add constraint finance_accounts_kind_check
  check (kind in ('bank', 'cash', 'crypto', 'personal_card'));

create index if not exists finance_accounts_team_idx
  on tosho.finance_accounts (team_id, sort_order);

drop trigger if exists finance_accounts_touch on tosho.finance_accounts;
create trigger finance_accounts_touch
before update on tosho.finance_accounts
for each row execute function tosho.finance_touch_updated_at();

-- =====================================================================
-- 3. finance_order_meta — фін-надбудова над замовленням
--    Ключ — quote_id (стабільний id замовлення; orders похідні від quotes).
-- =====================================================================
create table if not exists tosho.finance_order_meta (
  quote_id uuid primary key,
  team_id uuid not null,
  order_type text,                                  -- goods | services
  legal_entity_id uuid references tosho.finance_legal_entities (id) on delete set null,
  intended_account_id uuid references tosho.finance_accounts (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.finance_order_meta
  drop constraint if exists finance_order_meta_order_type_check;
alter table tosho.finance_order_meta
  add constraint finance_order_meta_order_type_check
  check (order_type is null or order_type in ('goods', 'services'));

create index if not exists finance_order_meta_team_idx
  on tosho.finance_order_meta (team_id);

drop trigger if exists finance_order_meta_touch on tosho.finance_order_meta;
create trigger finance_order_meta_touch
before update on tosho.finance_order_meta
for each row execute function tosho.finance_touch_updated_at();

-- =====================================================================
-- 4. finance_invoices — рахунки клієнтам
-- =====================================================================
create table if not exists tosho.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  number text,
  legal_entity_id uuid references tosho.finance_legal_entities (id) on delete set null,
  customer_id uuid,
  quote_id uuid,                                    -- замовлення, до якого виставлено
  issue_date date,
  due_date date,
  amount numeric(14, 2) not null default 0,
  vat_rate numeric(5, 2),
  vat_amount numeric(14, 2) not null default 0,
  prepayment_amount numeric(14, 2),
  balance_amount numeric(14, 2),
  status text not null default 'draft',             -- draft|sent|partial|paid|overdue|cancelled
  file_pdf text,
  file_xlsx text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.finance_invoices
  drop constraint if exists finance_invoices_status_check;
alter table tosho.finance_invoices
  add constraint finance_invoices_status_check
  check (status in ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'));

create index if not exists finance_invoices_team_idx
  on tosho.finance_invoices (team_id, issue_date desc);
create index if not exists finance_invoices_quote_idx
  on tosho.finance_invoices (quote_id);
create index if not exists finance_invoices_customer_idx
  on tosho.finance_invoices (customer_id);

drop trigger if exists finance_invoices_touch on tosho.finance_invoices;
create trigger finance_invoices_touch
before update on tosho.finance_invoices
for each row execute function tosho.finance_touch_updated_at();

-- =====================================================================
-- 5. finance_payments — ФАКТ надходження грошей (тільки до замовлення)
-- =====================================================================
create table if not exists tosho.finance_payments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  account_id uuid references tosho.finance_accounts (id) on delete set null,
  quote_id uuid not null,                           -- замовлення (прорахунок платити не може)
  invoice_id uuid references tosho.finance_invoices (id) on delete set null,
  amount numeric(14, 2) not null default 0,
  currency text not null default 'UAH',
  fx_rate numeric(18, 8),                            -- курс для крипти/валюти
  uah_equivalent numeric(14, 2),
  paid_at date not null default current_date,
  source text not null default 'manual',            -- manual | raiffeisen | mono | csv
  bank_txn_ref text,
  notes text,
  entered_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.finance_payments
  drop constraint if exists finance_payments_source_check;
alter table tosho.finance_payments
  add constraint finance_payments_source_check
  check (source in ('manual', 'raiffeisen', 'mono', 'csv'));

create index if not exists finance_payments_team_idx
  on tosho.finance_payments (team_id, paid_at desc);
create index if not exists finance_payments_quote_idx
  on tosho.finance_payments (quote_id);
create index if not exists finance_payments_account_idx
  on tosho.finance_payments (account_id);

drop trigger if exists finance_payments_touch on tosho.finance_payments;
create trigger finance_payments_touch
before update on tosho.finance_payments
for each row execute function tosho.finance_touch_updated_at();

-- =====================================================================
-- RLS — team-scoped, like leads/customers. Falls back to permissive
-- if public.is_team_member(uuid) is unavailable in this environment.
-- =====================================================================
do $$
declare
  has_member_fn boolean := to_regprocedure('public.is_team_member(uuid)') is not null;
  tbl text;
  op text;
  policy_name text;
begin
  foreach tbl in array array[
    'finance_legal_entities',
    'finance_accounts',
    'finance_order_meta',
    'finance_invoices',
    'finance_payments'
  ] loop
    execute format('alter table tosho.%I enable row level security', tbl);

    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      policy_name := tbl || '_' || op;
      execute format('drop policy if exists %I on tosho.%I', policy_name, tbl);

      if op = 'select' then
        if has_member_fn then
          execute format(
            'create policy %I on tosho.%I for select using (public.is_team_member(team_id))',
            policy_name, tbl);
        else
          execute format('create policy %I on tosho.%I for select using (true)', policy_name, tbl);
        end if;
      elsif op = 'insert' then
        if has_member_fn then
          execute format(
            'create policy %I on tosho.%I for insert with check (public.is_team_member(team_id))',
            policy_name, tbl);
        else
          execute format('create policy %I on tosho.%I for insert with check (true)', policy_name, tbl);
        end if;
      elsif op = 'update' then
        if has_member_fn then
          execute format(
            'create policy %I on tosho.%I for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id))',
            policy_name, tbl);
        else
          execute format('create policy %I on tosho.%I for update using (true) with check (true)', policy_name, tbl);
        end if;
      else -- delete
        if has_member_fn then
          execute format(
            'create policy %I on tosho.%I for delete using (public.is_team_member(team_id))',
            policy_name, tbl);
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

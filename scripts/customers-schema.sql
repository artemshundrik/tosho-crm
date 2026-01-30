-- Customers schema extensions for CRM
-- Safe to run multiple times.

alter table tosho.customers
  add column if not exists legal_name text,
  add column if not exists ownership_type text,
  add column if not exists vat_rate numeric,
  add column if not exists tax_id text,
  add column if not exists website text,
  add column if not exists iban text,
  add column if not exists logo_url text;

create index if not exists customers_team_name_idx
  on tosho.customers (team_id, name);

create index if not exists customers_team_legal_name_idx
  on tosho.customers (team_id, legal_name);

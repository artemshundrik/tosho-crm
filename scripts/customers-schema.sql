-- Customers schema extensions for CRM
-- Safe to run multiple times.

alter table tosho.customers
  add column if not exists legal_name text,
  add column if not exists manager text,
  add column if not exists ownership_type text,
  add column if not exists vat_rate numeric,
  add column if not exists tax_id text,
  add column if not exists website text,
  add column if not exists iban text,
  add column if not exists logo_url text,
  add column if not exists contact_name text,
  add column if not exists contact_position text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists contact_birthday date,
  add column if not exists signatory_name text,
  add column if not exists signatory_position text,
  add column if not exists reminder_at timestamptz,
  add column if not exists reminder_comment text,
  add column if not exists event_name text,
  add column if not exists event_at date,
  add column if not exists event_comment text,
  add column if not exists notes text;

create index if not exists customers_team_name_idx
  on tosho.customers (team_id, name);

create index if not exists customers_team_legal_name_idx
  on tosho.customers (team_id, legal_name);

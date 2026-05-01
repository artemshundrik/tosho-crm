-- Orders schema
-- Safe to run multiple times.

create table if not exists tosho.orders (
  id uuid primary key,
  team_id uuid not null,
  quote_id uuid unique,
  customer_id uuid null,
  quote_number text,
  customer_name text,
  customer_logo_url text,
  party_type text not null default 'customer',
  manager_user_id uuid null,
  manager_label text,
  currency text not null default 'UAH',
  total numeric not null default 0,
  payment_method_id text,
  payment_method_label text,
  payment_terms text not null default '70/30',
  incoterms_code text not null default 'FCA',
  incoterms_place text,
  order_status text not null default 'new',
  payment_status text not null default 'awaiting_payment',
  delivery_status text not null default 'not_shipped',
  contact_email text,
  contact_phone text,
  legal_entity_label text,
  customer_tax_id text,
  customer_iban text,
  customer_bank_details text,
  customer_legal_address text,
  signatory_label text,
  customer_signatory_authority text,
  design_statuses jsonb not null default '[]'::jsonb,
  documents jsonb not null default '{}'::jsonb,
  contract_created_at timestamptz,
  specification_created_at timestamptz,
  readiness_steps jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  readiness_column text not null default 'ready',
  has_approved_visualization boolean not null default false,
  has_approved_layout boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists tosho.orders
  add column if not exists payment_method_id text,
  add column if not exists payment_terms text not null default '70/30',
  add column if not exists incoterms_code text not null default 'FCA',
  add column if not exists incoterms_place text,
  add column if not exists customer_tax_id text,
  add column if not exists customer_iban text,
  add column if not exists customer_bank_details text,
  add column if not exists customer_legal_address text,
  add column if not exists customer_signatory_authority text,
  add column if not exists contract_created_at timestamptz,
  add column if not exists specification_created_at timestamptz;

create index if not exists orders_team_created_idx
  on tosho.orders (team_id, created_at desc);

create index if not exists orders_team_quote_idx
  on tosho.orders (team_id, quote_id);

create table if not exists tosho.order_items (
  id uuid primary key,
  team_id uuid not null,
  order_id uuid not null references tosho.orders(id) on delete cascade,
  quote_item_id uuid null,
  position integer,
  name text not null,
  description text,
  qty numeric not null default 0,
  unit text,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  methods jsonb,
  catalog_model_id uuid null,
  image_url text,
  thumb_url text,
  created_at timestamptz not null default now()
);

alter table if exists tosho.order_items
  add column if not exists description text,
  add column if not exists methods jsonb,
  add column if not exists catalog_model_id uuid null,
  add column if not exists image_url text,
  add column if not exists thumb_url text;

create index if not exists order_items_team_order_idx
  on tosho.order_items (team_id, order_id, position);

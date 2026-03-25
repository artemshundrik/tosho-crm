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
  payment_method_label text,
  order_status text not null default 'new',
  payment_status text not null default 'awaiting_payment',
  delivery_status text not null default 'not_shipped',
  contact_email text,
  contact_phone text,
  legal_entity_label text,
  signatory_label text,
  design_statuses jsonb not null default '[]'::jsonb,
  documents jsonb not null default '{}'::jsonb,
  readiness_steps jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  readiness_column text not null default 'ready',
  has_approved_visualization boolean not null default false,
  has_approved_layout boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  qty numeric not null default 0,
  unit text,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists order_items_team_order_idx
  on tosho.order_items (team_id, order_id, position);

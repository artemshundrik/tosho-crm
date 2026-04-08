-- Dropbox integration scaffold for Tosho CRM.
-- Safe additive migration: stores Dropbox folder metadata without changing the current attachment flow.

alter table tosho.customers
  add column if not exists dropbox_client_path text,
  add column if not exists dropbox_brand_path text,
  add column if not exists dropbox_shared_url text;

create index if not exists customers_team_dropbox_client_path_idx
  on tosho.customers (team_id, dropbox_client_path);

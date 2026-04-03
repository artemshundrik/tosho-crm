-- perf-disk-io-indexes.sql
-- Safe performance indexes for common read paths that showed up in CRM code review.
-- Run in Supabase SQL editor during a low-traffic window.
--
-- Focus:
-- 1) quotes list / overview filters
-- 2) quote items / attachments by quote_id
-- 3) notifications list / unread updates
-- 4) activity_log lookups for quote details and design-task derived reads

-- Quotes: newest lists, status filters, manager filters, customer quote lookups.
create index if not exists quotes_team_created_idx
  on tosho.quotes (team_id, created_at desc);

create index if not exists quotes_team_status_created_idx
  on tosho.quotes (team_id, status, created_at desc);

create index if not exists quotes_team_assigned_created_idx
  on tosho.quotes (team_id, assigned_to, created_at desc);

create index if not exists quotes_team_customer_created_idx
  on tosho.quotes (team_id, customer_id, created_at desc);

-- Quote rows loaded by quote_id inside a team with stable ordering by position.
create index if not exists quote_items_team_quote_position_idx
  on tosho.quote_items (team_id, quote_id, position);

create index if not exists quote_attachments_team_quote_created_idx
  on tosho.quote_attachments (team_id, quote_id, created_at desc);

-- Notifications: recent list, unread checks, and mark-as-read flows.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Generic quote/activity timeline reads.
create index if not exists activity_log_team_entity_created_idx
  on public.activity_log (team_id, entity_type, entity_id, created_at desc);

-- Design-task reads tied to a specific quote/order entity_id.
create index if not exists activity_log_design_task_team_entity_created_idx
  on public.activity_log (team_id, entity_id, created_at desc)
  where action = 'design_task';

-- Optional follow-up after index creation.
analyze tosho.quotes;
analyze tosho.quote_items;
analyze tosho.quote_attachments;
analyze public.notifications;
analyze public.activity_log;

-- Smoke checks (optional)
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname in ('public', 'tosho')
--   and indexname in (
--     'quotes_team_created_idx',
--     'quotes_team_status_created_idx',
--     'quotes_team_assigned_created_idx',
--     'quotes_team_customer_created_idx',
--     'quote_items_team_quote_position_idx',
--     'quote_attachments_team_quote_created_idx',
--     'notifications_user_created_idx',
--     'notifications_user_unread_created_idx',
--     'activity_log_team_entity_created_idx',
--     'activity_log_design_task_team_entity_created_idx'
--   );

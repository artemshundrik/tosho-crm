-- perf-disk-io-indexes-v2.sql
-- Incremental safe indexes for read paths found after the first optimization pass.
-- Run in Supabase SQL Editor during a low-traffic window.
--
-- Notes:
-- 1) Uses CONCURRENTLY to reduce write blocking on production traffic.
-- 2) No schema/data changes, only additive indexes plus ANALYZE.
-- 3) Run after scripts/perf-disk-io-indexes.sql.

-- Quote item reads often filter by quote_id without team_id.
create index concurrently if not exists quote_items_quote_position_idx
  on tosho.quote_items (quote_id, position);

-- Quote attachment reads often filter by quote_id without team_id.
create index concurrently if not exists quote_attachments_quote_created_idx
  on tosho.quote_attachments (quote_id, created_at desc);

-- Design page list reads newest design tasks by team + action.
create index concurrently if not exists activity_log_team_action_created_idx
  on public.activity_log (team_id, action, created_at desc);

-- Design/quotes/order flows often narrow by team + action + entity_id.
create index concurrently if not exists activity_log_team_action_entity_created_idx
  on public.activity_log (team_id, action, entity_id, created_at desc);

-- Completed-summary reads target design_task_status rows by team + entity_id + period.
create index concurrently if not exists activity_log_design_task_status_team_entity_created_idx
  on public.activity_log (team_id, entity_id, created_at desc)
  where action = 'design_task_status';

analyze tosho.quote_items;
analyze tosho.quote_attachments;
analyze public.activity_log;

-- Optional smoke checks:
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname in ('public', 'tosho')
--   and indexname in (
--     'quote_items_quote_position_idx',
--     'quote_attachments_quote_created_idx',
--     'activity_log_team_action_created_idx',
--     'activity_log_team_action_entity_created_idx',
--     'activity_log_design_task_status_team_entity_created_idx'
--   );

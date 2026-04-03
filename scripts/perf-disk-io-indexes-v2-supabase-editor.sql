-- perf-disk-io-indexes-v2-supabase-editor.sql
-- Same indexes as perf-disk-io-indexes-v2.sql, but without CONCURRENTLY
-- so the script can run as a single block in Supabase SQL Editor.
--
-- Run during a low-traffic window because non-concurrent index creation can
-- take stronger locks while each index is being built.

create index if not exists quote_items_quote_position_idx
  on tosho.quote_items (quote_id, position);

create index if not exists quote_attachments_quote_created_idx
  on tosho.quote_attachments (quote_id, created_at desc);

create index if not exists activity_log_team_action_created_idx
  on public.activity_log (team_id, action, created_at desc);

create index if not exists activity_log_team_action_entity_created_idx
  on public.activity_log (team_id, action, entity_id, created_at desc);

create index if not exists activity_log_design_task_status_team_entity_created_idx
  on public.activity_log (team_id, entity_id, created_at desc)
  where action = 'design_task_status';

analyze tosho.quote_items;
analyze tosho.quote_attachments;
analyze public.activity_log;

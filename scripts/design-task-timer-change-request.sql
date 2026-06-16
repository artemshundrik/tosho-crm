-- Per-change-request (правка) attribution for the design-task timer.
--
-- Adds an optional change_request_id to timer sessions so a designer can track
-- time spent on a specific правка separately, while the task total stays the
-- sum of ALL sessions (initial ТЗ work = sessions with NULL change_request_id,
-- plus one bucket per правка).
--
-- Safe to run before deploying the new client code:
--   * the column is additive and NULLABLE, so existing (general/ТЗ) timers keep working;
--   * NO RLS changes — row-level policies already cover the new column.
--
-- NOTE: design_task_timer_sessions lives in the PUBLIC schema (the timer lib uses
-- the default supabase client, not the `tosho` schema client). Do not move it.

alter table public.design_task_timer_sessions
  add column if not exists change_request_id uuid;

-- Speeds up the per-change-request breakdown query (group by design_task_id, change_request_id).
create index if not exists design_task_timer_sessions_task_change_request_idx
  on public.design_task_timer_sessions (design_task_id, change_request_id);

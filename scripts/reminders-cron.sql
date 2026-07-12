-- Restore scheduled reminders via Supabase pg_cron + pg_net.
--
-- Why: the reminder Netlify functions stopped running on Netlify's own scheduler
-- (team-events never registered; every-minute reminders went silent on 2026-06-18).
-- Instead of relying on Netlify's scheduled-functions feature, we trigger the SAME
-- public function endpoints from Postgres on a schedule we control (and that is free
-- on the existing Supabase plan).
--
-- Run this in the Supabase SQL Editor (it runs with enough privilege to create the
-- extensions). Re-running is safe: cron.schedule() upserts by job name.
--
-- Prereq extensions (also enable-able via Dashboard -> Database -> Extensions):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Reminder jobs. Each job fires a fire-and-forget POST to the Netlify endpoint.
-- The functions are idempotent: a partial unique index
-- (notifications_user_reminder_href_unique) blocks duplicate reminder rows, and
-- every reminder function now inserts with dedupeByHref, so re-runs are no-ops.
-- ---------------------------------------------------------------------------

-- Customer / lead follow-up reminders (was: Netlify "* * * * *").
select cron.schedule(
  'reminders-customer-lead',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/customer-lead-reminders',
       headers := jsonb_build_object('x-cron-key', coalesce(current_setting('app.cron_secret', true), '')),
       timeout_milliseconds := 20000) $$
);

-- Quote deadline reminders (was: Netlify "* * * * *").
select cron.schedule(
  'reminders-quote-deadline',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/quote-deadline-reminders',
       headers := jsonb_build_object('x-cron-key', coalesce(current_setting('app.cron_secret', true), '')),
       timeout_milliseconds := 20000) $$
);

-- Contractor / supplier reminders (was: Netlify "* * * * *").
select cron.schedule(
  'reminders-contractor',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/contractor-reminders',
       headers := jsonb_build_object('x-cron-key', coalesce(current_setting('app.cron_secret', true), '')),
       timeout_milliseconds := 20000) $$
);

-- Team events: birthdays / work anniversaries / vacation start+end.
-- Hourly at :05 (matches the function's original schedule). The function resolves
-- "today" in Europe/Kiev internally, so any hour-of-day trigger is correct.
select cron.schedule(
  'reminders-team-events',
  '5 * * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/team-events-reminders',
       headers := jsonb_build_object('x-cron-key', coalesce(current_setting('app.cron_secret', true), '')),
       timeout_milliseconds := 20000) $$
);

-- ---------------------------------------------------------------------------
-- Optional. Uncomment if you also want these back. Times below are UTC
-- (Kyiv = UTC+3 in summer / UTC+2 in winter, so they drift ~1h across DST).
-- ---------------------------------------------------------------------------

-- Probation review reminders (was 09:00 Kyiv):
-- select cron.schedule(
--   'reminders-probation', '0 6 * * *',
--   $$ select net.http_post(url := 'https://tosho.pro/.netlify/functions/probation-reminders', headers := jsonb_build_object('x-cron-key', coalesce(current_setting('app.cron_secret', true), '')), timeout_milliseconds := 20000) $$);

-- Activity-log retention -- DELETES old activity_log rows (was 03:20 Kyiv):
-- select cron.schedule(
--   'activity-log-retention', '20 0 * * *',
--   $$ select net.http_post(url := 'https://tosho.pro/.netlify/functions/activity-log-retention', headers := jsonb_build_object('x-cron-key', coalesce(current_setting('app.cron_secret', true), '')), timeout_milliseconds := 20000) $$);

-- ---------------------------------------------------------------------------
-- Verify after running:
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 20;
--
-- To stop a job:   select cron.unschedule('reminders-team-events');
--
-- Auth: each job sends an `x-cron-key` header from current_setting('app.cron_secret').
-- The functions enforce it once CRON_SHARED_SECRET is set in the Netlify env (fail-closed;
-- until then requests are allowed so nothing breaks). Activation runbook + verification:
-- docs/CRON_SECRET_ROLLOUT.md. Set the DB secret before re-running this file:
--   ALTER DATABASE postgres SET app.cron_secret = '<secret>';
--
-- Netlify free tier counts every invocation. Four "* * * * *" jobs ~= 172k
-- invocations/month. If you hit limits, change "* * * * *" to "*/5 * * * *".
-- ---------------------------------------------------------------------------

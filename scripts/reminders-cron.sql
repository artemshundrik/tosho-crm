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

-- Locked secret store for the x-cron-key header (pg_cron reads it; the value is inserted
-- manually and NEVER committed). RLS + revoked grants keep anon/authenticated out.
create table if not exists tosho.cron_config (key text primary key, value text not null);
alter table tosho.cron_config enable row level security;
revoke all on tosho.cron_config from anon, authenticated, public;
-- Provision once (see docs/CRON_SECRET_ROLLOUT.md):
--   insert into tosho.cron_config(key, value) values ('cron_secret', '<secret>')
--     on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Reminder jobs. Each job fires a fire-and-forget POST to the Netlify endpoint.
-- The functions are idempotent: a partial unique index
-- (notifications_user_reminder_href_unique) blocks duplicate reminder rows, and
-- every reminder function now inserts with dedupeByHref, so re-runs are no-ops.
-- ---------------------------------------------------------------------------

-- Три нагадування раз на п'ять хвилин — ОДНИМ джобом.
--
-- ЧОМУ РАЗОМ, А НЕ ТРИ ОКРЕМІ. pg_cron бере на кожен джоб окремий фоновий
-- процес, а їх в інстансі рівно шість (max_worker_processes). Три щохвилинні
-- джоби стартують в одну й ту саму секунду й тримають половину всього запасу.
-- 20.08.2026 це вилилось у 479 збоїв «job startup timeout» за ніч: pg_cron не
-- зміг підняти воркер, і наші функції в ті хвилини навіть не викликались.
--
-- Злиття НІЧОГО не міняє для людей: ті самі три виклики о тій самій хвилині,
-- просто одним `select` — pg_net кладе всі три в чергу й віддає керування, тож
-- воркер потрібен один замість трьох. Заодно втричі менше рядків у журналі
-- запусків (було ~4 300 на добу, стало ~1 400).
--
-- ЦІНА, яку варто знати: на дошці здоровʼя це тепер ОДИН рядок замість трьох.
-- Якщо мовчатиме конкретно одне з трьох нагадувань, джоб цього не покаже —
-- дивитись треба в самі функції (net._http_response) або в сповіщення.
--
-- Повернути три окремі джоби можна цим же файлом з історії git.
--
-- ЧОМУ РАЗ НА П'ЯТЬ ХВИЛИН, А НЕ ЩОХВИЛИНИ (29.08.2026). Хвилинний крон давав
-- 1440 запусків на добу × 3 виклики = 4320 звернень до Netlify-функцій. Це 98%
-- усіх викликів функцій і ~375 кредитів Netlify на місяць — третина місячного
-- пакета, друга стаття витрат одразу після викочувань (docs/DEPLOY_POLICY.md §2).
--
-- Затримки це не додає ЖОДНОЇ: усі 303 наявні часи нагадувань у базі стоять на
-- п'ятихвилинних мітках (22 з 22 у клієнтах, 281 з 281 у дедлайнах прорахунків,
-- офсети — 0, 15 і 60 хвилин). Тобто крон і далі спрацьовує рівно тієї хвилини,
-- на яку людина поставила нагадування. Якщо колись з'явиться час на кшталт 14:03,
-- нагадування прийде о 14:05 — на чотири хвилини пізніше, і це не дефект.
--
-- Повернути щохвилинний ритм: замінити '*/5 * * * *' на '* * * * *' і
-- застосувати файл заново (`npm run db:apply scripts/reminders-cron.sql`).

do $$
begin
  -- Прибираємо попередників, якщо вони ще стоять. Через exists, бо
  -- cron.unschedule на неіснуючому імені кидає помилку й валить весь файл.
  if exists (select 1 from cron.job where jobname = 'reminders-customer-lead') then
    perform cron.unschedule('reminders-customer-lead');
  end if;
  if exists (select 1 from cron.job where jobname = 'reminders-quote-deadline') then
    perform cron.unschedule('reminders-quote-deadline');
  end if;
  if exists (select 1 from cron.job where jobname = 'reminders-contractor') then
    perform cron.unschedule('reminders-contractor');
  end if;
end $$;

select cron.schedule(
  'reminders-minute',
  '*/5 * * * *',
  $$ select
       net.http_post(
         url := 'https://tosho.pro/.netlify/functions/customer-lead-reminders',
         headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
         timeout_milliseconds := 20000),
       net.http_post(
         url := 'https://tosho.pro/.netlify/functions/quote-deadline-reminders',
         headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
         timeout_milliseconds := 20000),
       net.http_post(
         url := 'https://tosho.pro/.netlify/functions/contractor-reminders',
         headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
         timeout_milliseconds := 20000) $$
);

-- Team events: birthdays / work anniversaries / vacation start+end.
-- Hourly at :00. The function resolves "today" in Europe/Kiev internally, so any
-- hour-of-day trigger is correct; the minute matters only because quiet hours
-- open at 08:00 and the team asked for the notification AT 08:00, not 08:05.
--
-- URL має суфікс -background: функція фонова (див. коментар у самому файлі).
-- Відповідь тепер завжди 202 з порожнім тілом — діагностика переїхала
-- в tosho.notification_deliveries.
select cron.schedule(
  'reminders-team-events',
  '0 * * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/team-events-reminders-background',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 20000) $$
);

-- Finance payment reminders: «за N днів до next_charge_date» + прокрутка дати вперед.
-- Раз на день (функція резолвить «сьогодні» в Europe/Kiev, тож година не критична).
-- ВАЖЛИВО: планувати лише ПІСЛЯ деплою функції finance-payment-reminders на прод.
select cron.schedule(
  'reminders-finance-payment',
  '0 6 * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/finance-payment-reminders',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 20000) $$
);

-- ---------------------------------------------------------------------------
-- Optional. Uncomment if you also want these back. Times below are UTC
-- (Kyiv = UTC+3 in summer / UTC+2 in winter, so they drift ~1h across DST).
-- ---------------------------------------------------------------------------

-- Probation review reminders (was 09:00 Kyiv):
-- select cron.schedule(
--   'reminders-probation', '0 6 * * *',
--   $$ select net.http_post(url := 'https://tosho.pro/.netlify/functions/probation-reminders', headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')), timeout_milliseconds := 20000) $$);

-- Activity-log retention -- DELETES old activity_log rows (was 03:20 Kyiv):
-- select cron.schedule(
--   'activity-log-retention', '20 0 * * *',
--   $$ select net.http_post(url := 'https://tosho.pro/.netlify/functions/activity-log-retention', headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')), timeout_milliseconds := 20000) $$);

-- ---------------------------------------------------------------------------
-- Verify after running:
--   select jobid, jobname, schedule, active from cron.job order by jobname;
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 20;
--
-- To stop a job:   select cron.unschedule('reminders-team-events');
--
-- Auth: each job sends an `x-cron-key` header read from tosho.cron_config (locked table,
-- created above). The functions enforce it once CRON_SHARED_SECRET is set in the Netlify
-- env (until then requests are allowed so nothing breaks). Store the secret before/after
-- scheduling:
--   insert into tosho.cron_config(key,value) values('cron_secret','<secret>')
--     on conflict (key) do update set value = excluded.value;
-- Activation runbook + verification: docs/CRON_SECRET_ROLLOUT.md.
--
-- Netlify free tier counts every invocation. Four "* * * * *" jobs ~= 172k
-- invocations/month. If you hit limits, change "* * * * *" to "*/5 * * * *".
-- ---------------------------------------------------------------------------

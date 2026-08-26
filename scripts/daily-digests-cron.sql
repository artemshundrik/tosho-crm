-- ---------------------------------------------------------------------------
-- Розклад щоденних дайджестів (docs/DAILY_DIGESTS_DESIGN.md §3, §9).
--
-- ВАЖЛИВО: застосовувати ЛИШЕ ПІСЛЯ того, як
--   1) функція daily-digest задеплоєна на prod,
--   2) застосовано scripts/daily-digests.sql,
--   3) вигляд звітів перевірено через ?dry=1.
-- Інакше cron стукатиме в 404 або розішле недопрацьований звіт живим людям.
--
-- Час у cron — UTC. Київ = UTC+3 влітку / UTC+2 взимку, тож розсилка взимку
-- зсувається на годину пізніше. Прийнято свідомо (як у reminders-cron.sql):
-- «сьогодні» всередині функції резолвиться в Europe/Kiev, тож дані коректні.
--
-- Re-run безпечний: cron.schedule() робить upsert за іменем джоба.
-- ---------------------------------------------------------------------------

-- Тех-звіт: 07:45 Київ (літо) — суперадміну.
select cron.schedule(
  'digest-tech',
  '45 4 * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/daily-digest?kind=tech',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 30000) $$
);

-- Бізнес-звіт «що сьогодні»: 08:15 Київ (літо) — СЕО + суперадмін.
select cron.schedule(
  'digest-business-morning',
  '15 5 * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/daily-digest?kind=business_morning',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 30000) $$
);

-- Бізнес-звіт «що сталося»: 19:00 Київ (літо) — СЕО + суперадмін.
select cron.schedule(
  'digest-business-evening',
  '0 16 * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/daily-digest?kind=business_evening',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 30000) $$
);

-- ---------------------------------------------------------------------------
-- Перевірка:
--   select jobname, schedule, active from cron.job where jobname like 'digest-%';
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
--
-- Зупинити окрему розсилку:
--   select cron.unschedule('digest-tech');
--   select cron.unschedule('digest-business-morning');
--   select cron.unschedule('digest-business-evening');
-- ---------------------------------------------------------------------------

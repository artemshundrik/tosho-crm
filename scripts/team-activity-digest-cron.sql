-- manual: застосовувати ЛИШЕ ПІСЛЯ деплою daily-digest з kind=team_activity і
-- перевірки тексту через ?dry=1 — інакше крон стукатиме в 400 або розішле
-- недопрацьований звіт живим людям.
--
-- Ранковий звіт «Робота в CRM» за вчора (REQ-331): власнику й CEO, хто з
-- категорією «Робота команди в CRM» увімкненою в Telegram.
--
-- 08:20 Київ улітку (UTC+3), 07:20 узимку — та сама свідома угода, що й у
-- scripts/daily-digests-cron.sql: крон у UTC, «учора» функція рахує в Europe/Kiev.
-- Після бізнес-звіту о 08:15, щоб два повідомлення не злипались в одне.
--
-- Re-run безпечний: cron.schedule() робить upsert за іменем джоба.

select cron.schedule(
  'digest-team-activity',
  '20 5 * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/daily-digest?kind=team_activity',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 30000) $$
);

-- Перевірка:
--   select jobname, schedule, active from cron.job where jobname = 'digest-team-activity';
-- Зупинити:
--   select cron.unschedule('digest-team-activity');

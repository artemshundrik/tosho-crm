-- Чекліст «закрити місяць» для журнальних витрат (комуналка, вода, прибирання).
--
-- Why: у журнальних витрат (finance_expenses.amount_varies = true) немає дати
-- списання, тож нагадування про платіж їх не бачить за дизайном. Наслідок —
-- місяць просто забувають внести (за серпень 2026 станом на 06.08 не було
-- жодного запису, хоча комуналку Богданівської вели стабільно лютий–липень).
--
-- Дві стадії, кожна — окрема джоба (стадію функція читає з query):
--   soft  25-го — про ПОТОЧНИЙ місяць, мʼяке попередження;
--   final  5-го — про ПОПЕРЕДНІЙ місяць, коли платежі вже точно пройшли
--                 (до 5-го числа ще бувають доплати за минулий місяць).
--
-- Обидві о 06:00 UTC ≈ 09:00 Київ. Функція резолвить «сьогодні» в Europe/Kiev
-- сама, тож точна година тригера не критична.
--
-- Re-running is safe: cron.schedule() upserts by job name.
-- Prereqs: pg_cron + pg_net + tosho.cron_config — усе вже створено
-- scripts/reminders-cron.sql.

select cron.schedule(
  'finance-month-close-soft',
  '0 6 25 * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/finance-month-close-reminders?stage=soft',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 20000) $$
);

select cron.schedule(
  'finance-month-close-final',
  '0 6 5 * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/finance-month-close-reminders?stage=final',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 20000) $$
);

-- ---------------------------------------------------------------------------
-- Перевірка після застосування:
--   select jobid, jobname, schedule, active from cron.job where jobname like 'finance-month-close%';
--   select jobname, status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 20;
--
-- Сухий прогін без запису сповіщень (показує склад списку):
--   .../finance-month-close-reminders?stage=soft&dry=1
--
-- Зняти джобу:  select cron.unschedule('finance-month-close-soft');
-- ---------------------------------------------------------------------------

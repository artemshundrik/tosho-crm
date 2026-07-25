-- ---------------------------------------------------------------------------
-- Нагадування про забутий таймер дизайн-задачі.
--
-- Раз на добу, а не щогодини. Забутий таймер — не аварія: він нікому не
-- заважає, крім самого дизайнера, чий час перестає рахуватись після 8 годин.
-- Щогодинне нагадування про це швидко стало б фоном, який перестають читати.
--
-- 15:10 UTC ≈ 18:10 Київ — кінець робочого дня: саме той момент, коли варто
-- згадати, що таймер досі йде. Дедуплікація в самій функції прив'язана до дати,
-- тож одна забута сесія нагадає раз на добу, поки її не зупинять.
--
-- ВАЖЛИВО: планувати лише ПІСЛЯ деплою функції на prod.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/design-timer-reminders-cron.sql
-- ---------------------------------------------------------------------------

select cron.schedule(
  'design-timer-reminders',
  '10 15 * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/design-timer-reminders',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 30000) $$
);

-- ---------------------------------------------------------------------------
-- Перевірка:
--   select jobname, schedule, active from cron.job where jobname='design-timer-reminders';
--   select id, user_id, started_at from public.design_task_timer_sessions where paused_at is null;
-- Зупинити: select cron.unschedule('design-timer-reminders');
-- ---------------------------------------------------------------------------

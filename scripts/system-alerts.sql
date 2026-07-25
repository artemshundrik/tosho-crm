-- ---------------------------------------------------------------------------
-- Стан алертів — щоб червоне не бомбардувало щогодини.
--
-- Дайджест каже про проблему раз на добу вранці. Алерти закривають дірку між
-- «зламалось о 9:00» і «дізнався о 07:45 наступного дня». Але сигнал, який
-- горить постійно, треба показати ОДИН раз, а не 24 рази на добу — інакше його
-- почнуть ігнорувати, і сенс алертів зникне.
--
-- Тому зберігаємо відбиток набору проблем: шлемо лише коли він ЗМІНИВСЯ, або
-- коли той самий набір висить довше за cooldown.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/system-alerts.sql
-- ---------------------------------------------------------------------------

create table if not exists tosho.alert_state (
  key          text primary key,
  fingerprint  text not null,
  notified_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table tosho.alert_state is
  'Останній надісланий набір критичних сигналів. Відбиток гасить повтори.';

alter table tosho.alert_state enable row level security;
revoke all on tosho.alert_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Розклад: щогодини о :20. Частіше немає сенсу — збір метрик сканує storage,
-- а для «бекап впав» чи «cron помер» година реакції цілком прийнятна.
-- ВАЖЛИВО: планувати лише ПІСЛЯ деплою функції system-alerts.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'system-alerts',
  '20 * * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/system-alerts',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 30000) $$
);

-- ---------------------------------------------------------------------------
-- Перевірка:
--   select * from tosho.alert_state;
--   select jobname, schedule, active from cron.job where jobname='system-alerts';
-- Скинути стан (щоб алерт прийшов знову): delete from tosho.alert_state;
-- Зупинити: select cron.unschedule('system-alerts');
-- ---------------------------------------------------------------------------

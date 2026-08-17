-- Журнал доставки сповіщень.
--
-- Навіщо: 17.08.2026 команда скаржилась, що ранкове сповіщення про відпустку
-- прийшло не всім. Рядки в public.notifications були у ВСІХ — тобто подія
-- знайшлась і в дзвіночок лягла, — а от чи пішов пуш і Telegram, з'ясувати
-- було НІЧИМ: ніде не лишалось жодного сліду. Розслідування впиралось у
-- здогадки, і навіть відповідь крона до того часу вже витиралась із
-- net._http_response. Ця таблиця закриває саме цю дірку.
--
-- Пишеться з _notificationDelivery.ts на кожну пару (сповіщення × канал),
-- включно з тими, кого свідомо пропустили: «не прив'язав бота» — це теж
-- відповідь на питання «чому не прийшло», і найчастіша.

create table if not exists tosho.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null,
  -- 'push' | 'telegram'
  channel text not null check (channel in ('push', 'telegram')),
  -- sent — пішло; failed — канал відмовив; skipped — свідомо не слали
  status text not null check (status in ('sent', 'failed', 'skipped')),
  -- Короткий код причини: not_linked, telegram_off, channel_off,
  -- no_subscription, http_410 тощо. Без тексту помилок від провайдера —
  -- вони можуть містити токени.
  reason text,
  category text,
  created_at timestamptz not null default now()
);

create index if not exists notification_deliveries_created_idx
  on tosho.notification_deliveries (created_at desc);
create index if not exists notification_deliveries_notification_idx
  on tosho.notification_deliveries (notification_id);
create index if not exists notification_deliveries_user_idx
  on tosho.notification_deliveries (user_id, created_at desc);

-- Журнал службовий: пише і читає лише service_role. RLS увімкнено БЕЗ політик,
-- гранти знято явно — у tosho.* діють default privileges, і без цього рядка
-- нова таблиця виявилась би читабельною з браузера (так уже було з HR-таблицями).
alter table tosho.notification_deliveries enable row level security;
revoke all on tosho.notification_deliveries from anon, authenticated;

comment on table tosho.notification_deliveries is
  'Хто, яким каналом і з яким результатом отримав сповіщення. Службовий журнал, лише service_role. Чистити разом з activity_log.';

-- Telegram-сповіщення, фаза 1: прив'язка акаунта + глобальний тумблер.
-- Схема per-user (як notifications/push_subscriptions), без workspace_id.
-- Застосовувати на prod вручну (DDL). Після — задеплоїти функції та зареєструвати webhook (див. docs/TELEGRAM_NOTIFICATIONS_DESIGN.md §12).

-- 1. Налаштування сповіщень користувача (єдине джерело правди).
create table if not exists tosho.user_notification_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  telegram_chat_id   bigint,                         -- null = Telegram не підключено
  telegram_username  text,
  telegram_linked_at timestamptz,
  telegram_enabled   boolean not null default true,  -- фаза 1: глобальний тумблер
  channel_prefs      jsonb   not null default '{}'::jsonb, -- зарезервовано під фазу 2 (матриця тип×канал)
  created_at         timestamptz not null default timezone('utc', now()),
  updated_at         timestamptz not null default timezone('utc', now())
);

-- 2. Одноразові токени прив'язки (deep-link t.me/ToShoCRM_bot?start=<nonce>).
create table if not exists tosho.telegram_link_tokens (
  nonce       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists telegram_link_tokens_user_id_idx on tosho.telegram_link_tokens(user_id);
create index if not exists telegram_link_tokens_expires_idx on tosho.telegram_link_tokens(expires_at) where used_at is null;
-- швидкий пошук за chat_id (webhook /stop):
create index if not exists user_notification_settings_chat_id_idx
  on tosho.user_notification_settings(telegram_chat_id) where telegram_chat_id is not null;

-- 3. updated_at тригер.
create or replace function tosho.set_user_notification_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists user_notification_settings_set_updated_at on tosho.user_notification_settings;
create trigger user_notification_settings_set_updated_at
before update on tosho.user_notification_settings
for each row execute function tosho.set_user_notification_settings_updated_at();

-- 4. Гранти (RLS все одно гейтить рядки; webhook працює service-role і обходить RLS).
grant usage on schema tosho to authenticated;
grant select, insert, update on tosho.user_notification_settings to authenticated;
grant select, insert on tosho.telegram_link_tokens to authenticated;

-- 5. RLS: користувач бачить/редагує лише свій рядок.
alter table tosho.user_notification_settings enable row level security;

drop policy if exists "uns_select_own" on tosho.user_notification_settings;
create policy "uns_select_own" on tosho.user_notification_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "uns_insert_own" on tosho.user_notification_settings;
create policy "uns_insert_own" on tosho.user_notification_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "uns_update_own" on tosho.user_notification_settings;
create policy "uns_update_own" on tosho.user_notification_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table tosho.telegram_link_tokens enable row level security;

drop policy if exists "tlt_select_own" on tosho.telegram_link_tokens;
create policy "tlt_select_own" on tosho.telegram_link_tokens
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "tlt_insert_own" on tosho.telegram_link_tokens;
create policy "tlt_insert_own" on tosho.telegram_link_tokens
  for insert to authenticated with check (auth.uid() = user_id);

notify pgrst, 'reload schema';

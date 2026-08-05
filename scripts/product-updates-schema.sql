-- Анонси оновлень CRM: «що змінилося», на відміну від каталогу, який
-- відповідає «що взагалі є».
--
-- НАВІЩО ОКРЕМА СУТНІСТЬ: більшість релізів — це покращення наявних фіч, а не
-- нові можливості. Каталогом такі зміни не показати: там немає рядка, який
-- можна було б «оновити».

create table if not exists tosho.product_updates (
  id            uuid        primary key default gen_random_uuid(),
  published_at  timestamptz not null default now(),
  title         text        not null,
  body          text        not null,
  /**
   * major — рідкісна велика фіча, показується постером;
   * minor — звичайне покращення, живе тільки в стрічці й дайджесті.
   */
  importance    text        not null default 'minor'
                            check (importance in ('major', 'minor')),
  /** Кому показувати. null = усім. Звіряється з module_access у застосунку. */
  module_key    text,
  /** Ключ можливості в каталозі — щоб з анонсу провалитись в онбординг. */
  feature_key   text,
  cta_label     text,
  cta_href      text,
  created_by    uuid,
  /** Проставляється після розсилки в Telegram, щоб не задвоїти (фаза 4). */
  telegram_broadcast_at timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists product_updates_published_idx
  on tosho.product_updates (published_at desc);

alter table tosho.product_updates enable row level security;

/**
 * Читають усі співробітники. Звуження за module_key робимо в застосунку тим
 * самим hasModuleAccess, що й у каталозі: заголовок анонсу — це внутрішня
 * новина продукту, а не чутливі дані, тож ціна помилки тут нульова, а RLS з
 * розбором module_access була б дорогою і крихкою.
 */
drop policy if exists product_updates_read on tosho.product_updates;
create policy product_updates_read on tosho.product_updates
  for select using (auth.uid() is not null);

revoke all on tosho.product_updates from anon;
grant select on tosho.product_updates to authenticated;

-- Хто що бачив. Саме це замінює здогадки «читали чи ні».
create table if not exists tosho.product_update_reads (
  update_id uuid        not null references tosho.product_updates(id) on delete cascade,
  user_id   uuid        not null,
  seen_at   timestamptz not null default now(),
  /** Де саме побачив: modal | feed. Показує, який канал працює. */
  source    text        not null default 'feed',
  primary key (update_id, user_id)
);

create index if not exists product_update_reads_user_idx
  on tosho.product_update_reads (user_id);

alter table tosho.product_update_reads enable row level security;

drop policy if exists product_update_reads_self on tosho.product_update_reads;
create policy product_update_reads_self on tosho.product_update_reads
  for select using (user_id = auth.uid());

drop policy if exists product_update_reads_insert on tosho.product_update_reads;
create policy product_update_reads_insert on tosho.product_update_reads
  for insert with check (user_id = auth.uid());

-- Зріз «переглянули 9 з 14» — власнику й SEO (фаза 5).
drop policy if exists product_update_reads_privileged on tosho.product_update_reads;
create policy product_update_reads_privileged on tosho.product_update_reads
  for select using (tosho.can_read_all_feature_adoption());

revoke all on tosho.product_update_reads from anon;
grant select, insert on tosho.product_update_reads to authenticated;

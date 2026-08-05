-- Стан підказок «спробуй цю можливість».
--
-- НАВІЩО ОКРЕМА ТАБЛИЦЯ, А НЕ localStorage: діюча промо-модалка бота саме на
-- цьому й обманювалась — лічильник показів жив у браузері, тож новий пристрій
-- чи очищене сховище обнуляли його, і людина бачила те саме вкотре. Тут стан
-- прив'язаний до людини, а не до браузера.
--
-- Підказка — найтихіший з каналів (маленький натяк біля наявної кнопки), але
-- правила все одно жорсткі: показуємо лише тим, хто фічу НЕ пробував,
-- максимум тричі за все життя й не частіше ніж раз на тиждень.

create table if not exists tosho.feature_hints (
  user_id      uuid        not null,
  feature_key  text        not null,
  shown_count  integer     not null default 0,
  last_shown_at timestamptz,
  dismissed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (user_id, feature_key)
);

alter table tosho.feature_hints enable row level security;

-- Свій стан людина і читає, і пише — це її власні налаштування показу.
drop policy if exists feature_hints_self_read on tosho.feature_hints;
create policy feature_hints_self_read on tosho.feature_hints
  for select using (user_id = auth.uid());

drop policy if exists feature_hints_self_insert on tosho.feature_hints;
create policy feature_hints_self_insert on tosho.feature_hints
  for insert with check (user_id = auth.uid());

drop policy if exists feature_hints_self_update on tosho.feature_hints;
create policy feature_hints_self_update on tosho.feature_hints
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on tosho.feature_hints from anon;
grant select, insert, update on tosho.feature_hints to authenticated;

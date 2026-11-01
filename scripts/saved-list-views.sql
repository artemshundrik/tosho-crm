-- ---------------------------------------------------------------------------
-- Збережені вигляди списків (хвиля В5, картка 346).
--
-- Над таблицею прорахунків замість вкладок-статусів стоять вигляди: вбудовані
-- («Активні», «Мої», «Горять», «Усі») живуть у коді, а свої набори фільтрів
-- людина зберігає сюди. Вигляд — особистий: кожен бачить і міняє лише свої
-- рядки, тож у політиках тільки user_id = auth.uid().
--
-- state — знімок фільтрів сторінки (стан, менеджер, замовник, сортування);
-- його форму знає лише клієнт, база в нього не заглядає.
--
-- Нова сторінка: create table if not exists НЕ оновить check на page —
-- додавай її окремим alter table … drop/add constraint.
--
-- Застосування: npm run db:apply scripts/saved-list-views.sql
-- ---------------------------------------------------------------------------

create table if not exists tosho.saved_list_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page text not null check (page in ('quotes')),
  name text not null check (char_length(name) between 1 and 40),
  state jsonb not null default '{}'::jsonb check (pg_column_size(state) <= 16384),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists saved_list_views_user_page_idx
  on tosho.saved_list_views (user_id, page, created_at);

alter table tosho.saved_list_views enable row level security;

drop policy if exists saved_list_views_select_own on tosho.saved_list_views;
create policy saved_list_views_select_own on tosho.saved_list_views
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists saved_list_views_insert_own on tosho.saved_list_views;
create policy saved_list_views_insert_own on tosho.saved_list_views
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists saved_list_views_delete_own on tosho.saved_list_views;
create policy saved_list_views_delete_own on tosho.saved_list_views
  for delete to authenticated using (user_id = (select auth.uid()));

-- Default ACL схеми tosho роздає гранти новим таблицям, і revoke from public їх
-- не знімає — тож гранти виставляємо явно: anon не має нічого, authenticated —
-- рівно три дії, які дозволяють політики. Оновлення немає: перейменувати =
-- видалити й зберегти знову.
revoke all on tosho.saved_list_views from anon, authenticated;
grant select, insert, delete on tosho.saved_list_views to authenticated;

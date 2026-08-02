-- Панель обговорення справи, фаза A. Див. docs/TASK_CHAT_DESIGN.md.
-- Safe to run multiple times.
--
-- Розвідка проду 2026-08-02 (docs/TASK_CHAT_PLAN.md, задача 1):
--   * у таблиці ВЖЕ є enum tosho.quote_comment_type = internal|client, де
--     "internal" означає «не для клієнта». Тому нова колонка зветься
--     visibility зі значеннями team|finance — слово internal не переюзовуємо.
--   * політики тримаються на is_team_member(team_id): цей helper несе гейт
--     заблокованих співробітників, тому в новій політиці зберігаємо саме його.
--   * події НЕ пишемо сюди — вони вже є в public.activity_log.
-- Відкат політик: scripts/task-chat-schema-rollback.sql

begin;

-- 1. Колонки нитки -----------------------------------------------------------
alter table tosho.quote_comments
  add column if not exists thread_key  text,
  add column if not exists kind        text not null default 'message',
  add column if not exists visibility  text not null default 'team',
  add column if not exists source      text not null default 'crm',
  add column if not exists is_pinned   boolean not null default false,
  add column if not exists thread_meta jsonb not null default '{}'::jsonb;

update tosho.quote_comments
set thread_key = 'quote:' || quote_id::text
where thread_key is null and quote_id is not null;

alter table tosho.quote_comments
  alter column thread_key set not null,
  alter column quote_id   drop not null,   -- ручні замовлення без прорахунку
  alter column created_by drop not null;   -- запас під системні/telegram-записи

alter table tosho.quote_comments
  drop constraint if exists quote_comments_kind_check;
alter table tosho.quote_comments
  add constraint quote_comments_kind_check check (kind in ('message','event'));

alter table tosho.quote_comments
  drop constraint if exists quote_comments_visibility_check;
alter table tosho.quote_comments
  add constraint quote_comments_visibility_check check (visibility in ('team','finance'));

alter table tosho.quote_comments
  drop constraint if exists quote_comments_source_check;
alter table tosho.quote_comments
  add constraint quote_comments_source_check check (source in ('crm','telegram'));

create index if not exists quote_comments_thread_idx
  on tosho.quote_comments (thread_key, created_at desc);

-- 2. Позначки прочитання -----------------------------------------------------
create table if not exists tosho.thread_reads (
  user_id      uuid not null references auth.users(id) on delete cascade,
  thread_key   text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread_key)
);

alter table tosho.thread_reads enable row level security;

drop policy if exists thread_reads_own on tosho.thread_reads;
create policy thread_reads_own on tosho.thread_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on tosho.thread_reads to authenticated;

-- 3. Видимість «лише фінанси» в RLS -----------------------------------------
-- Було: for select using (is_team_member(team_id))
drop policy if exists quote_comments_select on tosho.quote_comments;
create policy quote_comments_select on tosho.quote_comments
  for select using (
    is_team_member(team_id)
    and (visibility = 'team' or tosho.has_finance_access(team_id))
  );

-- Було: for insert with check (is_team_member(team_id))
drop policy if exists quote_comments_insert on tosho.quote_comments;
create policy quote_comments_insert on tosho.quote_comments
  for insert with check (
    is_team_member(team_id)
    and (visibility = 'team' or tosho.has_finance_access(team_id))
  );

-- 3.1. Автозаповнення thread_key --------------------------------------------
-- КРИТИЧНО: наявний код (QuoteDetailsPage, netlify/functions/quote-comments.ts)
-- вставляє коментарі БЕЗ thread_key. Оскільки колонка not null, без цього
-- тригера всі старі шляхи запису падали б. BEFORE INSERT спрацьовує до
-- перевірки not null, тож ключ проставляється сам.
create or replace function tosho.fill_quote_comment_thread_key()
returns trigger
language plpgsql
as $$
begin
  if new.thread_key is null then
    if new.quote_id is not null then
      new.thread_key := 'quote:' || new.quote_id::text;
    else
      raise exception 'quote_comments: потрібен thread_key або quote_id';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_comments_fill_thread_key on tosho.quote_comments;
create trigger quote_comments_fill_thread_key
  before insert on tosho.quote_comments
  for each row
  execute function tosho.fill_quote_comment_thread_key();

-- 4. Realtime ----------------------------------------------------------------
-- Публікація supabase_realtime на проді була ПОРОЖНЯ (розвідка 2026-08-02),
-- тому підписки postgres_changes мовчали. Додаємо лише свою таблицю; решту
-- (public.notifications, public.activity_log) вмикати окремим рішенням CEO.
do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'tosho'
      and c.relname = 'quote_comments'
  ) then
    execute 'alter publication supabase_realtime add table tosho.quote_comments';
  end if;
end
$$;

commit;

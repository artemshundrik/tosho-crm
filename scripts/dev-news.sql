-- ---------------------------------------------------------------------------
-- Ранкова підбірка для розробки (REQ-239): схема.
--
-- Дві речі:
--   1. tosho.digest_log приймає ще один вид розсилки — 'dev_news';
--   2. tosho.dev_news_seen — пам'ять про те, що вже надсилали.
--
-- Обидві суто серверні: жодних грантів для anon/authenticated. Читає їх лише
-- Netlify-функція dev-news.ts під service-role ключем.
--
-- Застосування: npm run db:apply (або psql "$BACKUP_DB_URL" -f scripts/dev-news.sql)
-- Розклад cron — окремим файлом scripts/dev-news-cron.sql, і ЛИШЕ ПІСЛЯ того,
-- як функція задеплоєна: інакше джоб добу стукатиме в 404.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Ще один вид у журналі відправок
-- ---------------------------------------------------------------------------
-- digest_log тримає ідемпотентність «одна розсилка на добу», і його CHECK
-- перелічує види поіменно. Підбірка — четвертий.
alter table tosho.digest_log drop constraint if exists digest_log_kind_check;
alter table tosho.digest_log add constraint digest_log_kind_check
  check (kind in ('tech', 'business_morning', 'business_evening', 'dev_news'));

-- ---------------------------------------------------------------------------
-- 2. Що вже надсилали
-- ---------------------------------------------------------------------------
-- НАВІЩО ОКРЕМА ТАБЛИЦЯ, А НЕ ДАТА В digest_log. Журнал відповідає на питання
-- «чи йшла сьогодні розсилка», а тут інше питання — «чи бачив він уже САМЕ ЦЕЙ
-- реліз». Без другої пам'яті підбірка щоранку повторювала б той самий рядок
-- про vite 8.2.0, поки той лишається найновішим, і за три дні перестала б
-- читатись.
--
-- Ключ складає src/lib/devNews.ts і навмисно НЕ містить дати: те саме
-- оновлення, побачене двічі, дає той самий рядок.
create table if not exists tosho.dev_news_seen (
  key            text primary key,
  first_seen_at  timestamptz not null default now()
);

create index if not exists dev_news_seen_first_seen_idx
  on tosho.dev_news_seen (first_seen_at);

comment on table tosho.dev_news_seen is
  'Що вже показувала ранкова підбірка для розробки. Чистку старших за 60 днів робить сама функція dev-news.';

alter table tosho.dev_news_seen enable row level security;
revoke all on tosho.dev_news_seen from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Перевірка:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'tosho.digest_log'::regclass and contype = 'c';
--   select count(*) from tosho.dev_news_seen;
-- ---------------------------------------------------------------------------

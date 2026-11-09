-- Короткі посилання на файли для замовника (картка 357).
--
-- ЩО ТУТ. Рядок = одна сторінка tosho.pro/f/<code>: заголовок і перелік файлів.
-- Файли лишаються в приватному сховищі; доступ видається щоразу заново.
--
-- ЧОМУ БЕЗ ПОЛІТИК. Читає й пише лише функція file-share під service role.
-- Браузеру ця таблиця не потрібна, а anon узагалі не має її бачити: код у ній
-- і є перепусткою до файлу. RLS увімкнено, грантів для anon/authenticated немає.
--
-- БЕЗПЕЧНО ЗАСТОСОВУВАТИ ПОВТОРНО.

create table if not exists tosho.file_share_links (
  code text primary key check (code ~ '^[A-Za-z0-9]{10}$'),
  team_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  files jsonb not null check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 1 and 30),
  created_by uuid not null,
  created_by_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists file_share_links_team_created_idx
  on tosho.file_share_links (team_id, created_at desc);

alter table tosho.file_share_links enable row level security;

revoke all on tosho.file_share_links from anon, authenticated, public;
grant select, insert on tosho.file_share_links to service_role;

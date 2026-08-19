-- Журнал комітів: коли робота СТАЛАСЬ, незалежно від того, коли її викотили.
--
-- НАВІЩО ОКРЕМО ВІД tosho.releases: релізи пише плагін Netlify у мить успішного
-- деплою. Поки не запушив — на сторінці «Релізи» дня немає взагалі, хоча години
-- в tosho.work_sessions за цей день уже записані. Виходило, що два прилади на
-- одній сторінці суперечать одне одному: години кажуть «працював», коміти —
-- «нічого». Реальний випадок 19.08.2026: три дні без пушу виглядали порожніми.
--
-- РОЗПОДІЛ РОЛЕЙ:
--   · tosho.commits  — що і коли зроблено (пише машина розробника на коміті);
--   · tosho.releases — що і коли викочено (пише деплой).
-- Це різні питання, і зливати їх в одну таблицю означало б відповідати на
-- обидва неправильно.
--
-- Джерело — git log локального репозиторію, тож завантажує скрипт із машини
-- (scripts/record-commits.mjs), як і години. Netlify до нього доступу не має.

create table if not exists tosho.commits (
  /** Скорочений sha, 8 символів — той самий формат, що в releases.changes. */
  sha          text        primary key,
  /** Час коміта в UTC — для сортування й діапазонів. */
  committed_at timestamptz not null,
  /**
   * Той самий час, але РЯДКОМ із зсувом, як його віддає git (%cI):
   * «2026-08-19T01:19:44+03:00». Саме з нього беруться день і година на
   * сторінці.
   *
   * НАВІЩО ОКРЕМА КОЛОНКА: timestamptz нормалізує час у UTC, і коміт о 01:19
   * за Києвом стає 22:19 попередньої доби. Теплокарта тоді відносить нічну
   * роботу у вчора — рівно та помилка, заради якої все це й починалось.
   */
  committed_local text     not null,
  /** Тип із conventional commit: feat, fix, perf, refactor, style, test, other. */
  type         text        not null default 'other',
  /** Розділ у дужках теми: «прорахунки», «каталог», … Може бути порожнім. */
  scope        text,
  subject      text        not null,
  ins          integer     not null default 0,
  del          integer     not null default 0,
  /**
   * Тема, переказана людською через AI. Заповнює релізний конвеєр, коли тема
   * коміта технічна. Тут поле лишається порожнім, доки коміт не потрапить у
   * реліз — і це нормально: оригінальна тема завжди на місці.
   */
  plain        text,
  recorded_at  timestamptz not null default now()
);

-- Для таблиці, створеної попереднім запуском скрипта.
alter table tosho.commits add column if not exists committed_local text;

create index if not exists commits_committed_at_idx on tosho.commits (committed_at desc);

alter table tosho.commits enable row level security;

-- Той самий предикат, що на релізах і годинах: власник або SEO.
drop policy if exists commits_privileged_read on tosho.commits;
create policy commits_privileged_read on tosho.commits
  for select using (tosho.can_read_all_feature_adoption());

revoke all on tosho.commits from anon;
grant select on tosho.commits to authenticated;

-- ── Перенесення історії ──────────────────────────────────────────────────────
-- Усе, що вже лежить у релізах, стає рядками журналу. Записи без часу коміта
-- (один із 1281, зроблений до того, як recorder почав його зберігати) беруть
-- час релізу — іншого джерела для них не існує.
insert into tosho.commits (sha, committed_at, committed_local, type, scope, subject, ins, del, plain)
select
  c->>'sha',
  coalesce((c->>'at')::timestamptz, r.released_at),
  -- У релізах час коміта лежить рядком зі зсувом — беремо як є. Для єдиного
  -- запису без нього збираємо київський час із мітки релізу.
  coalesce(
    c->>'at',
    to_char(r.released_at at time zone 'Europe/Kiev', 'YYYY-MM-DD"T"HH24:MI:SS') || '+03:00'
  ),
  coalesce(nullif(c->>'type', ''), 'other'),
  nullif(c->>'scope', ''),
  coalesce(nullif(c->>'subject', ''), '(без теми)'),
  coalesce((c->>'ins')::int, 0),
  coalesce((c->>'del')::int, 0),
  nullif(c->>'plain', '')
from tosho.releases r, jsonb_array_elements(r.changes) c
where c->>'sha' is not null
on conflict (sha) do update
  set plain = coalesce(excluded.plain, tosho.commits.plain);

-- Дозаповнення для рядків, записаних до появи колонки.
update tosho.commits c
set committed_local = coalesce(
  (
    select ch->>'at'
    from tosho.releases r, jsonb_array_elements(r.changes) ch
    where ch->>'sha' = c.sha and ch->>'at' is not null
    limit 1
  ),
  to_char(c.committed_at at time zone 'Europe/Kiev', 'YYYY-MM-DD"T"HH24:MI:SS') || '+03:00'
)
where c.committed_local is null;

alter table tosho.commits alter column committed_local set not null;

notify pgrst, 'reload schema';

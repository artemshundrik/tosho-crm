-- ---------------------------------------------------------------------------
-- Стек CRM: що npm знає про наші пакети (REQ-116).
--
-- ЩО ТУТ ЛЕЖИТЬ, А ЩО В КОДІ. Встановлені версії, шари й дати останнього
-- оновлення знає сам репозиторій — вони їдуть у бандлі знімком
-- (src/data/stackSnapshot.generated.ts). У базі лише те, чого репозиторій про
-- себе знати не може: яка версія вийшла в npm і чи є на пакет дірка безпеки.
--
-- ЧОМУ ЧЕРЕЗ БАЗУ, А НЕ З БРАУЗЕРА. Пряме звернення до registry.npmjs.org з
-- клієнта означало б 61 запит на кожне відкриття сторінки, CORS і залежність
-- сторінки від чужої доступності. Питає раз на добу крон
-- (netlify/functions/stack-versions.ts), сторінка читає готове.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/stack-schema.sql
-- ---------------------------------------------------------------------------

create table if not exists tosho.stack_versions (
  /** Ім'я пакета в npm — воно ж ключ у знімку репозиторію. */
  name                text primary key,
  /** Остання опублікована версія (dist-tag latest). */
  latest_version      text,
  /**
   * Коли МИ вперше побачили саме цю нову версію.
   *
   * Не дата публікації: щоб дізнатись її, треба тягнути повний packument npm
   * (2–3 МБ на пакет, ~90 МБ за прохід) — надто дорого заради підпису. А от
   * «нова версія висить у нас третій місяць» відповідає на те саме питання й
   * коштує один рядок: крон зсуває позначку лише тоді, коли latest_version
   * справді змінилась.
   */
  latest_seen_at      timestamptz,
  /**
   * Дірки безпеки для ВСТАНОВЛЕНОЇ версії: масив {title, severity, url}.
   * Порожній масив — це відповідь «перевіряли, чисто», а не «не питали»;
   * різницю тримає checked_at.
   */
  advisories          jsonb not null default '[]'::jsonb,
  /** Коли востаннє питали npm саме про цей пакет. */
  checked_at          timestamptz not null default now()
);

comment on table tosho.stack_versions is
  'Відповідь npm про кожну залежність: остання версія і дірки безпеки. Пише крон stack-versions, читає сторінка Dev → Стек.';

alter table tosho.stack_versions enable row level security;

-- Той самий предикат, що в релізах і зрізі використання: власник або SEO.
-- Розділ Dev бачать двоє, і таблиця не має віддавати більше за сторінку.
drop policy if exists stack_versions_privileged_read on tosho.stack_versions;
create policy stack_versions_privileged_read on tosho.stack_versions
  for select using (tosho.can_read_all_feature_adoption());

revoke all on tosho.stack_versions from anon;
grant select on tosho.stack_versions to authenticated;

-- ---------------------------------------------------------------------------
-- Виноска «платформа»: Postgres, таблиці, функції, крони, Storage.
--
-- Числа лежать у системних каталогах, до яких у ролі authenticated доступу
-- немає й бути не повинно. Тому SECURITY DEFINER — але з тим самим гейтом
-- усередині: без owner/SEO функція просто нічого не віддає.
--
-- Storage береться з НАЙСВІЖІШОГО зрізу Observability, а не рахується наживо:
-- живий підрахунок сканує весь бакет (8 ГБ, 9000 обʼєктів) — надто дорого для
-- виноски під заголовком. Зріз пишеться щодоби, і для «розміру сховища» доба
-- точності більш ніж достатньо.
-- ---------------------------------------------------------------------------
create or replace function tosho.get_stack_platform()
returns jsonb
language plpgsql
stable
security definer
set search_path = tosho, public, pg_catalog
as $$
declare
  result jsonb;
begin
  if not tosho.can_read_all_feature_adoption() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'postgres_version', split_part(current_setting('server_version'), ' ', 1),
    'schema_tables', (
      select count(*) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'tosho' and c.relkind = 'r'
    ),
    'schema_functions', (
      select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'tosho'
    ),
    'cron_jobs', (select count(*) from cron.job where active),
    'database_bytes', pg_database_size(current_database()),
    'storage_bytes', (
      select coalesce(sum((b->>'bytes')::bigint), 0)
      from tosho.admin_observability_snapshots s,
           lateral jsonb_array_elements(coalesce(s.bucket_sizes, '[]'::jsonb)) b
      where s.captured_at = (select max(captured_at) from tosho.admin_observability_snapshots)
    ),
    'storage_captured_at', (select max(captured_at) from tosho.admin_observability_snapshots)
  )
  into result;

  return result;
end;
$$;

revoke all on function tosho.get_stack_platform() from public, anon;
grant execute on function tosho.get_stack_platform() to authenticated;

-- ---------------------------------------------------------------------------
-- Розклад: щодня о 06:10 за Києвом (03:10 UTC) — до початку робочого дня, щоб
-- сторінка вже вранці показувала свіже. Частіше немає сенсу: пакети виходять
-- не щогодини, а 61 запит до npm — це не те, чим варто гріти чужий сервер.
--
-- ВАЖЛИВО: планувати лише ПІСЛЯ деплою функції stack-versions, інакше джоб
-- добу стукатиме в 404 і мовчки «успішно» (net.http_post не бачить відповіді).
-- ---------------------------------------------------------------------------
select cron.schedule(
  'stack-versions',
  '10 3 * * *',
  $$ select net.http_post(
       url := 'https://tosho.pro/.netlify/functions/stack-versions',
       headers := jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret')),
       timeout_milliseconds := 60000) $$
);

-- ---------------------------------------------------------------------------
-- Перевірка:
--   select name, latest_version, jsonb_array_length(advisories), checked_at
--     from tosho.stack_versions order by checked_at desc limit 10;
--   select jsonb_pretty(tosho.get_stack_platform());
--   select jobname, schedule, active from cron.job where jobname='stack-versions';
-- Зупинити: select cron.unschedule('stack-versions');
-- ---------------------------------------------------------------------------

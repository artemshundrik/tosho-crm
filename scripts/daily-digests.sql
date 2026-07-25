-- ---------------------------------------------------------------------------
-- Щоденні дайджести в Telegram (docs/DAILY_DIGESTS_DESIGN.md).
--
-- Два об'єкти:
--   1. tosho.digest_log            — ідемпотентність «один дайджест на добу».
--   2. tosho.get_admin_digest_metrics() — свіжі системні метрики для тех-звіту.
--
-- Обидва — суто серверні: жодних грантів для anon/authenticated. Читає їх лише
-- Netlify-функція daily-digest.ts під service-role ключем.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/daily-digests.sql
-- Розклад cron — окремим файлом scripts/daily-digests-cron.sql (лише ПІСЛЯ
-- деплою функції на prod).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Журнал відправок
-- ---------------------------------------------------------------------------
create table if not exists tosho.digest_log (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('tech', 'business_morning', 'business_evening')),
  digest_date  date not null,
  team_id      uuid,
  recipients   integer not null default 0,
  delivered    integer not null default 0,
  failed       integer not null default 0,
  tone         text,
  created_at   timestamptz not null default now()
);

-- Ключ ідемпотентності: повторний запуск того самого дня впаде на конфлікті,
-- і функція просто вийде без розсилки.
create unique index if not exists digest_log_kind_date_uidx
  on tosho.digest_log (kind, digest_date);

create index if not exists digest_log_created_idx
  on tosho.digest_log (created_at desc);

comment on table tosho.digest_log is
  'Журнал щоденних Telegram-дайджестів. Unique (kind, digest_date) = захист від повторної розсилки.';

-- RLS + зняття дефолтних грантів: таблиця тільки для service-role.
alter table tosho.digest_log enable row level security;
revoke all on tosho.digest_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Системні метрики для тех-звіту
--
-- Повертає лише ДЕШЕВІ й свіжі сигнали. Важкий аудит orphan-вкладень свідомо
-- не тягнемо — дайджест бере його з останнього snapshot'а і позначає давність
-- (див. docs/DAILY_DIGESTS_DESIGN.md §7).
--
-- Без auth.uid()-гейта: функція недоступна authenticated/anon у принципі,
-- бо EXECUTE відкликано і видано лише service_role.
-- ---------------------------------------------------------------------------
create or replace function tosho.get_admin_digest_metrics()
returns jsonb
language plpgsql
security definer
set search_path = tosho, public, extensions
set statement_timeout = '60s'
as $$
declare
  db_size_bytes      bigint := 0;
  deadlocks_value    bigint := 0;
  temp_files_value   bigint := 0;
  backends_value     integer := 0;
  storage_bytes      bigint := 0;
  storage_objects    bigint := 0;
  buckets_json       jsonb := '[]'::jsonb;
  dead_ratio_max     numeric := 0;
  dead_worst_table   text := null;
  cron_jobs_json     jsonb := '[]'::jsonb;
  http_failures      integer := null;
  audit_trigger_ok   boolean := false;
begin
  select pg_database_size(current_database()) into db_size_bytes;

  select
    coalesce(numbackends, 0),
    coalesce(deadlocks, 0),
    coalesce(temp_files, 0)
  into backends_value, deadlocks_value, temp_files_value
  from pg_stat_database
  where datname = current_database();

  -- Storage: сумарний обсяг + розбивка по бакетах (та сама метрика, що на
  -- сторінці Observability).
  select
    coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0),
    count(*)
  into storage_bytes, storage_objects
  from storage.objects o;

  select coalesce(jsonb_agg(row_to_json(bucket_row) order by bucket_row.bytes desc), '[]'::jsonb)
  into buckets_json
  from (
    select
      o.bucket_id,
      coalesce(sum(coalesce((o.metadata->>'size')::bigint, 0)), 0) as bytes,
      count(*)::integer as object_count
    from storage.objects o
    group by o.bucket_id
  ) as bucket_row;

  -- Найгірша таблиця за часткою dead tuples. Поріг застосовує вже дайджест.
  select
    coalesce(worst.dead_ratio, 0),
    worst.table_name
  into dead_ratio_max, dead_worst_table
  from (
    select
      stat.relname as table_name,
      case
        when coalesce(stat.n_live_tup, 0) + coalesce(stat.n_dead_tup, 0) = 0 then 0
        else round((stat.n_dead_tup::numeric / (stat.n_live_tup + stat.n_dead_tup)::numeric) * 100, 2)
      end as dead_ratio
    from pg_stat_user_tables stat
    -- Дрібні таблиці дають 100% сміття на кількох рядках — це шум, не сигнал.
    where coalesce(stat.n_live_tup, 0) + coalesce(stat.n_dead_tup, 0) >= 1000
    order by 2 desc
    limit 1
  ) as worst;

  -- Здоров'я pg_cron. Схема cron може бути недоступна (інша інсталяція,
  -- урізані права) — тоді просто віддаємо порожній масив, а не валимо звіт.
  begin
    with runs_24h as (
      select
        jobid,
        count(*)::integer as runs,
        count(*) filter (where status is distinct from 'succeeded')::integer as failures
      from cron.job_run_details
      where start_time >= now() - interval '24 hours'
      group by jobid
    ),
    -- Вікно обмежене 7 днями, щоб не сканувати всю історію: джоб, який не
    -- бігав тиждень, і так вважається застряглим.
    last_runs as (
      select jobid, max(start_time) as last_start
      from cron.job_run_details
      where start_time >= now() - interval '7 days'
      group by jobid
    )
    select coalesce(jsonb_agg(row_to_json(job_row) order by job_row.failures desc, job_row.jobname), '[]'::jsonb)
    into cron_jobs_json
    from (
      select
        j.jobname,
        j.schedule,
        j.active,
        coalesce(r.runs, 0) as runs,
        coalesce(r.failures, 0) as failures,
        l.last_start,
        case
          when l.last_start is null then null
          else round(extract(epoch from (now() - l.last_start)) / 3600.0, 1)
        end as hours_since_last_run
      from cron.job j
      left join runs_24h r on r.jobid = j.jobid
      left join last_runs l on l.jobid = j.jobid
      where j.active
    ) as job_row;
  exception
    when insufficient_privilege or undefined_table or invalid_schema_name then
      cron_jobs_json := '[]'::jsonb;
  end;

  -- net.http_post асинхронний: успішний запис у job_run_details ще не означає,
  -- що HTTP-виклик удався. Рахуємо невдалі відповіді окремо. У pg_net коротка
  -- ретенція відповідей, тож це «за той час, що вцілів», а не строго за добу.
  begin
    select count(*)::integer
    into http_failures
    from net._http_response
    where created >= now() - interval '24 hours'
      and (status_code is null or status_code >= 400 or error_msg is not null);
  exception
    when insufficient_privilege or undefined_table or invalid_schema_name then
      http_failures := null;
  end;

  -- Аудит статусів прорахунку тримає тригер. Перевіряємо його НАЯВНІСТЬ, а не
  -- намагаємось вивести поломку з даних: updated_at рухається від будь-якого
  -- редагування, тож «прорахунок змінився, а історії немає» дає хибну тривогу.
  select exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'tosho.quotes'::regclass
      and t.tgname = 'quotes_status_history_trg'
      and t.tgenabled <> 'D'
  ) into audit_trigger_ok;

  return jsonb_build_object(
    'quote_audit_trigger_ok', audit_trigger_ok,
    'captured_at', timezone('utc', now()),
    'database_size_bytes', db_size_bytes,
    'deadlocks', deadlocks_value,
    'temp_files', temp_files_value,
    'backends', backends_value,
    'storage_bytes', storage_bytes,
    'storage_objects', storage_objects,
    'buckets', buckets_json,
    'dead_tuple_max_ratio', dead_ratio_max,
    'dead_tuple_worst_table', dead_worst_table,
    'cron_jobs', cron_jobs_json,
    'cron_http_failures_24h', http_failures
  );
end;
$$;

comment on function tosho.get_admin_digest_metrics() is
  'Свіжі системні метрики для щоденного тех-дайджесту. Лише service_role.';

-- Гранти: EXECUTE за замовчуванням видається PUBLIC — прибираємо і віддаємо
-- виключно service-role ключу (Netlify-функція daily-digest.ts).
revoke all on function tosho.get_admin_digest_metrics() from public;
revoke all on function tosho.get_admin_digest_metrics() from anon;
revoke all on function tosho.get_admin_digest_metrics() from authenticated;
grant execute on function tosho.get_admin_digest_metrics() to service_role;

-- ---------------------------------------------------------------------------
-- Перевірка після застосування:
--   select tosho.get_admin_digest_metrics();                  -- як postgres
--   select * from tosho.digest_log order by created_at desc;  -- журнал
--
-- Скинути ідемпотентність (щоб дайджест можна було відправити повторно):
--   delete from tosho.digest_log where kind='tech' and digest_date = current_date;
-- ---------------------------------------------------------------------------

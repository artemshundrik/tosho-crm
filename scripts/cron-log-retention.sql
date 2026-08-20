-- Ретенція журналу запусків крона (cron.job_run_details).
--
-- НАВІЩО. pg_cron пише рядок на КОЖЕН запуск і не прибирає їх ніколи. У нас три
-- джоби біжать щохвилини, тобто журнал росте на ~4 300 рядків щодня. На
-- 20.08.2026 в ньому було 256 645 рядків і 129 МБ.
--
-- ЧИМ ЦЕ ЗАВАДИЛО НАСПРАВДІ. pg_cron реєструє job_run_details як конфігураційну
-- таблицю розширення (pg_extension.extconfig), тож pg_dump вивантажує її ВМІСТ
-- разом із даними застосунку. 19.08.2026 денний бекап упав саме на ній:
--   pg_dump: error: Dumping the contents of table "job_run_details" failed:
--   PQgetCopyData() failed. server closed the connection unexpectedly
--   Command was: COPY cron.job_run_details (...) TO stdout;
-- Тобто службовий журнал, який нікому не потрібен у відновленні, зривав
-- резервне копіювання бази.
--
-- ЗАХИСТ ТУТ ДРУГИЙ. Перший — у scripts/backup.sh: дамп більше не тягне вміст
-- цієї таблиці взагалі (--exclude-table-data). Ретенція ж лікує причину: журнал
-- перестає рости без межі.
--
-- ЧОМУ 14 ДНІВ. Застосунок дивиться у нього двома вікнами: добу (збої на дошці
-- здоровʼя) і тиждень (коли джоб востаннє біг) — див. scripts/daily-digests.sql.
-- Два тижні лишають запас на розслідування «що було минулих вихідних» і тримають
-- таблицю приблизно на 60 тис. рядків замість нескінченності.
--
-- ЧОМУ НЕ VACUUM FULL У ЦЬОМУ ЖЕ ДЖОБІ. VACUUM FULL бере ексклюзивне блокування,
-- а в таблицю щохвилини пишуть три джоби. Звичайний автовакуум зробить звільнене
-- місце придатним для повторного запису — файл перестає рости, і цього досить.

select cron.schedule(
  'cron-log-retention',
  '40 2 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '14 days' $$
);

-- Перевірка після застосування:
--   select jobname, schedule from cron.job where jobname = 'cron-log-retention';
--   select count(*), pg_size_pretty(pg_total_relation_size('cron.job_run_details'))
--     from cron.job_run_details;

-- ---------------------------------------------------------------------------
-- Журнал тимчасових файлів (REQ-337).
--
-- Supabase попередив 26.10.2026, що база вичерпує бюджет Disk IO. За
-- pg_stat_database база за весь час записала ~1,3 ТБ тимчасових файлів, а
-- запити з pg_stat_statements пояснюють лише кілька ГБ. Хто пише решту, видно
-- лише з журналу: кожен тимчасовий файл від 10 МБ лягає рядком
-- «temporary file: path …, size …» разом із текстом запиту.
--
-- Поріг 10 МБ — щоб журнал ловив важке, а не кожне сортування на кілобайти.
-- Діє на НОВІ з'єднання: пул PostgREST підхопить його, коли перевідкриє свої.
--
-- На рівні бази Supabase не пускає (`alter database … set log_temp_files` →
-- permission denied), на рівні ролі — пускає. Двох ролей досить:
-- authenticator — це весь PostgREST (застосунок і Netlify-функції), postgres —
-- pg_cron, бекап і наші скрипти.
--
-- Де дивитись: панель Supabase → Logs → Postgres, пошук «temporary file»,
-- або Supabase MCP get_logs(service: "postgres").
--
-- Вимкнути, коли винного знайдено:
--   alter role authenticator reset log_temp_files;
--   alter role postgres reset log_temp_files;
-- ---------------------------------------------------------------------------

alter role authenticator set log_temp_files = '10MB';
alter role postgres set log_temp_files = '10MB';

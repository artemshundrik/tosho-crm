-- Чистка журналу відповідей pg_net (net._http_response), REQ-337.
--
-- НАВІЩО. Кожен net.http_post із кронів лишає тут рядок-відповідь, а pg_net
-- сам видаляє старі пачками (`delete … where created < now() - ttl order by
-- created limit …`). Видалене стає мертвими рядками, і прибирати їх мав би
-- автовакуум. Але він цю таблицю не чіпав з 20.08.2026 (день аварії):
-- лічильник мертвих рядків для неї стоїть на нулі, бо пише в неї фоновий
-- процес pg_net, а не звичайне з'єднання.
--
-- ЩО ЦЕ КОШТУВАЛО. На 26.10.2026: 91 живий рядок у 89 МБ. Чистка pg_net щоразу
-- продиралась крізь усе мертве — ~1,5 с на виклик кожні ~1,5 хв, з квітня
-- ~2,7 ТБ через пам'ять. На сервері з ~426 МБ пам'яті це прямий внесок у своп
-- і в лист Supabase про вичерпаний Disk IO.
--
-- ЩО РОБИМО.
--   1. Одноразово очищаємо таблицю. Втрачаємо відповіді кронів за останні
--      години — їх читає лише рядок «HTTP-помилок» у тех-дайджесті
--      (scripts/daily-digests.sql), і наступна доба його відновить.
--   2. Щоночі звичайний VACUUM — замість автовакууму, який цю таблицю не бачить.
--      Права є: власник supabase_admin, але postgres має MAINTAIN (PG17).
--      VACUUM FULL не беремо: він блокує таблицю, у яку пишуть щохвилини.

truncate net._http_response;

select cron.schedule(
  'pg-net-response-vacuum',
  '50 2 * * *',
  $$ vacuum (analyze) net._http_response $$
);

-- Перевірка після застосування:
--   select pg_size_pretty(pg_total_relation_size('net._http_response'));
--   select jobname, schedule from cron.job where jobname = 'pg-net-response-vacuum';
-- Зупинити: select cron.unschedule('pg-net-response-vacuum');

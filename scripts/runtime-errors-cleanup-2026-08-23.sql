-- Разова чистка журналу помилок браузера (REQ-100).
--
-- ЩО ПРИБИРАЄМО: рядки, яких не бачив жоден користувач — сліди гарячого
-- перезапуску на машині розробника («X is not defined», «Rendered more
-- hooks»), помилки завантаження модулів з localhost і будь-що з локальним
-- origin. Заміряно 23.08.2026: 718 рядків, УСІ від однієї людини (Артем Ш.).
--
-- ЩО ЛИШАЄТЬСЯ: 557 рядків від 11 людей — справжні помилки в проді, включно
-- з 13 випадками «стара вкладка після викочування» (React #130). Їх свідомо
-- НЕ чіпаємо: вони сталися з живими людьми, тобто це сигнал, а не шум.
--
-- ЧОМУ ЦЕ БЕЗПЕЧНО ДЛЯ АЛЕРТІВ: щогодинний system-alerts вважає помилку
-- «новою», якщо її підпису немає в історії за 30 днів. Видалення СПРАВЖНІХ
-- свіжих помилок змусило б бота надіслати їх ще раз; шум, який більше не
-- зʼявиться (логер тепер мовчить з localhost), таких наслідків не має.
--
-- Знімок таблиці до чистки: backups/runtime-errors-2026-08-23.sql
-- (pg_dump --data-only, 1275 рядків). Відновити: psql "$BACKUP_DB_URL" -f <файл>

begin;

select count(*) as було from tosho.runtime_errors;

delete from tosho.runtime_errors
where coalesce(metadata->>'message', '') ~ ' is not defined$'
   or coalesce(metadata->>'message', '') like '%Rendered more hooks%'
   or coalesce(metadata->>'message', '') like '%dynamically imported module: http://localhost%'
   or coalesce(metadata->>'origin', '') like 'http://localhost%';

select count(*) as лишилось, count(distinct user_id) as людей from tosho.runtime_errors;

commit;

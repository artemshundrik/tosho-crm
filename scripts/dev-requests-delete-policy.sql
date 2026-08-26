-- Видалення картки із дошки «Запити на доробку» — лише власник і CEO.
--
-- НАВІЩО ОКРЕМИЙ ФАЙЛ: у scripts/dev-requests-schema.sql заведено політики
-- select/insert/update, а DELETE не було жодної. RLS у Postgres — deny by
-- default, тому DELETE без політики не падає з помилкою: він мовчки чіпає
-- 0 рядків. Заміряно на проді 2026-08-08 (begin/rollback, симуляція owner):
--   is_owner_or_seo() = t, а «delete ... returning» повернув 0 рядків.
-- Тобто кнопка «Видалити» на фронті рапортувала б про успіх, а картка
-- лишалась би на дошці — найгірший різновид поломки, бо непомітний.
--
-- ЧОМУ ЛИШЕ owner/SEO: видалення тут — не прибирання свого запису, а рішення
-- «цієї справи не існує». Автор картки такого права не має: якщо задача не
-- потрібна, для цього є тупиковий статус wont_do з причиною. Той самий
-- предикат уже стоїть на update (рухати картку по дошці) — права на дошці
-- мусять читатись однією фразою, а не двома різними.
--
-- ЧОМУ БЕЗ is_team_member(team_id): рівно як на політиці update. Додавати сюди
-- другу умову означало б, що видалити можна вужче, ніж редагувати «в нуль»
-- через update — захисту це не додає, а дві різні формули на сусідніх діях
-- розійдуться на першій же зміні.
--
-- Історія не губиться: тригер trg_dev_requests_audit пише delete у загальний
-- аудит (tosho.audit_row_change), тож видалену картку видно в get_audit_log.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/dev-requests-delete-policy.sql

\set ON_ERROR_STOP on

begin;

drop policy if exists dev_requests_delete on tosho.dev_requests;
create policy dev_requests_delete on tosho.dev_requests
  for delete using (tosho.is_owner_or_seo());

-- Право DELETE у ролі вже є (видане широким грантом на схему), але файл має
-- лишатись самодостатнім: на чистій базі політика без гранта не працює, і
-- діагностика цього — знову ті самі мовчазні 0 рядків.
grant delete on tosho.dev_requests to authenticated;
revoke all on tosho.dev_requests from anon;

commit;

notify pgrst, 'reload schema';

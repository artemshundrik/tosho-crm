-- Класифікація картки запиту: напрямок, пріоритет і позначка «це здогад».
--
-- НАВІЩО: картку заводять на бігу — переслали повідомлення або надиктували
-- фразу. У цей момент людина не має ні часу, ні бажання обирати напрямок і
-- пріоритет зі списків. Тому їх ставить агент, а людина за потреби виправляє.
--
-- ЧОМУ module_key БЕЗ check-констрейнта: перелік модулів живе в
-- src/lib/moduleAccess.ts і є там джерелом правди для доступів, сайдбару й
-- дефолтів за роллю. Констрейнт у базі став би другим списком, який неминуче
-- розійдеться з першим — рівно та біда, від якої той реєстр і рятував (до
-- 2026-07-26 список був продубльований у шести місцях: 13 ключів проти 10
-- проти 8 проти 7). Значення перевіряє застосунок проти реєстру.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/dev-requests-classification.sql

\set ON_ERROR_STOP on

begin;

alter table tosho.dev_requests
  add column if not exists priority text,
  add column if not exists module_key text,
  add column if not exists auto_classified boolean not null default false;

comment on column tosho.dev_requests.priority is
  'low | normal | high. Ставить агент при захопленні, людина переставляє.';
comment on column tosho.dev_requests.module_key is
  'Напрямок = ключ модуля з src/lib/moduleAccess.ts (quotes, design, finance...). Порожньо = агент не був упевнений; порожнє поле краще за неправильне.';
comment on column tosho.dev_requests.auto_classified is
  'true = тип/напрямок/пріоритет поставив агент і людина цього ще не підтверджувала. Потрібно, щоб здогад було видно як здогад.';

alter table tosho.dev_requests
  drop constraint if exists dev_requests_priority_check;
alter table tosho.dev_requests
  add constraint dev_requests_priority_check
  check (priority is null or priority in ('low', 'normal', 'high'));

-- Дошка фільтрується за напрямком, тож індекс під той самий запит, що вже
-- обслуговує board_idx.
create index if not exists dev_requests_module_idx
  on tosho.dev_requests (team_id, module_key)
  where module_key is not null;

commit;

notify pgrst, 'reload schema';

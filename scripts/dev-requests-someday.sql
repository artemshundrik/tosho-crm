-- Статус «Ідеї» (someday) для дошки «Запити на доробку».
--
-- НАВІЩО: «колись зроблю» лежало в «У черзі» разом із роботою, на яку справді
-- виділено час. Через це черга переставала щось означати: за її довжиною не
-- видно, скільки роботи попереду, і кожен погляд на дошку давав дозу провини.
-- Тепер такі картки їдуть в окремий стан.
--
-- ЦЕ НЕ КОЛОНКА ДОШКИ. Стан живе поруч із wont_do: обидва показуються окремим
-- списком за перемиканням, а не стовпчиком. Стовпчик читався б як етап роботи,
-- хоч роботою не є (див. BOARD_COLUMNS у src/features/devRequests/types.ts).
--
-- ЧОМУ ТУТ ЛИШЕ ЧЕК-КОНСТРЕЙНТ: у базі status — звичайний text, тож єдине, що
-- треба відкрити, — перелік дозволених значень. Ні індекси, ні політики, ні
-- гранти від нового стану не залежать: dev_requests_board_idx уже стоїть на
-- (team_id, status, created_at desc), а всі політики дивляться на is_private і
-- tosho.is_owner_or_seo(), а не на статус.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/dev-requests-someday.sql

\set ON_ERROR_STOP on

begin;

-- Звірка ПЕРЕД зміною: якщо в таблиці вже є статус, якого немає в новому
-- переліку, alter впаде з повідомленням Postgres про порушений констрейнт і
-- жодного натяку, ЯКЕ значення завинило. Тому кажемо це самі й зупиняємось до
-- того, як щось змінилось.
do $$
declare
  stray text;
begin
  select string_agg(distinct status, ', ')
    into stray
    from tosho.dev_requests
   where status not in ('triage', 'queued', 'in_progress', 'done_local', 'released', 'wont_do', 'someday');

  if stray is not null then
    raise exception 'У tosho.dev_requests є статуси поза переліком: %. Спершу розберіться з ними.', stray;
  end if;
end;
$$;

alter table tosho.dev_requests
  drop constraint if exists dev_requests_status_check;
alter table tosho.dev_requests
  add constraint dev_requests_status_check
  check (status in ('triage', 'queued', 'in_progress', 'done_local', 'released', 'wont_do', 'someday'));

commit;

notify pgrst, 'reload schema';

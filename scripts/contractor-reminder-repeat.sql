-- Періодичні нагадування по підрядниках і постачальниках.
--
-- Why: reminder_at був разовим — спрацював і забувся. А «раз на тиждень
-- звіритись по залишках» чи «раз на місяць перевірити ціни» — це саме те, для
-- чого нагадування й заводять. Без повтору людина щоразу мусить перевиставляти
-- дату руками, і саме тому цього ніхто не робив.
--
-- Модель без нової таблиці: один стовпець поруч із reminder_at. NULL = разове
-- нагадування (стара поведінка, нічого не ламається).
--
-- Прокрутку дати після спрацювання робить netlify/functions/contractor-reminders.ts —
-- у КИЇВСЬКОМУ настінному часі, щоб «щомісяця о 10:00» лишалось 10:00 і після
-- переводу годинників (reminder_at — справжній UTC, див. docs/DB_MAP.md).

alter table tosho.contractors
  add column if not exists reminder_repeat text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contractors_reminder_repeat_check'
  ) then
    alter table tosho.contractors
      add constraint contractors_reminder_repeat_check
      check (reminder_repeat is null or reminder_repeat in ('weekly', 'monthly'));
  end if;
end $$;

-- Перевірка після застосування:
--   \d tosho.contractors
--   select reminder_repeat, count(*) from tosho.contractors group by 1;

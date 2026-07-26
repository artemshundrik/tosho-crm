-- Finance module — подія (корпоратив, день народження) як окрема витрата.
-- Структура: категорія «Події та свята» → ПОДІЯ (окрема витрата) → позиції (журнал).
-- event_type тримає тип події («Корпоратив», «День народження»), щоб список типів
-- сам поповнювався; назва й дата події — це supplier_name та expense_date витрати.
-- null = звичайна витрата (не подія).
-- Safe to run multiple times.

begin;

alter table tosho.finance_expenses
  add column if not exists event_type text;

comment on column tosho.finance_expenses.event_type is
  'Тип події («Корпоратив», «День народження»…). Не null = ця витрата є подією: позиції ведуться журналом, бейдж періодичності не показуємо.';

create index if not exists finance_expenses_event_type_idx
  on tosho.finance_expenses (team_id, event_type)
  where event_type is not null;

notify pgrst, 'reload schema';

commit;

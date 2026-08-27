-- Finance module — бекфіл періодичності «по потребі» (REQ-190).
--
-- НАВІЩО. Журнальні витрати не мали як сказати «це буває не щомісяця»: у
-- `recurrence` вибір був лише monthly/quarterly/…, тож паливо, таксі й подарунки
-- стояли «Раз на місяць» і після REQ-190 щомісяця світились «не внесено за X».
-- Це неправда: вони трапляються, коли трапляються.
--
-- Вивести це з даних не вийшло: `finance_expense_categories.kind` ділить не за
-- тим (Вода — variable, але вона щомісяця), `object_group` теж (Кондиціонери
-- привʼязані до адреси, але обслуговуються раз на сезон). Тому періодичність
-- каже людина, а тут — разовий бекфіл того, що вже є, за словами Артема:
-- Логістика, Подарунки й Обслуговування техніки — по потребі; Комунальні,
-- Прибирання й Вода лишаються щомісячними.
--
-- Safe to run multiple times (умова звужує вибірку до monthly).

begin;

-- Спершу пускаємо нове значення в CHECK: до цього дозволялись лише
-- monthly/quarterly/semiannual/yearly.
alter table tosho.finance_expenses
  drop constraint if exists finance_expenses_recurrence_check;
alter table tosho.finance_expenses
  add constraint finance_expenses_recurrence_check
  check (recurrence is null or recurrence in ('monthly', 'quarterly', 'semiannual', 'yearly', 'as_needed'));

comment on column tosho.finance_expenses.recurrence is
  'Як часто платимо: monthly|quarterly|semiannual|yearly, або as_needed («по потребі») для журнальних витрат, які трапляються нерегулярно — від них не чекають запису щомісяця.';

update tosho.finance_expenses e
set recurrence = 'as_needed'
from tosho.finance_expense_categories c
where c.id = e.category_id
  and e.amount_varies
  and e.event_type is null
  and e.recurrence = 'monthly'
  and c.name in ('Логістика', 'Подарунки', 'Обслуговування техніки');

notify pgrst, 'reload schema';

commit;

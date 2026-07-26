-- Finance module — власний список постачальників («звідки») для кожної витрати.
-- Раніше підказки були глобальні: у журналі кондиціонерів пропонувались Метро й
-- Сільпо — безглуздо. Тепер список належить конкретній витраті: у «Продукти та
-- смаколики» свої магазини, у «Вода» — свої, у «Кондиціонери» порожньо, поки не
-- додаси. Новий постачальник додається прямо з пікера й дописується сюди.
-- Safe to run multiple times.

begin;

alter table tosho.finance_expenses
  add column if not exists vendor_options text[] not null default '{}';

comment on column tosho.finance_expenses.vendor_options is
  'Список постачальників/магазинів для поля «звідки» в записах журналу цієї витрати. Порожній = підказок немає.';

notify pgrst, 'reload schema';

commit;

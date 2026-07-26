-- Finance module — «звідки» у записі журналу витрат.
-- Для витрат на кшталт «Продукти та смаколики» важливо не лише скільки й коли,
-- а й ДЕ куплено (Метро / Сільпо / Новус / МауДау). Раніше це писали в коментар
-- вільним текстом — тепер окреме поле, щоб дані були структуровані (можна буде
-- порахувати витрати в розрізі магазинів) і щоб вибір був зі списку, а не набором.
-- Safe to run multiple times.

begin;

alter table tosho.finance_expense_monthly_amounts
  add column if not exists vendor text;

comment on column tosho.finance_expense_monthly_amounts.vendor is
  'Звідки цей запис: магазин/постачальник (Метро, Сільпо, Новус, МауДау…). Вільний текст із підказками; null = не вказано.';

-- Підказки в UI будуються з уже введених значень — індекс тримає цей запит швидким.
create index if not exists finance_expense_monthly_amounts_vendor_idx
  on tosho.finance_expense_monthly_amounts (team_id, vendor)
  where vendor is not null;

notify pgrst, 'reload schema';

commit;

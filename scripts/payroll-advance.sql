-- =====================================================================
-- payroll-advance.sql
-- Аванс у зарплатній відомості: сума + дата видачі.
--
-- Рішення власника: аванс НЕ зменшує «До виплати». Це окремий факт «частину
-- грошей уже видали такого-то числа», а нарахування лишається повним. Тому
-- обчислювану колонку total_amount не чіпаємо — вона й далі
-- base + bonus − deduction.
--
-- Дата зберігається в тому ж рядку місяця: аванс за місяць один.
-- Ідемпотентно: можна виконувати повторно.
-- =====================================================================

begin;

alter table tosho.payroll_entries
  add column if not exists advance_amount numeric(12, 2) not null default 0,
  add column if not exists advance_date date;

comment on column tosho.payroll_entries.advance_amount is
  'Аванс, виданий за цей місяць. Довідковий факт — у total_amount НЕ входить.';
comment on column tosho.payroll_entries.advance_date is
  'Дата видачі авансу. Має сенс лише разом із advance_amount > 0.';

-- Дата без суми — це недописаний запис, який мовчки з''їдав би сенс колонки.
alter table tosho.payroll_entries
  drop constraint if exists payroll_entries_advance_date_needs_amount;
alter table tosho.payroll_entries
  add constraint payroll_entries_advance_date_needs_amount
  check (advance_date is null or advance_amount > 0);

commit;

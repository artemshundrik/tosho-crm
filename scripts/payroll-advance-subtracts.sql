-- =====================================================================
-- payroll-advance-subtracts.sql
-- Аванс зменшує «До виплати».
--
-- Уточнення власника (2026-07-27): аванс — це вже видані гроші, тож у колонці
-- має лишатися ЗАЛИШОК до виплати. Початково колонку додавали як довідкову
-- (scripts/payroll-advance.sql), це рішення скасовано.
--
-- total_amount — generated always, тому змінити вираз можна лише через
-- перестворення колонки. Дані не втрачаються: значення обчислюване.
--
-- Ідемпотентно: можна виконувати повторно.
-- =====================================================================

begin;

alter table tosho.payroll_entries drop column if exists total_amount;

alter table tosho.payroll_entries
  add column total_amount numeric(12, 2)
  generated always as (base_amount + bonus_amount - deduction_amount - advance_amount) stored;

comment on column tosho.payroll_entries.total_amount is
  'До виплати: ставка + бонус − офіційна ЗП − аванс. Аванс віднімається, бо ці гроші вже видані.';

comment on column tosho.payroll_entries.advance_amount is
  'Аванс, виданий за цей місяць. Зменшує total_amount — у ньому лишається залишок.';

commit;

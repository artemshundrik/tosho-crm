-- =====================================================================
-- payroll-penalty.sql
-- Штраф у відомості виплат (REQ-20).
--
-- Що було не так: у відомості є рівно одна колонка, яка віднімає, —
-- deduction_amount, і вона вже зайнята «Офіційною ЗП» (scripts/… , коміт
-- fb7ae0b). Тобто вирахувати штраф не було куди, і сума витрат за місяць
-- через це виходила завищеною.
--
-- Штраф — ОКРЕМА колонка, а не «ще одне утримання» в тій самій: це різні за
-- природою речі. Офіційна ЗП — частина тих самих грошей, просто виплачена
-- інакше; штраф зменшує суму, яку людина отримає взагалі. Складені в одне
-- поле, вони перестали б відповідати на питання «скільки ми утримали».
--
-- total_amount — generated always, тому змінити вираз можна лише через
-- перестворення колонки (той самий прийом, що в payroll-advance-subtracts.sql).
-- Дані не втрачаються: значення обчислюване.
--
-- Ідемпотентно: можна виконувати повторно.
-- =====================================================================

begin;

alter table tosho.payroll_entries
  add column if not exists penalty_amount numeric(12, 2) not null default 0;

comment on column tosho.payroll_entries.penalty_amount is
  'Штраф за місяць. Зменшує total_amount. Окремий від deduction_amount («Офіційна ЗП»).';

alter table tosho.payroll_entries drop column if exists total_amount;

alter table tosho.payroll_entries
  add column total_amount numeric(12, 2)
  generated always as (
    base_amount + bonus_amount - deduction_amount - penalty_amount - advance_amount
  ) stored;

comment on column tosho.payroll_entries.total_amount is
  'До виплати: ставка + бонус − офіційна ЗП − штраф − аванс.';

-- Від'ємний штраф — це прихована премія повз колонку «Бонус»: сума виросте,
-- а в підсумку «Штрафи» стоятиме мінус, якого ніхто не шукає.
alter table tosho.payroll_entries
  drop constraint if exists payroll_entries_penalty_not_negative;
alter table tosho.payroll_entries
  add constraint payroll_entries_penalty_not_negative
  check (penalty_amount >= 0);

commit;

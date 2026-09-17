-- =====================================================================
-- payroll-official-split.sql
-- Відомість «Виплати команді»: чотири нові поля й «Загальна ЗП» (REQ-284).
--
-- Що просило керівництво (16.09.2026):
--   • «Особисте замовлення» — менеджер замовив собі щось із нашого сайту;
--     віднімається з «До виплати».
--   • «Офіційна ЗП» розділяється на дві комірки: офіційна ЗП (лишається в
--     deduction_amount — колонка так названа історично, див. payroll-penalty.sql)
--     і офіційний аванс АЗП із датою — офіційна частина приходить двічі на
--     місяць. АЗП, як і офіційна ЗП, іде через банк, тож із готівкової
--     виплати віднімається.
--   • «Офіційні податки» — податки з офіційної частини. ЛИШЕ облік: у
--     «До виплати» не входять, потрібні для повної вартості зарплатного
--     проєкту у зведенні.
--   • «Загальна ЗП за місяць» — скільки людина заробила: ставка + бонус −
--     штраф. Обчислювана, як і total_amount, щоб кожен читач брав одне число.
--
-- total_amount — generated always, тому змінити вираз можна лише через
-- перестворення колонки (той самий прийом, що в payroll-advance-subtracts.sql
-- і payroll-penalty.sql). Дані не втрачаються: значення обчислюване, а нові
-- колонки в наявних рядках нульові, тож «До виплати» для них не зміниться.
--
-- Ідемпотентно: можна виконувати повторно.
-- =====================================================================

begin;

alter table tosho.payroll_entries
  add column if not exists personal_order_amount numeric(12, 2) not null default 0,
  add column if not exists official_advance_amount numeric(12, 2) not null default 0,
  add column if not exists official_advance_date date,
  add column if not exists official_tax_amount numeric(12, 2) not null default 0;

comment on column tosho.payroll_entries.personal_order_amount is
  'Особисте замовлення співробітника з нашого сайту за місяць. Зменшує total_amount.';
comment on column tosho.payroll_entries.official_advance_amount is
  'Офіційний аванс (АЗП) — частина офіційної ЗП, що приходить через банк у першій половині місяця. Зменшує total_amount так само, як deduction_amount («Офіційна ЗП»).';
comment on column tosho.payroll_entries.official_advance_date is
  'Дата офіційного авансу. Має сенс лише разом із official_advance_amount > 0.';
comment on column tosho.payroll_entries.official_tax_amount is
  'Офіційні податки з офіційної частини ЗП. Лише облік для повної вартості зарплатного проєкту — у total_amount НЕ входять.';

-- Дата без суми — недописаний запис (те саме правило, що й для готівкового авансу).
alter table tosho.payroll_entries
  drop constraint if exists payroll_entries_official_advance_date_needs_amount;
alter table tosho.payroll_entries
  add constraint payroll_entries_official_advance_date_needs_amount
  check (official_advance_date is null or official_advance_amount > 0);

-- Від'ємне утримання — прихована премія повз «Бонус» (те саме, що й для штрафу).
alter table tosho.payroll_entries
  drop constraint if exists payroll_entries_official_split_not_negative;
alter table tosho.payroll_entries
  add constraint payroll_entries_official_split_not_negative
  check (personal_order_amount >= 0 and official_advance_amount >= 0 and official_tax_amount >= 0);

alter table tosho.payroll_entries drop column if exists total_amount;
alter table tosho.payroll_entries
  add column total_amount numeric(12, 2)
  generated always as (
    base_amount + bonus_amount
      - deduction_amount - official_advance_amount
      - penalty_amount - personal_order_amount
      - advance_amount
  ) stored;

comment on column tosho.payroll_entries.total_amount is
  'До виплати на руки: ставка + бонус − офіційна ЗП − офіційний аванс (АЗП) − штраф − особисте замовлення − аванс готівкою. Офіційні податки сюди не входять.';

alter table tosho.payroll_entries drop column if exists earned_amount;
alter table tosho.payroll_entries
  add column earned_amount numeric(12, 2)
  generated always as (base_amount + bonus_amount - penalty_amount) stored;

comment on column tosho.payroll_entries.earned_amount is
  'Загальна ЗП за місяць — скільки людина заробила: ставка + бонус − штраф. Спосіб виплати (офіційно/готівкою) і особисті замовлення на неї не впливають.';

commit;

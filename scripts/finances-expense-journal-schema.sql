-- Finance module — журнал датованих записів для змінних регулярних платежів.
-- Раніше «сума змінна» тримала РІВНО одну суму на місяць (finance_expense_monthly_amounts
-- з unique(expense_id, period)). Для прибирання офісу й подібного цього мало: треба
-- логувати КОЖНЕ прибирання окремо — конкретна дата + сума + коментар, кілька на місяць.
-- Тому та сама таблиця стає журналом записів: додаємо entry_date + note і знімаємо
-- унікальність (expense_id, period). Місячна сума = сума записів за місяць.
-- Safe to run multiple times.

begin;

-- Конкретна дата запису (коли фактично сталося). Бекфіл зі старого period.
alter table tosho.finance_expense_monthly_amounts
  add column if not exists entry_date date;
update tosho.finance_expense_monthly_amounts
  set entry_date = period
  where entry_date is null;
alter table tosho.finance_expense_monthly_amounts
  alter column entry_date set not null;

comment on column tosho.finance_expense_monthly_amounts.entry_date is
  'Конкретна дата запису (коли фактично сталося: напр. дата прибирання). period лишається як місячний бакет.';

-- Коментар до запису (напр. «кухня+санвузли»).
alter table tosho.finance_expense_monthly_amounts
  add column if not exists note text;

comment on column tosho.finance_expense_monthly_amounts.note is
  'Вільний коментар до запису журналу (напр. що саме прибирали).';

-- Знімаємо унікальність (expense_id, period): тепер за місяць може бути кілька записів.
do $$
declare
  c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'tosho.finance_expense_monthly_amounts'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%(expense_id, period)%';
  if c is not null then
    execute format('alter table tosho.finance_expense_monthly_amounts drop constraint %I', c);
  end if;
end $$;

-- Індекс під вибірку журналу конкретної витрати за датою.
create index if not exists finance_expense_monthly_amounts_expense_date_idx
  on tosho.finance_expense_monthly_amounts (expense_id, entry_date);

notify pgrst, 'reload schema';

commit;

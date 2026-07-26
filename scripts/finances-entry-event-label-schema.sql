-- Finance module — назва події для записів журналу.
-- Корпоратив / день народження = ОДНА подія (дата + назва) з кількома позиціями
-- (алкоголь, вода, піца). Раніше кожен запис доводилось заводити окремо з датою;
-- тепер подія створюється один раз, а позиції успадковують її дату й назву.
-- null = звичайний запис журналу (комуналка, прибирання) — поводиться як раніше.
-- Safe to run multiple times.

begin;

alter table tosho.finance_expense_monthly_amounts
  add column if not exists event_label text;

comment on column tosho.finance_expense_monthly_amounts.event_label is
  'Назва події (напр. «Корпоратив Q3»). Записи з однаковими entry_date + event_label — позиції однієї події. null = окремий запис.';

create index if not exists finance_expense_monthly_amounts_event_idx
  on tosho.finance_expense_monthly_amounts (expense_id, entry_date, event_label)
  where event_label is not null;

notify pgrst, 'reload schema';

commit;

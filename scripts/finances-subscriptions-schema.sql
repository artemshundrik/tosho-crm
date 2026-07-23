-- Finance module — підписки/сталі витрати у валюті.
-- Розширює tosho.finance_expenses: валюта, періодичність, наступне списання, бренд.
-- Свідомо БЕЗ нової таблиці: «стала витрата» (is_recurring = true) вже і є планом,
-- який рахується в кожному місяці (див. fixedBaseline у FinanceExpenses.tsx).
-- Safe to run multiple times.

begin;

alter table tosho.finance_expenses
  add column if not exists currency text not null default 'UAH',
  add column if not exists fx_rate numeric(14, 4),
  add column if not exists next_charge_date date,
  add column if not exists vendor_key text,
  add column if not exists logo_url text;

comment on column tosho.finance_expenses.currency is 'Валюта суми: UAH | USD | EUR. Гривневий еквівалент рахується за курсом.';
comment on column tosho.finance_expenses.fx_rate is 'Курс до гривні на момент оплати (факт). Якщо null — беремо поточний курс Мінфіну.';
comment on column tosho.finance_expenses.next_charge_date is 'Наступне списання для сталої витрати/підписки — джерело для платіжного календаря.';
comment on column tosho.finance_expenses.vendor_key is 'Слаг сервісу з subscriptionBrands.ts (dropbox, adobe, supabase…) — для лого.';
comment on column tosho.finance_expenses.logo_url is 'Ручне перевизначення лого, якщо автопідбір по бренду не влучив.';

alter table tosho.finance_expenses
  drop constraint if exists finance_expenses_currency_check;
alter table tosho.finance_expenses
  add constraint finance_expenses_currency_check
  check (currency in ('UAH', 'USD', 'EUR'));

-- recurrence вже існує (текст, раніше завжди 'monthly'). Тепер це період білінгу.
alter table tosho.finance_expenses
  drop constraint if exists finance_expenses_recurrence_check;
alter table tosho.finance_expenses
  add constraint finance_expenses_recurrence_check
  check (recurrence is null or recurrence in ('monthly', 'quarterly', 'semiannual', 'yearly'));

create index if not exists finance_expenses_next_charge_idx
  on tosho.finance_expenses (team_id, next_charge_date)
  where next_charge_date is not null;

notify pgrst, 'reload schema';

commit;

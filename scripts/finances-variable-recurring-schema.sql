-- Finance module — «сума змінна» для регулярних платежів (комуналка тощо).
-- Регулярний платіж може бути зі СТАЛОЮ сумою (оренда, підписки — рахується щомісяця
-- автоматично) або зі ЗМІННОЮ: у списку лишається як очікуваний пункт, але реальну
-- суму вводимо по місяцях. Валюта успадковується від самого платежу (finance_expenses).
-- Safe to run multiple times.

begin;

alter table tosho.finance_expenses
  add column if not exists amount_varies boolean not null default false;

comment on column tosho.finance_expenses.amount_varies is
  'true = регулярний платіж зі змінною сумою (щомісяця різна). Фактичні суми — у finance_expense_monthly_amounts.';

-- Журнал датованих записів фактичної суми (див. finances-expense-journal-schema.sql):
-- кожен запис = одна подія (напр. одне прибирання). period — місячний бакет,
-- entry_date — конкретна дата, note — коментар. За місяць може бути кілька записів.
create table if not exists tosho.finance_expense_monthly_amounts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  expense_id uuid not null references tosho.finance_expenses (id) on delete cascade,
  period date not null,                 -- перше число місяця, напр. 2026-07-01
  entry_date date not null,             -- конкретна дата запису, напр. 2026-07-05
  amount numeric(14, 2) not null default 0,
  note text,
  entered_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists finance_expense_monthly_amounts_team_idx
  on tosho.finance_expense_monthly_amounts (team_id);
create index if not exists finance_expense_monthly_amounts_expense_idx
  on tosho.finance_expense_monthly_amounts (expense_id, period);
create index if not exists finance_expense_monthly_amounts_expense_date_idx
  on tosho.finance_expense_monthly_amounts (expense_id, entry_date);

drop trigger if exists finance_expense_monthly_amounts_touch on tosho.finance_expense_monthly_amounts;
create trigger finance_expense_monthly_amounts_touch
before update on tosho.finance_expense_monthly_amounts
for each row execute function tosho.finance_touch_updated_at();

-- RLS — team-scoped, з permissive-фолбеком як у решти finances-схем.
do $$
declare
  has_member_fn boolean := to_regprocedure('public.is_team_member(uuid)') is not null;
  op text;
  policy_name text;
begin
  execute 'alter table tosho.finance_expense_monthly_amounts enable row level security';
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    policy_name := 'finance_expense_monthly_amounts_' || op;
    execute format('drop policy if exists %I on tosho.finance_expense_monthly_amounts', policy_name);
    if op = 'select' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_expense_monthly_amounts for select using (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_expense_monthly_amounts for select using (true)', policy_name);
      end if;
    elsif op = 'insert' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_expense_monthly_amounts for insert with check (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_expense_monthly_amounts for insert with check (true)', policy_name);
      end if;
    elsif op = 'update' then
      if has_member_fn then
        execute format('create policy %I on tosho.finance_expense_monthly_amounts for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_expense_monthly_amounts for update using (true) with check (true)', policy_name);
      end if;
    else
      if has_member_fn then
        execute format('create policy %I on tosho.finance_expense_monthly_amounts for delete using (public.is_team_member(team_id))', policy_name);
      else
        execute format('create policy %I on tosho.finance_expense_monthly_amounts for delete using (true)', policy_name);
      end if;
    end if;
  end loop;
  execute 'grant select, insert, update, delete on tosho.finance_expense_monthly_amounts to authenticated';
end $$;

notify pgrst, 'reload schema';

commit;

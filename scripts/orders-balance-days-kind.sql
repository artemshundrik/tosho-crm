-- Відтермінування доплати рахують у робочих або календарних днях від дати ВН
-- (СЕО, 14.10.2026). null = старі замовлення: договір і СП у них казали «робочих днів».
-- КОД ЧИТАЄ ЦЮ КОЛОНКУ В ЗАГАЛЬНОМУ ЗАПИТІ ЗАМОВЛЕНЬ: без неї список падає на
-- базові колонки й губить умови оплати. Застосувати ДО пушу.
alter table tosho.orders
  add column if not exists balance_days_kind text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_balance_days_kind_chk'
  ) then
    alter table tosho.orders
      add constraint orders_balance_days_kind_chk
      check (balance_days_kind is null or balance_days_kind in ('working', 'calendar'));
  end if;
end$$;

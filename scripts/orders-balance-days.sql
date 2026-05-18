-- Кількість робочих днів на доплату, якщо balance_timing = 'after_shipment'.
-- Замінює hardcoded "3-х робочих днів" у тексті СП.
alter table tosho.orders
  add column if not exists balance_days_after_shipment integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_balance_days_after_shipment_chk'
  ) then
    alter table tosho.orders
      add constraint orders_balance_days_after_shipment_chk
      check (balance_days_after_shipment is null or balance_days_after_shipment > 0);
  end if;
end$$;

-- Payment breakdown for contracts/specifications.
-- Replaces the legacy fixed paymentTerms string ("70/30", "50/50", ...) with
-- explicit manager-entered values:
--   prepayment_pct  — % перед запуском (передоплата)
--   balance_pct     — % доплати
--   balance_timing  — коли відбувається доплата ('before_shipment' / 'after_shipment')
--
-- Старе поле payment_terms лишаємо для зворотної сумісності — якщо нові поля порожні,
-- ми досі парсимо payment_terms (50/50, 70/30 ...).

alter table tosho.orders
  add column if not exists prepayment_pct numeric(5,2),
  add column if not exists balance_pct numeric(5,2),
  add column if not exists balance_timing text;

-- Constrain balance_timing to known values.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_balance_timing_chk'
  ) then
    alter table tosho.orders
      add constraint orders_balance_timing_chk
      check (balance_timing is null or balance_timing in ('before_shipment', 'after_shipment'));
  end if;
end$$;

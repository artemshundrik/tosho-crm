-- Префікс номера замовлення ZM- → TO- (ToSho Order), 22.10.2026, REQ-322.
--
-- Латинська Z у номерах документів неприйнятна. Нові номери вже видає клієнт
-- (getNextManualOrderNumber у src/features/orders/orderRecords.ts), а цей файл
-- переписує старі номери замовлень: ZM-MMYY-NNNN → TO-MMYY-NNNN.
-- Повтор безпечний: другий прогін нічого не знайде.

update tosho.orders
set quote_number = 'TO-' || substr(quote_number, 4)
where quote_number ~ '^ZM-[0-9]{4}-[0-9]{4}$';

-- Перевірка: у номерах замовлень ZM- не лишилось.
select count(*) as zm_orders_left from tosho.orders where quote_number like 'ZM-%';

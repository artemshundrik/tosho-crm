-- Manual-order («Створити замовлення без прорахунку») extra fields.
-- Additive + nullable — safe to run repeatedly. Mirrors quote logistics
-- (delivery_type/delivery_details) and adds packaging + a soft link to the
-- design task chosen/created from the order.
--
-- Applied to prod 2026-07-18. Read/insert code lives in
-- src/features/orders/orderRecords.ts (createManualOrder) and the reader
-- listStoredOrders (extended column set, with a fallback for older schemas).

alter table tosho.orders
  add column if not exists delivery_type text,
  add column if not exists delivery_details jsonb,
  add column if not exists packaging text,
  add column if not exists design_task_id text,
  add column if not exists design_task_number text;

comment on column tosho.orders.delivery_type is 'Логістика: тип доставки (nova_poshta/pickup/taxi/cargo), як у quotes.delivery_type.';
comment on column tosho.orders.delivery_details is 'Логістика: структурований знімок доставки (jsonb), як у quotes.delivery_details.';
comment on column tosho.orders.packaging is 'Пакування: вільний опис вимог до пакування.';
comment on column tosho.orders.design_task_id is 'Soft-link на дизайн-задачу (activity_log.id), обрану/створену із замовлення.';
comment on column tosho.orders.design_task_number is 'Номер привʼязаної дизайн-задачі (TS-MMYY-NNNN) для відображення.';

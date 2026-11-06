-- Позиція замовлення без прорахунку може прийти за посиланням або з пулу
-- постачальників, тобто без моделі каталогу. Артикул, колір і посилання такого
-- товару тепер живуть тут: в описі їм не місце, бо опис їде в специфікацію.
--
-- Адитивно й nullable: старі рядки лишаються з null, читачі це вміють.
-- Запис: createManualOrder, читання: listStoredOrderItems (src/features/orders/orderRecords.ts).
-- Застосувати ДО пушу коду, інакше створення ручного замовлення впаде на відсутній колонці.

alter table tosho.order_items
  add column if not exists metadata jsonb;

comment on column tosho.order_items.metadata is
  'Походження товару позиції без моделі каталогу: sku, color, sourceUrl, supplierUrl, avantprintUrl, supplierProductId, variantId, kindId, kindName, typeName. Закупівельної ціни тут немає навмисно.';

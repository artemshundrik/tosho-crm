-- Назва позиції в документах і візуал у СП за вибором (REQ-322#p37, p38).
--
-- ORDER_ITEMS.DOCUMENT_NAME — як позиція називається в рахунку, СП, ВН і акті.
-- Досі всі документи друкували назву моделі з каталогу («Ніж Combo, TM
-- Discover»), а бухгалтерії для BAS потрібна номенклатура («Ніж з логотипом»).
-- Менеджер задає її в замовленні, бухгалтер може виправити в запиті рахунку.
-- NULL — як досі: назва позиції.
--
-- ORDERS.SPEC_INCLUDE_VISUALIZATION — чи друкувати в СП погоджений візуал.
-- Не кожному замовнику він потрібен у СП, а без погодженого візуалу СП досі не
-- створювалась узагалі. Менеджер обирає у вікні «Параметри специфікації».
-- NULL — як досі: візуал друкується, якщо він погоджений.
--
-- Нові колонки лягають під наявні політики orders_update / order_items_update
-- (is_team_member) — окремих грантів не треба.

alter table tosho.order_items add column if not exists document_name text;
comment on column tosho.order_items.document_name is
  'Назва позиції в рахунку, СП, ВН і акті (номенклатура BAS). NULL — назва позиції.';

alter table tosho.orders add column if not exists spec_include_visualization boolean;
comment on column tosho.orders.spec_include_visualization is
  'Чи друкувати в СП погоджений візуал. NULL — так, якщо він погоджений.';

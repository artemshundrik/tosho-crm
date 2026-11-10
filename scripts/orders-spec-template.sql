-- Вид специфікації на замовленні (REQ-358#p1).
--
-- Влад, 06.11.2026: «СП на поліграфічну і на сувенірну продукцію краще
-- розділяти в різні СП, так само як СП на дизайнерські послуги». Текст СП на
-- поліграфію відрізняється описом позиції (рядками за частинами виробу) і
-- назвою розділу 1; пункти 2 і 3 — ті самі (Влад, 10.11.2026).
--
-- ORDERS.SPEC_TEMPLATE — який шаблон СП друкувати:
--   merch  — товари (нинішній шаблон № 31);
--   print  — поліграфія;
--   design — дизайн-послуги (шаблону ще немає: чекає договору на послуги).
-- NULL — як досі: шаблон товарів. Менеджер обирає у вікні «Параметри
-- специфікації», CRM підказує вид за позиціями. Вид зберігається, а не
-- обчислюється на льоту: HTML СП збирається щоразу наново, і без збереженого
-- виду вже створені й підписані СП змінили б вигляд при повторному відкритті.
--
-- Колонка лягає під наявну політику orders_update (is_team_member).

alter table tosho.orders add column if not exists spec_template text;

alter table tosho.orders drop constraint if exists orders_spec_template_check;
alter table tosho.orders
  add constraint orders_spec_template_check
  check (spec_template is null or spec_template in ('merch', 'print', 'design'));

comment on column tosho.orders.spec_template is
  'Шаблон СП: merch (товари), print (поліграфія), design (дизайн-послуги). NULL — товари.';

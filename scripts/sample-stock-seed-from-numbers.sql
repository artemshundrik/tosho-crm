-- Seed sample stock from /Users/artem/Downloads/ToSho. Склад взірці.xsls.numbers.
-- Run after scripts/sample-stock-schema.sql.
-- This script is idempotent: it does not overwrite rows that already match
-- team + name + sku + color.

do $$
declare
  resolved_team_id uuid;
begin
  if to_regprocedure('tosho.current_workspace_id()') is not null then
    execute 'select tosho.current_workspace_id()' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regprocedure('public.current_workspace_id()') is not null then
    execute 'select public.current_workspace_id()' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regprocedure('tosho.my_workspace_id()') is not null then
    execute 'select tosho.my_workspace_id()' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regprocedure('public.my_workspace_id()') is not null then
    execute 'select public.my_workspace_id()' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regclass('public.team_members') is not null then
    execute 'select team_id from public.team_members where team_id is not null order by created_at asc limit 1' into resolved_team_id;
  end if;

  if resolved_team_id is null and to_regclass('tosho.memberships') is not null then
    execute 'select workspace_id from tosho.memberships where workspace_id is not null order by created_at asc limit 1' into resolved_team_id;
  end if;

  if resolved_team_id is null then
    raise exception 'Could not resolve current team_id automatically. Open the script and replace resolved_team_id manually.';
  end if;

  insert into tosho.sample_stock_items (
    team_id,
    name,
    visual_ref,
    sku,
    category,
    color,
    specifications,
    quantity_on_hand,
    reserved_quantity,
    unit_price,
    currency,
    comments
  )
  select
    resolved_team_id,
    seed.name,
    seed.visual_ref,
    nullif(seed.sku, '-'),
    seed.category,
    seed.color,
    seed.specifications,
    seed.quantity_on_hand,
    seed.reserved_quantity,
    seed.unit_price,
    'UAH',
    seed.comments
  from (
    values
      ('Термос Smart', null, '2619-08', 'Посуд / термоси', 'Чорний', '500 мл', 499, 0, 249.77::numeric, null),
      ('Пакет банан 70х50/4 50 мкм', null, '-', 'Пакування', 'Білий', '500х700мм', 100, 0, 8.60::numeric, null),
      (E'Садовий совок\nFiskars Premium', null, '1000726', 'Сувеніри / інструменти', 'Чорно-помаранчевий', '87 х 320 мм', 190, 0, 399.00::numeric, null),
      (E'Подарункова коробка дерв''яна', null, '-', 'Пакування', 'Чорний', null, 85, 0, 0.00::numeric, null),
      (E'Коробка подарункова\nCase', null, '1901-08', 'Пакування', 'Чорний', '33 х 24 х 10,5 см', 74, 0, 130.40::numeric, null),
      (E'Коробка подарункова\nCase', null, '1901-05', 'Пакування', 'Синій', '33 х 24 х 10,5 см', 200, 0, 130.40::numeric, null),
      (E'Коробка подарункова\nSurprise2', null, '1903-01', 'Пакування', 'Білий', '42 х 30 х 25см', 70, 0, 117.90::numeric, null),
      ('Зонтик на скло в машину', null, null, 'Авто / аксесуари', 'Срібний з чорною ручкою', null, 8, 0, 0.00::numeric, null),
      ('Чашки (Ukravit)', null, null, 'Посуд', 'Чорний', null, 36, 0, 0.00::numeric, null),
      ('Такі деревʼяні подарункові коробки', null, null, 'Пакування', E'Дерев''яна', null, 12, 0, 0.00::numeric, null),
      ('Ремінці для теллефону', 'Wookie', null, 'Аксесуари', 'Чорний', null, 247, 0, 0.00::numeric, null),
      ('Ліхтарик-брелок «SANLIGHT»', null, 'МО946903', 'Аксесуари / ліхтарики', 'Чорний', null, 0, 0, 0.00::numeric, 'Бронювання 99 шт - Антон'),
      ('Ліхтарик-брелок «SANLIGHT»', null, 'МО946905', 'Аксесуари / ліхтарики', 'Червоний', null, 15, 0, 0.00::numeric, null)
  ) as seed(
    name,
    visual_ref,
    sku,
    category,
    color,
    specifications,
    quantity_on_hand,
    reserved_quantity,
    unit_price,
    comments
  )
  where not exists (
    select 1
    from tosho.sample_stock_items existing
    where existing.team_id = resolved_team_id
      and lower(existing.name) = lower(seed.name)
      and coalesce(existing.sku, '') = coalesce(nullif(seed.sku, '-'), '')
      and coalesce(existing.color, '') = coalesce(seed.color, '')
  );
end $$;

notify pgrst, 'reload schema';

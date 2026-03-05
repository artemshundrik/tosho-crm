with upsert_type as (
  insert into tosho.catalog_types (team_id, name, quote_type, sort_order)
  select team_id, 'Пакети', 'print', 0
  from (
    select distinct team_id from tosho.catalog_types
  ) teams
  on conflict do nothing
  returning id, team_id
),
type_rows as (
  select id, team_id
  from upsert_type
  union
  select id, team_id
  from tosho.catalog_types
  where name = 'Пакети' and quote_type = 'print'
),
upsert_kind as (
  insert into tosho.catalog_kinds (team_id, type_id, name, sort_order)
  select team_id, id, 'Паперові пакети', 0
  from type_rows
  on conflict do nothing
  returning id, team_id, type_id
),
kind_rows as (
  select id, team_id, type_id
  from upsert_kind
  union
  select k.id, k.team_id, k.type_id
  from tosho.catalog_kinds k
  join type_rows t on t.id = k.type_id
  where k.name = 'Паперові пакети'
)
insert into tosho.catalog_models (team_id, kind_id, name, price, metadata)
select
  team_id,
  id,
  'Паперовий пакет',
  0,
  '{"configuratorPreset":"print_package"}'::jsonb
from kind_rows
on conflict do nothing;

update tosho.catalog_models m
set metadata = coalesce(m.metadata, '{}'::jsonb) || '{"configuratorPreset":"print_package"}'::jsonb
from tosho.catalog_kinds k
join tosho.catalog_types t on t.id = k.type_id
where
  m.kind_id = k.id
  and k.name = 'Паперові пакети'
  and t.name = 'Пакети'
  and t.quote_type = 'print'
  and m.name = 'Паперовий пакет';

notify pgrst, 'reload schema';

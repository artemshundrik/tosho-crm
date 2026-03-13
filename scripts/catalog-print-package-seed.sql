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
),
legacy_models as (
  select m.id as model_id, m.team_id
  from tosho.catalog_models m
  join tosho.catalog_kinds k on k.id = m.kind_id
  join tosho.catalog_types t on t.id = k.type_id
  where t.quote_type = 'print'
    and t.name = 'Поліграфія'
    and k.name = 'Пакети'
    and m.name = 'Паперовий пакет'
),
relinked_legacy as (
  update tosho.catalog_models m
  set kind_id = target_kind.id
  from legacy_models legacy
  join kind_rows target_kind on target_kind.team_id = legacy.team_id
  where m.id = legacy.model_id
  returning m.id
)
insert into tosho.catalog_models (team_id, kind_id, name, price, metadata)
select
  team_id,
  id,
  'Паперовий пакет',
  0,
  '{"configuratorPreset":"print_package"}'::jsonb
from kind_rows
where not exists (
  select 1
  from tosho.catalog_models existing
  where existing.kind_id = kind_rows.id
    and existing.name = 'Паперовий пакет'
);

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

delete from tosho.catalog_kinds k
where
  k.name = 'Пакети'
  and exists (
    select 1
    from tosho.catalog_types t
    where t.id = k.type_id
      and t.quote_type = 'print'
      and t.name = 'Поліграфія'
  )
  and not exists (
    select 1
    from tosho.catalog_models m
    where m.kind_id = k.id
  );

delete from tosho.catalog_types t
where
  t.quote_type = 'print'
  and t.name = 'Поліграфія'
  and not exists (
    select 1
    from tosho.catalog_kinds k
    where k.type_id = t.id
  );

notify pgrst, 'reload schema';

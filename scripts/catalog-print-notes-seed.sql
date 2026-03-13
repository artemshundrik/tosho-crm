with source_teams as (
  select distinct team_id
  from tosho.catalog_types
),
target_types as (
  select *
  from (
    values
      ('Блокноти', 'Блокноти', 'Блокнот', '{"configuratorPreset":"print_notebook"}'::jsonb, 1),
      ('Блоки для записів', 'Блоки для записів', 'Блоки для записів', '{"configuratorPreset":"print_note_blocks"}'::jsonb, 2)
  ) as v(type_name, kind_name, model_name, metadata, sort_order)
),
inserted_types as (
  insert into tosho.catalog_types (team_id, name, quote_type, sort_order)
  select teams.team_id, targets.type_name, 'print', targets.sort_order
  from source_teams teams
  cross join target_types targets
  on conflict do nothing
  returning id, team_id, name
),
type_rows as (
  select id, team_id, name
  from inserted_types
  union
  select t.id, t.team_id, t.name
  from tosho.catalog_types t
  join target_types targets on targets.type_name = t.name
  where t.quote_type = 'print'
),
inserted_kinds as (
  insert into tosho.catalog_kinds (team_id, type_id, name, sort_order)
  select type_rows.team_id, type_rows.id, targets.kind_name, 0
  from type_rows
  join target_types targets on targets.type_name = type_rows.name
  on conflict do nothing
  returning id, team_id, type_id, name
),
kind_rows as (
  select id, team_id, type_id, name
  from inserted_kinds
  union
  select k.id, k.team_id, k.type_id, k.name
  from tosho.catalog_kinds k
  join tosho.catalog_types t on t.id = k.type_id
  join target_types targets on targets.type_name = t.name and targets.kind_name = k.name
  where t.quote_type = 'print'
),
legacy_models as (
  select
    m.id as model_id,
    m.team_id,
    case
      when m.name = 'Блокнот' then 'Блокноти'
      when m.name = 'Блоки для записів' then 'Блоки для записів'
      else null
    end as target_type_name,
    case
      when m.name = 'Блокнот' then 'Блокноти'
      when m.name = 'Блоки для записів' then 'Блоки для записів'
      else null
    end as target_kind_name
  from tosho.catalog_models m
  join tosho.catalog_kinds k on k.id = m.kind_id
  join tosho.catalog_types t on t.id = k.type_id
  where t.quote_type = 'print'
    and m.name in ('Блокнот', 'Блоки для записів')
    and (
      (t.name = 'Поліграфія' and k.name = 'Блокноти та нотатки')
      or (t.name = 'Блокнот' and k.name = 'Блокнот')
      or (t.name = 'Блокноти' and k.name = 'Блокнот')
      or (t.name = 'Блоки для записів' and k.name = 'Блоки для записів')
    )
),
relinked_legacy as (
  update tosho.catalog_models m
  set kind_id = target_kind.id
  from legacy_models legacy
  join kind_rows target_kind
    on target_kind.team_id = legacy.team_id
   and target_kind.name = legacy.target_kind_name
  join tosho.catalog_types target_type
    on target_type.id = target_kind.type_id
   and target_type.name = legacy.target_type_name
   and target_type.quote_type = 'print'
  where m.id = legacy.model_id
  returning m.id
)
insert into tosho.catalog_models (team_id, kind_id, name, price, metadata)
select kind_rows.team_id, kind_rows.id, targets.model_name, 0, targets.metadata
from kind_rows
join target_types targets
  on targets.type_name = (
    select t.name from tosho.catalog_types t where t.id = kind_rows.type_id
  )
 and targets.kind_name = kind_rows.name
where not exists (
  select 1
  from tosho.catalog_models existing
  where existing.kind_id = kind_rows.id
    and existing.name = targets.model_name
);

update tosho.catalog_models m
set metadata = coalesce(m.metadata, '{}'::jsonb) ||
  case
    when t.name = 'Блокноти' and k.name = 'Блокноти' and m.name = 'Блокнот'
      then '{"configuratorPreset":"print_notebook"}'::jsonb
    when t.name = 'Блоки для записів' and k.name = 'Блоки для записів' and m.name = 'Блоки для записів'
      then '{"configuratorPreset":"print_note_blocks"}'::jsonb
    else '{}'::jsonb
  end
from tosho.catalog_kinds k
join tosho.catalog_types t on t.id = k.type_id
where
  m.kind_id = k.id
  and t.quote_type = 'print'
  and (
    (t.name = 'Блокноти' and k.name = 'Блокноти' and m.name = 'Блокнот')
    or (t.name = 'Блоки для записів' and k.name = 'Блоки для записів' and m.name = 'Блоки для записів')
  );

delete from tosho.catalog_kinds k
where
  (
    (
      k.name = 'Блокноти та нотатки'
      and exists (
        select 1
        from tosho.catalog_types t
        where t.id = k.type_id
          and t.quote_type = 'print'
          and t.name = 'Поліграфія'
      )
    )
    or (
      k.name = 'Блокнот'
      and exists (
        select 1
        from tosho.catalog_types t
        where t.id = k.type_id
          and t.quote_type = 'print'
          and t.name in ('Блокнот', 'Блокноти')
      )
    )
    or (
      k.name = 'Блоки для записів'
      and exists (
        select 1
        from tosho.catalog_types t
        where t.id = k.type_id
          and t.quote_type = 'print'
          and t.name = 'Блоки для записів'
      )
    )
  )
  and not exists (
    select 1
    from tosho.catalog_models m
    where m.kind_id = k.id
  );

delete from tosho.catalog_types t
where
  t.quote_type = 'print'
  and t.name in ('Поліграфія', 'Блокнот')
  and not exists (
    select 1
    from tosho.catalog_kinds k
    where k.type_id = t.id
  );

notify pgrst, 'reload schema';

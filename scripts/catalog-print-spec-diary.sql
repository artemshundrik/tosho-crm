-- Щоденник як вид поліграфії з описовими полями (`src/lib/printSpec.ts`).
--
-- Окремим файлом від `catalog-print-spec-types.sql`, хоч структура та сама:
-- той уже в журналі застосованих, і дописування рядка в нього означало б новий
-- sha на весь файл — «що саме поїхало цього разу» довелось би відновлювати
-- порівнянням версій.
--
-- Без цього рядка пресет `print_diary` лежить у бандлі й недосяжний: поля виду
-- показуються ЛИШЕ тоді, коли в моделі каталогу заповнено metadata.specPreset.
-- Рівно так загубився «Сертифікат» — написаний повністю, не призначений нікому.
--
-- Ідемпотентний: повторний запуск нічого не дублює й з чужих правок у metadata
-- перетирає лише сам specPreset.

\set ON_ERROR_STOP on

begin;

with team as (
  select id from public.teams order by created_at limit 1
),
spec (type_name, kind_name, model_name, preset) as (
  values
    ('Щоденники', 'Щоденники', 'Щоденник', 'print_diary')
),
types as (
  insert into tosho.catalog_types (team_id, name, quote_type, sort_order)
  select distinct team.id, spec.type_name, 'print', 0
  from spec cross join team
  on conflict (team_id, name) do update set quote_type = 'print'
  returning id, team_id, name
),
kinds as (
  insert into tosho.catalog_kinds (team_id, type_id, name, sort_order)
  select distinct types.team_id, types.id, spec.kind_name, 0
  from spec join types on types.name = spec.type_name
  on conflict (type_id, name) do update set updated_at = now()
  returning id, team_id, type_id, name
)
insert into tosho.catalog_models as m (team_id, kind_id, name, metadata)
select kinds.team_id, kinds.id, spec.model_name, jsonb_build_object('specPreset', spec.preset)
from spec
join types on types.name = spec.type_name
join kinds on kinds.type_id = types.id and kinds.name = spec.kind_name
on conflict (kind_id, name) do update
  set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object('specPreset', excluded.metadata ->> 'specPreset'),
      updated_at = now();

select
  t.name as type_name,
  k.name as kind_name,
  m.name as model_name,
  m.metadata ->> 'specPreset' as spec_preset
from tosho.catalog_models m
join tosho.catalog_kinds k on k.id = m.kind_id
join tosho.catalog_types t on t.id = k.type_id
where m.metadata ->> 'specPreset' = 'print_diary';

commit;

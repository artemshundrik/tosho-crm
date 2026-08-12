-- Види поліграфії з описовими полями (`src/lib/printSpec.ts`) у каталозі.
--
-- Поля виду показуються ЛИШЕ тоді, коли в моделі каталогу заповнено
-- metadata.specPreset. Без цих рядків код лежить у бандлі й не робить нічого —
-- рівно так загубився пресет «Сертифікат»: написаний повністю, але не призначений
-- жодній моделі, тож у застосунку до нього не дійти.
--
-- specPreset, а не configuratorPreset: старий ключ звужується десятком функцій
-- механізму з printPackage.ts, і нове значення в тій union зламало б їх усі.
-- Ключі зіллються, коли старі пресети перейдуть на опис полями.
--
-- «Листівка» вже є типом у каталозі (з видом «Вкладиш у монетницю»), тож ON
-- CONFLICT свідомо переюзує його, а не заводить другий тип із тією ж назвою.
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
    ('Календарі', 'Квартальні', 'Квартальний календар', 'print_calendar_quarterly'),
    ('Календарі', 'Перекидні', 'Перекидний календар', 'print_calendar_flip'),
    ('Календарі', 'Хатинки', 'Календар-хатинка', 'print_calendar_house'),
    ('Брошури', 'Брошури', 'Брошура', 'print_brochure'),
    ('Листівка', 'Листівки', 'Листівка', 'print_flyer')
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
where m.metadata ->> 'specPreset' is not null
order by t.name, k.name, m.name;

commit;

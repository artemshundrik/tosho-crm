-- Сертифікат: вид і модель під наявний тип «Сертифікати».
--
-- Тип у каталозі був, але без жодного виду й моделі — тому пресет сертифіката,
-- написаний у коді повністю, був недосяжний: набір полів показується лише тоді,
-- коли модель на нього вказує. За весь час сертифікатом не скористались ані разу.
--
-- Вказуємо на ОПИСОВИЙ пресет `print_certificate` (specPreset), а не на старий
-- `print_certificates` (configuratorPreset). Різниця для людини: старий механізм
-- заповнюється один раз, при створенні прорахунку, і на картці лише читається —
-- той, хто рахує, не міг ні дозаповнити, ні виправити. Описовий дає і поля у
-- вікні створення, і правки на картці, як у календарів.
--
-- Ідемпотентний: повторний запуск нічого не дублює, з чужих правок у metadata
-- перетирає лише specPreset.

\set ON_ERROR_STOP on

begin;

with team as (
  select id from public.teams order by created_at limit 1
),
type_row as (
  insert into tosho.catalog_types (team_id, name, quote_type, sort_order)
  select team.id, 'Сертифікати', 'print', 0 from team
  on conflict (team_id, name) do update set quote_type = 'print'
  returning id, team_id
),
kind_row as (
  insert into tosho.catalog_kinds (team_id, type_id, name, sort_order)
  select type_row.team_id, type_row.id, 'Сертифікати', 0 from type_row
  on conflict (type_id, name) do update set updated_at = now()
  returning id, team_id
)
insert into tosho.catalog_models as m (team_id, kind_id, name, metadata)
select kind_row.team_id, kind_row.id, 'Сертифікат', jsonb_build_object('specPreset', 'print_certificate')
from kind_row
on conflict (kind_id, name) do update
  set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object('specPreset', 'print_certificate'),
      updated_at = now();

select
  t.name as tip,
  coalesce(k.name, '—') as vyd,
  coalesce(m.name, '—') as model,
  coalesce(m.metadata ->> 'configuratorPreset', m.metadata ->> 'specPreset', 'НЕМАЄ ПОЛІВ') as preset
from tosho.catalog_types t
left join tosho.catalog_kinds k on k.type_id = t.id
left join tosho.catalog_models m on m.kind_id = k.id
where t.quote_type = 'print'
order by t.name, k.name;

commit;

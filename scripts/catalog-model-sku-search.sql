-- Пошук товару за артикулом ВАРІАНТА, а не лише моделі (REQ-248).
--
-- ЩО БУЛО НЕ ТАК. Поле позиції прорахунку шукало за `metadata->>'sku'` —
-- одним скаляром моделі. Але постачальник дає код кольору: «TSRA170-BK», тоді
-- як модель у каталозі підписана «TSRA170-WH» (перший колір). Замір на проді
-- 04.09.2026: 250 моделей, у 71 є артикул моделі, і рівно у 56 із них є
-- артикули варіантів, яких не видно з артикула моделі. Тобто більшість
-- вставлених кодів не знаходила нічого.
--
-- ЧОМУ НЕ ВЗЯТИ `variants` У БРАУЗЕР. Масив variants на цих 250 моделях важить
-- 661 кБ, і він тягнувся б на КОЖНЕ відкриття вікна прорахунку заради пошуку,
-- яким користуються зрідка. При зростанні каталогу до 1851 товару це вікно, яке
-- думає. Тому артикули шукаються запитом, і лише тоді, коли набране схоже на
-- код (`looksLikeSku` у src/features/quotes/quote-wizard/catalogSkuSearch.ts).
--
-- ЧОМУ ГЕНЕРОВАНА КОЛОНКА, А НЕ ТРИГЕР. Моделі пишуть три різні місця —
-- сторінка «Каталог», вікно прорахунку (товар за посиланням) і фонова розвідка
-- імпорту. Тригер треба було б не забути; generated always колонку неможливо
-- обійти в принципі, вона просто НЕ МОЖЕ розійтись із metadata.
--
-- ЦІНА ЗМІНИ ПРАВИЛА. Тіло функції змінити «на місці» не вийде: колонка
-- залежить від неї, і `create or replace` не перерахує вже записані рядки.
-- Міняти правило — значить `drop column` + `create or replace function` +
-- `add column` знову, тобто прогнати цей файл зі знятою колонкою. Це свідома
-- незручність за неможливість тихого розходження.
--
-- РОЗДІЛЬНИК — ПЕРЕНОС РЯДКА, а не пробіл. У живих даних є артикули з
-- пробілом усередині («64000-CG 10C», «U0402-Grey Heather») і навіть один
-- зіпсований («Артикул: 51K087C66»), тож по пробілу список не розібрати назад
-- на артикули, а браузеру треба показати, ЯКИЙ саме код збігся.
--
-- РЕГІСТР ЗБЕРІГАЄТЬСЯ. Індекс gin_trgm_ops однаково обслуговує LIKE та ILIKE
-- (триграми з тексту знімаються в нижньому регістрі), тож нема потреби гнути
-- значення під пошук — у підказці видно артикул рівно так, як його завели.
--
-- Ідемпотентний: повторний прогін нічого не дублює.

-- Одна транзакція — від `npm run db:apply` (psql -1); свого `begin` тут немає
-- навмисно: він закривав би її раніше й ламав атомарність усього файлу.
\set ON_ERROR_STOP on

create or replace function tosho.catalog_model_search_skus(p_metadata jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select nullif(string_agg(sku, E'\n' order by sku), '')
  from (
    select distinct sku
    from (
      select nullif(trim(p_metadata->>'sku'), '') as sku
      union all
      select nullif(trim(variant->>'sku'), '')
      from jsonb_array_elements(
             case
               when jsonb_typeof(p_metadata->'variants') = 'array' then p_metadata->'variants'
               else '[]'::jsonb
             end
           ) as variant
    ) raw
    where sku is not null
  ) uniq
$fn$;

comment on function tosho.catalog_model_search_skus(jsonb) is
  'Усі артикули моделі — свій плюс усі артикули варіантів, по одному в рядок (REQ-248). '
  'Immutable, бо годує генеровану колонку catalog_models.search_skus.';

alter table tosho.catalog_models
  add column if not exists search_skus text
  generated always as (tosho.catalog_model_search_skus(metadata)) stored;

comment on column tosho.catalog_models.search_skus is
  'Артикули моделі та її варіантів, по одному в рядок — для пошуку товару за кодом (REQ-248). '
  'Тільки читання: значення веде generated always із metadata.';

-- Триграмний індекс: він і лише він робить `ilike ''%код%''` дешевим. Без нього
-- запит читав би всю таблицю — рівно те, від чого ми пішли з браузера.
create index if not exists catalog_models_search_skus_trgm
  on tosho.catalog_models using gin (search_skus public.gin_trgm_ops);

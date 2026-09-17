-- Полагодити позиції, у які замість товару потрапив логотип магазину (REQ-285#p8, #p9).
--
-- ЩО СТАЛОСЬ. Розбирач сторінок відкидав службову графіку лише на запасному
-- скануванні `<img>`, тож найперший і найдовіреніший кандидат — `og:image` —
-- проходив без перевірки. Два постачальники ставлять там власний логотип НА
-- КОЖНІЙ сторінці товару: eney.com.ua (`logo-1.png`, 253×50) і toptime.com.ua
-- (`slogan-ka.png`, 270×50). Плюс e-suvenir.com.ua — SPA, що на будь-яку
-- адресу віддає порожню оболонку з кодом 200, тож у позицію поїхав заголовок
-- сайту замість назви товару.
--
-- Код полагоджено (`_lib/ogTags.ts` + пошук у пулі `_lib/supplierPoolLookup.ts`),
-- але вісім позицій уже лежать у базі з чужою картинкою, і самі вони не
-- виправляться: фонова розвідка ходить лише по щойно створених.
--
-- ЗВІДКИ БЕРЕМО ПРАВИЛЬНЕ. З нашого ж пулу `tosho.supplier_products`, за тією
-- самою адресою, що лежить у `metadata.supplierUrl`. Усі вісім позицій там є —
-- перевірено поіменно.
--
-- ЧОМУ СПИСОК ID, А НЕ ПРАВИЛО. Правило «онови все, де картинка схожа на
-- логотип» вимагало б дивитись на самі файли, чого SQL не вміє; правило «онови
-- все, що є в пулі» переписало б і те, що зараз правильне. Вісім рядків
-- знайдено очима (розміри webp у Storage), і переліком вони лишаються
-- перевірюваними: видно, що саме міняється і чому.
--
-- ЧОГО НЕ РОБИМО — АРТИКУЛ ТАМ, ДЕ ЙОГО НЕ ВИДНО. У книжки Е-Сувеніра кожен
-- колір має свій артикул (16225002/1, 16225003/1, 16225004/1, 16225008/1), і
-- вибрати за менеджера не можна: це замовлення не того кольору. Тому їй
-- ставимо назву й фото, а артикул лишаємо порожнім — його допише вибір кольору
-- в картці. У Топтайма навпаки: артикул один на всі кольори (1823 рядки на 166
-- артикулів), тож `ST7000` і `ka911` проставляються сміливо.
--
-- ФОТО ДЛЯ БАГАТОКОЛІРНИХ беремо детерміновано — рядок із найменшим артикулом
-- серед тих, де фото є. Це той самий «представник картки», якого показує пошук
-- пулу; колір уточнить менеджер.
--
-- ДВА ТРИГЕРИ НА `quote_items` ЗНІМАЄМО, як у scripts/catalog-method-directory.sql:
--   * trg_quote_items_recalc_upd → `recalc_quote_totals()` падає з «Not allowed»,
--     бо звіряє `is_team_member()`, а адмінське з'єднання членом команди не є.
--     Перерахунок тут і не потрібен: ні кількості, ні ціни не чіпаємо.
--   * trg_quote_lock_quote_items → «Quote is locked by another user», якщо в
--     мить прогону хтось тримає прорахунок відкритим.
-- Тригер аудиту лишається ввімкненим: правка має лишити слід.
-- Усе однією транзакцією, тож при будь-якій помилці тригери повертаються самі.
--
-- Ідемпотентний: повторний прогін перепише ті самі значення тими самими.

\set ON_ERROR_STOP on

alter table tosho.quote_items disable trigger trg_quote_items_recalc_upd;
alter table tosho.quote_items disable trigger trg_quote_lock_quote_items;

-- Представник картки за адресою: назва, артикул (лише коли він один на всі
-- кольори) і фото з найменшого артикула, у якого воно є.
create temporary table repair_source on commit drop as
with pooled as (
  select p.url,
         min(p.name) as name,
         case when count(distinct p.article) = 1 then min(p.article) end as article,
         (array_agg(p.image_url order by p.article)
            filter (where p.image_url is not null))[1] as image_url
  from tosho.supplier_products p
  where p.url is not null
  group by p.url
)
select * from pooled;

-- 1. ПОЗИЦІЇ. Назва — лише в ті, де стоїть заголовок сайту або урізана назва;
--    артикул — лише в порожнє й лише коли він однозначний; фото — завжди, бо
--    саме воно й зіпсоване.
update tosho.quote_items i
set metadata = jsonb_set(
      jsonb_set(
        case
          when s.article is not null and coalesce(i.metadata->>'sku', '') = ''
            then jsonb_set(i.metadata, '{sku}', to_jsonb(s.article))
          else i.metadata
        end,
        '{catalogVariant}',
        coalesce(i.metadata->'catalogVariant', '{}'::jsonb)
          || jsonb_build_object(
               'id', coalesce(i.metadata->'catalogVariant'->>'id', 'import:' || i.id::text),
               'name', s.name,
               'sku', case
                        when coalesce(i.metadata->>'sku', '') <> '' then i.metadata->>'sku'
                        else to_jsonb(s.article) #>> '{}'
                      end,
               'imageUrl', s.image_url
             )
      ),
      '{research}',
      coalesce(i.metadata->'research', '{}'::jsonb)
        || jsonb_build_object('source', 'pool', 'repairedAt', now()::text)
    ),
    name = case
             -- Назву з пулу ставимо там, де своя гірша: заголовок сайту або
             -- та сама назва без товарного префікса («Фліс», «Футболка»).
             when i.name = 'Сувенірна продукція для рекламних агенцій | Е-Сувенір UA' then s.name
             when s.name like '%' || i.name then s.name
             else i.name
           end,
    updated_at = now()
from repair_source s
where s.url = i.metadata->>'supplierUrl'
  and i.id in (
    -- eney.com.ua — логотип 253×50 замість фото (TS-0926-0029, позиції 6–9)
    '31abea99-652c-4b58-bdb5-cea536ce99c8',
    'c414553e-42df-4471-b193-6ac59e6c56a5',
    '6938c90f-7e76-40e8-a7b5-6c85e24a24a9',
    '2d3f18e0-4ef7-4834-b9cc-be11f92162f4',
    -- toptime.com.ua — рекламна смуга 270×50 (TS-0926-0026 і TS-0926-0030)
    '3e5fbb73-7665-4d56-9bc5-bf88d2fceedc',
    '19e001ad-7119-412d-83eb-e0c53fd8ae94',
    'ca5ef70a-227e-490f-805d-2bc0cb14bc44',
    -- e-suvenir.com.ua — заголовок сайту замість назви, фото немає (TS-0926-0029, позиція 4)
    'd5a2f29a-190c-4559-9aab-d7b08f0df814'
  );

-- 2. МОДЕЛІ КАТАЛОГУ. Фонова розвідка писала знайдену картинку не лише в
--    позицію, а й у `catalog_models.image_url` — тож логотип ENEY став фото
--    трьох НОВИХ моделей і поїхав би з ними в наступні прорахунки.
update tosho.catalog_models m
set image_url = s.image_url, updated_at = now()
from tosho.quote_items i
join repair_source s on s.url = i.metadata->>'supplierUrl'
where m.id = i.catalog_model_id
  and s.image_url is not null
  and m.id in (
    'b2ac3822-dabf-4d81-b83f-2290beb49b19',  -- Ручка UMA STRAIGHT GUM
    '07a6a9b3-826c-4c75-b275-09b5ee8cda55',  -- Горнятко KATRINA
    '8c6c0316-ee91-426c-ad3c-3bc1d88028c3'   -- Горнятко LUMINA
  );

alter table tosho.quote_items enable trigger trg_quote_items_recalc_upd;
alter table tosho.quote_items enable trigger trg_quote_lock_quote_items;

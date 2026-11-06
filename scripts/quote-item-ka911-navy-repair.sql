-- Прорахунок TS-1126-0008: менеджер обрав фліс ka911 кольору Navy, а в позицію лягло
-- фото Sage. Вибір кольору тоді ніде не записувався, тож лагодимо зі слів менеджера,
-- і лише цю позицію: решті зачеплених колір мають назвати люди.
--
-- Фото тут ще на сайті постачальника. У наше сховище його переносить наступний крок:
-- CATALOG_IMAGE_MIGRATION_DRY_RUN=0 npm run migrate:quote-item-images
--
-- Тригери знімаються, як у quote-items-logo-repair.sql: recalc_quote_totals() відмовляє
-- адмінському з'єднанню, а кількість і ціна тут не змінюються. Аудит лишається ввімкненим.
-- Умова на старий id робить повторний прогін порожнім і не затре вже перенесене фото.

\set ON_ERROR_STOP on

alter table tosho.quote_items disable trigger trg_quote_items_recalc_upd;
alter table tosho.quote_items disable trigger trg_quote_lock_quote_items;

update tosho.quote_items
set name = 'Фліс ka911 FALCO - FULL ZIP MICROFLEECE JACKET · Navy',
    metadata = jsonb_set(
      metadata,
      '{catalogVariant}',
      jsonb_build_object(
        'id', 'pool:ef9c1369-abeb-4def-ac69-07966d5811ab',
        'name', 'Navy',
        'sku', 'ka911',
        'imageUrl', 'https://toptime.com.ua/photos/products/ka911/ka911_NV.jpg'
      )
    )
where id = '768d1627-e8a3-4ab4-acf8-576662ae0113'
  and metadata->'catalogVariant'->>'id' = 'pool:457b7bbd-9a6c-4729-887c-49e5a5a13327';

alter table tosho.quote_items enable trigger trg_quote_items_recalc_upd;
alter table tosho.quote_items enable trigger trg_quote_lock_quote_items;

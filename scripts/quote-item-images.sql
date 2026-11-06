-- Фото позицій прорахунку переїхали в наше сховище (REQ-296#p8).
-- Згенеровано scripts/migrate-quote-item-images.mjs; картинки вже завантажені.
-- Тригери знімаються, як у quote-items-logo-repair.sql: recalc_quote_totals()
-- відмовляє адмінському з'єднанню, а перераховувати тут нема чого — ні
-- кількості, ні ціни не змінюються. Аудит лишається ввімкненим.

\set ON_ERROR_STOP on

alter table tosho.quote_items disable trigger trg_quote_items_recalc_upd;
alter table tosho.quote_items disable trigger trg_quote_lock_quote_items;

update tosho.quote_items set metadata = jsonb_set(jsonb_set(metadata, '{catalogVariant,sourceImageUrl}', to_jsonb('https://toptime.com.ua/photos/products/ka911/ka911_NV.jpg'::text), true), '{catalogVariant,imageUrl}', to_jsonb('https://nqqabedngnndtltzvqyi.supabase.co/storage/v1/object/public/public-assets/teams/389719a7-5022-41da-bc49-11e7a3afbd98/quote-items/768d1627-e8a3-4ab4-acf8-576662ae0113/1793984085127-ka911_nv.jpg.webp'::text), true) where id = '768d1627-e8a3-4ab4-acf8-576662ae0113';

alter table tosho.quote_items enable trigger trg_quote_items_recalc_upd;
alter table tosho.quote_items enable trigger trg_quote_lock_quote_items;

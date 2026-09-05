-- manual
-- Постачальники з особистими кабінетами та знижками — перший список Артема
-- (REQ-250#p11, #p12). Розвідка кожного сайту — у docs/CATALOG_DESIGN.md §5б.
--
-- Чому -- manual: це разовий сід даних, а не схема. Застосовується руками через
-- `npm run db:apply scripts/catalog-suppliers-seed.sql` після рішення Артема, а
-- не автоматом. Ідемпотентний: website лише проставляється, нові рядки — лише
-- якщо постачальника з таким сайтом ще немає.
--
-- website тут — не косметика: без домену не працює показ «звідки беремо» (§5б).
-- notes у нових рядках несе розвідку (рушій + звідки тягнути дані), щоб знання
-- не загубилось; картки Артем доведе до ладу в CRM (p11).

begin;

-- 1. Наявні постачальники — проставити сайт (картки вже є, бракувало домену).
update tosho.contractors set website = 'https://bergamo.ua/',    updated_at = now()
  where id = 'f6a86214-45e4-435d-8c38-df3e9f42413d' and coalesce(website,'') = '';
update tosho.contractors set website = 'https://eney.com.ua/',   updated_at = now()
  where id = '0cb703d7-5643-40a6-a431-f5f9c7108716' and coalesce(website,'') = '';
update tosho.contractors set website = 'https://totobi.com.ua/', updated_at = now()
  where id = '49593d89-bf7c-4b32-89b9-d05a6fcdf6a8' and coalesce(website,'') = '';

-- 2. Нові постачальники — завести карткою kind='supplier'. Назви робочі,
--    Артем уточнить у CRM. INSERT ... WHERE NOT EXISTS робить повтор безпечним.
insert into tosho.contractors (id, team_id, name, kind, website, notes, created_at, updated_at)
select gen_random_uuid(), '389719a7-5022-41da-bc49-11e7a3afbd98', v.name, 'supplier', v.website, v.notes, now(), now()
from (values
  ('Berrytex',     'https://berrytex.com.ua/',    'Magento. Публічний фід prom.xml (2098 товарів): артикул, назва, виробник, фото, роздрібна ціна. Оптова — за логіном у кабінеті.'),
  ('Е-Сувенір',    'https://e-suvenir.com.ua/',   'Власний рушій. «Вхід для менеджерів» — оптові ціни за логіном. Публічний фід не знайдено.'),
  ('Папірус Гурт', 'https://papirus-opt.com/',    'Власний B2B-портал. Ціни сховані до входу. Джерело даних — кабінет.'),
  ('Toptime',      'https://toptime.com.ua/',     'Власний рушій. Публічно лише sitemap. Спосіб отримання цін — уточнити.'),
  -- Аванпринт — НАШ сайт, але для каталогу він таке саме джерело товару, як
  -- решта (§5, is_own). Без цієї картки завантажувач пулу не має під кого
  -- вставляти рядки: team_id і постачальник беруться саме звідси.
  ('Аванпринт',    'https://avanprint.ua/',       'Наш власний сайт (Хорошоп). Назви й фото беруться з мапи сайту; артикул і ціна — лише експортом з адмінки (/edit), сторінки за анти-бот захистом.')
) as v(name, website, notes)
where not exists (
  select 1 from tosho.contractors c
  where c.kind = 'supplier'
    and (c.website = v.website or lower(c.name) = lower(v.name))
);

commit;

-- Перевірка після застосування:
--   select name, kind, website from tosho.contractors where kind='supplier' order by name;

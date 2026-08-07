-- Точки доставки підрядників і постачальників — той самий формат, що в замовників.
--
-- Why: `delivery_info` — вільний текст, у якому осіла структура. Прогін по базі
-- показав 13 заповнених записів, і в них навперемішку лежать місто, номер
-- відділення НП, ЄДРПОУ отримувача, юрособа, ПІБ представника й телефон —
-- усе те, що для ТТН потрібно окремими полями. Поки воно рядком, Нова Пошта
-- з CRM не поїде, а таблиця не може показати «НП №327» пілюлею.
--
-- Формат 1:1 із `tosho.customers.delivery_points` (jsonb-масив, snake_case) —
-- читає й пише той самий `src/lib/customerDeliveryPoints.ts`, тож окремого
-- парсера для підрядників не з'являється.
--
-- ЩО СВІДОМО НЕ РОБИМО: не чистимо `delivery_info`. Розбір вільного тексту —
-- здогад, і в 5 із 13 записів там узагалі не доставка («рахунки виставляли з
-- ПДВ», «Відправка адресна», просто ім'я менеджера). Оригінал лишається в
-- колонці й показується в картці як сира нотатка, доки людина не звірить.

alter table tosho.contractors
  add column if not exists delivery_points jsonb not null default '[]'::jsonb;

-- Перенесення 8 записів, де номер відділення й місто читаються однозначно.
-- Решту 5 не чіпаємо: там не адреси.
--
-- Ідемпотентність: пишемо лише в порожні `delivery_points`, щоб повторний
-- запуск не затер те, що вже виправили руками в CRM.
with parsed(name, kind, type, city, address, recipient_type, recipient_edrpou,
            contact_first_name, contact_last_name, contact_phone, comment) as (
  values
    -- «м. Київ, відділення №327, ЭДРПОУ 35909417, Проценко Валентин Іванович, тел. (066)607-81-01»
    ('ТОВ «СВ-Друк»',       'contractor', 'np_branch',   'Київ',                     'Відділення №327',
     'organization', '35909417', 'Валентин',    'Проценко', '+380666078101', ''),
    -- «Данкев Ігор Олександрович / 0505548673 / Київ, 242 відділення / ТОВ "Планета Прінт" / 42469017»
    ('Планета Сервіс',      'contractor', 'np_branch',   'Київ',                     'Відділення №242',
     'organization', '42469017', 'Ігор',        'Данкев',   '+380505548673', ''),
    -- «Київ / ТзОВ «Підприємство «Кліше» / 33169375 / БЕЗНАЛ / Представник / 093 610 98 73 / НП № 213»
    ('Кліше',               'contractor', 'np_branch',   'Київ',                     'Відділення №213',
     'organization', '33169375', 'Представник', '',         '+380936109873', 'Безготівковий розрахунок'),
    -- «Киев, НП 181 на компанию / Гранд Стиль Интернешнл / 41388134 / Доставка по б/н / Максименко Олеся»
    ('ТОВ «Гранд Стиль»',   'contractor', 'np_branch',   'Київ',                     'Відділення №181',
     'organization', '41388134', 'Олеся',       'Максименко', '+380688457060', 'Доставка по безготівковому розрахунку'),
    -- «м. Київ, Поштомат №7966» — єдиний поштомат у базі, отримувача не вказано
    ('Мазур Алла',          'contractor', 'np_postomat', 'Київ',                     'Поштомат №7966',
     'private',      '',         '',            '',         '',              ''),
    -- «м. Вишневе, відділення №1 (код 34192206» — дужка не закрита, код читається
    ('Бергамо Україна',     'supplier',   'np_branch',   'Вишневе',                  'Відділення №1',
     'organization', '34192206', '',            '',         '',              ''),
    ('ТОВ «ТоТобі»',        'supplier',   'np_branch',   'Вишневе',                  'Відділення №1',
     'organization', '40872583', '',            '',         '',              ''),
    -- «НП: Львівська обл., с. Малехів, Нова Пошта, відділення1 ЄДРПОУ 23955204»
    ('ТОВ «Компанія Еней»', 'supplier',   'np_branch',   'с. Малехів, Львівська обл.', 'Відділення №1',
     'organization', '23955204', '',            '',         '',              '')
)
update tosho.contractors as c
set delivery_points = jsonb_build_array(
      jsonb_build_object(
        'id',                 gen_random_uuid()::text,
        'type',               p.type,
        'recipient_type',     p.recipient_type,
        'recipient_edrpou',   p.recipient_edrpou,
        'city',               p.city,
        'address',            p.address,
        'contact_first_name', p.contact_first_name,
        'contact_last_name',  p.contact_last_name,
        'contact_name',       btrim(p.contact_first_name || ' ' || p.contact_last_name),
        'contact_phone',      p.contact_phone,
        'comment',            p.comment,
        'is_default',         true,
        -- Refs довідника НП лишаються порожні: точки заведені руками, як і в
        -- замовників. Заповняться, коли менеджер перевибере місто/відділення
        -- в автокомпліті — тоді ТТН зможе поїхати без ручного пошуку.
        'np_city_ref',        null,
        'np_warehouse_ref',   null,
        'np_settlement_ref',  null
      )
    ),
    updated_at = now()
from parsed as p
where c.name = p.name
  and c.kind = p.kind
  and c.delivery_points = '[]'::jsonb;

-- Перевірка:
--   select name, kind,
--          delivery_points #>> '{0,city}'    as місто,
--          delivery_points #>> '{0,address}' as відділення,
--          delivery_info                     as сирий_текст
--   from tosho.contractors
--   where delivery_points <> '[]'::jsonb
--   order by kind, name;
--
--   -- Що лишилось вільним текстом і чекає на людину:
--   select name, delivery_info from tosho.contractors
--   where coalesce(btrim(delivery_info), '') <> '' and delivery_points = '[]'::jsonb;

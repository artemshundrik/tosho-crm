-- manual
-- Злити подвійний «Антистрес» у каталозі (REQ-250, знайдено 05.09.2026).
--
-- ЩО БУЛО НЕ ТАК. У списку видів «Антистрес» стояв двічі, і вибрати правильний
-- було неможливо — обидва рядки виглядають однаково. Причина не в дублюванні
-- виду, а в тому, що хтось завів ТИПОМ те, що мало бути видом: тип «Антистрес»
-- містив рівно один вид, названий так само. Правильна структура вже існує —
-- «Іграшки / Антистрес».
--
-- Заміряно на проді перед злиттям:
--   Іграшки/Антистрес   (ціль)    2 моделі, 2 позиції, методи: Тамподрук, УФ-друк
--   Антистрес/Антистрес (джерело) 1 модель, 1 позиція, методи: Тамподрук,
--                                 УФ-друк, Лазерне гравіювання
--   На жоден метод джерела позиції НЕ посилаються (перевірено по metadata),
--   тож прибирання дублікатів нікого не осиротить.
--
-- ЧОМУ -- manual: разове злиття даних, не схема. Застосовується рукою через
-- `npm run db:apply scripts/catalog-merge-antistres-kind.sql`.
--
-- Повторний запуск безпечний: після першого джерела вже немає, і всі update
-- зачеплять нуль рядків.

begin;

-- Ціль і джерело названі явно, щоб їх не переплутати місцями.
--   ціль:    Іграшки / Антистрес   c7ad11b2-3da7-45e6-8dff-55b129205eb6
--   джерело: Антистрес / Антистрес dc4d1e01-6662-42a9-91e2-3797daa05819

-- 1. Моделі каталогу переїжджають у правильний вид.
update tosho.catalog_models
   set kind_id = 'c7ad11b2-3da7-45e6-8dff-55b129205eb6', updated_at = now()
 where kind_id = 'dc4d1e01-6662-42a9-91e2-3797daa05819';

-- 2. Позиції прорахунків — разом із типом: інакше позиція лишиться з типом
--    «Антистрес», якого вже не буде.
update tosho.quote_items
   set catalog_kind_id = 'c7ad11b2-3da7-45e6-8dff-55b129205eb6',
       catalog_type_id = 'e17d4326-cd10-482c-a10f-0a4a484ca02f'
 where catalog_kind_id = 'dc4d1e01-6662-42a9-91e2-3797daa05819';

-- 3. Методи нанесення: переносимо лише ті, яких у цілі ще немає (це «Лазерне
--    гравіювання»); «Тамподрук» і «УФ-друк» там уже є, і другий їх примірник
--    дав би в інтерфейсі той самий дубль, від якого ми й тікаємо.
update tosho.catalog_methods m
   set kind_id = 'c7ad11b2-3da7-45e6-8dff-55b129205eb6'
 where m.kind_id = 'dc4d1e01-6662-42a9-91e2-3797daa05819'
   and not exists (
     select 1 from tosho.catalog_methods t
      where t.kind_id = 'c7ad11b2-3da7-45e6-8dff-55b129205eb6'
        and lower(trim(t.name)) = lower(trim(m.name))
   );
delete from tosho.catalog_methods where kind_id = 'dc4d1e01-6662-42a9-91e2-3797daa05819';

-- 4. Місця нанесення. Їх у джерела нуль, але правило те саме — на випадок,
--    якщо між заміром і застосуванням хтось додасть.
update tosho.catalog_print_positions p
   set kind_id = 'c7ad11b2-3da7-45e6-8dff-55b129205eb6'
 where p.kind_id = 'dc4d1e01-6662-42a9-91e2-3797daa05819'
   and not exists (
     select 1 from tosho.catalog_print_positions t
      where t.kind_id = 'c7ad11b2-3da7-45e6-8dff-55b129205eb6'
        and lower(trim(t.label)) = lower(trim(p.label))
   );
delete from tosho.catalog_print_positions where kind_id = 'dc4d1e01-6662-42a9-91e2-3797daa05819';

-- 5. Порожній вид і порожній тип прибираємо. Тип видаляємо ЛИШЕ якщо в ньому
--    справді не лишилось видів: якщо хтось устиг завести туди ще один, тип має
--    вижити, а не забрати його з собою.
delete from tosho.catalog_kinds where id = 'dc4d1e01-6662-42a9-91e2-3797daa05819';
delete from tosho.catalog_types t
 where t.id = 'bf22474f-f454-4261-8cc5-0b4870d83118'
   and not exists (select 1 from tosho.catalog_kinds k where k.type_id = t.id);

commit;

-- Перевірка після застосування (має лишитись один рядок — Іграшки/Антистрес,
-- 3 моделі, 3 методи):
--   select t.name, k.name,
--          (select count(*) from tosho.catalog_models m where m.kind_id=k.id) models,
--          (select count(*) from tosho.catalog_methods cm where cm.kind_id=k.id) methods
--     from tosho.catalog_kinds k join tosho.catalog_types t on t.id=k.type_id
--    where lower(trim(k.name))='антистрес';

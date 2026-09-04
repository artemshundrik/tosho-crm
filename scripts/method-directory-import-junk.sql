-- Прибрати сміттєві «методи нанесення», що приїхали імпортом (REQ-182#p19).
--
-- ЗВІДКИ ВОНИ. Разом із курткою в каталог заїхала таблиця розмірів із сайту
-- постачальника, і кожен її рядок став «методом нанесення» виду «Куртки»:
-- «5 см», «2», «Всі розміри одягу:», «*B: довжина по центру спини» і два
-- хвости примітки про допуски. Методом жоден із них не є.
--
-- ЧОМУ ЦЕ ПОМІТИЛОСЬ ЗАРАЗ. У вікні «Новий прорахунок» методи виду стали
-- чипами в рядку позиції (REQ-182#p16) — тобто це сміття тепер видно як
-- кнопки, які менеджеру пропонують натиснути.
--
-- ЧОМУ ВИДАЛЯЄМО, А НЕ ХОВАЄМО. `method_directory.active` гасить запис у
-- довіднику, але чипи вікна й каталог читають `catalog_methods` виду, і
-- мертвий рядок лишився б на екрані. Ховати те, що не має існувати, —
-- це борг, який доведеться пояснювати наступному читачеві.
--
-- ЧОМУ ЦЕ БЕЗПЕЧНО. Заміряно на проді 04.09.2026: у всіх шести нуль звʼязків
-- у `catalog_model_methods` і нуль згадок у `quote_items.methods`. Тобто
-- жодна модель каталогу їх не пропонує і жоден прорахунок ними не рахувався:
-- видалення не міняє ані цін, ані вмісту карток.
--
-- ЧОГО ЦЕЙ СКРИПТ НЕ РОБИТЬ. Не чіпає синоніми з малої літери, що теж
-- приїхали імпортом на «Куртки» (`DTF`, `термоперенос`, `шовкографія`,
-- `шовкотрафарет`): у них є звʼязки з моделями, і звести їх із «ДТФ»,
-- «Термотрансфер» і «Шовкодрук» — це перенесення звʼязків, а не прибирання
-- сміття. Рішення про злиття ухвалює людина (так було й у REQ-54).

begin;

create temporary table junk_directory on commit drop as
select id, name
from tosho.method_directory
where name in (
  '- можуть бути змінені без попереднього повідомлення',
  '- підлягають допуску &plusmn',
  '*B: довжина по центру спини',
  '2',
  '5 см',
  'Всі розміри одягу:'
);

-- Запобіжник: якщо на щось із цього вже посилається модель або прорахунок,
-- значить, воно перестало бути сміттям — і скрипт має впасти, а не тихо
-- забрати робочі дані.
do $$
declare
  linked int;
  used int;
begin
  select count(*) into linked
  from tosho.catalog_model_methods mm
  join tosho.catalog_methods m on m.id = mm.method_id
  where m.directory_id in (select id from junk_directory);

  select count(*) into used
  from tosho.quote_items qi,
       jsonb_array_elements(coalesce(qi.methods, '[]'::jsonb)) e
  join tosho.catalog_methods m on m.id::text = e->>'method_id'
  where m.directory_id in (select id from junk_directory);

  if linked > 0 or used > 0 then
    raise exception 'Сміттєві методи вже вживаються: % звʼязків з моделями, % згадок у прорахунках', linked, used;
  end if;
end $$;

-- Спершу рядки видів (`catalog_methods.directory_id` має on delete restrict),
-- потім самі записи довідника.
delete from tosho.catalog_methods
where directory_id in (select id from junk_directory);

delete from tosho.method_directory
where id in (select id from junk_directory);

commit;

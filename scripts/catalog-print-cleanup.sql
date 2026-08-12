-- Прибирання ручних карток поліграфії, які ніколи не працювали.
--
-- Причина: набір полів кожного виду поліграфії живе в коді. Менеджер міг додати
-- товар у каталог, але без пресета в прорахунку він не показував ЖОДНОГО
-- налаштування — а до сьогодні його ще й вибрати було неможливо, бо каскад
-- «Категорія / Вид / Модель» у білдері підмінявся списком лише тих моделей, що
-- мають конфігуратор. Після виправлення каскаду такі картки стали доступні й
-- порожні, тож пастка з невидимої стала видимою — саме тому чистимо тепер.
--
-- Рішення Артема 2026-08-11: видалити «Плакат», «Посібник» і вид «Вкладиш у
-- монетницю»; «Папки» і «Сертифікати» ЛИШИТИ.
--   • Папки — на них посилається прорахунок TS-0426-0015 (8 квітня), і база
--     видалити не дасть: FK стоїть як NO ACTION. Окремо вирішуємо, чи описувати
--     папки шостим видом полів.
--   • Сертифікати — тип порожній, але пресет print_certificates у коді написаний
--     повністю (22 поля, валідація, три розділи). Видалити тип означало б
--     закопати робочий код; дешевше дописати йому вид і модель.
--
-- Скрипт свідомо вузький: видаляє рівно три названі картки, за назвою, і лише
-- якщо на них не посилається жодна позиція прорахунку. Перед видаленням друкує
-- те, що збирається прибрати, — щоб рядки лишились у логу.

\set ON_ERROR_STOP on

begin;

-- 1. Що саме йде під видалення (лишається в логу як слід).
select 'ПІД ВИДАЛЕННЯ' as mark, t.name as tip, k.name as vyd, m.name as model
from tosho.catalog_types t
left join tosho.catalog_kinds k on k.type_id = t.id
left join tosho.catalog_models m on m.kind_id = k.id
where t.quote_type = 'print' and t.name in ('Плакат', 'Посібник')
union all
select 'ПІД ВИДАЛЕННЯ', t.name, k.name, m.name
from tosho.catalog_kinds k
join tosho.catalog_types t on t.id = k.type_id
left join tosho.catalog_models m on m.kind_id = k.id
where k.name = 'Вкладиш у монетницю';

-- 2. Захист: жодна позиція прорахунку не має на це посилатись.
--    FK і сам не дасть (NO ACTION), але окрема перевірка дає зрозумілу помилку
--    замість «violates foreign key constraint».
do $$
declare
  v_used integer;
begin
  select count(*) into v_used
  from tosho.quote_items qi
  where qi.catalog_type_id in (
          select id from tosho.catalog_types where quote_type = 'print' and name in ('Плакат', 'Посібник')
        )
     or qi.catalog_kind_id in (
          select id from tosho.catalog_kinds where name = 'Вкладиш у монетницю'
        )
     or qi.catalog_model_id in (
          select m.id from tosho.catalog_models m
          join tosho.catalog_kinds k on k.id = m.kind_id
          join tosho.catalog_types t on t.id = k.type_id
          where t.name in ('Плакат', 'Посібник') or k.name = 'Вкладиш у монетницю'
        );

  if v_used > 0 then
    raise exception 'Скасовано: на ці картки посилається % позицій прорахунків. Видаляти не можна.', v_used;
  end if;
end $$;

-- 3. Видалення — знизу вгору, явно, а не через каскад: хочемо бачити кількість
--    на кожному рівні, а не довіряти тому, що каскад зніс саме потрібне.
delete from tosho.catalog_models m
where m.kind_id in (
  select k.id from tosho.catalog_kinds k
  join tosho.catalog_types t on t.id = k.type_id
  where t.name in ('Плакат', 'Посібник') or k.name = 'Вкладиш у монетницю'
);

delete from tosho.catalog_kinds k
where k.name = 'Вкладиш у монетницю'
   or k.type_id in (select id from tosho.catalog_types where quote_type = 'print' and name in ('Плакат', 'Посібник'));

delete from tosho.catalog_types t
where t.quote_type = 'print' and t.name in ('Плакат', 'Посібник');

-- 4. Що лишилось у поліграфії.
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

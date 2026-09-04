-- Звести чотири дублі методів, що приїхали імпортом на вид «Куртки» (REQ-182#p19).
--
-- ЩО ЗВОДИМО. `DTF` → «ДТФ», `термоперенос` → «Термотрансфер»,
-- `шовкографія` і `шовкотрафарет` → «Шовкодрук». Це рівно ті самі пари, які
-- Артем уже звів руками в REQ-54 (17.08.2026); ці чотири рядки просто
-- приїхали пізніше, з карткою куртки, і під те зведення не потрапили.
--
-- ЧОМУ ЦЕ НЕ ПРИБИРАННЯ СМІТТЯ. На відміну від «5 см» і «Всі розміри одягу:»
-- (scripts/method-directory-import-junk.sql), на цих чотирьох ВИСЯТЬ звʼязки
-- з моделями каталогу: 3 + 1 + 1 + 1. Тому їх не видаляють, а зливають —
-- звʼязки переїжджають на канонічний метод, і жодна модель не втрачає вміння,
-- яке в неї було.
--
-- ЯК ЦЕ ПРАЦЮЄ. Тригер `catalog_methods_bind_directory` сам перепише назву
-- рядка з довідника, щойно змінити `directory_id` (він падає лише на спробі
-- перейменувати метод «на місці», не чіпаючи довідник). Тому:
--   * якщо в цього виду ще НЕМАЄ канонічного методу — просто переставляємо
--     `directory_id`, і рядок разом зі своїми звʼязками стає канонічним;
--   * якщо вже є (так буде з другим із двох «шовко-») — переносимо звʼязки
--     моделей на наявний рядок і видаляємо дубль.
-- Обидва «шовко-» ведуть в один «Шовкодрук», а `catalog_methods` має
-- unique (kind_id, name) — тож два рядки з однаковою назвою в одному виді
-- не вживуться, і саме тому другий іде через перенесення звʼязків.
--
-- ПРО ПРОРАХУНКИ. `quote_items.methods` посилається на `catalog_methods.id`.
-- Три з чотирьох рядків зберігають свій id (переставляється лише довідник),
-- а той єдиний, що видаляється, у прорахунках не згадується — це звіряє
-- запобіжник нижче, який радше впаде, ніж мовчки залишить прорахунок без
-- назви методу.

do $$
declare
  pair record;
  dupe record;
  v_target_dir uuid;
  v_target_method uuid;
  v_used int;
  v_moved int;
begin
  for pair in
    select *
    from (values
      ('DTF', 'ДТФ'),
      ('термоперенос', 'Термотрансфер'),
      ('шовкографія', 'Шовкодрук'),
      ('шовкотрафарет', 'Шовкодрук')
    ) as t(dupe_name, target_name)
  loop
    select id into v_target_dir from tosho.method_directory where name = pair.target_name;
    if v_target_dir is null then
      raise exception 'Канонічного методу «%» у довіднику немає — зливати нема з чим', pair.target_name;
    end if;

    for dupe in
      select m.id, m.kind_id, m.team_id
      from tosho.catalog_methods m
      join tosho.method_directory d on d.id = m.directory_id
      where d.name = pair.dupe_name
    loop
      select id into v_target_method
      from tosho.catalog_methods
      where kind_id = dupe.kind_id and directory_id = v_target_dir;

      if v_target_method is null then
        -- Канонічного методу в цього виду ще немає: рядок стає ним сам,
        -- разом зі своїми звʼязками й своїм id.
        update tosho.catalog_methods set directory_id = v_target_dir where id = dupe.id;
        raise notice '«%» → «%»: переставлено довідник, звʼязки лишились на місці', pair.dupe_name, pair.target_name;
      else
        select count(*) into v_used
        from tosho.quote_items qi,
             jsonb_array_elements(coalesce(qi.methods, '[]'::jsonb)) e
        where e->>'method_id' = dupe.id::text;
        if v_used > 0 then
          raise exception 'Дубль «%» згадується в % прорахунках — видаляти його не можна', pair.dupe_name, v_used;
        end if;

        insert into tosho.catalog_model_methods (model_id, method_id)
        select mm.model_id, v_target_method
        from tosho.catalog_model_methods mm
        where mm.method_id = dupe.id
        on conflict do nothing;
        get diagnostics v_moved = row_count;

        delete from tosho.catalog_methods where id = dupe.id;
        raise notice '«%» → «%»: перенесено % звʼязків, дубль прибрано', pair.dupe_name, pair.target_name, v_moved;
      end if;
    end loop;

    -- Запис довідника лишається порожнім — прибираємо, щоб він не спливав у
    -- підказках і в довіднику методів на сторінці «Каталог».
    delete from tosho.method_directory d
    where d.name = pair.dupe_name
      and not exists (select 1 from tosho.catalog_methods m where m.directory_id = d.id);
  end loop;
end $$;

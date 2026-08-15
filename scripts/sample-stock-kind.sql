-- REQ-38 — два підрозділи складу: «Взірці» й «Залишки на складі».
--
-- НАВІЩО ОКРЕМА КОЛОНКА, ЯКЩО Є `category`. Категорія відповідає на питання
-- «що це за річ» — Одяг, Посуд, Пакування, Термопляшка. Підрозділ відповідає на
-- інше: «це товар, який ми брендуємо, чи витратний матеріал, яким пакуємо».
-- Осі різні й перетинаються: «Пакування» — категорія, і водночас саме вона
-- сьогодні збирає всі витратні матеріали. Складати їх в одне поле означало б
-- назавжди втратити можливість мати, скажімо, взірець пакування.
--
-- ЗНАЧЕННЯ. Два, як у картці:
--   · sample — «Взірці»: готова продукція, що лежить під брендування;
--   · supply — «Залишки на складі»: витратні матеріали (скотч, стрейч,
--     коробки, пупирка).
--
-- ЗАСІВ ІСНУЮЧИХ 17 ПОЗИЦІЙ. Усе з категорії «Пакування» → supply, решта →
-- sample. На сьогоднішніх даних це влучає точно: у «Пакуванні» лежать рівно
-- коробки й пакети, а решта — Термос, Худі, Чашки, Метеостанція, Ліхтарик,
-- Ремінці, Комахопастка, Зонтик, Совок. Якщо щось потрапило не туди —
-- виправляється одним випадаючим списком у картці товару, дані від цього не
-- страждають.
--
-- Ідемпотентна, безпечна до повторного запуску. Засів виконується РІВНО ОДИН
-- РАЗ — при першому додаванні колонки, — щоб повторний прогін не затирав
-- ручні виправлення, які люди зроблять потім.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/sample-stock-kind.sql

begin;

do $$
declare
  column_added boolean := false;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'tosho'
      and table_name = 'sample_stock_items'
      and column_name = 'stock_kind'
  ) then
    alter table tosho.sample_stock_items
      add column stock_kind text not null default 'sample';
    column_added := true;
  end if;

  -- Засів лише разом зі створенням колонки: інакше другий прогін скрипта
  -- повернув би у «Залишки» все, що встигли перекласти руками.
  if column_added then
    update tosho.sample_stock_items
       set stock_kind = 'supply'
     where category ilike '%пакуванн%';
  end if;
end
$$;

alter table tosho.sample_stock_items
  drop constraint if exists sample_stock_items_stock_kind_check;

alter table tosho.sample_stock_items
  add constraint sample_stock_items_stock_kind_check
  check (stock_kind in ('sample', 'supply'));

-- Сторінка завжди читає склад однієї команди й розкладає його на два
-- підрозділи — індекс покриває рівно цей запит.
create index if not exists sample_stock_items_team_kind_idx
  on tosho.sample_stock_items (team_id, stock_kind);

commit;

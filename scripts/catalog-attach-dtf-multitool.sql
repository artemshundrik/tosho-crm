-- manual
-- Мультитули: у нанесенні з'являється «ДТФ» — щоб рахувати нанесення на чохлах
-- (запит менеджера, 18.09.2026).
--
-- У виду «Мультитул» був прив'язаний лише один метод — «Лазерне гравіювання», а
-- вікно прорахунку показує тільки методи виду. «ДТФ» уже є в спільному довіднику
-- (ним користуються 26 видів), тож новий метод не заводимо — лише прив'язуємо
-- наявний до виду. Назву «DTF-друк» не вводимо: 17.08.2026 синоніми ДТФ-друк/DTF
-- зведено в «ДТФ».
--
-- Ціну не ставимо — як і в «Лазерного гравіювання» цього виду: нанесення рахують
-- у самому прорахунку.
--
-- team_id і kind_id беремо з наявного методу виду, а не з catalog_kinds, — так
-- вони гарантовано з тієї самої команди. Повторний запуск безпечний: not exists
-- нічого не вставить удруге.

insert into tosho.catalog_methods (team_id, kind_id, name, directory_id)
select lg.team_id, lg.kind_id, d.name, d.id
  from tosho.catalog_methods lg
  join tosho.catalog_kinds k on k.id = lg.kind_id and k.name = 'Мультитул'
  join tosho.method_directory d on d.team_id = lg.team_id and d.name = 'ДТФ' and d.active
 where lg.name = 'Лазерне гравіювання'
   and not exists (
     select 1 from tosho.catalog_methods cm where cm.kind_id = lg.kind_id and cm.directory_id = d.id
   );

-- Перевірка: у «Мультитула» два методи — «ДТФ» і «Лазерне гравіювання».
--   select k.name, string_agg(cm.name, ', ' order by cm.name)
--     from tosho.catalog_kinds k join tosho.catalog_methods cm on cm.kind_id = k.id
--    where k.name = 'Мультитул' group by k.name;

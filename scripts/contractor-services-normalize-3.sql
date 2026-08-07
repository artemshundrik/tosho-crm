-- Третій прохід: злиття «лак» → «Лакування» і єдиний регістр.
--
-- Рішення власника після другого проходу. Регістр досі був змішаний — поруч
-- жили «Каширування» і «висічка», бо перші два проходи чіпали лише те, де була
-- помилка, і не лізли туди, де було просто інше написання.
--
-- Правило регістру: велика ЛИШЕ перша літера, решта як є. Це навмисно, а не
-- initcap: інакше «УФ-друк» став би «Уф-Друк», «ДТФ» → «Дтф», а
-- «Постачальник плівки (Flex)…» втратив би Flex.

create temporary table service_rename (from_tag text primary key, to_tag text not null);
insert into service_rename (from_tag, to_tag) values ('лак', 'Лакування');

with exploded as (
  select c.id, u.ord, btrim(u.tag) as tag
  from tosho.contractors c,
       lateral unnest(string_to_array(c.services, ',')) with ordinality as u(tag, ord)
  where c.services is not null and c.services <> ''
),
renamed as (
  select e.id, e.ord, coalesce(r.to_tag, e.tag) as tag
  from exploded e
  left join service_rename r on r.from_tag = lower(e.tag)
  where btrim(e.tag) <> ''
),
cased as (
  -- Велика перша літера, решта недоторкана.
  select id, ord, upper(left(tag, 1)) || substr(tag, 2) as tag
  from renamed
),
deduped as (
  select id, min(ord) as ord, min(tag) as tag
  from cased
  group by id, lower(tag)
),
rebuilt as (
  select id, string_agg(tag, ', ' order by ord) as services
  from deduped
  group by id
)
update tosho.contractors c
set services = coalesce(r.services, ''),
    updated_at = now()
from rebuilt r
where c.id = r.id
  and c.services is distinct from coalesce(r.services, '');

-- Перевірка:
--   with tags as (select btrim(unnest(string_to_array(services, ','))) as tag
--                 from tosho.contractors where services <> '')
--   select tag, count(*) from tags where tag <> '' group by 1 order by lower(tag);

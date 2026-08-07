-- Другий прохід нормалізації послуг — за рішеннями власника.
--
-- Перший прохід (contractor-services-normalize.sql) звів лише однозначне:
-- регістр, друкарські помилки, росіянізми. Спірне лишалось як є. Тут
-- застосовуємо те, що Артем підтвердив вручну.
--
-- Рішення:
--   1. шовкодрук = трафаретний друк — одне й те саме, лишаємо «Шовкодрук».
--   2. УФ-лак ОКРЕМО від Лакування — різні машини, різні процеси. Не чіпаємо.
--   3. Записи, що виглядали як нотатки, лишаються послугами, але формулюються
--      по-людськи: це не «підрядник по календарю», а «Виробник календарів».
--   4. гофроящики = коробки — лишаємо «коробки».
--   5. «персональний менеджер» і «представник» — це формат співпраці, не
--      послуга. Переносимо в нотатки й прибираємо зі списку.

create temporary table service_rename (from_tag text primary key, to_tag text not null);

insert into service_rename (from_tag, to_tag) values
  ('трафаретний друк',                    'Шовкодрук'),
  ('почтачальник флексу',                 'Постачальник плівки (Flex) для термотрансферу'),
  ('підрядник по календарю з годинником',  'Виробник календарів з годинником'),
  ('наліпки',                             'Виробник наліпок'),
  ('гофроящики',                          'коробки');

-- Теги, які взагалі не є послугами: спершу дописуємо в нотатки, потім прибираємо.
create temporary table service_to_notes (tag text primary key);
insert into service_to_notes (tag) values ('персональний менеджер'), ('представник');

-- 1) Переносимо в нотатки — до того, як прибрати зі списку послуг.
update tosho.contractors c
set notes = nullif(btrim(concat_ws(E'\n', nullif(btrim(coalesce(c.notes, '')), ''), moved.text)), ''),
    updated_at = now()
from (
  select c2.id,
         string_agg(btrim(u.tag), E'\n' order by btrim(u.tag)) as text
  from tosho.contractors c2,
       lateral unnest(string_to_array(c2.services, ',')) as u(tag)
  join service_to_notes t on t.tag = lower(btrim(u.tag))
  where c2.services is not null and c2.services <> ''
  group by c2.id
) moved
where c.id = moved.id;

-- 2) Перейменування + прибирання «не-послуг» + повторний дедуп.
with exploded as (
  select c.id, u.ord, btrim(u.tag) as tag
  from tosho.contractors c,
       lateral unnest(string_to_array(c.services, ',')) with ordinality as u(tag, ord)
  where c.services is not null and c.services <> ''
),
kept as (
  select e.id, e.ord, coalesce(r.to_tag, e.tag) as tag
  from exploded e
  left join service_rename r on r.from_tag = lower(e.tag)
  where btrim(e.tag) <> ''
    and lower(e.tag) not in (select tag from service_to_notes)
),
deduped as (
  select id, min(ord) as ord, min(tag) as tag
  from kept
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

-- 3) Рядки, які втратили ВСІ теги, у CTE вище не потрапляють (rebuilt для них
--    порожній, тож UPDATE ... from rebuilt їх не бачить) і лишились би зі старим
--    значенням. Дочищаємо окремо — інакше тег дублюється: і в послугах, і в нотатках.
update tosho.contractors
set services = '', updated_at = now()
where lower(btrim(services)) in (select tag from service_to_notes);

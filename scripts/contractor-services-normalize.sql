-- Зведення написань послуг підрядників і постачальників до канонічних.
--
-- Why: поле `services` заповнювалось вільним текстом, і та сама послуга
-- розповзлась на варіанти — «гравірування», «Гравіювання», «гравіювання» жили
-- як три різні речі, а фільтр на сторінці порівнював рядок цілком, тож
-- «Гравіювання, УФ-друк» не знаходився за жодним із них.
--
-- ОБСЯГ СВІДОМО ВУЗЬКИЙ: тільки те, де сумніву немає — різний регістр, друкарські
-- помилки, сміття на кінцях і прямі росіянізми. Спірні злиття (лак ↔ лакування,
-- шовкодрук ↔ трафаретний друк, гофроящики ↔ коробки) і записи, які взагалі не є
-- послугами («постачальник Флексу», «персональний менеджер»), НЕ чіпаємо — це
-- рішення власника, а не скрипта.
--
-- Ідемпотентно: повторний запуск нічого не змінить, бо канонічні значення вже
-- не збігаються з жодним `from_tag`.

create temporary table service_mapping (from_tag text primary key, to_tag text not null);

insert into service_mapping (from_tag, to_tag) values
  -- регістр і написання
  ('гравірування',                          'Гравіювання'),
  ('гравіювання',                           'Гравіювання'),
  ('кашировка',                             'Каширування'),
  ('каширування',                           'Каширування'),
  ('цифовий друк',                          'Цифровий друк'),
  ('цифровий друк',                         'Цифровий друк'),
  ('уф друк',                               'УФ-друк'),
  ('уф-друк',                               'УФ-друк'),
  -- росіянізм
  ('перевозки',                             'Вантажні перевезення'),
  ('вантажні перевезення',                  'Вантажні перевезення'),
  ('наружна реклама',                       'Зовнішня реклама'),
  -- сміття на кінцях
  ('ширкоформат',                           'Широкоформатний друк'),
  ('широкоформатний друк роблять.',         'Широкоформатний друк'),
  ('а також дтф',                           'ДТФ'),
  ('дтф',                                   'ДТФ'),
  ('встановлення хольнітенів(з резинкою)',  'Встановлення хольнітенів'),
  -- друкарські помилки
  ('виготовленя кліше',                     'Виготовлення кліше'),
  ('пошиття тикстилю',                      'Пошиття текстилю'),
  ('тамподруком',                           'Тамподрук'),
  ('шавкодрук',                             'Шовкодрук');

-- Розбираємо рядок на теги, підмінюємо за словником, гасимо дублі без регістру
-- і збираємо назад у той самий формат «через кому».
with exploded as (
  select c.id, u.ord, btrim(u.tag) as tag
  from tosho.contractors c,
       lateral unnest(string_to_array(c.services, ',')) with ordinality as u(tag, ord)
  where c.services is not null and c.services <> ''
),
mapped as (
  select e.id, e.ord, coalesce(m.to_tag, e.tag) as tag
  from exploded e
  left join service_mapping m on m.from_tag = lower(e.tag)
  where btrim(e.tag) <> ''
),
deduped as (
  -- Дубль усередині одного підрядника лишає найраніший за порядком варіант.
  select id, min(ord) as ord, min(tag) as tag
  from mapped
  group by id, lower(tag)
),
rebuilt as (
  select id, string_agg(tag, ', ' order by ord) as services
  from deduped
  group by id
)
update tosho.contractors c
set services = r.services,
    updated_at = now()
from rebuilt r
where c.id = r.id
  and c.services is distinct from r.services;

-- Перевірка після застосування:
--   with tags as (select btrim(unnest(string_to_array(services, ','))) as tag
--                 from tosho.contractors where services <> '')
--   select tag, count(*) from tags where tag <> '' group by 1 order by lower(tag);

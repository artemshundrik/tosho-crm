-- Пул товарів постачальників — двигун агрегатора (REQ-250#p3).
-- Дизайн: docs/CATALOG_DESIGN.md §5 (спрощена модель) + §5б (розвідка).
-- Safe to run multiple times.
--
-- НАВІЩО ОКРЕМА ТАБЛИЦЯ, А НЕ catalog_models. Перевірений каталог — це 250
-- моделей, які реально продавали. Пул — це тисячі товарів із фідів постачальників
-- (berrytex 2098, avanprint 1854, …). Якщо злити їх в один список, прайс утопить
-- перевірене — рівно те, від чого відмовились 04.09 (§6а). Тому пул живе поруч:
-- пошук прорахунку дивиться в обидва, але перевірене показує вище.
--
-- ЦІНА. У фідах ціна РОЗДРІБНА (prom.xml — це вітрина). Оптова, яку ми хочемо
-- (§5), — за логіном у кабінеті. Тому кожен рядок несе price_kind: поки 'retail',
-- менеджер/прайс-файл заміняє на 'wholesale'. «Ціни можна потім змінити» — саме
-- це поле дозволяє знати, яку ціну ще не уточнили.
--
-- КЛЮЧ ІДЕМПОТЕНТНОСТІ — (supplier_slug, external_key): завантажувач можна
-- ганяти скільки завгодно, рядок оновиться, а не задублюється. supplier_slug —
-- домен ('berrytex.com.ua'), бо контрагента може ще не бути заведено.

begin;

create extension if not exists pg_trgm;

create table if not exists tosho.supplier_products (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null,
  -- Постачальник: домен завжди, картка контрагента — коли вже заведена (§5б).
  supplier_slug text not null,
  contractor_id uuid references tosho.contractors(id) on delete set null,
  -- Звідки приїхало й стабільний ключ товару в межах постачальника.
  source        text not null,               -- 'feed:prom' | 'feed:cscart' | 'sitemap' | 'export' | 'manual'
  external_key  text not null,               -- id пропозиції з фіда або url
  -- Товарні дані.
  article       text,                         -- код / артикул
  name          text not null,
  vendor        text,                         -- виробник (JHK, Adler)
  category      text,
  -- Ціна: поки роздрібна з вітрини, уточнюється до оптової.
  price         numeric,
  currency      text not null default 'UAH',
  price_kind    text not null default 'retail',   -- 'retail' | 'wholesale'
  -- Посилання й фото.
  url           text,
  image_url     text,                         -- перше фото
  images        jsonb not null default '[]'::jsonb,
  -- Кольори/розміри й сире поле — щоб не втратити те, чого схема ще не знає.
  attrs         jsonb not null default '{}'::jsonb,
  raw           jsonb,
  -- Службове.
  observed_at   timestamptz not null default now(),   -- коли знято з джерела
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint supplier_products_price_kind_check check (price_kind in ('retail','wholesale')),
  constraint supplier_products_uniq unique (supplier_slug, external_key)
);

-- Пошук агрегатора: назва й артикул через trgm (одруки, часткові збіги).
create index if not exists supplier_products_name_trgm
  on tosho.supplier_products using gin (name gin_trgm_ops);
create index if not exists supplier_products_article_trgm
  on tosho.supplier_products using gin (article gin_trgm_ops)
  where article is not null;
create index if not exists supplier_products_contractor_idx
  on tosho.supplier_products (contractor_id);
create index if not exists supplier_products_supplier_idx
  on tosho.supplier_products (supplier_slug, is_active);

-- RLS: пул бачить уся команда (пошук прорахунку). Наповнює завантажувач сервісним
-- ключем, який RLS обходить, тож для authenticated — лише читання. Ручні правки
-- ціни/статусу підуть окремою дією пізніше (там і додамо write-політику).
alter table tosho.supplier_products enable row level security;

drop policy if exists supplier_products_select on tosho.supplier_products;
create policy supplier_products_select on tosho.supplier_products
  for select using (is_team_member(team_id));

grant select on tosho.supplier_products to authenticated;

-- anon відрізаємо явно. Supabase роздає права за замовчуванням і анонімній ролі
-- теж — перевірка «захист БД» спіймала це на першому ж повному прогоні. RLS
-- тут прикрила б (is_team_member для анонімного хибний), але грант, який нікому
-- не потрібен, — це зайві двері: прибираємо їх, а не покладаємось на замок.
revoke all on tosho.supplier_products from anon;

commit;

-- Перевірка після застосування:
--   select supplier_slug, count(*), min(observed_at) from tosho.supplier_products group by 1;

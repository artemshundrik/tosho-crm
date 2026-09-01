-- ---------------------------------------------------------------------------
-- Тип угоди прорахунку — від нього залежить дно ціни (REQ-182).
--
-- НАВІЩО. Дно накрутки було одним числом на всю компанію (20 %), тож тендер на
-- 400 тис. і кастомна сотня блокнотів мали однакову межу «дешевше не можна».
-- Олена 01.09.2026 прислала шкалу з чотирьох рівнів, задану цільовою
-- маржинальністю (30 / 35 / 40 / 45 %) і відповідною накруткою
-- (42,9 / 53,8 / 66,7 / 81,8 %). Рішення Артема того ж дня: підстановка Й ДНО
-- залежать від типу угоди, а поле в картці лишається «Накрутка, %» — саме так
-- CRM говорить із 30.08.2026, і шкала кладеться в ці одиниці.
--
-- ЧОМУ НЕ quote_type. Він уже зайнятий і означає геть інше — категорію товару
-- (merch / print / other, замір 01.09.2026: 211 / 75 / 5 із 291 прорахунку).
-- Тип угоди описує УГОДУ, а не товар: той самий мерч буває і тендером, і малим
-- кастомом. Дві різні речі в одній колонці зробили б неможливим ні те, ні те.
--
-- ЧОМУ DEFAULT, А НЕ NULL. Протилежно до сусіднього unit_price_model_vat, де
-- порожнеча — це чесне «не знаємо». Тут порожнеча означала б прорахунок без
-- дна, тобто ціну, яку ніхто не перевіряє. 291 наявний прорахунок — це
-- звичайна виробнича робота, і 'standard' для них не вигадка, а найточніше з
-- можливих тверджень. Читач усе одно нормалізує порожнє значення в 'standard'
-- (normalizeQuoteDealType у src/lib/quoteDealType.ts), тож дефолт у схемі й
-- дефолт у коді кажуть одне й те саме.
--
-- ЩО ЦЕ НЕ МІНЯЄ. Формулу ціни (computeRunSalePricingFromMarkup) — жодного
-- рядка, і жодна з уже порахованих цін не зрушить: тип впливає на те, яке
-- число ПІДСТАВЛЯЄТЬСЯ в новий тираж і де стоїть дно, а не на те, як із
-- накрутки рахується сума.
--
-- Застосування: npm run db:apply scripts/quote-deal-type.sql
-- ---------------------------------------------------------------------------

alter table tosho.quotes
  add column if not exists deal_type text not null default 'standard'
  check (deal_type in ('tender', 'standard', 'design', 'custom'));

comment on column tosho.quotes.deal_type is
  'Тип угоди: tender / standard / design / custom. Визначає підставлену накрутку й дно, нижче якого потрібне погодження СЕО або головного бухгалтера (REQ-182). Не плутати з quote_type — той про категорію товару.';

-- ---------------------------------------------------------------------------
-- Та сама шкала, але в базі — бо її читає тригер прав доступу.
--
-- ЧОМУ ЦЕ ДУБЛЬ І ЧОМУ ІНАКШЕ НЕ ВИЙДЕ. Правило живе в
-- src/lib/quoteDealType.ts, але enforce_quote_run_price_field_access()
-- виконується в базі й до застосунку не дотягнеться. Тому числа стоять у двох
-- місцях, і обидва посилаються одне на одне. Міняєш шкалу — міняєш ОБИДВА.
--
-- Джерелом лишається маржа (30 / 35 / 40 / 45), накрутка рахується з неї — так
-- само, як у TS: округлене 53,8 дало б 34,98 % маржі замість рівних 35.
-- ---------------------------------------------------------------------------

create or replace function tosho.quote_deal_type_default_markup(p_deal_type text)
returns numeric
language sql
immutable
as $$
  select (margin / (100 - margin)) * 100
  from (
    select case coalesce(nullif(p_deal_type, ''), 'standard')
      when 'tender' then 30::numeric
      when 'design' then 40::numeric
      when 'custom' then 45::numeric
      else 35::numeric
    end as margin
  ) s;
$$;

comment on function tosho.quote_deal_type_default_markup(text) is
  'Накрутка, яку CRM підставляє для цього типу угоди (REQ-182). Дзеркало QUOTE_DEAL_TYPES із src/lib/quoteDealType.ts — міняти разом.';

-- ---------------------------------------------------------------------------
-- Тригер прав: «типова накрутка» більше не дорівнює 40.
--
-- ЩО БУЛО НЕ ТАК. Гілка INSERT питала `coalesce(new.markup_rate, 40) <> 40`,
-- тобто вважала введеним усе, що не дорівнює сорока. Це було правильно, поки
-- сорок було дефолтом колонки й дефолтом застосунку водночас. З типом угоди
-- застосунок підставляє 53,8 % на звичайний виробничий прорахунок — і проєктний
-- менеджер, який має право заводити тираж, але не має права на накрутку, діставав
-- би 42501 на кожному новому тиражі. Тобто зміна дна тихо забрала б у PM
-- можливість додати тираж узагалі.
--
-- ЩО РОБИМО. Порівнюємо не з константою, а з тим, що підставляє система для
-- типу цієї угоди. Сенс правила не змінився: рядок за типовою ціною ніхто не
-- «задавав», а відхилення від неї — задав, і на це потрібне право.
--
-- ДОПУСК 1e-6. Накрутка зберігається без округлення
-- (scripts/quote-run-markup-rate-precision.sql), а 35/65 у numeric і в
-- JavaScript дають різні хвости. Точне порівняння відкидало б рівно ту вставку,
-- яку правило має пропускати.
-- ---------------------------------------------------------------------------

create or replace function tosho.enforce_quote_run_price_field_access()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  v_job text;
  v_can_cost boolean;
  v_can_print boolean;
  v_can_logistics boolean;
  v_can_markup boolean;
  v_default_markup numeric;
begin
  select m.job_role into v_job
    from tosho.memberships m
   where m.user_id = auth.uid()
   limit 1;

  if v_job is null or v_job in ('owner', 'seo', 'chief_accountant') then
    return new;
  end if;

  v_can_cost := v_job in ('pm', 'manager', 'sales_manager', 'junior_sales_manager');
  v_can_print := v_job = 'pm';
  v_can_logistics := v_job in ('pm', 'logistics', 'head_of_logistics');
  v_can_markup := v_job in ('manager', 'sales_manager', 'junior_sales_manager');

  if tg_op = 'INSERT' then
    if exists (select 1 from tosho.quote_item_runs r where r.id = new.id) then
      return new;
    end if;

    if coalesce(new.unit_price_model, 0) <> 0 and not v_can_cost then
      raise exception 'Собівартість заповнює менеджер або проєктний менеджер'
        using errcode = '42501';
    end if;
    if coalesce(new.unit_price_print, 0) <> 0 and not v_can_print then
      raise exception 'Вартість нанесення заповнює проєктний менеджер'
        using errcode = '42501';
    end if;
    if coalesce(new.logistics_cost, 0) <> 0 and not v_can_logistics then
      raise exception 'Логістику заповнює проєктний менеджер або логіст'
        using errcode = '42501';
    end if;
    if coalesce(new.desired_manager_income, 0) <> 0 and not v_can_cost then
      raise exception 'Бажаний особистий заробіток заповнює менеджер або проєктний менеджер'
        using errcode = '42501';
    end if;

    -- Типова накрутка тепер залежить від типу угоди, а не дорівнює 40.
    select tosho.quote_deal_type_default_markup(q.deal_type)
      into v_default_markup
      from tosho.quotes q
     where q.id = new.quote_id;

    -- ДВА ЗНАЧЕННЯ ВВАЖАЮТЬСЯ «НЕ ЗАДАНИМИ», і обидва обов'язкові.
    --
    -- 1. Дефолт КОЛОНКИ (40). Тригер стоїть BEFORE INSERT, а на цей момент
    --    default колонки вже підставлений — тобто рядок, у якому накрутки не
    --    вказали взагалі, приходить сюди з сорока, а не з null. Порівняння
    --    лише з числом типу відкидало б саме такі вставки.
    -- 2. Дефолт ТИПУ УГОДИ — те, що підставляє картка прорахунку.
    --
    -- Побічний, але потрібний наслідок: SQL можна застосувати ДО викочування
    -- коду. Поки в проді стара збірка, вона шле 40, і проєктний менеджер
    -- створює тиражі як раніше; після деплою вона шле число типу, і воно теж
    -- проходить. Без цієї пари сорок став би «заданою» накруткою, і PM ловив
    -- би 42501 на кожному тиражі у вікні між міграцією та деплоєм.
    if abs(new.markup_rate - coalesce(v_default_markup, 40)) > 0.000001
       and abs(new.markup_rate - 40) > 0.000001
       and not v_can_markup then
      raise exception 'Накрутку задає менеджер прорахунку'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.unit_price_model is distinct from old.unit_price_model and not v_can_cost then
    raise exception 'Собівартість заповнює менеджер або проєктний менеджер'
      using errcode = '42501';
  end if;
  if new.unit_price_print is distinct from old.unit_price_print and not v_can_print then
    raise exception 'Вартість нанесення заповнює проєктний менеджер'
      using errcode = '42501';
  end if;
  if new.logistics_cost is distinct from old.logistics_cost and not v_can_logistics then
    raise exception 'Логістику заповнює проєктний менеджер або логіст'
      using errcode = '42501';
  end if;
  if new.desired_manager_income is distinct from old.desired_manager_income and not v_can_cost then
    raise exception 'Бажаний особистий заробіток заповнює менеджер або проєктний менеджер'
      using errcode = '42501';
  end if;
  if new.markup_rate is distinct from old.markup_rate and not v_can_markup then
    raise exception 'Накрутку задає менеджер прорахунку'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function tosho.enforce_quote_run_price_field_access() from public;

-- Тригер уже висить на таблиці (scripts/quote-run-price-field-access.sql) —
-- create or replace підмінив тіло функції, перечіпляти не треба.

-- Перевірка після застосування:
--   select deal_type, count(*) from tosho.quotes group by 1 order by 2 desc;
--   -- очікувано: один рядок, standard = усі прорахунки (бекфіл дає дефолт)
--
--   select tosho.quote_deal_type_default_markup('standard');
--   -- очікувано: 53.846153846153846…

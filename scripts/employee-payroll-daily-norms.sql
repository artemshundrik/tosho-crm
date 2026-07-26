-- Денні норми замість місячної + окрема норма й тариф для макетів.
-- Рішення CEO 2026-07-26 (друга ітерація, після симуляції на живих даних).
--
-- ЧОМУ ДЕННА НОРМА: у місяці буває 21–23 робочі дні (травень 2026 — 21,
-- липень — 23). Місячна норма 250 карала за «короткі» місяці й дарувала в
-- довгі. Денна норма множиться на робочі дні людини, тож відпустка й
-- лікарняний зменшують норму автоматично.
--
-- ЧОМУ МАКЕТИ ТЕПЕР РАХУЮТЬСЯ: попереднє рішення «макети не рахуються»
-- разом із нормою 250 давало нуль доплати завжди (максимум за пів року —
-- 183 візуали/міс).
--
-- ЧИСЛА НОРМИ: CEO обрав 8 візуалів + 5 макетів на день (симуляція кві–лип
-- 2026 на цих числах дає 1 900 ₴ на двох дизайнерок за 4 місяці; на 7/4 було
-- б 14 300 ₴ — різниця майже вся на макетах). Змінюються без релізу — це
-- рядок у employee_pay_defaults.
--
-- ЩО ЗМІНЮЄТЬСЯ В КОЛОНКАХ:
--   visual_norm (міс.)  → visual_norm_per_day   (8)
--   over_norm_rate      → visual_over_rate      (100 ₴)
--   +                     layout_norm_per_day   (5)
--   +                     layout_over_rate      (200 ₴)
--
-- Дані не мігруються: на момент запуску в employee_pay_rates один рядок і всі
-- дизайнер-специфічні поля в ньому null (беруться командні дефолти).
--
-- Ідемпотентний: можна ганяти повторно.

begin;

-- ---------------------------------------------------------------- дефолти
-- Спершу перейменування, потім add-if-not-exists — інакше нова колонка вже
-- існувала б і rename упав би на конфлікті імен.
do $$
begin
  if exists (
        select 1 from information_schema.columns
        where table_schema = 'tosho' and table_name = 'employee_pay_defaults'
          and column_name = 'over_norm_rate')
     and not exists (
        select 1 from information_schema.columns
        where table_schema = 'tosho' and table_name = 'employee_pay_defaults'
          and column_name = 'visual_over_rate')
  then
    alter table tosho.employee_pay_defaults rename column over_norm_rate to visual_over_rate;
  end if;
end $$;

alter table tosho.employee_pay_defaults
  drop constraint if exists employee_pay_defaults_sane;

alter table tosho.employee_pay_defaults
  add column if not exists visual_norm_per_day int           not null default 8,
  add column if not exists layout_norm_per_day int           not null default 5,
  add column if not exists layout_over_rate    numeric(12,2) not null default 200;

-- Дефолти колонок для воркспейсів, створених до цієї міграції, лишились би
-- старими — вирівнюємо явно.
alter table tosho.employee_pay_defaults
  alter column visual_norm_per_day set default 8,
  alter column layout_norm_per_day set default 5;

alter table tosho.employee_pay_defaults
  drop column if exists visual_norm;

alter table tosho.employee_pay_defaults
  add constraint employee_pay_defaults_sane check (
    visual_norm_per_day >= 0
    and layout_norm_per_day >= 0
    and visual_over_rate >= 0
    and layout_over_rate >= 0
    and creative_percent between 0 and 100
  );

-- Чинні значення команди (рішення CEO): 8 візуалів + 5 макетів на робочий день,
-- 100 ₴ за візуал понад норму, 200 ₴ за макет.
update tosho.employee_pay_defaults
set visual_norm_per_day = 8,
    layout_norm_per_day = 5,
    visual_over_rate    = 100,
    layout_over_rate    = 200,
    updated_at          = now();

-- ------------------------------------------------------------ ставки людей
do $$
begin
  if exists (
        select 1 from information_schema.columns
        where table_schema = 'tosho' and table_name = 'employee_pay_rates'
          and column_name = 'over_norm_rate')
     and not exists (
        select 1 from information_schema.columns
        where table_schema = 'tosho' and table_name = 'employee_pay_rates'
          and column_name = 'visual_over_rate')
  then
    alter table tosho.employee_pay_rates rename column over_norm_rate to visual_over_rate;
  end if;
end $$;

alter table tosho.employee_pay_rates
  drop constraint if exists employee_pay_rates_sane;

-- Індивідуальні overrides: null = «беремо командний дефолт».
alter table tosho.employee_pay_rates
  add column if not exists visual_norm_per_day int,
  add column if not exists layout_norm_per_day int,
  add column if not exists layout_over_rate    numeric(12,2);

alter table tosho.employee_pay_rates
  drop column if exists visual_norm;

alter table tosho.employee_pay_rates
  add constraint employee_pay_rates_sane check (
    base_month_rate >= 0
    and (visual_norm_per_day is null or visual_norm_per_day >= 0)
    and (layout_norm_per_day is null or layout_norm_per_day >= 0)
    and (visual_over_rate    is null or visual_over_rate    >= 0)
    and (layout_over_rate    is null or layout_over_rate    >= 0)
    and (creative_percent    is null or creative_percent between 0 and 100)
  );

-- ------------------------------------------------------- закриття місяця
-- Знімок місяця тепер розводить доплату за візуали й макети окремо: у
-- підсумковій таблиці має бути видно, звідки взялася сума (70% доплати за
-- симуляцією дають саме макети).
alter table tosho.employee_pay_month_close
  add column if not exists visual_over_uah numeric(12,2) not null default 0,
  add column if not exists layout_over_uah numeric(12,2) not null default 0;

commit;

-- Вартість товару приходить із пулу, а не від людини (Артем, 08.09.2026).
--
-- ПРАВИЛО СЛОВАМИ. Ціна з пулу — властивість товару, а не чиєсь заповнення.
-- Вона стоїть у всіх і видно її всім; нуль означає «ціни немає», а не «тобі
-- не можна». Правити її на прорахунку можуть проєктний менеджер, СЕО і
-- бухгалтер (owner проходить наскрізь окремою гілкою).
--
-- ЧОМУ ЦЬОГО НЕ ВИЙШЛО ЗРОБИТИ ПЕРЕВІРКОЮ ЧИСЛА. Перша спроба пропускала
-- ціну, якщо в пулі знайдеться рядок із таким самим артикулом і такою самою
-- ціною. Перевірка безпеки її завернула, і слушно: артикул позиції пише той
-- самий браузер, а пул відкритий на читання всім. Тобто звірялося не «це той
-- товар», а «десь у пулі є така пара» — і будь-хто міг поставити собі ціну
-- найдешевшого товару, а потім повернути артикул назад.
--
-- ЩО РОБИМО НАТОМІСТЬ. Число взагалі не проходить через браузер. Клієнт
-- називає РЯДОК ПУЛУ, на який клікнули, а ціну з нього читає сама база й сама
-- ж її записує. Підставити чуже число нема куди: щоб дістати ціну 40 грн,
-- треба вибрати саме той товар, що коштує 40, — а це не підробка, а звичайний
-- вибір.
--
-- Ідемпотентний: повторний прогін нічого не дублює.

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Хто править вартість товару
-- ─────────────────────────────────────────────────────────────────────────────
--
--   було:  pm, manager, sales_manager, junior_sales_manager
--   стало: pm, accountant, it_specialist
--          (+ seo, chief_accountant, owner — наскрізь вгорі функції)
--
-- Звичайний менеджер вартість товару більше НЕ править — він її бачить.
--
-- ПРАПОРЕЦЬ РОЗЩЕПЛЕНО НАВМИСНО. Той самий `v_can_cost` стеріг ДВА різні поля:
-- вартість товару й «бажаний особистий заробіток». Друге — власне поле
-- менеджера, і звуження переліку мовчки відрізало б від нього шістьох людей.
-- Тому заробіток дістає окремий прапорець зі старим переліком.
--
-- І ЩЕ ОДИН ВИНЯТОК — запис із пулу. Він позначається транзакційним прапорцем
-- `tosho.cost_from_pool`, який ставить лише функція нижче: інакше тригер
-- зупиняв би й ту ціну, яку жодна людина не вписувала. Ззовні прапорець не
-- виставити — PostgREST не дає виконати `set_config`, а функція ставить його
-- рівно на час свого запису (`is_local => true`).

create or replace function tosho.enforce_quote_run_price_field_access()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'tosho', 'public'
as $function$
declare
  v_job text;
  v_can_cost boolean;
  v_can_income boolean;
  v_can_print boolean;
  v_can_logistics boolean;
  v_can_markup boolean;
  v_from_pool boolean;
  v_default_markup numeric;
begin
  v_from_pool := coalesce(current_setting('tosho.cost_from_pool', true), '') = '1';

  select m.job_role into v_job
    from tosho.memberships m
   where m.user_id = auth.uid()
   limit 1;

  if v_job is null or v_job in ('owner', 'seo', 'chief_accountant') then
    return new;
  end if;

  -- Проєктний менеджер, бухгалтер і IT; СЕО, головбух і owner — наскрізь вище.
  v_can_cost := v_job in ('pm', 'accountant', 'it_specialist');
  v_can_income := v_job in ('pm', 'manager', 'sales_manager', 'junior_sales_manager');
  v_can_print := v_job = 'pm';
  v_can_logistics := v_job in ('pm', 'logistics', 'head_of_logistics');
  v_can_markup := v_job in ('manager', 'sales_manager', 'junior_sales_manager');

  if tg_op = 'INSERT' then
    if exists (select 1 from tosho.quote_item_runs r where r.id = new.id) then
      return new;
    end if;

    if coalesce(new.unit_price_model, 0) <> 0 and not v_can_cost and not v_from_pool then
      raise exception 'Вартість товару заповнює проєктний менеджер'
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
    if coalesce(new.desired_manager_income, 0) <> 0 and not v_can_income then
      raise exception 'Бажаний особистий заробіток заповнює менеджер або проєктний менеджер'
        using errcode = '42501';
    end if;

    select tosho.quote_deal_type_default_markup(q.deal_type)
      into v_default_markup
      from tosho.quotes q
     where q.id = new.quote_id;

    -- ДВА ЗНАЧЕННЯ ВВАЖАЮТЬСЯ «НЕ ЗАДАНИМИ», і обидва обов'язкові: дефолт
    -- КОЛОНКИ (40, його вже підставлено на BEFORE INSERT) і дефолт ТИПУ УГОДИ,
    -- який шле картка прорахунку.
    if abs(new.markup_rate - coalesce(v_default_markup, 40)) > 0.000001
       and abs(new.markup_rate - 40) > 0.000001
       and not v_can_markup then
      raise exception 'Накрутку задає менеджер прорахунку'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.unit_price_model is distinct from old.unit_price_model
     and not v_can_cost and not v_from_pool then
    raise exception 'Вартість товару заповнює проєктний менеджер'
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
  if new.desired_manager_income is distinct from old.desired_manager_income and not v_can_income then
    raise exception 'Бажаний особистий заробіток заповнює менеджер або проєктний менеджер'
      using errcode = '42501';
  end if;
  if new.markup_rate is distinct from old.markup_rate and not v_can_markup then
    raise exception 'Накрутку задає менеджер прорахунку'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Ціну ставить база, а не браузер
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Клієнт називає тираж і РЯДОК ПУЛУ; ціну функція читає сама. Повертає
-- поставлене число або null, якщо нашої ціни в того рядка немає — це не
-- помилка, а «ціни немає», і поле лишається порожнім.
--
-- ЛИШЕ В ПОРОЖНЄ: якщо у тиражі вже стоїть вартість, не чіпаємо. Число, яке
-- поставила людина, головніше за фід — те саме правило, що й для фото.
--
-- ЧОМУ security definer. Потрібно обійти гейт посад — саме для цього й
-- заведено виняток, — але доступ перевіряємо самі: `is_team_member` на команду
-- прорахунку. Definer тут не знімає RLS «про всяк випадок», а замінює одну
-- конкретну перевірку іншою, вужчою.

create or replace function tosho.set_quote_run_cost_from_pool(
  p_run_id uuid,
  p_supplier_product_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_team uuid;
  v_price numeric;
begin
  select q.team_id
    into v_team
    from tosho.quote_item_runs r
    join tosho.quotes q on q.id = r.quote_id
   where r.id = p_run_id;

  if v_team is null then
    raise exception 'Тираж не знайдено' using errcode = '42704';
  end if;
  if not public.is_team_member(v_team) then
    raise exception 'Немає доступу до цього прорахунку' using errcode = '42501';
  end if;

  -- Тільки НАША ціна: `retail` — це вітрина постачальника, з якої нічого не
  -- порахуєш, і в собівартість вона не має права. Рядок мусить належати тій
  -- самій команді, що й прорахунок.
  select sp.price
    into v_price
    from tosho.supplier_products sp
   where sp.id = p_supplier_product_id
     and sp.is_active
     and sp.team_id = v_team
     and sp.price is not null
     and sp.price_kind = 'wholesale';

  if v_price is null then
    return null;
  end if;

  perform set_config('tosho.cost_from_pool', '1', true);

  update tosho.quote_item_runs
     set unit_price_model = v_price,
         -- Ціни постачальників вважаємо з ПДВ (рішення Артема 08.09.2026).
         unit_price_model_vat = 'incl'
   where id = p_run_id
     and coalesce(unit_price_model, 0) = 0;

  perform set_config('tosho.cost_from_pool', '', true);

  return v_price;
end;
$fn$;

revoke all on function tosho.set_quote_run_cost_from_pool(uuid, uuid) from public;
grant execute on function tosho.set_quote_run_cost_from_pool(uuid, uuid) to authenticated;

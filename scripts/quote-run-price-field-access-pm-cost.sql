-- REQ-229 · Вартість товару в тиражі заповнює тільки проєктний менеджер.
--
-- ЩО МІНЯЄТЬСЯ. У матриці REQ-37 (scripts/quote-run-price-field-access.sql)
-- `unit_price_model` вели двоє — менеджер прорахунку і проєктний менеджер.
-- Тепер її веде лише проєктний менеджер: закупівельна сума приходить від
-- постачальника, а не з переговорів із клієнтом. Менеджер задає ціну для
-- клієнта накруткою (`markup_rate`), і це поле в нього лишається.
--
-- ЧОМУ НЕ ОДНИМ ПРАПОРЦЕМ. `v_can_cost` тримав ДВА поля одразу — вартість
-- товару й легасі-«бажаний особистий заробіток». Звузити прапорець означало б
-- мовчки забрати в менеджера й друге поле: інпута під нього в картці вже
-- немає, але старі тиражі його пишуть, і будь-яке збереження такого тиражу
-- падало б на 42501 без жодного пояснення в інтерфейсі. Тому прапорці
-- розділені: `v_can_cost` — тільки pm, `v_can_income` — як було.
--
-- Дзеркало в React: `canEditQuoteRunPriceField` у src/lib/permissions.ts. Тут і
-- там перелік мусить збігатись: інтерфейс сам собою нічого не захищає — RLS
-- дозволяє update без обмеження по колонках, тож правило обходиться одним
-- запитом повз картку.
--
-- Застосування: npm run db:apply scripts/quote-run-price-field-access-pm-cost.sql

create or replace function tosho.enforce_quote_run_price_field_access()
returns trigger
language plpgsql
security definer
set search_path = 'tosho', 'public', 'auth'
as $$
declare
  v_job text;
  v_access text;
  v_can_cost boolean;
  v_can_income boolean;
  v_can_print boolean;
  v_can_logistics boolean;
begin
  -- Серверні шляхи (service_role, крони, адмінклієнт) працюють без JWT і не
  -- підпадають під рольове правило: там немає посади, яку можна перевірити.
  if auth.uid() is null then
    return new;
  end if;

  select lower(coalesce(m.job_role::text, '')), lower(coalesce(m.role::text, ''))
    into v_job, v_access
  from tosho.memberships m
  where m.user_id = auth.uid()
  limit 1;

  -- Якщо рядка немає взагалі, SELECT ... INTO лишає змінні NULL, і тоді КОЖНА
  -- перевірка нижче дає NULL замість true — жоден raise не спрацьовує, і
  -- правило мовчки пропускає запис. Порожній рядок замість NULL робить усі
  -- v_can_* чесними false.
  v_job := coalesce(v_job, '');
  v_access := coalesce(v_access, '');

  if v_access = 'owner' or v_job = 'seo' then
    return new;
  end if;

  v_can_cost := v_job = 'pm';
  v_can_income := v_job in ('pm', 'manager', 'sales_manager', 'junior_sales_manager');
  v_can_print := v_job = 'pm';
  v_can_logistics := v_job in ('pm', 'logistics', 'head_of_logistics');

  if tg_op = 'INSERT' then
    -- saveQuoteRuns шле upsert onConflict=id, а BEFORE INSERT у Postgres
    -- спрацьовує ДО розв'язання конфлікту. Тобто на редагуванні наявного
    -- тиражу цей тригер бачить INSERT, хоча насправді буде UPDATE. Такі рядки
    -- пропускаємо: їх перевірить гілка UPDATE, порівнявши OLD і NEW.
    if exists (select 1 from tosho.quote_item_runs r where r.id = new.id) then
      return new;
    end if;

    -- Справді новий тираж створюється з нулями (білдер, addRun, AI-помічник),
    -- тож ненульове значення в чужому полі — це обхід правила через
    -- видалення й повторне створення рядка.
    if coalesce(new.unit_price_model, 0) <> 0 and not v_can_cost then
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

    return new;
  end if;

  if new.unit_price_model is distinct from old.unit_price_model and not v_can_cost then
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

  return new;
end;
$$;

revoke all on function tosho.enforce_quote_run_price_field_access() from public;

-- Тригер quote_item_runs_price_field_access перевішувати не треба: він
-- посилається на функцію за іменем, а `create or replace` лишає його чинним.

-- REQ-149 · Накрутка на собівартість замість бажаного заробітку — бік бази.
--
-- НАВІЩО. Ціна прорахунку виводилась із поля «бажаний особистий заробіток»:
-- заробіток ділився на ставку менеджера, далі додавались постійні витрати й
-- ПДВ. Через це ціна залежала від побажання однієї людини та її ставки, а
-- порожнє поле означало продаж за собівартістю. Замір 18.08.2026: за 90 днів
-- 44 тиражі мали порожній заробіток, тобто НУЛЬОВУ націнку, і два таких
-- прорахунки пройшли погодження.
--
-- Рішення СЕО 30.08.2026: менеджер задає НАКРУТКУ НА СОБІВАРТІСТЬ у відсотках.
-- Собівартість 10 000 ₴ при 40 % дає ціну 14 000 ₴; постійні витрати й ПДВ
-- лежать усередині цих 40 %, а не додаються зверху. Заробіток менеджера стає
-- наслідком ціни, тож зміна ставки більше не переписує вже показану клієнту
-- ціну. Дно — 20 %, нижче нього ціну погоджує СЕО або головний бухгалтер.
--
-- Дзеркало формули в коді: src/lib/quoteRuns.ts (computeRunSalePricingFromMarkup)
-- і netlify/functions/_lib/quotePricing.ts.

-- 1. Колонка.
--
-- DEFAULT 40, а не NULL — і це не косметика. Саме порожнє поле давало ціну,
-- рівну собівартості: значення за замовчуванням прибирає цей стан із бази, а
-- не лише з інтерфейсу. Тираж, створений повз UI (білдер, addRun, AI-помічник),
-- теж отримає накрутку, а не нуль.
alter table tosho.quote_item_runs
  add column if not exists markup_rate numeric not null default 40;

comment on column tosho.quote_item_runs.markup_rate is
  'Накрутка на собівартість у відсотках (REQ-149). Ціна = собівартість × (1 + markup_rate/100). Постійні витрати й ПДВ — усередині накрутки. Дно 20 %: нижче потрібне погодження СЕО або головного бухгалтера.';

-- 2. Перенести історію, а не залишити всім 40 %.
--
-- Наявні тиражі вже мають пораховану націнку — витягуємо з неї відсоток
-- зворотним ходом тієї самої формули, інакше 460 тиражів історії разом
-- перестрибнули б на 40 % і зіпсували будь-який замір норми.
update tosho.quote_item_runs r
set markup_rate = round(
      (
        (coalesce(r.desired_manager_income, 0) / (nullif(r.manager_rate, 0) / 100.0))
        * (1 + coalesce(r.fixed_cost_rate, 0) / 100.0)
        * (1 + coalesce(r.vat_rate, 0) / 100.0)
      )
      / nullif((coalesce(r.unit_price_model, 0) + coalesce(r.unit_price_print, 0))
               * coalesce(r.quantity, 0) + coalesce(r.logistics_cost, 0), 0)
      * 100.0
    , 2)
where coalesce(r.desired_manager_income, 0) > 0
  and coalesce(r.manager_rate, 0) > 0
  and (coalesce(r.unit_price_model, 0) + coalesce(r.unit_price_print, 0))
      * coalesce(r.quantity, 0) + coalesce(r.logistics_cost, 0) > 0;

-- 3. Права на поле — бік бази.
--
-- Матриця REQ-37 лишається як була, накрутка додається ОКРЕМОЮ гілкою БЕЗ pm:
--   собівартість / од.            — менеджер, pm
--   бажаний особистий заробіток   — менеджер, pm   (легасі, лишається до зняття поля)
--   вартість нанесення            — pm
--   логістика                     — pm, логіст, начальник відділу логістики
--   НАКРУТКА                      — тільки менеджер
--   owner і seo                   — усе
--
-- Чому без pm. Замір 30.08.2026 по tosho.quote_run_income_changes: із 28 змін
-- заробітку 12 зробив проєктний менеджер, і в 9 випадках менеджер потім
-- переписував його число. TS-0826-0039: pm поставив 1000 ₴ о 08:13, менеджер
-- виправив на 500 ₴ о 08:15. Гроші вписували, щоб зняти блокування, а не тому,
-- що така ціна. Проєктний менеджер веде собівартість, ціну для клієнта — менеджер.
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
  v_can_print boolean;
  v_can_logistics boolean;
  v_can_markup boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  select lower(coalesce(m.job_role::text, '')), lower(coalesce(m.role::text, ''))
    into v_job, v_access
  from tosho.memberships m
  where m.user_id = auth.uid()
  limit 1;

  v_job := coalesce(v_job, '');
  v_access := coalesce(v_access, '');

  if v_access = 'owner' or v_job = 'seo' then
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
    -- Новий рядок із накруткою, відмінною від типової: значення справді
    -- ввели, а не отримали з DEFAULT. Порівнюємо саме з 40, бо це те, що
    -- підставляє колонка, — інакше правило спрацьовувало б на кожному тиражі.
    if coalesce(new.markup_rate, 40) <> 40 and not v_can_markup then
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

-- Тригер уже висить на таблиці (scripts/quote-run-price-field-access.sql) і
-- перечіпляти його не треба: create or replace підмінив тіло функції.

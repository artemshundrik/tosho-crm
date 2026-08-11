-- REQ-37 · Права на поля ціни в тиражі прорахунку — бік бази.
--
-- Навіщо. В інтерфейсі чотири поля ціни висіли на одному прапорці canEditRuns,
-- і хто редагував вміст прорахунку, той міняв усе одразу. Розділити їх лише в
-- React недостатньо: політики quote_item_runs_update/_insert дозволяють будь-
-- якому учаснику команди писати будь-яку колонку, тож правило обходиться одним
-- запитом повз інтерфейс.
--
-- Звідки береться посада. НЕ з public.team_members: там job_role заповнений
-- сміттям (14 рядків поспіль 'manager', 7 порожніх), і обидва проєктні
-- менеджери та начальник відділу логістики були б прирівняні до менеджера.
-- Правдиве джерело — tosho.memberships (по одному рядку на людину, один
-- воркспейс), те саме, що читає інтерфейс через memberships_view.
--
-- Матриця (узгоджено 11.08.2026):
--   собівартість / од.            — менеджер, pm
--   бажаний особистий заробіток   — менеджер, pm
--   вартість нанесення            — pm
--   логістика                     — pm, логіст, начальник відділу логістики
--   owner і seo                   — усе, це задум, а не виняток

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

  if v_access = 'owner' or v_job = 'seo' then
    return new;
  end if;

  v_can_cost := v_job in ('pm', 'manager', 'sales_manager', 'junior_sales_manager');
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

  return new;
end;
$$;

revoke all on function tosho.enforce_quote_run_price_field_access() from public;

drop trigger if exists quote_item_runs_price_field_access on tosho.quote_item_runs;

create trigger quote_item_runs_price_field_access
  before insert or update on tosho.quote_item_runs
  for each row
  execute function tosho.enforce_quote_run_price_field_access();

-- Дизайн-задачі ліда переїжджають до замовника разом із прорахунками (REQ-364).
--
-- ЩО БУЛО НЕ ТАК. Дизайн-задача тримає сторону в `metadata.customer_id` +
-- `metadata.customer_type`. Переведення ліда (partyCardSave.saveLeadCard)
-- створює нового замовника, переносить на нього прорахунки й видаляє ліда, а
-- задачі лишались на id, якого вже немає. Вікно створення замовлення шукає
-- «готовий дизайн» за customer_id замовника — і задача зникала. 16.11.2026
-- менеджер не зміг прив'язати погоджений візуал TS-1126-0031 до TO-1126-0003
-- (АЄ.БРІК переведено за чотири хвилини до замовлення). Таких задач на проді 28.
--
-- ТРИ ЧАСТИНИ.
--   1. relink_lead_design_tasks — переведення кличе її одразу після прорахунків.
--      Злиття jsonb атомарне на сервері: читати-міняти-писати з клієнта
--      затирало б паралельні правки задачі.
--   2. Запобіжник: сторінка дизайн-задачі пише метадані ЦІЛКОМ зі свого стану.
--      Відкрита до переведення вкладка першим же записом повернула б id ліда,
--      якого вже немає. Такий відкат тригер тихо скасовує.
--   3. Разовий бекфіл того, що вже розійшлось, і замовлення TO-1126-0003.
-- Safe to run multiple times.

-- 1. Перенос задач ліда на замовника --------------------------------------
create or replace function tosho.relink_lead_design_tasks(p_lead_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, tosho
as $$
declare
  v_team_id uuid;
  v_moved integer := 0;
  v_locked integer := 0;
begin
  -- Команду беремо з самого замовника, а не з аргументу: під RLS викликач бачить
  -- лише замовників своєї команди, тож чужий id просто нічого не знайде.
  select c.team_id into v_team_id from tosho.customers c where c.id = p_customer_id;
  if v_team_id is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  -- Задачу, яку зараз редагує інша людина, тригер блокування не дасть змінити й
  -- завалить усе оновлення. Такі пропускаємо й повертаємо лічильником — клієнт
  -- попередить, а решта переїде.
  select count(*) into v_locked
  from public.activity_log a
  where a.team_id = v_team_id
    and a.action = 'design_task'
    and a.metadata->>'customer_id' = p_lead_id::text
    and not public.is_entity_lock_allowed(v_team_id, 'design_task', a.id::text, auth.uid());

  update public.activity_log a
  set metadata = a.metadata || jsonb_build_object(
    'customer_id', p_customer_id::text,
    'customer_type', 'customer'
  )
  where a.team_id = v_team_id
    and a.action = 'design_task'
    and a.metadata->>'customer_id' = p_lead_id::text
    and public.is_entity_lock_allowed(v_team_id, 'design_task', a.id::text, auth.uid());
  get diagnostics v_moved = row_count;

  return jsonb_build_object('moved', v_moved, 'locked', v_locked);
end;
$$;

comment on function tosho.relink_lead_design_tasks(uuid, uuid) is
  'Переводить дизайн-задачі ліда на замовника, у якого лід перетворився (REQ-364). Кличе saveLeadCard при переведенні.';

revoke all on function tosho.relink_lead_design_tasks(uuid, uuid) from public, anon;
grant execute on function tosho.relink_lead_design_tasks(uuid, uuid) to authenticated;

-- 2. Запобіжник від відкату на видаленого ліда ------------------------------
create or replace function public.guard_design_task_party_revert()
returns trigger
language plpgsql
security definer
set search_path = public, tosho
as $$
declare
  v_old_id text := old.metadata->>'customer_id';
  v_new_id text := new.metadata->>'customer_id';
begin
  if new.action <> 'design_task'
     or v_new_id is null or v_old_id is null
     or v_new_id = v_old_id then
    return new;
  end if;

  -- Відкат лише тоді, коли задача вже стоїть на живому замовнику, а запис несе
  -- id, якого немає ні серед замовників, ні серед лідів: обрати такого людина не
  -- могла, його принесла застаріла вкладка.
  if exists (select 1 from tosho.customers c where c.id::text = v_old_id)
     and not exists (select 1 from tosho.customers c where c.id::text = v_new_id)
     and not exists (select 1 from tosho.leads l where l.id::text = v_new_id) then
    new.metadata := new.metadata || jsonb_build_object(
      'customer_id', v_old_id,
      'customer_type', coalesce(old.metadata->>'customer_type', 'customer')
    );
  end if;
  return new;
end;
$$;

comment on function public.guard_design_task_party_revert() is
  'Не дає застарілій вкладці дизайн-задачі повернути id видаленого ліда поверх замовника (REQ-364).';

revoke all on function public.guard_design_task_party_revert() from public, anon, authenticated;

drop trigger if exists activity_log_guard_design_task_party on public.activity_log;
create trigger activity_log_guard_design_task_party
  before update of metadata on public.activity_log
  for each row
  when (new.action = 'design_task')
  execute function public.guard_design_task_party_revert();

-- 3а. Бекфіл: задачі на видалених лідах, чия назва однозначно збігається з
-- рівно одним замовником команди. П'ять задач без збігу (ліда видалили, не
-- перевівши) свідомо не чіпаємо: прив'язувати їх нема до кого.
with orphan as (
  select a.id, a.team_id, lower(trim(a.metadata->>'customer_name')) as name_key
  from public.activity_log a
  where a.action = 'design_task'
    and a.metadata->>'customer_type' = 'lead'
    and coalesce(a.metadata->>'customer_id', '') <> ''
    and coalesce(trim(a.metadata->>'customer_name'), '') <> ''
    and not exists (select 1 from tosho.leads l where l.id::text = a.metadata->>'customer_id')
    and not exists (select 1 from tosho.customers c where c.id::text = a.metadata->>'customer_id')
),
matched as (
  select o.id, min(c.id::text) as customer_id
  from orphan o
  join tosho.customers c
    on c.team_id = o.team_id and lower(trim(c.name)) = o.name_key
  group by o.id
  having count(*) = 1
)
update public.activity_log a
set metadata = a.metadata || jsonb_build_object('customer_id', m.customer_id, 'customer_type', 'customer')
from matched m
where a.id = m.id;

-- 3б. TO-1126-0003 при створенні прив'язали до новоствореної задачі TS-1126-0049,
-- яку потім видалили; потрібна була TS-1126-0031. Умова на старий id робить
-- рядок одноразовим.
update tosho.orders o
set design_task_id = '0d8e00ad-e802-41be-8173-a76372034aef',
    design_task_number = 'TS-1126-0031'
where o.id = '17028654-34d8-4864-a263-1b7cda8ff595'
  and o.design_task_id = '085c1f74-0ccf-43e2-becc-fb8d8a691d15';

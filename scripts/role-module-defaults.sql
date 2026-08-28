-- REQ-194 · Дефолти доступів посади — з бази, а не тільки з коду.
--
-- ЩО ЛІКУЄ. Стартові набори модулів для посад лежать у ROLE_MENUS
-- (src/lib/moduleAccess.ts). Щоб змінити рішення «що бачить бухгалтер»,
-- власникові потрібен коміт і деплой — тобто розробник. Ця таблиця дає йому
-- зробити те саме з інтерфейсу.
--
-- ЗБЕРІГАЄМО ВИНЯТКИ, А НЕ ПОВНІ НАБОРИ. Рядок з'являється лише там, де
-- власник свідомо відступив від коду. Причини дві. Перша: повна копія наборів
-- у базі — це друге джерело правди, і воно мовчки розійдеться з кодом при
-- першій же зміні ROLE_MENUS. Друга: новий модуль тоді доводилось би вручну
-- дописувати кожній посаді, а так він просто підхоплює правило з коду —
-- рівно те, чого просили в картці («для нового модуля дефолт створюється
-- автоматично»).
--
-- ЗВІДКИ ЦЕ ЧИТАЄТЬСЯ: доступи людини рахує клієнт (defaultModuleAccess), тож
-- читати таблицю має право будь-який учасник команди — інакше власні модулі
-- людині не порахувати. Небезпеки в цьому немає: тут немає нічого про
-- конкретних людей, лише «яка посада що бачить за замовчуванням».
--
-- Писати може owner або СЕО — ті самі, хто редагує доступи людей.
--
-- Безпечно застосовувати повторно.

create table if not exists tosho.role_module_defaults (
  workspace_id uuid not null,
  -- Ключ посади з довідника (`tosho.memberships.job_role`), напр. accountant.
  job_role text not null,
  -- Ключ модуля з реєстру ModuleKey, напр. finance.
  module_key text not null,
  enabled boolean not null,
  updated_by uuid,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, job_role, module_key)
);

create or replace function tosho.touch_role_module_defaults_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists role_module_defaults_touch_updated_at on tosho.role_module_defaults;
create trigger role_module_defaults_touch_updated_at
before update on tosho.role_module_defaults
for each row execute function tosho.touch_role_module_defaults_updated_at();

alter table tosho.role_module_defaults enable row level security;

-- Читає будь-який учасник: без цього застосунок не порахує доступи навіть
-- самому собі.
drop policy if exists "role_module_defaults_select" on tosho.role_module_defaults;
create policy "role_module_defaults_select"
on tosho.role_module_defaults
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = role_module_defaults.workspace_id
      and mv.user_id = auth.uid()
  )
);

-- Пишуть owner і СЕО — ті самі, хто змінює доступи людей.
drop policy if exists "role_module_defaults_write" on tosho.role_module_defaults;
create policy "role_module_defaults_write"
on tosho.role_module_defaults
for all
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = role_module_defaults.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
)
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = role_module_defaults.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

revoke all on tosho.role_module_defaults from anon;
grant select, insert, update, delete on tosho.role_module_defaults to authenticated;

-- Слід у журналі змін: хто й коли перекроїв доступи посади. Тригером, а не з
-- інтерфейсу, — щоб рядок з'явився навіть тоді, коли запис прийшов повз нього.
--
-- entity_id тут null навмисно: колонка має тип uuid, а ключ цієї таблиці —
-- пара «посада + модуль». Обидва значення лежать у `changed`, звідки їх і
-- читають; вигадувати штучний uuid заради формальної повноти означало б
-- покласти в стовпчик те, що нікуди не веде.
create or replace function tosho.log_role_module_defaults_change()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  v_action text;
  v_role text;
  v_module text;
  v_enabled boolean;
begin
  if tg_op = 'DELETE' then
    v_action := 'role_default_cleared';
    v_role := old.job_role;
    v_module := old.module_key;
    v_enabled := old.enabled;
  else
    v_action := case when tg_op = 'INSERT' then 'role_default_set' else 'role_default_changed' end;
    v_role := new.job_role;
    v_module := new.module_key;
    v_enabled := new.enabled;
  end if;

  insert into tosho.audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, changed)
  values (
    coalesce(new.workspace_id, old.workspace_id),
    auth.uid(),
    v_action,
    'role_module_default',
    null,
    jsonb_build_object('job_role', v_role, 'module_key', v_module, 'enabled', v_enabled)
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists role_module_defaults_audit on tosho.role_module_defaults;
create trigger role_module_defaults_audit
after insert or update or delete on tosho.role_module_defaults
for each row execute function tosho.log_role_module_defaults_change();

notify pgrst, 'reload schema';

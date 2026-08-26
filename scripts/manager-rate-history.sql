-- Історія персональних ставок менеджерів.
--
-- Навіщо: tosho.team_member_manager_rates зберігає ЛИШЕ поточне значення —
-- при зміні старе просто затирається. На питання «яка ставка була в людини
-- в березні» відповіді немає й не буде, а від ставки залежить ціна кожного
-- прорахунку й заробіток людини.
--
-- CEO 19.08: «історія — це хто з користувачів коли яку ставку мав, коли
-- ставка помінялась востаннє, хто щось змінював по заробітку».
--
-- Ведеться ТРИГЕРОМ, як і історія ставок компанії: запис, що залежить від
-- того, чи не забув про нього фронт, історією не є.

create table if not exists tosho.team_member_manager_rate_changes (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  -- Чия ставка змінилась.
  user_id uuid not null,
  old_rate numeric(6, 2),
  new_rate numeric(6, 2) not null,
  -- Хто змінив. Nullable навмисно: на аудиті статусу прорахунку вже
  -- наступали на NOT NULL — падало там, де auth-контексту немає.
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists team_member_manager_rate_changes_user_idx
  on tosho.team_member_manager_rate_changes (workspace_id, user_id, changed_at desc);
create index if not exists team_member_manager_rate_changes_recent_idx
  on tosho.team_member_manager_rate_changes (workspace_id, changed_at desc);

create or replace function tosho.log_manager_rate_change()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
begin
  if tg_op = 'INSERT' then
    insert into tosho.team_member_manager_rate_changes (workspace_id, user_id, old_rate, new_rate, changed_by)
    values (new.workspace_id, new.user_id, null, new.manager_rate, new.updated_by);
    return new;
  end if;

  if new.manager_rate is distinct from old.manager_rate then
    insert into tosho.team_member_manager_rate_changes (workspace_id, user_id, old_rate, new_rate, changed_by)
    values (new.workspace_id, new.user_id, old.manager_rate, new.manager_rate, new.updated_by);
  end if;

  return new;
end;
$$;

drop trigger if exists team_member_manager_rates_audit on tosho.team_member_manager_rates;
create trigger team_member_manager_rates_audit
  after insert or update on tosho.team_member_manager_rates
  for each row execute function tosho.log_manager_rate_change();

alter table tosho.team_member_manager_rate_changes enable row level security;

-- Читає той, хто й так бачить ставки: сама людина про себе, власник і CEO
-- про всіх. Точно той самий набір, що в team_member_manager_rates_select —
-- інакше історія показувала б те, чого не видно в самій ставці.
drop policy if exists team_member_manager_rate_changes_select on tosho.team_member_manager_rate_changes;
create policy team_member_manager_rate_changes_select on tosho.team_member_manager_rate_changes
  for select using (
    exists (
      select 1 from tosho.memberships_view mv
      where mv.workspace_id = team_member_manager_rate_changes.workspace_id
        and mv.user_id = auth.uid()
        and (mv.user_id = team_member_manager_rate_changes.user_id
             or mv.access_role = 'owner'::tosho.workspace_role
             or lower(coalesce(mv.job_role::text, '')) = 'seo')
    )
  );

-- Писати з клієнта не можна взагалі: єдине джерело — тригер.
grant select on tosho.team_member_manager_rate_changes to authenticated;
revoke insert, update, delete on tosho.team_member_manager_rate_changes from authenticated;
revoke all on tosho.team_member_manager_rate_changes from anon;

-- Засідуємо чинні ставки як відправну точку: без цього історія почалася б
-- з першої майбутньої зміни, і «яка ставка зараз» довелось би шукати в
-- іншій таблиці. changed_by порожній — це стан на момент міграції.
insert into tosho.team_member_manager_rate_changes (workspace_id, user_id, old_rate, new_rate, changed_by)
select r.workspace_id, r.user_id, null, r.manager_rate, null
from tosho.team_member_manager_rates r
where not exists (
  select 1 from tosho.team_member_manager_rate_changes h
  where h.workspace_id = r.workspace_id and h.user_id = r.user_id
);

comment on table tosho.team_member_manager_rate_changes is
  'Хто коли яку ставку менеджера мав. Пише лише тригер на team_member_manager_rates.';

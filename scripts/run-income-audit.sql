-- Аудит змін бажаного заробітку в тиражах прорахунку.
--
-- CEO 19.08 просив, серед іншого, бачити «хто щось змінював по заробітку».
-- Це поле визначає ВСЮ націнку: з нього виводяться і прибуток, і постійні
-- витрати, і податковий резерв. Тобто одна правка тут міняє ціну для клієнта,
-- а сліду не лишалось.

create table if not exists tosho.quote_run_income_changes (
  id bigint generated always as identity primary key,
  team_id uuid not null,
  quote_id uuid not null,
  run_id uuid not null,
  old_income numeric(14, 2),
  new_income numeric(14, 2) not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists quote_run_income_changes_quote_idx
  on tosho.quote_run_income_changes (quote_id, changed_at desc);
create index if not exists quote_run_income_changes_recent_idx
  on tosho.quote_run_income_changes (team_id, changed_at desc);
-- Під схлопування правок однієї сесії (див. нижче).
create index if not exists quote_run_income_changes_run_author_idx
  on tosho.quote_run_income_changes (run_id, changed_by, changed_at desc);

create or replace function tosho.log_run_income_change()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  v_team_id uuid;
  v_actor uuid := auth.uid();
  v_last_id bigint;
begin
  -- Нові тиражі створюються з нулем — це не «зміна заробітку», а заготовка.
  if tg_op = 'INSERT' and coalesce(new.desired_manager_income, 0) = 0 then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.desired_manager_income is not distinct from old.desired_manager_income then
    return new;
  end if;

  select q.team_id into v_team_id from tosho.quotes q where q.id = new.quote_id;
  if v_team_id is null then
    return new;
  end if;

  -- ВАЖЛИВО: тиражі автозберігаються через 900 мс після кожної правки, тож
  -- наївний INSERT перетворив би історію на стрічку з двадцяти рядків за одне
  -- редагування. Правки тієї самої людини в тому самому тиражі протягом
  -- 5 хвилин схлопуємо в один запис: old_income лишається тим, з чого людина
  -- почала, new_income доїжджає до того, чим закінчила.
  select h.id into v_last_id
    from tosho.quote_run_income_changes h
   where h.run_id = new.id
     and h.changed_by is not distinct from v_actor
     and h.changed_at > now() - interval '5 minutes'
   order by h.changed_at desc
   limit 1;

  if v_last_id is not null then
    update tosho.quote_run_income_changes
       set new_income = new.desired_manager_income,
           changed_at = now()
     where id = v_last_id;
    return new;
  end if;

  insert into tosho.quote_run_income_changes
    (team_id, quote_id, run_id, old_income, new_income, changed_by)
  values
    (v_team_id, new.quote_id, new.id,
     case when tg_op = 'UPDATE' then old.desired_manager_income else null end,
     new.desired_manager_income, v_actor);

  return new;
end;
$$;

drop trigger if exists quote_item_runs_income_audit on tosho.quote_item_runs;
create trigger quote_item_runs_income_audit
  after insert or update on tosho.quote_item_runs
  for each row execute function tosho.log_run_income_change();

alter table tosho.quote_run_income_changes enable row level security;

-- Читають ті, кому CEO відкрив економіку: власник, CEO, бухгалтери. Менеджер
-- вкладки «Економіка» не бачить, тож і аудиту заробітку бачити не має.
drop policy if exists quote_run_income_changes_select on tosho.quote_run_income_changes;
create policy quote_run_income_changes_select on tosho.quote_run_income_changes
  for select using (
    is_team_member(team_id)
    and exists (
      select 1 from tosho.memberships_view mv
      where mv.user_id = auth.uid()
        and (mv.access_role = 'owner'::tosho.workspace_role
             or lower(coalesce(mv.job_role::text, '')) in ('seo', 'accountant', 'chief_accountant'))
    )
  );

grant select on tosho.quote_run_income_changes to authenticated;
revoke insert, update, delete on tosho.quote_run_income_changes from authenticated;
revoke all on tosho.quote_run_income_changes from anon;

comment on table tosho.quote_run_income_changes is
  'Хто і коли міняв бажаний заробіток у тиражі. Пише лише тригер; правки однієї сесії схлопуються в один запис.';

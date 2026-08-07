-- =====================================================================
-- Тип «З дому» (wfh) — присутність в іншому місці, а не відсутність
-- (рішення CEO 2026-08-04: З ПОГОДЖЕННЯМ керівника).
--
-- Три властивості типу, і всі три — «ні»:
--   · квоту НЕ списує (не входить у QUOTA_ABSENCE_KINDS і в RPC балансів,
--     які перелічують типи явно — тут нічого міняти не треба);
--   · норму дизайнера НЕ ріже (виключення живе у фронтовій платіжці,
--     src/lib/designerPayroll.ts — БД тут ні до чого);
--   · відсутністю НЕ вважається (аватарка не гаситься, «Зараз відсутні»
--     не рахує — теж фронт).
--
-- А що МІНЯЄТЬСЯ тут:
--   1) check-констрейнт kind — новий дозволений тип;
--   2) RLS self-insert — wfh подається як pending (погодження SEO) у тому ж
--     вікні дат, що відпустка й day-off. ВЛАСНИК — виняток: його запис іде
--     одразу approved через адмінську політику (над ним керівника немає,
--     і pending власника не міг би вирішити ніхто — тупик, спійманий
--     тестом CEO 2026-08-07);
--   3) RPC бота виводить статус «sick або власник → approved, решта →
--     pending» — розширюємо whitelist і додаємо перевірку ролі.
--
-- Гард дублів (guard_team_absence_duplicate) ловить wfh автоматично: він
-- порівнює kind+дати без переліку типів.
--
-- Застосування: psql "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 -f scripts/team-absences-wfh.sql
-- =====================================================================

begin;

-- 1. Дозволяємо тип.
alter table tosho.team_absences drop constraint if exists team_absences_kind_check;
alter table tosho.team_absences add constraint team_absences_kind_check
  check (kind = any (array['sick_leave'::text, 'day_off'::text, 'vacation'::text, 'wfh'::text, 'other'::text]));

-- 2. Self-service: wfh — заявка на погодження, як відпустка/day-off.
drop policy if exists "team_absences_insert_self" on tosho.team_absences;
create policy "team_absences_insert_self"
on tosho.team_absences
for insert
to authenticated
with check (
  team_absences.user_id = auth.uid()
  and team_absences.requested_by = auth.uid()
  and exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absences.workspace_id
      and mv.user_id = auth.uid()
  )
  and (
    -- Заявка на погодженні норму не чіпає, але без меж у планер лізе
    -- «відпустка 2026–2030». Рік уперед і місяць назад покривають усе живе.
    -- wfh тут само: погодження робить довгі діапазони питанням SEO, а не RLS.
    (
      team_absences.kind in ('vacation', 'day_off', 'wfh')
      and team_absences.status = 'pending'
      and team_absences.start_date >= tosho.absence_today() - 31
      and team_absences.end_date <= tosho.absence_today() + 366
    )
    or (
      team_absences.kind = 'sick_leave'
      and team_absences.status = 'approved'
      -- Обидва кінці діапазону, а не лише початок. Обмежити тільки початок
      -- мало: «хворію з сьогодні до кінця наступного місяця» так само
      -- обнуляє норму — просто вперед, а не назад. Довший лікарняний вносить
      -- керівництво (окрема політика, без обмежень).
      and team_absences.start_date >= tosho.absence_today() - 7
      and team_absences.end_date <= tosho.absence_today() + 14
      and team_absences.end_date - team_absences.start_date <= 14
    )
  )
);

-- 3. RPC бота: розширюємо whitelist типів.
create or replace function tosho.bot_submit_absence(
  p_user_id uuid,
  p_kind text,
  p_start date,
  p_end date,
  p_comment text default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'tosho', 'public'
as $$
declare
  v_workspace uuid;
  v_is_owner boolean;
  v_status text;
  v_id uuid;
  v_start date;
  v_end date;
  v_caller text := current_user;
begin
  if p_kind not in ('vacation', 'day_off', 'sick_leave', 'wfh') then
    raise exception 'Невідомий тип відсутності';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Невірний діапазон дат';
  end if;

  -- Воркспейс — із членства самої людини, не з параметрів виклику.
  select mv.workspace_id, lower(coalesce(mv.access_role::text, '')) = 'owner'
    into v_workspace, v_is_owner
  from tosho.memberships_view mv
  where mv.user_id = p_user_id
  order by mv.created_at asc, mv.workspace_id asc
  limit 1;

  if v_workspace is null then
    raise exception 'Немає доступу до воркспейсу';
  end if;

  -- Статус виводиться з типу, як і в HTTP-поданні: лікарняний — факт,
  -- решта (включно з wfh) чекає рішення. ВЛАСНИК — виняток для всіх типів:
  -- над ним керівника немає, і його pending не міг би вирішити ніхто
  -- (сам собі — заборонено, SEO заявку власника — теж).
  v_status := case
    when p_kind = 'sick_leave' or coalesce(v_is_owner, false) then 'approved'
    else 'pending'
  end;

  -- Перевтілення. set_config(…, true) — на транзакцію; SET LOCAL ROLE
  -- дозволений, бо session_user (authenticator/postgres) має членство в
  -- authenticated. Із цього моменту auth.uid() = p_user_id і діють RLS.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  -- RETURNING перелічує колонки поіменно: на decision_comment грант SELECT
  -- у authenticated відкликано, і «returning *» упав би на ній.
  insert into tosho.team_absences
    (workspace_id, user_id, start_date, end_date, kind, status, comment, created_by, requested_by)
  values
    (v_workspace, p_user_id, p_start, p_end, p_kind, v_status,
     nullif(btrim(coalesce(p_comment, '')), ''), p_user_id, p_user_id)
  returning id, start_date, end_date
    into v_id, v_start, v_end;

  -- Повертаємо роль викликача (service_role на проді, postgres у psql-тестах):
  -- після нас у цій транзакції ще працює PostgREST.
  execute format('set local role %I', v_caller);

  return jsonb_build_object(
    'id', v_id,
    'workspace_id', v_workspace,
    'user_id', p_user_id,
    'start_date', v_start,
    'end_date', v_end,
    'kind', p_kind,
    'status', v_status
  );
end;
$$;

commit;

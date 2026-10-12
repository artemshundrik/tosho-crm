-- ВІДРІЗКИ РОБОТИ ЗА ДЕНЬ: «перша активність, остання, перерви» (REQ-331).
--
-- ЩО БУЛО. tosho.user_activity_daily рахувала хвилину, поки вкладка CRM на
-- екрані (visibilityState), і тримала лише гістограму по ГОДИНАХ та останню
-- хвилину. Звідси дві дірки:
--   1. Перший вхід відомий до години («між 9 і 10»), а не до хвилини.
--   2. Відкрита вкладка, від якої людина пішла на обід, рахувалась як робота.
--
-- ЩО ТЕПЕР. Клієнт кличе record_activity_minute лише тоді, коли в CRM був рух
-- мишки, клавіатура чи прокрутка (useWorkspacePresenceState), — не частіше
-- разу на хвилину. Правило бездіяльності живе ТУТ, а не в клієнті:
--
--   * між двома хвилинами з рухом ≤ 10 хв — людина читала чи думала, проміжок
--     зараховуємо цілком (гістограма й лічильник добирають пропущені хвилини);
--   * > 10 хв — перерва: проміжок НЕ рахується, день ділиться на відрізки.
--
-- Відрізки лежать у `sessions` (int4multirange хвилин київської доби, [від,
-- до)). Звідти ранковий звіт бере першу/останню активність і перерви, а сума
-- довжин дорівнює active_minutes нового дня.
--
-- ЧОМУ НЕ «ХВОСТ» ПІСЛЯ ОСТАННЬОГО РУХУ. Якби клієнт рахував хвилини, доки з
-- останнього руху не минуло 10 хв, кожна перерва додавала б до 10 зайвих хвилин
-- роботи. Добирання проміжку ЗАДНІМ числом — у момент, коли рух повернувся, —
-- рахує лише те, що справді між двома рухами.
--
-- СУМІСНІСТЬ. Сигнатура функції та сама: вкладка, відкрита до деплою, і далі
-- кличе її щохвилини, поки видима, — для неї кожна хвилина просто «з рухом».
-- Історичні дні лишаються як були: sessions там порожні, звіт їх не читає.

begin;

alter table tosho.user_activity_daily
  add column if not exists sessions int4multirange not null default '{}'::int4multirange;

comment on column tosho.user_activity_daily.sessions is
  'Відрізки роботи за день: хвилини київської доби [від, до). Проміжок між рухами ≤ 10 хв зараховано, > 10 хв — перерва. Порожньо для днів до REQ-331.';

-- Новий вид дайджесту: «хто як працював учора».
alter table tosho.digest_log drop constraint if exists digest_log_kind_check;
alter table tosho.digest_log
  add constraint digest_log_kind_check
  check (kind = any (array['tech', 'business_morning', 'business_evening', 'dev_news', 'team_activity']));

create or replace function tosho.record_activity_minute(
  p_team_id uuid,
  p_workspace_id uuid,
  p_actor_name text default null
)
returns void
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  -- Проміжок без руху, який ще вважається роботою. Більший — перерва.
  c_idle_gap constant integer := 10;
  v_user   uuid := auth.uid();
  v_now    timestamptz := now();
  v_minute timestamptz := date_trunc('minute', v_now);
  v_local  timestamp := v_now at time zone 'Europe/Kiev';
  v_day    date := v_local::date;
  v_mod    integer := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;  -- 0..1439
  v_row    tosho.user_activity_daily%rowtype;
  v_gap    integer;
  v_fill   integer;
  v_from   integer;
  v_hours  integer[];
  m        integer;
begin
  if v_user is null or p_workspace_id is null then
    return;
  end if;

  -- Писати можна лише у свій простір: інакше будь-хто автентифікований
  -- підкидав би рядки (з вигаданим actor_name) у чужу аналітику.
  if not exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = p_workspace_id
      and mv.user_id = v_user
  ) then
    return;
  end if;

  -- FOR UPDATE: дві вкладки однієї людини не повинні добрати той самий
  -- проміжок двічі.
  select * into v_row
  from tosho.user_activity_daily
  where workspace_id = p_workspace_id
    and user_id = v_user
    and day = v_day
  for update;

  if not found then
    v_hours := array_fill(0, array[24]);
    v_hours[v_mod / 60 + 1] := 1;
    insert into tosho.user_activity_daily
      (workspace_id, team_id, user_id, day, active_minutes, hours, last_bucket, sessions, actor_name, updated_at)
    values
      (p_workspace_id, p_team_id, v_user, v_day, 1, v_hours, v_minute,
       int4multirange(int4range(v_mod, v_mod + 1)), p_actor_name, v_now)
    on conflict (workspace_id, user_id, day) do nothing;  -- гонка першої хвилини: друга вкладка мовчить
    return;
  end if;

  -- Ця хвилина вже врахована (або годинник бази пішов назад).
  if v_row.last_bucket is not null and v_row.last_bucket >= v_minute then
    return;
  end if;

  v_gap := case
    when v_row.last_bucket is null then null
    else floor(extract(epoch from (v_minute - v_row.last_bucket)) / 60)::integer
  end;
  v_fill := case when v_gap between 1 and c_idle_gap then v_gap else 1 end;
  -- Перехід на зимовий час може дати проміжок, довший за київську добу до
  -- цієї хвилини, — не виходимо за північ.
  v_from := greatest(0, v_mod - v_fill + 1);
  v_fill := v_mod - v_from + 1;

  v_hours := v_row.hours;
  for m in v_from..v_mod loop
    v_hours[m / 60 + 1] := v_hours[m / 60 + 1] + 1;
  end loop;

  update tosho.user_activity_daily
    set active_minutes = active_minutes + v_fill,
        hours          = v_hours,
        sessions       = sessions + int4multirange(int4range(v_from, v_mod + 1)),
        last_bucket    = v_minute,
        team_id        = coalesce(team_id, p_team_id),
        actor_name     = coalesce(p_actor_name, actor_name),
        updated_at     = v_now
    where workspace_id = p_workspace_id
      and user_id = v_user
      and day = v_day;
end;
$$;

grant execute on function tosho.record_activity_minute(uuid, uuid, text) to authenticated;

commit;

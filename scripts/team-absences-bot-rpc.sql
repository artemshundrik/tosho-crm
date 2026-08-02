-- =====================================================================
-- Подання відсутності з Telegram-бота: tosho.bot_submit_absence
--
-- Проблема: у вебхука бота немає JWT користувача — лише telegram_chat_id,
-- перевірений при прив'язці. Вставляти сервісною роллю не можна: вона
-- обходить і RLS-політику team_absences_insert_self (межі дат, «лише за
-- себе», статус за типом), і тригер річної квоти лікарняних — а це якраз
-- той захист, що закриває маніпуляцію нормою дизайнера.
--
-- Рішення: функція, яка ПЕРЕВТІЛЮЄТЬСЯ в користувача — set_config(
-- 'request.jwt.claims', …) + SET LOCAL ROLE authenticated — і вже під його
-- роллю робить INSERT. Усі політики й тригери спрацьовують точно як із CRM;
-- правила живуть в одному місці, дублікатів немає.
--
-- SECURITY INVOKER навмисно: у security definer Postgres забороняє SET ROLE
-- («cannot set parameter "role"…»). Викликач — service_role (BYPASSRLS), тож
-- підготовчі читання йому доступні й без definer, а перевтілення далі саме
-- знімає цей обхід.
--
-- Викликати може ЛИШЕ service_role (netlify-функції). Дати authenticated
-- грант не можна: p_user_id — параметр, і будь-хто подавав би за інших.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/team-absences-bot-rpc.sql
-- =====================================================================

begin;

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
  v_status text;
  v_id uuid;
  v_start date;
  v_end date;
  v_caller text := current_user;
begin
  if p_kind not in ('vacation', 'day_off', 'sick_leave') then
    raise exception 'Невідомий тип відсутності';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Невірний діапазон дат';
  end if;

  -- Воркспейс — із членства самої людини, не з параметрів виклику.
  select mv.workspace_id
    into v_workspace
  from tosho.memberships_view mv
  where mv.user_id = p_user_id
  order by mv.created_at asc, mv.workspace_id asc
  limit 1;

  if v_workspace is null then
    raise exception 'Немає доступу до воркспейсу';
  end if;

  -- Статус виводиться з типу, як і в HTTP-поданні: лікарняний — факт,
  -- решта чекає рішення. RLS нижче перевіряє ту саму пару ще раз.
  v_status := case when p_kind = 'sick_leave' then 'approved' else 'pending' end;

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

revoke all on function tosho.bot_submit_absence(uuid, text, date, date, text) from public;
revoke all on function tosho.bot_submit_absence(uuid, text, date, date, text) from anon;
revoke all on function tosho.bot_submit_absence(uuid, text, date, date, text) from authenticated;
grant execute on function tosho.bot_submit_absence(uuid, text, date, date, text) to service_role;

commit;

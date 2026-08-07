-- Передача редагування: запит на звільнення, примусове забрання, Realtime.
--
-- Навіщо: коли задачу тримає інша людина, єдиним виходом був дзвінок або
-- повідомлення в Телеграм — і воно не спрацьовувало, бо людина або говорить по
-- телефону, або взагалі не знає, що когось блокує. Тепер запит іде туди, де
-- вона вже дивиться, — у саму CRM.
--
-- Що НЕ додаємо: окрему таблицю запитів. Запит живе рівно доти, доки живий сам
-- лок, і разом із ним помирає — `release_entity_lock` видаляє рядок цілком.
-- Окрема таблиця означала б власний life cycle й власні протухлі рядки.

alter table tosho.entity_locks
  add column if not exists release_requested_by uuid,
  add column if not exists release_requested_by_name text,
  add column if not exists release_requested_at timestamptz;

-- ---------------------------------------------------------------------------
-- acquire: повертає ще й запит на звільнення, щоб тримач його побачив.
-- ---------------------------------------------------------------------------
-- RETURNS TABLE змінює сигнатуру, тож replace недостатньо — треба drop.
drop function if exists public.acquire_entity_lock(uuid, text, text, uuid, text, integer);

create function public.acquire_entity_lock(
  p_team_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_user_id uuid,
  p_user_label text default null,
  p_ttl_seconds integer default 45
)
returns table(
  acquired boolean,
  locked_by uuid,
  locked_by_name text,
  expires_at timestamptz,
  release_requested_by uuid,
  release_requested_by_name text,
  release_requested_at timestamptz
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_ttl_seconds integer := greatest(coalesce(p_ttl_seconds, 180), 30);
  v_expiry timestamptz := v_now + make_interval(secs => v_ttl_seconds);
  v_refresh_threshold timestamptz := v_now + make_interval(secs => greatest(least(v_ttl_seconds / 2, 60), 15));
  v_row tosho.entity_locks%rowtype;
begin
  delete from tosho.entity_locks as l
  where l.expires_at < v_now - interval '5 minutes';

  insert into tosho.entity_locks (
    team_id, entity_type, entity_id, locked_by, locked_by_name,
    locked_at, expires_at, created_at, updated_at
  )
  values (
    p_team_id, p_entity_type, p_entity_id, p_user_id,
    nullif(trim(coalesce(p_user_label, '')), ''),
    v_now, v_expiry, v_now, v_now
  )
  on conflict (team_id, entity_type, entity_id) do nothing;

  select l.* into v_row
  from tosho.entity_locks as l
  where l.team_id = p_team_id
    and l.entity_type = p_entity_type
    and l.entity_id = p_entity_id;

  if not found then
    return query select true, p_user_id, nullif(trim(coalesce(p_user_label, '')), ''), v_expiry,
                        null::uuid, null::text, null::timestamptz;
    return;
  end if;

  -- Свій і ще довго живий — просто підтверджуємо, разом із запитом (якщо є).
  if v_row.locked_by = p_user_id and v_row.expires_at > v_refresh_threshold then
    return query select true, v_row.locked_by, v_row.locked_by_name, v_row.expires_at,
                        v_row.release_requested_by, v_row.release_requested_by_name, v_row.release_requested_at;
    return;
  end if;

  if v_row.locked_by = p_user_id or v_row.expires_at <= v_now then
    -- Зміна тримача гасить запит: він стосувався попередника. Продовження
    -- власного лока запит зберігає — інакше тримач ніколи б його не побачив,
    -- бо heartbeat перезаписував би поле раніше за показ.
    update tosho.entity_locks as l
    set locked_by = p_user_id,
        locked_by_name = nullif(trim(coalesce(p_user_label, '')), ''),
        locked_at = v_now,
        expires_at = v_expiry,
        updated_at = v_now,
        release_requested_by =
          case when l.locked_by = p_user_id then l.release_requested_by else null end,
        release_requested_by_name =
          case when l.locked_by = p_user_id then l.release_requested_by_name else null end,
        release_requested_at =
          case when l.locked_by = p_user_id then l.release_requested_at else null end
    where l.id = v_row.id
    returning l.* into v_row;

    return query select true, v_row.locked_by, v_row.locked_by_name, v_row.expires_at,
                        v_row.release_requested_by, v_row.release_requested_by_name, v_row.release_requested_at;
    return;
  end if;

  return query select false, v_row.locked_by, v_row.locked_by_name, v_row.expires_at,
                      v_row.release_requested_by, v_row.release_requested_by_name, v_row.release_requested_at;
end;
$$;

grant execute on function public.acquire_entity_lock(uuid, text, text, uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- request: «звільни, будь ласка». Пише прохання прямо в рядок лока.
-- ---------------------------------------------------------------------------
create or replace function public.request_entity_lock_release(
  p_team_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_user_id uuid,
  p_user_label text default null
)
returns table(requested boolean, locked_by uuid, locked_by_name text)
language plpgsql
as $$
declare
  v_row tosho.entity_locks%rowtype;
begin
  select l.* into v_row
  from tosho.entity_locks as l
  where l.team_id = p_team_id
    and l.entity_type = p_entity_type
    and l.entity_id = p_entity_id;

  -- Немає лока або він уже протух — просити нема кого, забирай вільно.
  if not found or v_row.expires_at <= now() then
    return query select false, null::uuid, null::text;
    return;
  end if;

  -- Свій лок просити в себе безглуздо.
  if v_row.locked_by = p_user_id then
    return query select false, v_row.locked_by, v_row.locked_by_name;
    return;
  end if;

  -- Останній прохач перезаписує попереднього: тримачу важливо бачити, кому
  -- саме зараз потрібно, а не хто спитав першим півгодини тому.
  update tosho.entity_locks as l
  set release_requested_by = p_user_id,
      release_requested_by_name = nullif(trim(coalesce(p_user_label, '')), ''),
      release_requested_at = now(),
      updated_at = now()
  where l.id = v_row.id;

  return query select true, v_row.locked_by, v_row.locked_by_name;
end;
$$;

grant execute on function public.request_entity_lock_release(uuid, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- force: забрати редагування. Резервний сценарій для власника та SEO.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER свідомо: перевірка ролі мусить бути в функції, бо політика
-- DELETE на entity_locks дозволяє видалення будь-якому членові команди.
--
-- ЧЕСНО ПРО МЕЖУ: через це сама політика лишається дірою — будь-хто може
-- видалити чужий лок напряму через REST, і роль тут не завада. Закрити це
-- означає звузити політику DELETE до `locked_by = auth.uid()`, але тоді
-- перестане працювати прибирання протухлих локів усередині acquire_entity_lock
-- (воно виконується від імені викликача). Тобто це окрема зміна: перевести
-- acquire/release на SECURITY DEFINER і аж тоді закрутити політику.
create or replace function public.force_release_entity_lock(
  p_team_id uuid,
  p_entity_type text,
  p_entity_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, tosho
as $$
declare
  v_deleted integer := 0;
begin
  if not public.is_team_member(p_team_id) then
    raise exception 'Немає доступу до цієї команди' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from tosho.memberships m
    where m.user_id = auth.uid()
      and m.workspace_id = tosho.my_workspace_id()
      and (m.role = 'owner' or m.job_role = 'seo')
  ) then
    raise exception 'Забрати редагування можуть лише власник і SEO' using errcode = '42501';
  end if;

  delete from tosho.entity_locks
  where team_id = p_team_id
    and entity_type = p_entity_type
    and entity_id = p_entity_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke execute on function public.force_release_entity_lock(uuid, text, text) from public, anon;
grant execute on function public.force_release_entity_lock(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: щоб «звільнилось» і «просять звільнити» доходили миттєво.
-- Без цього довелося б опитувати базу, а запит доїжджав би з затримкою до
-- хвилини — рівно та затримка, через яку зараз дзвонять по телефону.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'tosho' and tablename = 'entity_locks'
  ) then
    alter publication supabase_realtime add table tosho.entity_locks;
  end if;
end;
$$;

-- Перевірка:
--   select entity_type, locked_by_name, release_requested_by_name, expires_at
--   from tosho.entity_locks;
--
--   select * from pg_publication_tables
--   where pubname='supabase_realtime' and tablename='entity_locks';

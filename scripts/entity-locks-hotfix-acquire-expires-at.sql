-- Hotfix: qualify entity_locks.expires_at inside acquire_entity_lock().
--
-- The function returns a column named expires_at, so unqualified references to
-- expires_at inside PL/pgSQL can be ambiguous with table columns.

create or replace function public.acquire_entity_lock(
  p_team_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_user_id uuid,
  p_user_label text default null::text,
  p_ttl_seconds integer default 45
)
returns table(
  acquired boolean,
  locked_by uuid,
  locked_by_name text,
  expires_at timestamp with time zone
)
language plpgsql
as $function$
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
    team_id,
    entity_type,
    entity_id,
    locked_by,
    locked_by_name,
    locked_at,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_team_id,
    p_entity_type,
    p_entity_id,
    p_user_id,
    nullif(trim(coalesce(p_user_label, '')), ''),
    v_now,
    v_expiry,
    v_now,
    v_now
  )
  on conflict (team_id, entity_type, entity_id) do nothing;

  select l.* into v_row
  from tosho.entity_locks as l
  where l.team_id = p_team_id
    and l.entity_type = p_entity_type
    and l.entity_id = p_entity_id;

  if not found then
    return query
    select true, p_user_id, nullif(trim(coalesce(p_user_label, '')), ''), v_expiry;
    return;
  end if;

  if v_row.locked_by = p_user_id and v_row.expires_at > v_refresh_threshold then
    return query
    select true, v_row.locked_by, v_row.locked_by_name, v_row.expires_at;
    return;
  end if;

  if v_row.locked_by = p_user_id or v_row.expires_at <= v_now then
    update tosho.entity_locks as l
    set locked_by = p_user_id,
        locked_by_name = nullif(trim(coalesce(p_user_label, '')), ''),
        locked_at = v_now,
        expires_at = v_expiry,
        updated_at = v_now
    where l.id = v_row.id
    returning l.* into v_row;

    return query
    select true, v_row.locked_by, v_row.locked_by_name, v_row.expires_at;
    return;
  end if;

  return query
  select false, v_row.locked_by, v_row.locked_by_name, v_row.expires_at;
end;
$function$;

notify pgrst, 'reload schema';

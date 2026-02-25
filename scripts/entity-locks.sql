-- Entity locks: prevent concurrent edits on the same record.
-- Safe to run multiple times.

create table if not exists tosho.entity_locks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  locked_by uuid not null,
  locked_by_name text,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, entity_type, entity_id)
);

create index if not exists entity_locks_team_entity_idx
  on tosho.entity_locks (team_id, entity_type, entity_id);

create index if not exists entity_locks_expires_idx
  on tosho.entity_locks (expires_at);

alter table tosho.entity_locks enable row level security;

do $$
declare
  has_member_fn boolean;
begin
  has_member_fn := to_regprocedure('public.is_team_member(uuid)') is not null;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'entity_locks' and policyname = 'entity_locks_select'
  ) then
    if has_member_fn then
      create policy entity_locks_select on tosho.entity_locks
      for select using (public.is_team_member(team_id));
    else
      create policy entity_locks_select on tosho.entity_locks
      for select using (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'entity_locks' and policyname = 'entity_locks_insert'
  ) then
    if has_member_fn then
      create policy entity_locks_insert on tosho.entity_locks
      for insert with check (public.is_team_member(team_id));
    else
      create policy entity_locks_insert on tosho.entity_locks
      for insert with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'entity_locks' and policyname = 'entity_locks_update'
  ) then
    if has_member_fn then
      create policy entity_locks_update on tosho.entity_locks
      for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
    else
      create policy entity_locks_update on tosho.entity_locks
      for update using (true) with check (true);
    end if;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'tosho' and tablename = 'entity_locks' and policyname = 'entity_locks_delete'
  ) then
    if has_member_fn then
      create policy entity_locks_delete on tosho.entity_locks
      for delete using (public.is_team_member(team_id));
    else
      create policy entity_locks_delete on tosho.entity_locks
      for delete using (true);
    end if;
  end if;
end $$;

create or replace function public.acquire_entity_lock(
  p_team_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_user_id uuid,
  p_user_label text default null,
  p_ttl_seconds integer default 45
)
returns table (
  acquired boolean,
  locked_by uuid,
  locked_by_name text,
  expires_at timestamptz
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_expiry timestamptz := now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 45), 10));
  v_row tosho.entity_locks%rowtype;
begin
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

  select * into v_row
  from tosho.entity_locks
  where team_id = p_team_id
    and entity_type = p_entity_type
    and entity_id = p_entity_id;

  if not found then
    return query
    select true, p_user_id, nullif(trim(coalesce(p_user_label, '')), ''), v_expiry;
    return;
  end if;

  if v_row.locked_by = p_user_id or v_row.expires_at <= v_now then
    update tosho.entity_locks
    set locked_by = p_user_id,
        locked_by_name = nullif(trim(coalesce(p_user_label, '')), ''),
        locked_at = v_now,
        expires_at = v_expiry,
        updated_at = v_now
    where id = v_row.id
    returning * into v_row;

    return query
    select true, v_row.locked_by, v_row.locked_by_name, v_row.expires_at;
    return;
  end if;

  return query
  select false, v_row.locked_by, v_row.locked_by_name, v_row.expires_at;
end;
$$;

create or replace function public.release_entity_lock(
  p_team_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_user_id uuid
)
returns boolean
language plpgsql
as $$
declare
  v_deleted integer := 0;
begin
  delete from tosho.entity_locks
  where team_id = p_team_id
    and entity_type = p_entity_type
    and entity_id = p_entity_id
    and locked_by = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.is_entity_lock_allowed(
  p_team_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_user_id uuid
)
returns boolean
language sql
stable
as $$
  select
    case
      when p_user_id is null then true
      when not exists (
        select 1
        from tosho.entity_locks l
        where l.team_id = p_team_id
          and l.entity_type = p_entity_type
          and l.entity_id = p_entity_id
          and l.expires_at > now()
      ) then true
      when exists (
        select 1
        from tosho.entity_locks l
        where l.team_id = p_team_id
          and l.entity_type = p_entity_type
          and l.entity_id = p_entity_id
          and l.expires_at > now()
          and l.locked_by = p_user_id
      ) then true
      else false
    end;
$$;

create or replace function public.assert_quote_lock_from_id()
returns trigger
language plpgsql
as $$
declare
  v_team_id uuid;
  v_quote_id text;
  v_user_id uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_team_id := old.team_id;
    v_quote_id := old.id::text;
  else
    v_team_id := new.team_id;
    v_quote_id := new.id::text;
  end if;

  if not public.is_entity_lock_allowed(v_team_id, 'quote', v_quote_id, v_user_id) then
    raise exception 'Quote is locked by another user'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.assert_quote_lock_from_quote_id()
returns trigger
language plpgsql
as $$
declare
  v_team_id uuid;
  v_quote_id text;
  v_user_id uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_team_id := old.team_id;
    v_quote_id := old.quote_id::text;
  else
    v_team_id := new.team_id;
    v_quote_id := new.quote_id::text;
  end if;

  if not public.is_entity_lock_allowed(v_team_id, 'quote', v_quote_id, v_user_id) then
    raise exception 'Quote is locked by another user'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.assert_design_task_lock_on_activity_log()
returns trigger
language plpgsql
as $$
declare
  v_team_id uuid;
  v_task_id text;
  v_action text;
  v_user_id uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_team_id := old.team_id;
    v_task_id := old.id::text;
    v_action := old.action;
  else
    v_team_id := new.team_id;
    v_task_id := new.id::text;
    v_action := new.action;
  end if;

  if v_action <> 'design_task' then
    return coalesce(new, old);
  end if;

  if not public.is_entity_lock_allowed(v_team_id, 'design_task', v_task_id, v_user_id) then
    raise exception 'Design task is locked by another user'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('tosho.quotes') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_quote_lock_quotes') then
      execute 'create trigger trg_quote_lock_quotes before update or delete on tosho.quotes for each row execute function public.assert_quote_lock_from_id()';
    end if;
  end if;

  if to_regclass('tosho.quote_items') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_quote_lock_quote_items') then
      execute 'create trigger trg_quote_lock_quote_items before insert or update or delete on tosho.quote_items for each row execute function public.assert_quote_lock_from_quote_id()';
    end if;
  end if;

  if to_regclass('tosho.quote_comments') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_quote_lock_quote_comments') then
      execute 'create trigger trg_quote_lock_quote_comments before insert or update or delete on tosho.quote_comments for each row execute function public.assert_quote_lock_from_quote_id()';
    end if;
  end if;

  if to_regclass('tosho.quote_attachments') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_quote_lock_quote_attachments') then
      execute 'create trigger trg_quote_lock_quote_attachments before insert or update or delete on tosho.quote_attachments for each row execute function public.assert_quote_lock_from_quote_id()';
    end if;
  end if;

  if to_regclass('tosho.quote_item_runs') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_quote_lock_quote_item_runs') then
      execute 'create trigger trg_quote_lock_quote_item_runs before insert or update or delete on tosho.quote_item_runs for each row execute function public.assert_quote_lock_from_quote_id()';
    end if;
  end if;

  if to_regclass('tosho.quote_status_history') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_quote_lock_quote_status_history') then
      execute 'create trigger trg_quote_lock_quote_status_history before insert or update or delete on tosho.quote_status_history for each row execute function public.assert_quote_lock_from_quote_id()';
    end if;
  end if;

  if to_regclass('public.activity_log') is not null then
    if not exists (select 1 from pg_trigger where tgname = 'trg_design_task_lock_activity_log') then
      execute 'create trigger trg_design_task_lock_activity_log before update or delete on public.activity_log for each row execute function public.assert_design_task_lock_on_activity_log()';
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';

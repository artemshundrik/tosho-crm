-- Change history / audit trail.
-- Append-only log of who changed what, captured at the DB level via AFTER
-- triggers so nothing is missed regardless of which of the ~43 mutation sites
-- (or which RPC / Netlify function) performed the write.
--
-- Design decision (see docs/superpowers/specs/2026-07-18-team-access-redesign-design.md):
-- store only CHANGED fields as {field: {from, to}}, never full row snapshots for
-- UPDATEs. Surfaced as "Історія змін" on entity cards; the access page shows the
-- team_member_profiles slice ("Історія доступів").
--
-- RLS/writer conventions mirror tosho.ai_usage: owner/admin SELECT, writes only
-- via the SECURITY DEFINER trigger (table-owner insert bypasses RLS).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists tosho.audit_log (
  id            bigint generated always as identity primary key,
  workspace_id  uuid,
  team_id       uuid,
  actor_user_id uuid,                      -- auth.uid() at write time; null = system/service
  actor_name    text,                      -- optional denormalized label (usually resolved on read)
  entity_type   text not null,             -- 'quote' | 'order' | 'customer' | 'lead' | ...
  entity_id     uuid,
  action        text not null,             -- 'insert' | 'update' | 'delete'
  changed       jsonb not null default '{}'::jsonb,   -- {field: {from, to}} (empty for inserts)
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_entity_idx
  on tosho.audit_log (entity_type, entity_id, created_at desc);

create index if not exists audit_log_actor_idx
  on tosho.audit_log (actor_user_id, created_at desc);

create index if not exists audit_log_workspace_idx
  on tosho.audit_log (workspace_id, created_at desc);

create index if not exists audit_log_team_idx
  on tosho.audit_log (team_id, created_at desc);

comment on table tosho.audit_log is
  'Append-only change history. UPDATE rows carry a {field:{from,to}} diff; DELETE rows carry the full prior snapshot; INSERT rows just record creation. Written only by the audit_row_change() trigger.';

-- ---------------------------------------------------------------------------
-- RLS: deny-by-default; SELECT for workspace owners/admins only.
-- ---------------------------------------------------------------------------
alter table tosho.audit_log enable row level security;

drop policy if exists audit_log_select on tosho.audit_log;
create policy audit_log_select
  on tosho.audit_log
  for select
  using (
    -- workspace-scoped rows (e.g. team_member_profiles)
    (
      audit_log.workspace_id is not null
      and exists (
        select 1
        from tosho.memberships_view mv
        where mv.workspace_id = audit_log.workspace_id
          and mv.user_id = auth.uid()
          and lower(coalesce(mv.access_role::text, '')) in ('owner', 'admin')
      )
    )
    -- team-scoped rows: every business table (quotes/orders/customers/leads/
    -- catalog_models) has team_id but NO workspace_id, so without this branch
    -- their audit history is written but unreadable by anyone.
    or (
      audit_log.team_id is not null
      and public.is_team_member(audit_log.team_id)
      and exists (
        select 1
        from tosho.memberships_view mv
        where mv.user_id = auth.uid()
          and lower(coalesce(mv.access_role::text, '')) in ('owner', 'admin')
      )
    )
  );

grant select on tosho.audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- Generic trigger: diff OLD vs NEW, write changed fields only.
-- Entity type is supplied as the first trigger argument (TG_ARGV[0]).
-- workspace_id / team_id / id are read generically from the row's jsonb so one
-- function serves every table. Noisy/derived columns are ignored.
-- ---------------------------------------------------------------------------
create or replace function tosho.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = tosho, public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_rec jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_key text;
  v_entity_id uuid;
  v_workspace uuid;
  v_team uuid;
  v_uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_ignore text[] := array[
    'updated_at', 'created_at', 'last_seen_at', 'search_vector',
    'fts', 'tsv', 'last_bucket'
  ];
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_rec := v_new;
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = any(v_ignore) then continue; end if;
      if v_new -> v_key is distinct from v_old -> v_key then
        v_changed := v_changed || jsonb_build_object(
          v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)
        );
      end if;
    end loop;
    if v_changed = '{}'::jsonb then
      return null;  -- only ignored columns moved; not worth a row
    end if;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_rec := v_old;
    for v_key in select jsonb_object_keys(v_old) loop
      if v_key = any(v_ignore) then continue; end if;
      v_changed := v_changed || jsonb_build_object(
        v_key, jsonb_build_object('from', v_old -> v_key, 'to', null)
      );
    end loop;
  else  -- INSERT: record creation event without dumping every column
    v_rec := to_jsonb(new);
  end if;

  -- Guard every cast: a non-uuid PK (e.g. bigint) must never break the underlying
  -- write. Fall back to null id rather than raising inside the trigger.
  -- Tables without a uuid `id` (e.g. team_member_profiles keyed by user_id) fall
  -- back to user_id so per-person history stays queryable by entity_id.
  v_entity_id := case
    when (v_rec ->> 'id') ~* v_uuid_re then (v_rec ->> 'id')::uuid
    when (v_rec ->> 'user_id') ~* v_uuid_re then (v_rec ->> 'user_id')::uuid
    else null
  end;
  v_workspace := case when (v_rec ->> 'workspace_id') ~* v_uuid_re then (v_rec ->> 'workspace_id')::uuid else null end;
  v_team      := case when (v_rec ->> 'team_id') ~* v_uuid_re then (v_rec ->> 'team_id')::uuid else null end;

  -- Auditing must never block the underlying business write: swallow any error.
  begin
    insert into tosho.audit_log
      (workspace_id, team_id, actor_user_id, entity_type, entity_id, action, changed, created_at)
    values
      (v_workspace, v_team, auth.uid(), tg_argv[0], v_entity_id, lower(tg_op), v_changed, now());
  exception when others then
    null;
  end;

  return null;  -- AFTER trigger: return value is ignored
end;
$$;

-- ---------------------------------------------------------------------------
-- Attach triggers to core business tables.
-- Deliberately excluded: quote_item_runs (high-churn pricing rows) and the
-- design-task activity_log rows (already self-documenting).
-- ---------------------------------------------------------------------------
drop trigger if exists audit_quotes on tosho.quotes;
create trigger audit_quotes
  after insert or update or delete on tosho.quotes
  for each row execute function tosho.audit_row_change('quote');

drop trigger if exists audit_quote_items on tosho.quote_items;
create trigger audit_quote_items
  after insert or update or delete on tosho.quote_items
  for each row execute function tosho.audit_row_change('quote_item');

drop trigger if exists audit_orders on tosho.orders;
create trigger audit_orders
  after insert or update or delete on tosho.orders
  for each row execute function tosho.audit_row_change('order');

drop trigger if exists audit_order_items on tosho.order_items;
create trigger audit_order_items
  after insert or update or delete on tosho.order_items
  for each row execute function tosho.audit_row_change('order_item');

drop trigger if exists audit_customers on tosho.customers;
create trigger audit_customers
  after insert or update or delete on tosho.customers
  for each row execute function tosho.audit_row_change('customer');

drop trigger if exists audit_leads on tosho.leads;
create trigger audit_leads
  after insert or update or delete on tosho.leads
  for each row execute function tosho.audit_row_change('lead');

drop trigger if exists audit_catalog_models on tosho.catalog_models;
create trigger audit_catalog_models
  after insert or update or delete on tosho.catalog_models
  for each row execute function tosho.audit_row_change('catalog_model');

-- Access / HR history for the members page ("Історія доступів"):
-- module_access, probation, employment status changes all land here.
drop trigger if exists audit_team_member_profiles on tosho.team_member_profiles;
create trigger audit_team_member_profiles
  after insert or update or delete on tosho.team_member_profiles
  for each row execute function tosho.audit_row_change('team_member_profile');

-- ---------------------------------------------------------------------------
-- Read RPC (owner/admin): recent audit entries for one entity or one actor.
-- Pass p_entity_type + p_entity_id for an entity card, or p_actor_user_id for a
-- person's history. Actor display names are resolved on the client.
-- ---------------------------------------------------------------------------
drop function if exists tosho.get_audit_log(uuid, text, uuid, uuid, integer);

create or replace function tosho.get_audit_log(
  p_workspace_id uuid,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_actor_user_id uuid default null,
  p_limit integer default 100,
  p_team_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = tosho, public
set statement_timeout = '15s'
as $$
declare
  actor_id uuid := auth.uid();
  actor_ok boolean;
  result jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = p_workspace_id
      and mv.user_id = actor_id
      and lower(coalesce(mv.access_role::text, '')) in ('owner', 'admin')
  ) into actor_ok;

  if not actor_ok then
    raise exception 'Only workspace owners or admins can view audit history';
  end if;

  -- A team id may only be used to widen the read if the caller is in that team.
  if p_team_id is not null and not public.is_team_member(p_team_id) then
    raise exception 'Not a member of the requested team';
  end if;

  select coalesce(jsonb_agg(row order by (row->>'createdAt') desc), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', a.id,
      'actorUserId', a.actor_user_id,
      'actorName', a.actor_name,
      'entityType', a.entity_type,
      'entityId', a.entity_id,
      'action', a.action,
      'changed', a.changed,
      'createdAt', a.created_at
    ) as row
    from tosho.audit_log a
    where (
        a.workspace_id = p_workspace_id
        or (p_team_id is not null and a.team_id = p_team_id)
      )
      and (p_entity_type is null or a.entity_type = p_entity_type)
      and (p_entity_id is null or a.entity_id = p_entity_id)
      and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) sub;

  return result;
end;
$$;

grant execute on function tosho.get_audit_log(uuid, text, uuid, uuid, integer, uuid) to authenticated;

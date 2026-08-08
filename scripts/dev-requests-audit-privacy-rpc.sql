-- Догін до scripts/dev-requests-audit-privacy.sql: та сама заборона для RPC.
--
-- tosho.get_audit_log — SECURITY DEFINER, тобто RLS вона обходить і має власний
-- гейт (owner/admin). Полагодивши лише політику на таблиці, ми лишили б відкритим
-- прямий виклик RPC з p_entity_type='dev_request'. Тіло функції взяте з проду
-- як є, додано рівно один рядок умови.
--
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/dev-requests-audit-privacy-rpc.sql

\set ON_ERROR_STOP on

begin;

CREATE OR REPLACE FUNCTION tosho.get_audit_log(p_workspace_id uuid, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tosho', 'public'
 SET statement_timeout TO '15s'
AS $function$
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
      -- Журнал не має бути ширшим за саму сутність: приватну картку запиту
      -- бачить owner/SEO, тож і її історію теж. Решти сутностей не стосується.
      and (a.entity_type is distinct from 'dev_request' or tosho.is_owner_or_seo())
      and (p_entity_id is null or a.entity_id = p_entity_id)
      and (p_actor_user_id is null or a.actor_user_id = p_actor_user_id)
    order by a.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) sub;

  return result;
end;
$function$;

commit;

notify pgrst, 'reload schema';

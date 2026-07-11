-- fix-anon-view-leak.sql
-- P0 remediation for the unauthenticated data leak documented in docs/AUDIT-2026-07-11.md.
--
-- Four views are GRANT SELECT TO anon and have no security_invoker, so they run with
-- owner privileges and bypass base-table RLS. Proven: an anonymous REST call with only the
-- public anon key returned live rows (234 quotes + employee PII).
--
-- This script ONLY revokes anon. It does NOT touch `authenticated` or `service_role`, which
-- is how the app actually reads these views (logged-in frontend + Netlify functions). No
-- anonymous read path exists in the app (verified by grep), so this is safe and reversible.
-- Reverse with: GRANT SELECT ON <view> TO anon;

\set ON_ERROR_STOP on
begin;

revoke select on tosho.v_quotes_list              from anon;
revoke select on tosho.memberships_view           from anon;
revoke select on tosho.workspace_member_directory from anon;
revoke select on public.team_members_view         from anon;

-- Verify inside the transaction: anon must now see nothing.
set local role anon;
do $$
declare n int;
begin
  begin
    execute 'select count(*) from tosho.v_quotes_list' into n;
    raise exception 'STILL LEAKING: v_quotes_list returned % rows to anon', n;
  exception when insufficient_privilege then
    raise notice 'OK: v_quotes_list is no longer readable by anon';
  end;
end $$;
reset role;

commit;

-- Post-verify (run separately): expect zero anon-readable views left.
--   select g.table_schema, g.table_name
--   from information_schema.role_table_grants g
--   join pg_class c on c.relname = g.table_name
--   join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = g.table_schema
--   where g.grantee = 'anon' and g.privilege_type = 'SELECT'
--     and c.relkind = 'v' and g.table_schema in ('tosho','public');

-- ---------------------------------------------------------------------------
-- OPTIONAL tidy (NOT P0): 11 RLS-off base tables also carry an anon SELECT grant.
-- These are catalog/counter/utility data (low confidentiality), but they violate
-- deny-by-default. Decide first whether the product catalog is meant to be public.
-- Uncomment to revoke anon (authenticated/service_role keep their grants):
--
-- revoke select on public.design_task_number_counters from anon;
-- revoke select on tosho._healthcheck            from anon;
-- revoke select on tosho.catalog_kinds           from anon;
-- revoke select on tosho.catalog_methods         from anon;
-- revoke select on tosho.catalog_model_methods   from anon;
-- revoke select on tosho.catalog_models          from anon;
-- revoke select on tosho.catalog_price_tiers     from anon;
-- revoke select on tosho.catalog_print_positions from anon;
-- revoke select on tosho.catalog_types           from anon;
-- revoke select on tosho.name_declensions        from anon;
-- revoke select on tosho.quote_counters          from anon;

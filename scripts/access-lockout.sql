-- =====================================================================
-- access-lockout.sql
-- Hard access lockout for deactivated employees.
--
-- Goal: when an employee is marked inactive (employment_status='inactive')
-- they must lose ALL access to the CRM immediately, while ALL of their data
-- (quotes, orders, design tasks, history, etc.) stays intact and visible to
-- everyone else.
--
-- This file installs a single source of truth — tosho.is_user_blocked() —
-- and wires it into every shared RLS gate so a blocked user's JWT returns
-- nothing and can write nothing, even with a still-valid access token.
--
-- Layers (this file = the DB layer):
--   1. is_user_blocked(uuid)            — true when the user is inactive/rejected
--   2. shared helper functions          — is_team_member / has_team_role /
--      has_finance_access / is_workspace_{member,admin,owner}  += block check
--   3. memberships_view                 — hides ONLY the caller's own row when
--                                         the caller is blocked (keeps other
--                                         members visible for name display)
--   4. crm_contacts policies            — inline membership check += block check
--   5. orders / order_items             — RLS was OFF; enable it with a
--                                         block-aware is_team_member gate
--   6. current_user_blocked()           — RPC for the frontend to force logout
--
-- Auth-level ban + frontend force-logout live outside this file
-- (netlify/functions/team-member-employment.ts, src/auth/AuthProvider.tsx).
--
-- Idempotent: safe to run multiple times.
-- Apply BEFORE deploying the function/frontend changes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Single source of truth: is the user currently blocked?
--    SECURITY DEFINER + row_security off so it can read team_member_profiles
--    regardless of the caller's own (now denied) access.
-- ---------------------------------------------------------------------
create or replace function tosho.is_user_blocked(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from tosho.team_member_profiles tmp
    where tmp.user_id = _user_id
      and tmp.employment_status in ('inactive', 'rejected')
  );
$$;

comment on function tosho.is_user_blocked(uuid) is
  'True when the user has been offboarded (employment_status inactive/rejected). Used by RLS gates to deny all access while keeping their data intact.';

-- Tiny partial index: only blocked users are indexed, so the gate check is O(1)
-- and adds no cost for the common (active) case.
create index if not exists team_member_profiles_blocked_user_idx
  on tosho.team_member_profiles (user_id)
  where employment_status in ('inactive', 'rejected');

-- ---------------------------------------------------------------------
-- 2. Frontend-facing RPC: am I (the caller) blocked?
--    Lets the SPA force a clean logout instead of silently breaking.
-- ---------------------------------------------------------------------
create or replace function tosho.current_user_blocked()
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select tosho.is_user_blocked(auth.uid());
$$;

comment on function tosho.current_user_blocked() is
  'Returns true when the calling user is blocked. The SPA calls this to force logout.';

grant execute on function tosho.current_user_blocked() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Shared RLS helper functions += block check.
--    These are unchanged except for the trailing
--      and not tosho.is_user_blocked(auth.uid())
--    so a blocked caller fails every gate that routes through them.
-- ---------------------------------------------------------------------

-- 3a. public.is_team_member — gate for quotes, design tasks, leads, stock,
--     orders (below), and ~35 other policies. ('tosho' added to search_path.)
create or replace function public.is_team_member(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'tosho'
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = _team_id
      and tm.user_id = auth.uid()
  )
  and not tosho.is_user_blocked(auth.uid());
$$;

-- 3b. public.has_team_role — delete gate on quotes/quote_items, etc.
create or replace function public.has_team_role(_team_id uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'tosho'
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = _team_id
      and tm.user_id = auth.uid()
      and tm.role = any(_roles)
  )
  and not tosho.is_user_blocked(auth.uid());
$$;

-- 3c. tosho.has_finance_access — gate for the finance module (~30 policies).
create or replace function tosho.has_finance_access(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'tosho', 'auth'
as $$
  select
    exists (
      select 1 from public.team_members tm
      where tm.team_id = _team_id and tm.user_id = auth.uid()
    )
    and exists (
      select 1 from tosho.memberships m
      where m.user_id = auth.uid()
        and (
          lower(coalesce(m.role::text, '')) = 'owner'
          or lower(coalesce(m.job_role::text, '')) in ('seo', 'accountant', 'chief_accountant')
        )
    )
    and not tosho.is_user_blocked(auth.uid());
$$;

-- 3d. tosho.is_workspace_member (auth.uid() variant, SECURITY DEFINER).
create or replace function tosho.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from tosho.memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
  )
  and not tosho.is_user_blocked(auth.uid());
$$;

-- 3e. tosho.is_workspace_admin (auth.uid() variant, SECURITY DEFINER).
create or replace function tosho.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from tosho.memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  )
  and not tosho.is_user_blocked(auth.uid());
$$;

-- 3f. tosho.is_workspace_owner (auth.uid() variant, SECURITY DEFINER).
create or replace function tosho.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'tosho', 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from tosho.memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  )
  and not tosho.is_user_blocked(auth.uid());
$$;

-- Note: the two-argument is_workspace_owner/admin(p_workspace_id, p_user_id)
-- overloads are intentionally NOT patched — they are used to inspect specific
-- users (e.g. is_last_owner checks), not to gate the caller's own access.

-- ---------------------------------------------------------------------
-- 4. memberships_view: hide ONLY the caller's own row when the caller is
--    blocked. Other members' rows stay visible so name/role lookups for
--    historical records (incl. the blocked user's own past tasks) still work.
--    Null-safe: service-role queries (auth.uid() is null) see every row.
-- ---------------------------------------------------------------------
create or replace view tosho.memberships_view as
  select
    m.id,
    m.workspace_id,
    m.user_id,
    m.role as access_role,
    m.job_role,
    m.created_at,
    p.email,
    p.full_name
  from tosho.memberships m
  left join tosho.user_profiles p on p.user_id = m.user_id
  where not (
    auth.uid() is not null
    and m.user_id = auth.uid()
    and tosho.is_user_blocked(m.user_id)
  );

-- ---------------------------------------------------------------------
-- 5. crm_contacts: policies inline a base-table membership check (not a
--    shared function), so patch each one to also deny blocked callers.
-- ---------------------------------------------------------------------
alter policy crm_contacts_select_member on tosho.crm_contacts
  using (
    exists (
      select 1 from tosho.memberships m
      where m.workspace_id = crm_contacts.workspace_id
        and m.user_id = auth.uid()
    )
    and not tosho.is_user_blocked(auth.uid())
  );

alter policy crm_contacts_insert_member on tosho.crm_contacts
  with check (
    auth.uid() is not null
    and exists (
      select 1 from tosho.memberships m
      where m.workspace_id = crm_contacts.workspace_id
        and m.user_id = auth.uid()
    )
    and not tosho.is_user_blocked(auth.uid())
  );

alter policy crm_contacts_update_member on tosho.crm_contacts
  using (
    exists (
      select 1 from tosho.memberships m
      where m.workspace_id = crm_contacts.workspace_id
        and m.user_id = auth.uid()
    )
    and not tosho.is_user_blocked(auth.uid())
  )
  with check (
    exists (
      select 1 from tosho.memberships m
      where m.workspace_id = crm_contacts.workspace_id
        and m.user_id = auth.uid()
    )
    and not tosho.is_user_blocked(auth.uid())
  );

alter policy crm_contacts_delete_member on tosho.crm_contacts
  using (
    exists (
      select 1 from tosho.memberships m
      where m.workspace_id = crm_contacts.workspace_id
        and m.user_id = auth.uid()
    )
    and not tosho.is_user_blocked(auth.uid())
  );

-- ---------------------------------------------------------------------
-- 6. orders / order_items had RLS DISABLED — authenticated users could read
--    and write them directly via PostgREST, bypassing every gate above.
--    Enable RLS and gate with the (now block-aware) is_team_member(team_id),
--    mirroring how tosho.quotes is protected. Service-role (Netlify) bypasses
--    RLS, so server-side flows are unaffected.
-- ---------------------------------------------------------------------
alter table tosho.orders enable row level security;
alter table tosho.order_items enable row level security;

drop policy if exists orders_select on tosho.orders;
drop policy if exists orders_insert on tosho.orders;
drop policy if exists orders_update on tosho.orders;
drop policy if exists orders_delete on tosho.orders;

create policy orders_select on tosho.orders
  for select using (public.is_team_member(team_id));
create policy orders_insert on tosho.orders
  for insert with check (public.is_team_member(team_id));
create policy orders_update on tosho.orders
  for update using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy orders_delete on tosho.orders
  for delete using (public.is_team_member(team_id));

drop policy if exists order_items_select on tosho.order_items;
drop policy if exists order_items_insert on tosho.order_items;
drop policy if exists order_items_update on tosho.order_items;
drop policy if exists order_items_delete on tosho.order_items;

create policy order_items_select on tosho.order_items
  for select using (public.is_team_member(team_id));
create policy order_items_insert on tosho.order_items
  for insert with check (public.is_team_member(team_id));
create policy order_items_update on tosho.order_items
  for update using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
create policy order_items_delete on tosho.order_items
  for delete using (public.is_team_member(team_id));

-- The leftover anon SELECT grant on orders/order_items is now inert (RLS denies
-- anon — no policy targets it), but revoke it as well to be explicit.
revoke select on tosho.orders from anon;
revoke select on tosho.order_items from anon;

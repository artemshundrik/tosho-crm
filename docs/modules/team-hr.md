# Team / HR

> The workspace roster: who is a member, what access/role they hold, and their HR lifecycle (probation, employment, absences).

## At a glance

- **Routes:** `/team` → `TeamPage` (directory + absences calendar, **ungated** — any member; `src/App.tsx:898`) · `/settings/members` → `TeamMembersPage` (access/role/HR management, gated by `canEditMemberRoles || moduleAccess.team` via `TeamMembersRouteGate`, `src/App.tsx:473,1053`)
- **Key files:** `src/pages/TeamPage.tsx` (~1,176 lines), `src/pages/TeamMembersPage.tsx` (~4,042), `src/lib/workspaceMemberDirectory.ts` (directory assembly + profile upsert), `src/lib/permissions.ts`, `src/lib/workspace.ts` (workspace/membership resolution), `src/lib/employment.ts`, `src/lib/teamAbsences.ts`; Netlify `create-workspace-invite.ts`, `team-member-employment.ts`, `team-member-probation.ts`, `probation-reminders.ts`
- **Main tables (`tosho`):** `memberships` (real `access_role`/`job_role`) read via `memberships_view`; `team_member_profiles` (HR/profile SoT — names, avatar, availability, `start_date`, probation fields, `manager_user_id`, `module_access` jsonb, `employment_status`); `team_absences`; `team_member_employment_events` / `team_member_probation_events` (audit logs); `user_profiles` (name directory); `team_member_manager_rates` (payroll input). `public.team_members` resolves operational `team_id`; `workspace_member_directory` is the unified read view.
- **Access / permissions:** `permissions.ts:buildPermissions` derives `canManageMembers` (owner/admin/SEO, `:71`) & `canEditMemberRoles` (owner/admin, `:72`). **Module access is a separate dimension** from `access_role` — a per-user jsonb card in `team_member_profiles.module_access`. Access-lockout RLS + auth ban on deactivation.
- **Workflow:** `CODEX_WORKFLOWS.md` §8 (permissions/membership) + §9 (Netlify functions)
- **Related:** auth (`AuthProvider`), profile (self-service edit of same profile row), [finances / payroll](../CODEX_PROJECT_GUIDE.md) (`team_member_manager_rates`, read at `QuotesPage.tsx:765`)

## Overview

Two surfaces over one roster. `/team` is a read-mostly directory: member cards with availability, birthday/anniversary insights (`employment.ts`), and an absences calendar (`team_absences`). `/settings/members` is the admin console: invite members, edit access/job roles, edit the profile (incl. per-module access card), and run the HR lifecycle — probation review and employment (offboard/reactivate).

Two orthogonal role axes drive everything: **`access_role`** (owner/admin/member → `mapAccessRoleToTeamRole`) and **`job_role`** (seo/manager/designer/pm/logistics/accountant…). `buildPermissions` (`permissions.ts:53`) folds both into `AppPermissions`. Module visibility (`overview/orders/design/finance/…`) is a third, independent axis stored per-user; `finance` additionally has a role fallback matching DB RLS (`App.tsx:546`).

## Data flow

- **Directory:** `listWorkspaceMemberDirectory` (`workspaceMemberDirectory.ts:558`) tries the unified `workspace_member_directory` view first, else falls back to merging `memberships_view` + `team_member_profiles` (`listFromFallback:420`). Both paths probe many column/table **variants** to tolerate schema drift — a conservative zone; don't collapse them.
- **Workspace/membership resolution:** always via `workspace.ts` (`resolveWorkspaceId:50`, `resolveWorkspaceMembership:105`) — RPC `my_workspace_id`/`current_workspace_id` first, then `memberships_view`, then legacy tables. Cached.
- **Profile writes:** `upsertWorkspaceMemberProfile` (`workspaceMemberDirectory.ts:644`) upserts `team_member_profiles`. ⚠️ **Dual storage:** `create-workspace-invite.ts` `update_member_profile` mode instead writes the profile into **auth `user_metadata`** (`:641`) — a legacy path `TeamMembersPage` still calls alongside the table upsert; keep both in sync when touching profile fields.
- **Role changes:** `create-workspace-invite.ts` `update_member_roles` (`:173`) writes `memberships` (service-role) after an owner/admin guard; probes many membership table/column variants.
- **HR lifecycle:** `team-member-probation.ts` (active/extend/rejected) and `team-member-employment.ts` (inactive/reactivate) — service-role functions that update `team_member_profiles`, append an `*_events` audit row, notify the target, and (employment) toggle the auth ban.

## Permissions & access

- **Frontend gates:** `canEditMemberRoles`/`canManageMembers` (`permissions.ts`); route gates `TeamMembersRouteGate` and `ModuleRouteGate` (`App.tsx:473,529`).
- **Function authz:** both HR functions require owner/admin/SEO (`canManageEmployment`/`canReviewProbation`, `:32`); invite/role functions require owner/admin (`canManageTeam`) and only an owner may create/assign an owner (`create-workspace-invite.ts:686-691`).
- **Access lockout (deactivation = full lockout, 3 layers):** (1) DB gate `tosho.is_user_blocked()` wired into shared RLS helpers (`scripts/access-lockout.sql`); (2) auth ban via `admin.updateUserById(ban_duration)` (`team-member-employment.ts:172`); (3) frontend `current_user_blocked()` RPC → `signOut` on focus (`AuthProvider.tsx:95`). Trigger `guard_employment_status_resurrection` (`scripts/employment-status-guard.sql`) stops the SPA profile upsert from resurrecting an offboarded member; only service-role reactivation may lift it.

## Gotchas / conservative zones

- **`memberships` is the SoT for roles; `memberships_view` is the read alias.** `team_members` (public) is only for `team_id`.
- **Three independent access axes** — `access_role`, `job_role`, and `module_access`. Don't conflate module access with `access_role`.
- **Dual profile storage** (`team_member_profiles` **and** auth `user_metadata`) — see Data flow.
- **Variant-probing** in `workspaceMemberDirectory.ts` and `create-workspace-invite.ts` is deliberate migration tolerance, not dead code.
- **Offboarding is sticky** — never write `employment_status` back to `active` from the SPA; the guard trigger will silently revert it.

## Known issues (security/audit)

- **Invite privilege-escalation (FIXED):** the create-invite path once had no authz — any member could POST `accessRole:"owner"` and self-promote. Guarded by `canManageTeam` + owner-only-invites-owner (`create-workspace-invite.ts:686-691`; [[project_function_authz_audit]]).
- **HR-tables anon leak (FIXED):** `user_profiles`, `team_member_employment_events`, `team_member_probation_events` were RLS-OFF + anon `GRANT` (PII/probation readable with just the public key). Fixed in `scripts/hr-tables-rls.sql` (RLS + revoke; events = owner/admin only). [[project_hr_tables_rls]].
- **Anon view leak (P0, FIXED 2026-07-11):** `memberships_view`, `workspace_member_directory`, `public.team_members_view` were anon-readable; revoked via `scripts/fix-anon-view-leak.sql` (`docs/AUDIT-2026-07-11.md`).
- **OPEN:** `probation-reminders.ts` (and sibling cron functions) run with service-role and **have no shared-secret gate** (`handler` takes no auth token) — publicly invokable → notification spam. Fix needs coordinated pg_cron secret. [[project_function_authz_audit]].

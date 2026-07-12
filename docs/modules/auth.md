# Auth & Onboarding

> Sign-in, workspace invites, password reset, and the hard lockout that ejects deactivated employees.

## At a glance

- **Routes (all public):** `/login` → `LoginPage` (**defined inline in `src/App.tsx:601`**, not a page file) · `/invite` → `InvitePage` · `/reset-password` → `ResetPasswordPage` · `/update-password` → `UpdatePasswordPage` (`src/pages/…`). Wired at `src/App.tsx:846-871`.
- **Auth context:** `src/auth/AuthProvider.tsx` (`useAuth()` — session, `accessRole`, `jobRole`, `permissions`, `signOut`). Guard = `RequireAuth` (`src/App.tsx:404`) → redirects to `/login?next=…`.
- **Key files:** `src/lib/workspace.ts` (`resolveWorkspaceId`, `resolveWorkspaceMembership` via `memberships_view`), `src/lib/permissions.ts` (`buildPermissions`, `mapAccessRoleToTeamRole`), `netlify/functions/create-workspace-invite.ts`, `netlify/functions/get-workspace-invite.ts`, `scripts/access-lockout.sql`.
- **Main tables (`tosho`):** `workspace_invites`, `memberships` (→ `memberships_view`, source of `access_role`/`job_role`), `workspaces`. Lockout reads `team_member_profiles.employment_status`.
- **Access / permissions:** invites & role edits gated to `owner`/`admin` (`canManageTeam`); **only `owner` may invite/assign `owner`**. See [team-hr.md](team-hr.md) for the member-management UI on top of these functions.
- **Workflow:** `CODEX_WORKFLOWS.md` — Netlify-function pattern (§ "user-scoped auth check first, privileged write second", lines 196-240).
- **Related:** [team-hr.md](team-hr.md), [orders-production.md](orders-production.md) (`orders`/`order_items` RLS enabled by the same lockout script).

## Overview

Frontend runs on the **anon Supabase client + RLS** ([CODEX_PROJECT_GUIDE.md](../CODEX_PROJECT_GUIDE.md) §"Frontend Auth And Permissions"). Login is email+password (`signInWithPassword`) by default; the invite flow switches to magic link (`signInWithOtp`, `App.tsx:611,657`). After a session exists, `AuthProvider` resolves `workspace_id` → membership (`access_role`/`job_role`) → `permissions`, and stores the operational `team_id` from `team_members` (`AuthProvider.tsx:113-131`).

## Data flow

- **Invite creation (privileged):** `create-workspace-invite.ts` builds a **user-scoped client** (anon key + bearer) to authorize, then an **admin client** (service role) to write. It inserts a random-UUID `token` into `workspace_invites`, then calls `auth.admin.inviteUserByEmail` with `redirectTo=/invite?token=…` (lines 698-756). Duplicate active invite (`23505` / `workspace_invites_unique_active_per_email`) → reuses the existing token (lines 718-747).
- **Invite lookup:** `InvitePage` fetches `get-workspace-invite?token=…` (unauthenticated, service-role read) → returns only `email/expires_at/accepted_at/access_role/job_role` (`get-workspace-invite.ts:45-62`).
- **Invite acceptance:** `InvitePage.acceptInvite` optionally sets a password (`updateUser`), **refreshes the session** (so the JWT carries the new identity), then calls RPC `tosho.accept_workspace_invite({ p_token })` and routes to `/orders/estimates` (`InvitePage.tsx:101-130`).
- **Password reset:** `ResetPasswordPage` → `resetPasswordForEmail(email, { redirectTo: /update-password })`; the emailed link opens `UpdatePasswordPage`, which requires an active recovery session (`getSession`, min 6 chars) and calls `updateUser({ password })` (`UpdatePasswordPage.tsx:17-53`).

## Permissions & access

- **`canManageTeam`** = `access_role` is `owner` or `admin` (`create-workspace-invite.ts:59`). Enforced server-side for every mode (create invite `:686`, `update_member_roles` `:193`, profile list/update).
- **Privilege-escalation guard (security fix):** an admin **cannot invite an owner** (`:689-691`), cannot assign the `owner` access role (`:200-202`), cannot edit/change an existing owner's roles (`:232-234`), and cannot change their own roles unless owner (`:197-199`). See [[project_function_authz_audit]] and [team-hr.md](team-hr.md).
- **Frontend permission mapping** is derived, never trusted for writes: `mapAccessRoleToTeamRole` + `buildPermissions` (`permissions.ts:45-91`).

## Gotchas / conservative zones

- **`LoginPage` is not a file** — it lives inline in `App.tsx` (~line 601); the three other pages are real files under `src/pages/`.
- **Multi-schema/multi-table fallback:** `update_member_roles` probes `tosho`+`public` across `memberships`/`workspace_members`/`team_members` with retry-verify loops (`create-workspace-invite.ts:262-401`). This is intentional legacy-compat probing — don't "simplify" it blindly ([DB_MAP.md](../DB_MAP.md) note: "compatibility code still probes both `tosho` and `public`").
- **`next` param is sanitized** — only same-origin paths (`rawNext.startsWith("/")`) are honored to avoid open redirect (`App.tsx:607-608`).
- **`get-workspace-invite` is token-only, unauthenticated** — anyone holding the UUID token can read the invitee email + role. Acceptable (token is a random UUID) but keep the response minimal.

## Access lockout (security)

Deactivating an employee (`employment_status` `inactive`/`rejected`) is a **hard lockout**, layered (`scripts/access-lockout.sql`):
1. `tosho.is_user_blocked(uuid)` — `SECURITY DEFINER`, `row_security off`, backed by a partial index (`:38-61`).
2. Wired into shared RLS gates — `public.is_team_member`, `has_team_role`, `has_finance_access`, `is_workspace_{member,admin,owner}` all append `and not is_user_blocked(auth.uid())` (`:92-204`); `orders`/`order_items` had RLS **off** and are now enabled + gated (`:294-325`).
3. `tosho.current_user_blocked()` RPC — `AuthProvider.refreshTeamContext` calls it on every focus/visibility refresh and force-`signOut()`s a blocked user even with a live token (`AuthProvider.tsx:94-107`).
4. Auth-level ban (`ban_duration` ~100y) set in `netlify/functions/team-member-employment.ts:170-175` when marked inactive; lifted on reactivation. See [[project_access_lockout]].

## Known issues / uncertainty

- **`tosho.accept_workspace_invite(p_token)` body is NOT in tracked SQL** — it's a DB-only function; its exact validation (expiry/email-match/membership insert) could not be verified from the repo. `InvitePage` relies on it for token/expiry checks; the UI also pre-checks `emailMismatch`/`isInviteExpired`/`inviteAccepted` client-side (`InvitePage.tsx:185-187`).
- **`workspace_invites`, `memberships`, `workspaces` table DDL is not in `scripts/*.sql`** — only `memberships_view` and helper functions are tracked (`access-lockout.sql`). Schema was created outside the tracked migrations.
- No dedicated `docs/AUDIT-2026-07-11.md` finding for this module beyond the (fixed) invite authz escalation noted above.
</content>
</invoke>

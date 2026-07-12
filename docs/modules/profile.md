# Profile & Personal Settings

> The logged-in user's own profile card: edit personal info, avatar, and link Telegram notifications.

## At a glance

- **Routes:** `/profile` → `ProfilePage` (`src/pages/ProfilePage.tsx`, ~1,057 lines). Registered at `src/App.tsx:1065` (no `PermissionGate` — any authenticated user sees their own profile); nav registry entry `src/App.tsx:243` (group `account`); preloaded `src/routes/routePreload.ts:15`.
- **Key files:** `ProfilePage.tsx`, `src/lib/workspaceMemberDirectory.ts` (`getCurrentWorkspaceMemberDirectoryEntry`, `upsertWorkspaceMemberProfile`), `src/lib/avatarUrl.ts` (`getCanonicalAvatarReference`), `src/lib/workspace.ts` (`resolveWorkspaceId`), `src/lib/employment.ts`, `src/lib/userName.ts`, `netlify/functions/telegram-webhook.ts` (link consumer).
- **Main tables (`tosho`):** `team_member_profiles` (name/avatar/phone/birth date — written here), `memberships_view` (read-only `access_role`/`job_role`), `user_notification_settings` (Telegram chat id + toggle), `telegram_link_tokens` (one-time deep-link nonces). Employment fields (start/probation/status) are read-only here — managed in team-hr.
- **Access / permissions:** self-scoped. RLS on `user_notification_settings` / `telegram_link_tokens` restricts rows to `auth.uid() = user_id` (`scripts/telegram-notifications-schema.sql:53-76`). `team_member_profiles` writes go through the workspace helper.
- **Related:** [team-hr.md](team-hr.md) (admin-side of the same `team_member_profiles`; sets employment/roles/module access), [notifications.md](notifications.md) (Telegram delivery + `/notifications` center this page links to), [vchasno.md](vchasno.md) (sibling settings surface; shares the `user_notification_settings` channel model).

## Overview

`/profile` is a single self-service card. Editable inline: first/last name, birth date, phone, avatar. Read-only display: email (changed only via admin), access role + job role badges, and the "Робота в компанії" employment panel (start date, стаж, probation, status). Password is a link-out to `/reset-password` (`ProfilePage.tsx:869`); the in-app notification center is a link-out to `/notifications` (`:892`). Telegram linking is the one integration configured entirely on this page.

## Data flow

- **Load (`getProfile`, `:246`):** `supabase.auth.getUser()` seeds email + `user_metadata` (name/birth_date/phone/avatar). `resolveWorkspaceId(user.id)` → `getCurrentWorkspaceMemberDirectoryEntry()` (`:289`) supplies the canonical directory row (names, avatar, birth date, phone, employment fields). `memberships_view` is read separately for `access_role`/`job_role` (`:309-316`). Results are cached via `usePageCache("profile")`.
- **Save (`updateProfile`, `:564`):** dual-write — `upsertWorkspaceMemberProfile` (→ `team_member_profiles`, `workspaceMemberDirectory.ts:644`) **and** `supabase.auth.updateUser` (→ `user_metadata`). Then dispatches `profile:name-updated` and **hard-reloads the page after 1s** (`:632`).
- **Avatar (`uploadAvatarBlob`, `:469`):** file → `react-easy-crop` → three WebP variants (`xs/md/hero`, `:450`) uploaded to the `avatars` bucket under `avatars/{userId}/{ts}/`; writes `avatar_path` to both `team_member_profiles` and auth metadata, refreshes session, removes stale variant files, dispatches `profile:avatar-updated`. Rendered via `AvatarBase` (avatar-kit) — never a raw `<img>`.
- **Telegram (`:155-244`):** load reads `user_notification_settings` (`telegram_chat_id/username/enabled`). Connect inserts a nonce into `telegram_link_tokens` (15-min expiry) and opens `t.me/ToShoCRM_bot?start=<nonce>`; the user presses Start, then `netlify/functions/telegram-webhook.ts` (service role) validates the nonce and upserts `telegram_chat_id`. Disconnect nulls `telegram_chat_id` + `telegram_enabled`; the toggle flips `telegram_enabled`.

## Permissions & access

Everything is the caller's own data. RLS gates the notification tables to the owning `user_id`; the webhook runs with `SUPABASE_SERVICE_ROLE_KEY` and intentionally bypasses RLS to write another user's row after nonce validation (`telegram-webhook.ts:119-152`). `db` is `supabase.schema("tosho")` (`src/lib/supabaseClient.ts:42`), so the notification/telegram tables live in the `tosho` schema.

## Gotchas / conservative zones

- **Dual source of truth for identity.** Name/avatar/phone/birth date live in **both** `team_member_profiles` and auth `user_metadata`; every save must write both or they drift. Other surfaces read the directory row, but headers/session read metadata.
- **Employment + roles are display-only here.** `start_date`, `probation_end_date`, `employment_status`, `access_role`, `job_role` are set in team-hr — do not add write paths on this page.
- **Full page reload on save** (`:632`) — a deliberate cache-bust; state set just before it is effectively throwaway.
- **`upsertWorkspaceMemberProfile` has column-fallback variants** (`workspaceMemberDirectory.ts:677-705`) that silently retry with fewer columns on missing-schema errors — a genuinely rejected write can look like a partial save. Verify the row, not just the absence of a thrown error.
- **Avatar refs are references, not URLs** — pass through `getCanonicalAvatarReference`/`AvatarBase`; don't hand a raw storage path to an image src.

## Known issues

No profile-specific finding in `docs/AUDIT-2026-07-11.md`. Relevant context: the HR-tables RLS leak (`user_profiles` / `team_member_*_events` were RLS-off with anon GRANT) was fixed separately; `user_notification_settings` / `telegram_link_tokens` ship with RLS on from creation. Watch the dual-write/metadata drift and the fallback-variant silent-degradation noted above.

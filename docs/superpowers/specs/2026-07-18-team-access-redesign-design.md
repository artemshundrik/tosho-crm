# Team Access page redesign + Team Pulse analytics + change history

**Date:** 2026-07-18
**Route:** `/settings/members` ("Налаштування компанії → Співробітники")
**Primary file:** `src/pages/TeamMembersPage.tsx` (~4042 lines)
**Status:** design approved verbally ("роби, але не пуш в прод"). Build locally, do NOT push to prod.

## Goal

Radically redesign the team-access page so that:

1. The tall decorative header ("the things at the top") is gone — replaced by a single working toolbar.
2. Every existing feature survives (hard requirement — see acceptance checklist).
3. New activity/time analytics ("Пульс команди") live **inside this page as a tab**, visible only to owner + SEO — NOT in `/admin/observability` (that stays the developer's technical space).
4. A real per-user **change history** (audit trail) is captured at the DB level and surfaced on each person's card.

## Non-goals

- No new access-control *system*. Reuse the existing module-key + job-role gate pattern (the Finance model: `moduleAccess[key] === true` AND `job_role` allow-list, super_admin bypass).
- No employee-surveillance features (screenshots, keylogging, idle-shaming). We measure *active-tab minutes* + *result metrics*, framed as a team pulse.
- Do not touch the design-task activity model (it already self-documents in `activity_log`).

## Access model

Two distinct spaces, not two doors to one page:

- **`/admin/observability`** — unchanged. `isSuperAdmin || isAdmin`. Developer/technical: backups, storage, AI cost.
- **`/settings/members`** — the team page. Opening it: unchanged (`canEditMemberRoles || moduleAccess.team`).
  - **New "Пульс" tab** visibility = `isSuperAdmin || job_role === "seo"` (owner + SEO only; plain admins do not see it).
  - New module key **`pulse`** added alongside `finance`/`marketing` in `normalizeModuleAccess` + defaults (`hasDefaultPulseAccess` = owner/seo). Lets the CEO grant the Пульс tab to one more person later without code.
  - Backend RPC `get_team_pulse_summary` re-checks owner/seo server-side (frontend gate is decoration otherwise), mirroring `get_ai_usage_summary`'s owner/admin check.

## Redesign: master–detail

Replace the "tall header + 3 tabs of full-width tables + 1180px profile dialog" with:

```
┌ Співробітники   [пошук…]  [чіп: Увага·3] [чіп: Інвайти·2]   [+ Інвайт] ┐  ← one toolbar row
├───────────────┬─────────────────────────────────────────────────────────┤
│ PEOPLE LIST   │  DETAIL PANEL (selected person)                          │
│ ● Олена К.    │  header: avatar · role/status · quick actions           │
│ ○ Ігор М.     │  sections (segmented): Профіль · Доступи · Активність · HR│
│ ● Дарина С.   │                                                          │
│ …             │  (sections replace the giant dialog; same fields/logic)  │
│ ── Інвайти(3) │                                                          │
│ ── Пульс      │  (owner/seo: selecting "Пульс" swaps detail → dashboard) │
└───────────────┴─────────────────────────────────────────────────────────┘
```

- **Toolbar (one row):** page title, search, filter chips, "Інвайт". Deleted: pill badge, sentence-title, explanatory paragraph, the 3 stat chips + 4 stat cards as *decoration*. Their data becomes **clickable filter chips** ("Потребують уваги · N", "Без дня народження · N", …) — same numbers, now they filter the list.
- **Left list:** compact rows (avatar + presence dot, name, job role, status). Invites and Пульс are entries/sections at the bottom of the rail.
- **Right detail:** the selected person's card as inline sections, not a modal:
  - **Профіль** — personal data, manager %, manager linkage, start date.
  - **Доступи** — access role + job role + 12 module checkboxes **+ new `pulse` toggle**. This is also where **change history** ("Історія доступів") renders.
  - **Активність** — per-person: hourly active minutes, action breakdown by type, month/year heatmap (GitHub-contributions style), recent events from `activity_log`.
  - **HR** — probation (with decision buttons), employment status (deactivate/reactivate), availability + absence ranges, seniority/anniversary insight tiles.
- Deep-link `?member=<userId>` already exists → now selects the person in the detail panel. `?tab=` preserved.

### Design language

Fit the existing system, do not invent one: neutral grays, single brand-blue accent (`--brand` hsl 219), radii 10–12px, minimal shadows, existing skeleton tokens. Numbers use `tabular-nums`. Charts = **recharts** (already a dependency). Icons = **lucide** (already a dependency). One perpetual micro-animation only: the online pulse dot. Respect `prefers-reduced-motion`. No emoji icons. Empty states are composed, not bare text.

## Data architecture

### Time-in-system (active minutes)

Chosen: **direct daily-aggregate increment** (not raw event log + nightly rollup, not deriving from `activity_log`).

- New table `tosho.user_activity_daily`:
  `(workspace_id, team_id, user_id, day date, active_minutes int, hours int[24], last_bucket timestamptz, updated_at)`, PK `(user_id, day)`.
  ≈ 1 row per person per day (~7k rows/year for the whole team). Nothing to prune.
- RPC `tosho.record_activity_minute(p_team_id, p_workspace_id)` — SECURITY DEFINER, idempotent per minute bucket (no-op if `last_bucket` is the current minute). Increments `active_minutes` and the current-hour slot of `hours[24]`.
- Called from the **existing** `useWorkspacePresenceState` heartbeat (already ticks every ~1 min, already visibility-gated). Max 1 write/min/person.
- Read: `get_team_pulse_summary(p_team_id, p_range)` aggregates `user_activity_daily` (already pre-aggregated → fast for day/week/month/year) + counts from `activity_log` for the action breakdown, owner/seo-gated. Never scans raw logs for a year.

### Change history (audit trail)

Chosen: **DB triggers** (not per-call-site frontend logging — mutations are scattered across ~43 files with no choke point).

- New table `tosho.audit_log`:
  `(id, workspace_id, team_id, actor_user_id, actor_name, entity_type, entity_id, action, changed jsonb, created_at)`.
  `changed` stores only changed fields as `{field: {from, to}}`, not full row snapshots.
- `AFTER INSERT/UPDATE/DELETE` triggers on core tables: `quotes`, `quote_items`, `orders`, `order_items`, `customers`, `leads`, `catalog_models`, and — most relevant to this page — membership/role/module changes. Trigger does minimal work in-txn; no HTTP/notifications from triggers.
- RLS: insert only via SECURITY DEFINER trigger; select owner/admin (mirror `ai_usage`).
- Surfaced as "Історія доступів"/"Історія змін" in the person's Доступи section and, later, on quote/order cards.

## Performance rules

- Writes: append-only; triggers do only a jsonb diff, negligible in-txn cost at our volume. No partitioning/BRIN yet (overkill).
- Reads: dashboards read pre-aggregated `user_activity_daily`; any `activity_log`/`audit_log` read is windowed with indexes `(team_id, created_at desc)`, `(user_id, created_at desc)`. Respect the authenticated RPC 8s ceiling.
- No realtime subscription on audit tables. Do not store fat design-task metadata jsonb into audit.

## Phasing

1. **Spec** (this doc) + local commit.
2. **Backend SQL foundation** (additive, new files, NOT applied to prod): `user_activity_daily` + `record_activity_minute` + `get_team_pulse_summary`; `audit_log` + triggers; `pulse` module key.
3. **Page redesign** — master-detail shell, migrate all features (acceptance checklist is the gate).
4. **Pulse tab + presence heartbeat wiring** + per-person Активність.

## Acceptance checklist — nothing may be lost

Members: 7-col table data, presence dot, quick availability change (with vacation/sick dates), access+job badges, probation progress, row menu (edit profile, change access, reset password, mark inactive, delete), row-click opens person.
Profile card: personal data, manager % (SEO-editable), manager linkage, start date, probation end + "+1 month", 12 module checkboxes, forced/disabled module rules, probation decisions, employment deactivate/reactivate, read-only mode for non-managers.
Invites: create (email+access+job, 7-day link), list with statuses, copy link, revoke.
Activity: 24h/7d/30d ranges over `activity_log` (kept as the event-feed block inside Пульс/Активність).
Permissions: owner=all; admin=all except editing owner/self-guards; SEO=view + manager % + probation decisions (+ new: Пульс tab); team-module member=view.
Plumbing: `?member=` deep link, `?tab=`, page cache, mobile card layouts, all Netlify-function fallbacks (`create-workspace-invite` update modes, `team-member-probation`, `team-member-employment`).
Sibling: `settings/nova-poshta` untouched, same route gate.

## Verification

`npx tsc --noEmit` + `npm run lint` after each phase. Preview only if the user explicitly asks. Do not apply SQL to prod. Run `/security-review` before declaring done (touches auth/RLS/roles). Do not push to prod.

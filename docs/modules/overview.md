# Overview & Activity

> The `/overview` dashboard (role-aware work board) and `/activity` feed (team-wide event timeline) over `activity_log`.

## At a glance

- **Routes:** `/overview` → `OverviewPage` (`src/pages/OverviewPage.tsx`, ~1,470 lines) · `/activity` → `ActivityPage` (`src/pages/ActivityPage.tsx`, ~336 lines)
- **Feature dir:** none — both are single-file pages.
- **Key files:** `src/lib/activity.ts` (`resolveActivityType`, `mapActivityRow`, formatters), `src/lib/activityLogger.ts` (write path), `src/hooks/usePageData.ts` (overview cache/load), `src/hooks/usePageCache.ts` (activity cache), `src/lib/toshoApi.ts` (`listQuotes`, `listTeamMembers`), `src/layout/AppLayout.tsx:1151` (unread badge). Manager gate: `src/lib/permissions.ts:78` (`canViewManagerOverview`).
- **Main tables:** `activity_log`, `activity_read_state` (**default/`public` schema** — accessed via `supabase.from(...)` with NO `.schema("tosho")`), plus `tosho.quotes` for counts. Design-task rows live in `activity_log` (`action='design_task'`), not a dedicated table — see [DB_MAP §Design Task Model](../DB_MAP.md).
- **Access / permissions:** both routes team-scoped by `team_id`. Overview has two layouts switched by `permissions.canViewManagerOverview` (= `canManageMembers || isManagerJob`, `permissions.ts:78`). No per-row content gating.
- **Workflow:** `CODEX_WORKFLOWS.md` §4A; `CODEX_PROJECT_GUIDE.md` §"Overview And Activity".
- **Related:** [quotes.md](quotes.md) (quote counts + recent list), design workflow (design queue/counts derived from `activity_log`).

## Overview

`/overview` is the landing dashboard: a hero with 4 metric cards, "потрібна увага" signals, a quote-status funnel with the 8 most recent quotes, a design-status funnel with a queue, and a short recent-activity list. It renders two variants — **manager view** (team-wide: active quotes, new intake, design-in-progress, unassigned tasks, review queue) vs **personal view** (my design tasks, free/unassigned design to grab, my quotes) — chosen by `canViewManagerOverview`.

`/activity` is the full team event feed: the latest 200 `activity_log` rows, grouped by day (Сьогодні / Вчора / date), filterable by tab (all / quotes / design / team / other). Visiting it marks activity read and clears the sidebar unread badge.

## Data flow

- **Overview load** (`usePageData`, `OverviewPage.tsx:710`): cacheKey keyed on team+user+role, `cacheTTL` 10 min, `backgroundRefetch: false`. One `Promise.all` (line 767) fans out: quote counts, total quotes, my quotes, `listQuotes({ limit: 8 })`, design-task logs, activity.
- **⚠️ ~8 count round-trips (audit P1):** `QUOTE_STATUSES.map` issues **6** separate head/`count:"planned"` queries against `tosho.quotes` (`OverviewPage.tsx:741`), plus total (`:752`) and my-quotes (`:758`) = **8 HEAD requests**. Audit fix: collapse into one grouped aggregate.
- **Design counts are derived, not counted:** `readOverviewDesignTaskLogs` (`:490`) pulls only the **60 most recent** `activity_log` rows with `action='design_task'` (`.limit(60)`) and tallies statuses client-side via `parseDesignTask`. So the design funnel/queue on `/overview` is a recent-window approximation, not an authoritative status count — flag before treating those numbers as totals.
- **Schema-drift resilience:** `selectOverviewRows` (`:201`) retries `select()` with progressively smaller column sets when a column-missing error is detected — overview stays useful across schema variants.
- **Activity feed:** `ActivityPage` reads latest **200** rows (`:52`, `.limit(200)`), maps via `mapActivityRow`, groups by day; avatars enriched from `listTeamMembers`. Type/tab derived by `resolveActivityType` (`activity.ts:33`) — a **keyword heuristic** over `entity_type/action/title` (uk+en), not a stored category.
- **Write path:** rows are inserted by `src/lib/activityLogger.ts` and the many design-task writers (`designTaskActivity.ts`, `DesignTaskPage.tsx`, etc.).

## Read-state & unread badge

`ActivityPage` on mount upserts `activity_read_state` (`{team_id, user_id, last_seen_at: now}`, `onConflict: "team_id,user_id"`, `ActivityPage.tsx:119`) then dispatches a `window` `activity_read` event. `AppLayout.loadActivityUnread` (`AppLayout.tsx:1151`) reads `last_seen_at`, then counts `activity_log` rows with `created_at > last_seen` for the team — that count is the sidebar badge. The event listener (`AppLayout.tsx:1228`) recomputes it immediately on read.

## Permissions & access

Both routes filter by `team_id`; RLS on `activity_log`/`activity_read_state` is the real boundary (verify `relrowsecurity` — these are `public`-schema tables that historically had RLS gaps; see the HR-tables leak lesson in project memory). No content-edit gating here — overview is read-only aggregation; activity is read-only feed. Manager vs personal layout is a UI switch only (`canViewManagerOverview`), not a security boundary — both variants read the same team-scoped data.

## Gotchas / conservative zones

- **`activity_log` is `public`-schema, not `tosho`** — do not add `.schema("tosho")` to these reads/writes; quote counts in the same file *do* use `tosho`.
- **Design numbers are a 60-row window**, not a true count (see Data flow). Don't "fix" a count discrepancy by assuming a query bug.
- **Legacy status mapping:** `quoteStatusFromDb` (`:281`) folds old statuses (`draft→new`, `sent→estimated`, …) — keep in sync with the quotes module's status config.
- **Overview cache is 10 min with no background refetch** — a stale board after a write is expected until TTL or the manual "Оновити" button (`refetch`).

## Known issues (see `docs/AUDIT-2026-07-11.md`)

- **Perf P1:** overview fans out ~8 quote-count round-trips (`OverviewPage.tsx:741/752/758`; audit cites 741/754/759 — line drift) → one grouped aggregate read (audit §🟡, line 141).
- **Infra (known-open):** `archive_activity_log_all` archival function flagged for audit-trail/DoS risk — still open (audit line 58).
- **No tests:** `resolveActivityType` (a heuristic that silently misclassifies) is untested pure logic, an easy unit-test target (audit line 143).

# Admin Observability

> Owner/admin-only ops dashboard: daily snapshots of DB/storage health, backup-run status, and an orphan-attachment audit.

## At a glance

- **Route:** `/admin/observability` → `AdminObservabilityPage` (`src/pages/AdminObservabilityPage.tsx`). Registered + gated in `src/App.tsx:1073` (`allowed={permissions.isSuperAdmin || permissions.isAdmin}`); preloaded in `src/routes/routePreload.ts:16`.
- **Key files:** `src/pages/AdminObservabilityPage.tsx` (data orchestration + KPI/health derivation), `src/components/admin-observability/ObservabilityPanels.tsx` (lazy-loaded tab panels: Overview / Backups / Attachments / Telegram), `scripts/admin-observability.sql` (table + both RPCs), `netlify/functions/admin-attachment-audit.ts` (server-side orphan audit — see note), `src/lib/runtimeErrorLogger.ts` (runtime-error sink), `scripts/report-backup-run.mjs` (backup-run writer).
- **Main tables (`tosho`):** `admin_observability_snapshots` (one row per `team_id` + `captured_for_date`, unique — `admin-observability.sql:35`), `backup_runs`, `runtime_errors`.
- **RPCs (SECURITY DEFINER):** `capture_admin_observability_snapshot(p_team_id)` (`admin-observability.sql:67`), `get_admin_attachment_audit(p_workspace_id)` (`admin-observability.sql:651`).
- **Access / permissions:** owner/admin only. Enforced at three layers — route (`App.tsx:1076`), RLS `SELECT` on snapshots (`admin-observability.sql:53`), and re-checked inside each RPC (`admin-observability.sql:118`, `:677`).
- **Workflow:** `CODEX_WORKFLOWS.md` §12 "Observability Change".
- **Related:** [docs/BACKUP.md](../BACKUP.md) (backup automation that feeds `backup_runs`), `CODEX_WORKFLOWS.md` §13 (Backup/Ops), [[project_statement_timeout_gotchas]], [[project_backup_egress_fix]].

## Overview

The page reads *stored* snapshots rather than running expensive live queries per open — the hero copy states it "reads saved slices so it doesn't load PostgREST on every open" (`AdminObservabilityPage.tsx:946`). It loads the last 30 daily snapshots (`AdminObservabilityPage.tsx:399`) and up to 40 `backup_runs` (`:421`), then derives KPI cards, tone-coded health rows, anomaly badges, and trend charts client-side. "Оновити зараз" triggers a fresh capture RPC on demand (`:440`). Four tabs: Overview, Backups, Attachments (orphan-files review), Telegram (link stats).

## Data flow

- **Snapshots (read):** `supabase.schema("tosho").from("admin_observability_snapshots").eq("team_id", workspaceId).order("captured_for_date", desc).limit(30)` (`AdminObservabilityPage.tsx:393`). `latest = rows[0]`; `previousRows = rows.slice(1)` seeds anomaly baselines via `describeAnomaly` (`:265`) — ratios vs. the historical mean drive good/warning/danger tones.
- **Snapshot (capture):** `capture_admin_observability_snapshot` collects `pg_database_size`, `pg_stat_database` counters, per-bucket + per-day storage bytes from `storage.objects`, design/quote activity counts from `public.activity_log`, attachment-hygiene metrics (orphan originals, orphan derivatives, missing preview variants), top-8 tables, dead-tuple tables, and top `pg_stat_statements` rows — then upserts on `(team_id, captured_for_date)` (`admin-observability.sql:608`). Day boundaries are computed in `Europe/Kiev` (`:78`).
- **Backup runs (read):** `backup_runs` filtered to `section in ('storage','database')` ordered by `finished_at` (`AdminObservabilityPage.tsx:415`). `buildBackupHealth` (`:223`) grades by latest-run status + age of last success: ≤8 days good, ≤16 warning, else danger; a failed latest run = danger.
- **Backup runs (write):** `scripts/report-backup-run.mjs` inserts with the service-role key, driven by `BACKUP_RUN_*` env vars from the ops backup scripts (`scripts/backup-*.sh`). No RPC — direct insert.
- **Attachment audit (read):** the Attachments tab lazily calls the `get_admin_attachment_audit` RPC (`AdminObservabilityPage.tsx:467`), which diffs `storage.objects` under `teams/<team>/…` against files referenced by `quote_attachments` + design metadata in `activity_log`; unreferenced originals are returned as orphan rows with entity resolution + a delete/needs-review/unknown classification. Row actions (open/download/delete) go through `attachmentPreview.ts` helpers.
- **Runtime errors (write only):** `logRuntimeError` (`runtimeErrorLogger.ts:30`) inserts into `tosho.runtime_errors` from global boundary/`window_error`/`unhandledrejection` handlers wired in `App.tsx:299`.

## Permissions & access

Owner/admin gate is defense-in-depth: the route (`App.tsx:1076`), the snapshot RLS `SELECT` policy checking `memberships_view` for `owner`/`admin` (`admin-observability.sql:57`), and an explicit role check that raises inside both RPCs (`:118`, `:677`). RPCs are SECURITY DEFINER so they can read `storage`, `pg_stat_*`, and cross-schema tables the caller can't; both resolve `effective_team_id` from `team_members`. The standalone `admin-attachment-audit.ts` Netlify function is stricter still — owner-only (`admin-attachment-audit.ts:156`).

## Gotchas / conservative zones

- **Statement-timeout ceiling (critical):** both RPCs carry `SET statement_timeout = '60s'` (`admin-observability.sql:72`, `:656`), but that is **decorative** — the real limit is the ROLE timeout (`authenticated` = 8s). A function's own `SET` does **not** re-arm the already-running top-level statement timer (proven by probe, commit 5df6958). Any change to these RPCs must fit ~8s, not 60s. See [[project_statement_timeout_gotchas]].
- **De-quadratified anti-join — do not "simplify" back:** the missing-preview-variant check uses two separate single-expression `NOT EXISTS` subqueries (`admin-observability.sql:412`) so the planner picks a hash anti join. The prior `ao.name in (expr1, expr2)` form forced a nested loop (~15M `regexp_replace` evals, 67s) that grew quadratically with file count and blew the role timeout the week the marketing gallery shipped more preview variants. The Ukrainian comment at `:400` documents this; capture dropped to ~3.35s after the rewrite.
- **Snapshot is the source of truth for the page**, not live queries — keep new metrics inside the capture RPC / snapshot columns rather than adding broad live queries to the page (`CODEX_WORKFLOWS.md` §12).

## Known issues / uncertainty

- **`runtime_errors` is captured but NOT surfaced here.** Despite being listed as an observability table, the page never reads it — it is written by the frontend logger and consumed only by the ToSho AI assistant for diagnostics (`netlify/functions/tosho-ai.ts:705`, `:3806`, `:6069`, `:7548`). Treat it as a sibling ops sink, not a dashboard feature.
- **`netlify/functions/admin-attachment-audit.ts` appears unwired from the current UI.** The Attachments tab uses the `get_admin_attachment_audit` RPC; nothing in `src/` calls this function (grep-verified). It is a parallel service-role implementation of the same orphan audit (owner-only) — likely legacy or an alternate entry point. Confirm before relying on or deleting it.
- **`backup_runs` and `runtime_errors` table DDL is not in `scripts/*.sql`** (only `admin_observability_snapshots` is). Their columns are inferred from the writers/readers (`report-backup-run.mjs`, `AdminObservabilityPage.tsx`, `runtimeErrorLogger.ts`); the authoritative schema lives only in the live DB. Verify against prod before schema changes.

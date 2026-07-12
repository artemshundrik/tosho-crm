# Design Workflow

> Track design tasks (візуалізації, верстки, правки) from brief through approval, with per-правка timers and output files that feed quotes/orders.

## At a glance

- **Routes:** `/design` → `DesignPage` (kanban / timeline / assignee views) · `/design/:id` → `DesignTaskPage` (detail). Neither route is wrapped in `ModuleRouteGate` in `App.tsx:970-985` (unlike contractors) — access relies on nav `moduleKey: "design"` gating + RLS. See Gotchas.
- **Key files:** `src/pages/DesignPage.tsx` (~7,050 lines), `src/pages/DesignTaskPage.tsx` (~11,981), and `src/lib/` helpers: `designTaskType.ts` (type source of truth), `designTaskStatus.ts`, `designTaskNumber.ts`, `designTaskTimer.ts`, `designTaskActivity.ts`, `designTaskCollaborators.ts`, `designTaskOutputSync.ts`, `designTaskMetadata.ts`, `designWorkload.ts`.
- **Main "tables":** design tasks are **`activity_log` rows** (`action='design_task'`, `entity_type='design_task'`) — **NOT** a `design_tasks` table. Separate real tables: `design_task_timer_sessions`, counter `design_task_number_counters` (via RPC `next_design_task_number`). All three live in the **`public` schema** (default client), not `tosho`.
- **Access / permissions:** `src/lib/permissions.ts` — `isDesigner`, `canManageAssignments`, `canManageDesignStatuses`, `canEditDesignBriefChangeRequests`, `canSelfAssignDesign`. Nav module key `design` (`AppLayout.tsx:452`).
- **Workflow:** `CODEX_WORKFLOWS.md` §4 "Design Task Workflow Change".
- **Related:** [quotes.md](quotes.md) (`metadata.quote_id` linkage), [orders-production.md](orders-production.md) (`orderRecords.ts` merges approved design assets).

## Overview

A design task is one `activity_log` row whose `metadata` JSONB carries the whole entity: `quote_id`, `status`, `design_task_number`, `design_task_type`, `assignee_user_id`, `collaborator_user_ids/labels/avatar_urls`, `design_brief`, `design_brief_versions`, `design_brief_change_requests`, `design_output_files`, `estimate_minutes`, display fields (`quote_number`, `customer_name`, `customer_logo_url`). History/side-effects are additional `activity_log` actions (`design_task_status`, `design_task_assignment`, `design_output_upload`, `design_task_brief_change_request`, …) written via `logDesignTaskActivity` (`designTaskActivity.ts:31`). Ownership is **1 primary assignee + optional collaborators**, never equal multi-assignee.

**Statuses** (`designTaskStatus.ts`): `new → in_progress → pm_review → client_review → approved`, with `changes` (правки) and `cancelled`. Transition rights differ for designers vs managers (`getAllowedDesignStatusTransitions`, `designTaskStatus.ts:59`).

## Data flow

- **List:** `DesignPage.tsx:529` queries `activity_log` filtered by `action='design_task'` + `metadata->>manager_user_id`, ordered `created_at desc`, paginated by `range`. Kanban columns keyed by status (`DESIGN_COLUMNS`).
- **Numbering:** `getNextDesignTaskNumber` (`designTaskNumber.ts:39`) calls RPC `next_design_task_number`; on missing-function it falls back to a month-scoped `count(*)`. Format `TS-MMYY-####`.
- **Timer:** `design_task_timer_sessions` (`started_at`/`paused_at`, optional `change_request_id`). One active (unpaused) session per task enforced in `startDesignTaskTimer` (`designTaskTimer.ts:344`). `getDesignTaskTimerBreakdown` splits general (ТЗ, null CR) vs per-правка seconds.
- **правка ↔ візуал:** `design_brief_change_requests` (правки) live in metadata; each output file/link carries a `change_request_id` backlink. `DesignTaskPage` groups outputs by CR and offers cross-tab jump (`jumpToOutput` / `jumpToChangeRequest`, ~1694-1707). **Newest правка = the "active round"**: the general Start button auto-attributes to `newestChangeRequestId` (`DesignTaskPage.tsx:4996`); non-privileged authors may only edit/delete that newest правка (`:1655`).
- **Outputs → downstream:** `syncDesignOutputFilesToQuoteAttachments` (`designTaskOutputSync.ts:96`) copies output files into `tosho.quote_attachments` (dedup by bucket:path); `orderRecords.ts` folds approved design assets into production records.

## Permissions & access

Team-scoped RLS on `activity_log` + `design_task_timer_sessions`. Edit gating combines role predicates (`permissions.ts`) with per-task identity: `ensureCanEdit` allows the assignee, collaborators (`isCollaboratorOnTask`), or managers (`canManageAssignments`). Designers can self-assign and drive `new/changes → in_progress → pm_review` only; full status control needs `canManageDesignStatuses`. Brief change-requests editable by super-admin/admin/SEO (`canEditDesignBriefChangeRequests`).

## Gotchas / conservative zones

- **`activity_log` is `public`, not `tosho`.** Design libs use the default client (no `.schema("tosho")`); only quote-side writes switch schema (`designTaskOutputSync.ts:106`). Timer table too (see SQL comment in `design-task-timer-change-request.sql`).
- **Cache poisons writes if metadata is stripped.** Both pages keep a sessionStorage copy; `sanitizeDesignTaskMetadataForCache` (`DesignTaskPage.tsx:793`) now caches **full** metadata precisely because stripping made `metadata: { ...task.metadata, ...patch }` writes wipe `design_brief`/`design_output_files` during the cache-hit window. Before composing an update, re-read live metadata via `fetchDesignTaskMetadata` (`designTaskMetadata.ts:14`).
- **Ghost output files.** `recoverDesignOutputFilesFromHistory` (`designTaskOutputSync.ts:143`) rebuilds `design_output_files` from `design_output_upload` history and HEAD-verifies each signed URL, because `createSignedUrl` can report "ok" mid-delete. Residual ghosts are swept by `scripts/cleanup-design-output-ghost-files.sql`.
- **Giant files** — navigate via `docs/LARGE_FILES_MAP.md` offsets, not top-to-bottom reads.

## Known issues (see `docs/AUDIT-2026-07-11.md`)

- **Frontend P1 (#7):** `DesignTaskPage` (128 `useState`, ~12k lines) and `DesignPage` (86) are god-components with no memo boundaries → whole-tree re-render storms; decompose along state clusters + add `React.memo`.
- **P2 (duplication):** the `DesignTask` type + cache sanitizers are duplicated across `DesignPage.tsx` (~103/669/681) and `DesignTaskPage.tsx` (~189/793/805) — two drifting copies of a "poisons writes" correctness trap; extract to `src/lib/designTaskCache.ts`.
- **Route not module-gated:** unlike `contractors`, `/design` + `/design/:id` have no `ModuleRouteGate`; direct navigation is bounded only by RLS + nav hiding — worth confirming whether that is intentional.

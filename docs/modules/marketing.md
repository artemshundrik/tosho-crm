# Marketing

> Gallery of design **visuals** (промо-візуали) for the marketing/photo team to triage: tag, checklist, status for shooting, favourite, hide.

## At a glance

- **Route:** `/marketing` → `MarketingPage` (`src/pages/MarketingPage.tsx`, ~1,681 lines). Lazy (`src/App.tsx:80`), preloaded as `heavy` (`src/routes/routePreload.ts:29`).
- **Feature dir:** none — the whole module is one page file (no `src/features/marketing/`).
- **Key files:** `src/pages/MarketingPage.tsx` (all logic + UI), `src/lib/designTaskOutputSync.ts` (`parseStoredDesignOutputFiles`, `StoredDesignOutputKind`), `scripts/marketing-schema.sql` (table + RLS). Reuses `attachmentPreview.ts` (signed URLs), `customerLogo.ts`, `workspaceMemberDirectory.ts`, `StorageObjectImage`/`StackHoverPreview`/`avatar-kit`.
- **Main table (`tosho`):** `marketing_visuals` — **overlay state only**. The visuals themselves are NOT stored here; they are derived from design-task `activity_log` metadata (see Data flow).
- **Access / permissions:** module key `"marketing"`; default ON for owner / SEO / marketer (`workspaceMemberDirectory.ts:210` `hasDefaultMarketingAccess`), default OFF otherwise (`DEFAULT_MODULE_ACCESS.marketing = false`, `:152`). Route wrapped in `ModuleRouteGate moduleKey="marketing"` (`App.tsx:1034`).
- **Related:** [design.md](design.md) (visuals originate as design-task outputs), [quotes.md](quotes.md) (each card deep-links to `/orders/estimates/:quoteId`), [customers.md](customers.md).

## Overview

Marketing is a read-mostly **gallery**. Designers upload output files to design tasks; the "visualization"-kind images surface here automatically as a masonry feed. Marketers (owner/SEO/marketer by default) triage each visual — set a shooting status, add tags, fill a photographer checklist, favourite, or hide it — without touching the underlying design task. The intent (page header, `MarketingPage.tsx:1069`) is "which visuals to shoot at production and use in promo".

Near-identical visuals from one design task collapse into a single **stack** card (`VisualGroup`, `groupVisuals` `:603`); one design task = one card, never raw files. Opening the detail dialog cycles that task's siblings via arrows/filmstrip.

## Data flow

- **Load** (`loadGallery` `MarketingPage.tsx:348`) — two paginated (1000/page) client-side fetches:
  1. `activity_log` rows `action='design_task'` with `metadata->design_output_files` not null (`:359`) — the **source of the images**.
  2. `tosho.marketing_visuals` overlay rows (`:377`).
  Files are parsed via `parseStoredDesignOutputFiles` and flattened to one `GalleryVisual` per file (`:408`). Customer/lead contact + logo batched from `tosho.customers` / `tosho.leads` in chunks of 150 (`:461`, `:480`). Member labels/avatars from `listWorkspaceMembersForDisplay`.
- **SOURCE OF TRUTH:** the visual (image, filename, brief, designer, quote link) is **derived from design-task activity metadata**, not from `marketing_visuals`. `marketing_visuals` stores ONLY marketer-owned overlay state: `status`, `tags`, `checklist`, `notes`, `is_favorite`, `is_hidden`, keyed by `(team_id, design_task_id, output_file_id)`.
- **Gallery is visuals-only** — a visual is shown when `outputKind === 'visualization'`, or `null` + previewable (`visualizationVisuals` `:567`); design **layouts** are excluded.
- **Write** (`persistRecord` `:716`) — optimistic local `setRecords`, then `upsert(..., { onConflict: "team_id,design_task_id,output_file_id" })`. Errors only toast; no read-back.
- **Refresh:** no manual button — silent refetch on window focus / tab visibility, throttled to 30s, no polling (`:523`).
- **"Нове" is date-derived**, not a stored badge: an untriaged visual reads `new` only for its first 2 days (`NEW_STATUS_WINDOW_MS` `:280`, `resolveDisplayStatus` `:287`); a real status always wins.

## Permissions & access

Module visibility is **frontend-gated** by `ModuleRouteGate` + the member directory's `moduleAccess.marketing` flag (default owner/SEO/marketer). **RLS on `tosho.marketing_visuals` gates on team membership only** — `public.is_team_member(team_id)` for select/insert/update/delete (`scripts/marketing-schema.sql:45-102`); anon is revoked (`:43`). So the DB does **not** enforce the "marketing" module role — any authenticated team member could read/write overlay rows via the API; the owner/SEO/marketer restriction is UI-only. No Netlify function is involved (direct anon-key + RLS client).

## Gotchas / conservative zones

- **`marketing_visuals` is overlay-only.** Never treat it as the visual catalog — the images live in design-task `activity_log` metadata. Deleting/editing here does not touch the design task, and vice-versa.
- **Everything the feed counts is per-stack** (distinct `design_task_id`), not per file — tags/hidden/favourite counts dedupe by task (`:657`, `:683`, `:691`).
- **Whole-team client-side load:** `loadGallery` pulls *all* design-task output rows + *all* overlay rows for the team, then filters/groups in memory. Fine now; watch as visuals grow (no server-side pagination/filtering).
- Depends on design-task metadata shape (`design_output_files`, `customer_id/type/name`, `quote_id/number`, `design_brief`, `assignee_user_id`, `design_task_type`) — changing the design output contract can silently empty this gallery.

## Known issues

- **Docs gap:** `tosho.marketing_visuals` is **not yet in `docs/DB_MAP.md`** (0 hits) — add it under the tosho-schema table list.
- Not referenced in `docs/AUDIT-2026-07-11.md`; the RLS-vs-module-access mismatch above (module role enforced only in UI) is worth a security note if overlay rows ever hold sensitive data.

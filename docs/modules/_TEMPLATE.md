# <Module Name>

> One-line purpose of this module.

## At a glance

- **Routes:** `/path` → `PageComponent` (`src/pages/…`)
- **Feature dir:** `src/features/…` (if any)
- **Key files:** page(s), hooks, `src/lib/…` helpers, `netlify/functions/…`
- **Main tables:** `tosho.…` (schema), with the source-of-truth note if pricing/status/derived
- **Access / permissions:** module key, roles that see it, `permissions.ts` predicates, RLS notes
- **Workflow:** `CODEX_WORKFLOWS.md` §N
- **Related modules / docs:** links

## Overview

What the module does, who uses it, how it fits the product. A few short paragraphs.

## Data flow

How data is loaded and written. Name the API helpers (`toshoApi.ts`), derived-record
assembly, caches. Call out the source of truth if the UI shows derived/snapshot values.

## Permissions & access

Which roles can view/edit; where gating is enforced (RLS + frontend). Any privileged
Netlify-function writes.

## Gotchas / conservative zones

Known traps, non-obvious contracts, things not to change casually.

## Known issues

Link to relevant `docs/AUDIT-2026-07-11.md` findings and any open items.

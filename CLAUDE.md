# CLAUDE.md

Claude Code uses the same project guidance as Codex. **Read [AGENTS.md](AGENTS.md) first** — it lists required reading, trust order, working rules, and the route/module checklist.

## Canonical docs (in trust order)

1. [AGENTS.md](AGENTS.md)
2. [docs/CODEX_PROJECT_GUIDE.md](docs/CODEX_PROJECT_GUIDE.md) — project snapshot, directory map, navigation surfaces, canonical product areas
3. [docs/DB_MAP.md](docs/DB_MAP.md) — schema/roles/storage/cross-table behavior
4. [docs/CODEX_WORKFLOWS.md](docs/CODEX_WORKFLOWS.md) — implementation + verification patterns per task type
5. Current tracked code in `src`, `netlify/functions`, `scripts`, `ops`, `netlify.toml`
6. Tracked SQL in `scripts/*.sql`
7. Ops/handoff docs (`docs/BACKUP.md`, `docs/SERVICES_ACCESS_REGISTRY.md`, etc.)
8. Local machine state for machine-specific tasks

If older docs conflict with current code, current code wins.

## Claude Code-specific notes

- Dev server: launch via `preview_start` (name `dev`, port 5173). For tasks involving Netlify Functions or `/.netlify/functions/*`, use `npx netlify dev` on `http://localhost:8888` instead — see [docs/CODEX_WORKFLOWS.md](docs/CODEX_WORKFLOWS.md) §0.
- Verification: `npx tsc --noEmit` for types, `npm run lint` for lint, `npm run build` for full type+build.
- Tosho schema, not `public`, unless code explicitly says otherwise.
- Quote details route is UUID-based: `/orders/estimates/:id` (NOT quote number like `TS-0326-XXXX`).

## Large files navigation

`src/pages/QuoteDetailsPage.tsx` (~9560 lines), `DesignTaskPage.tsx` (~9786), `QuotesPage.tsx` (~7990), `DesignPage.tsx` (~6348) — `Read` paginates at 2000 lines. Jump directly using offsets in [docs/LARGE_FILES_MAP.md](docs/LARGE_FILES_MAP.md) instead of re-scanning from line 1.

## Skills to invoke for this repo

Most skills auto-trigger from request wording. These two are easy to miss and matter here:

- **`/security-review`** — run before declaring done on any change that touches auth, RLS, Netlify Functions, privileged Supabase writes, attachment ACLs, or admin observability. This repo has plenty of those surfaces.
- **`/review`** — run before opening a PR with multi-file changes or any quote/order/design-workflow logic. Independent second opinion catches the cross-file regressions our giant pages tend to hide.

UI work auto-triggers `ui-ux-pro-max`; backend/Supabase work auto-triggers `anthropic-skills:server` — no need to invoke manually.

## What NOT to repeat

The Codex docs already cover: directory map, canonical helpers (avatars/logos/permissions/orders), route/module checklist, schema conventions, conservative-change zones, performance review dimension, SQL migration policy. Don't duplicate them here — link instead and update the source.

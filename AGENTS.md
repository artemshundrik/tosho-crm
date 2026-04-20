# AGENTS.md

This repository has project-specific Codex guidance. Start here before broad exploration.

## Required Read Order

1. Read [docs/CODEX_PROJECT_GUIDE.md](/Users/artem/Projects/tosho-crm/docs/CODEX_PROJECT_GUIDE.md).
2. If the task touches schema, roles, storage, observability, or cross-table behavior, read [docs/DB_MAP.md](/Users/artem/Projects/tosho-crm/docs/DB_MAP.md).
3. For implementation and verification patterns, read [docs/CODEX_WORKFLOWS.md](/Users/artem/Projects/tosho-crm/docs/CODEX_WORKFLOWS.md).

## Trust Order

When sources disagree, use this order:

1. `AGENTS.md`
2. `docs/CODEX_PROJECT_GUIDE.md`, `docs/DB_MAP.md`, `docs/CODEX_WORKFLOWS.md`
3. current tracked code in `src`, `netlify/functions`, `scripts`, `ops`, `netlify.toml`
4. tracked SQL scripts in `scripts/*.sql`
5. operational or handoff docs such as `docs/BACKUP.md`, `docs/SERVICES_ACCESS_REGISTRY.md`, `docs/DIRECTOR_ACCESS_HANDOFF.md`, `docs/HANDOFF_SIMPLE_TEMPLATE_UA.md`, `docs/ONEPASSWORD_FILL_CHECKLIST.md`
6. local machine state for machine-specific tasks such as backup automation, launchd jobs, or local env files

## Working Rules For This Repo

- Do not start with broad repo-wide search if the task clearly belongs to a known domain. Use the canonical entrypoints in `docs/CODEX_PROJECT_GUIDE.md` first.
- Reuse existing workspace, permission, notification, attachment, and order-derivation helpers before introducing new patterns.
- For teammate avatars, reuse the canonical chain: `src/lib/workspaceMemberDirectory.ts` + `src/lib/avatarUrl.ts` + `src/components/app/avatar-kit.tsx`. Do not ship ad hoc avatar lookups or raw storage-path rendering when an existing helper already resolves/caches the reference.
- For customer/lead/company logos, reuse `src/lib/customerLogo.ts`, normalized `customer_logo_url` fields, and `EntityAvatar`. Do not introduce one-off logo fallback logic in pages when a shared normalized source already exists.
- Treat `tosho` as the main app schema unless code explicitly uses `public` for an integration table or helper function.
- Design tasks are primarily `activity_log`-backed entities with metadata, not a simple `design_tasks` table. Confirm this model before changing design flows.
- Orders/production screens use derived records assembled in `src/features/orders/orderRecords.ts`; do not assume `tosho.orders` alone explains the UI.
- For user-initiated server actions, prefer the established pattern: user-scoped auth/RLS check first, privileged write second.
- Be conservative around permissions, route/module access, quote workflow state, design-task metadata contracts, attachment deletion, and admin observability queries.
- Treat performance as a required review dimension for every change. Reuse caches/directories before adding queries, avoid N+1 lookups or broad unbounded reads, and sanity-check whether the first render now does more work than before.
- Treat backup/ops automation as a partially legacy zone. Verify actual tracked files and local machine state before relying on old doc snippets.

## New Route Or Module Checklist

If a task adds or changes a top-level route or module, check these surfaces:

- `src/App.tsx`
- `src/routes/routePreload.ts`
- `src/layout/AppLayout.tsx`
- `src/components/app/CommandPalette.tsx`
- `src/components/app/TabBar.tsx` for mobile top-level sections
- `src/lib/workspaceMemberDirectory.ts` and `src/pages/TeamMembersPage.tsx` if module access is involved

## If The Task Is Ambiguous

Use this order:

1. project guide
2. domain files
3. DB map
4. workflow guide
5. only then broader search

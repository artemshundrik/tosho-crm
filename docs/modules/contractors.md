# Contractors & Suppliers

> A team-scoped address book of external subcontractors (підрядники) and suppliers (постачальники), with per-record reminders. **Not to be confused with `contract_revisions`** — see the note below.

## At a glance

- **Routes:** `/contractors` → `ContractorsPage` (`src/pages/ContractorsPage.tsx`, single page, ~957 lines). Registered `src/App.tsx:987` under the **operations** nav group (`src/App.tsx:257`), gated by `ModuleRouteGate moduleKey="contractors"`.
- **Feature dir:** none for the directory itself. `src/features/contractRevisions/` is a **separate** feature (order contracts, see below).
- **Key files:** `src/pages/ContractorsPage.tsx` (list + tabs + CRUD sheet), `netlify/functions/contractor-reminders.ts` (reminder cron), `src/lib/reminderDateTime.ts` (`buildReminderAtIso` etc.), `scripts/contractors-schema.sql`, `scripts/contractors-seed-from-xlsx.sql`.
- **Main tables (`tosho`):** `contractors` (this module). `contract_revisions` is a related-but-distinct table — see below.
- **Access / permissions:** module key `contractors`; **default off** (`workspaceMemberDirectory.ts:147`), force-on for `owner` (`TeamMembersPage.tsx:391`) and visible to super-admins in nav (`AppLayout.tsx:774`). RLS `public.is_team_member(team_id)` on all four policies (`contractors-schema.sql:56-113`).
- **Workflow:** no dedicated `CODEX_WORKFLOWS.md` section; standard table-page CRUD.
- **Related:** [orders-production.md](orders-production.md) (where `contract_revisions` actually lives), [notifications.md](notifications.md) (reminder delivery). Reminder timing convention: [[project_datetime_conventions]] / [[project_reminders_pg_cron]].

## Overview

`ContractorsPage` is a single-page directory. One table (`tosho.contractors`) backs both tabs — the `kind` column (`'contractor' | 'supplier'`, check-constrained at `contractors-schema.sql:37-39`) splits **Підрядники** from **Постачальники** (`ContractorsPage.tsx:293-342`). Each record holds free-text `services`, `contact_name`, `phone`, `address`, `delivery_info` (Нова Пошта), `notes`, plus an optional `reminder_at` + `reminder_comment`. Editing happens in a right-side `Sheet` (`ContractorsPage.tsx:801-939`).

**Distinct feature under a confusingly similar name:** `src/features/contractRevisions/` + table `tosho.contract_revisions` are **not** part of this directory. They implement per-**order** versioned legal contracts (договір) with a `draft → pending_ceo → approved → rejected → sent` state machine (`contractRevisions.ts:16`, `contract-revisions-schema.sql`), rendered inside `OrdersProductionDetailsPage` via `ContractRevisionsPanel` — never on `/contractors`. They belong to orders/production; documented here only because the tables share a prefix.

## Data flow

- **Load:** `ContractorsPage.tsx:260-266` reads the whole team's rows in one query (`.eq("team_id", teamId)`, ordered by name, **no pagination**), then filters `kind`/search/service **client-side** (`:306-331`). Fine for a small directory; would need paging if it grows.
- **Write:** `handleSave` upserts directly via `supabase.schema("tosho").from("contractors")` (`:493-511`); `handleDelete` hard-deletes (`:529-534`). No `toshoApi.ts` helper — direct client calls, both scoped by `team_id`.
- **Graceful degrade:** if the table is missing, the load catch sets `schemaMissing` and prompts to apply `scripts/contractors-schema.sql` (`:272-278`, `:565-574`).
- **Reminders:** `reminder_at` is a **true UTC instant** built by `buildReminderAtIso(date, time)` (local wall-clock → `toISOString()`, `reminderDateTime.ts:5-14`) — unlike floating-wall-clock deadlines, see [[project_datetime_conventions]]. `netlify/functions/contractor-reminders.ts` (schedule `* * * * *`, `:85-87`) scans due reminders within a 30-day lookback (`:113-121`), dedups against existing `/contractors%` notifications by `reminder:` href key (45-day window, `:70-77`, `:178-186`), and fans out to every deliverable team member (excludes `inactive`/`rejected`, `:79-83`). In practice the live trigger is Supabase pg_cron, not Netlify's dead scheduler — [[project_reminders_pg_cron]].

## Permissions & access

Team-scoped RLS via `public.is_team_member(team_id)` on select/insert/update/delete (`contractors-schema.sql:62-112`), with a `using(true)` fallback if that helper is absent (schema-portability, not intended for prod). Module visibility is gated by the `contractors` access key, off by default and force-granted to owners. `contract_revisions` RLS is deliberately **broad** (team-level) — allowed status transitions are enforced in application code via `.in("status", [...])` / `.eq("status", ...)` guards on each update (`contractRevisions.ts:168,189,215,240`).

## Gotchas / conservative zones

- **`contractors` ≠ `contract_revisions`.** Different tables, different UIs, different modules. Don't wire one into the other.
- **xlsx-import artifacts.** `normalizeScientificNumber` (`ContractorsPage.tsx:127-137`) repairs phone numbers pasted as scientific notation, and `normalizeFormFromRow` (`:149-180`) swaps `contact_name`/`phone` when they look transposed — legacy seed cleanup from `contractors-seed-from-xlsx.sql`. Preserve these when refactoring the form.
- **`renderLinkedLines`** (`:197-223`) auto-links emails/URLs across multi-line fields; keep `rel="noreferrer"` on external links.
- **Whole-team fetch, client filter** — no server-side pagination; revisit if a team accumulates hundreds of rows.

## Known issues (see `docs/AUDIT-2026-07-11.md`)

- **Security (open):** `contractor-reminders.ts` is one of the six cron functions with **no shared-secret gate** (AUDIT §Security #1, lines 53-59). It runs on the service-role key and checks no secret, so anyone can POST it in a loop to drive notification spam (in-app + Telegram + push). Fix needs both a secret-header check **and** the pg_cron `net.http_post` call updated to send it (`scripts/reminders-cron.sql`) — coordinate both sides. Also tracked in [[project_function_authz_audit]].
- **Docs gap:** neither `contractors` nor `contract_revisions` appears in `docs/DB_MAP.md` (verified absent) — schema/roles for these tables live only in `scripts/*.sql`.

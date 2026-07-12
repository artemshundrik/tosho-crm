# Module Reference — tosho-crm

Per-module documentation, one file per screen/module under `docs/modules/`. This is the
**depth** layer: `docs/CODEX_PROJECT_GUIDE.md` gives the terse canonical summary of each
product area; the files here give one page's routes, key files, data model, permissions,
gotchas, and known issues in a single place. Every module doc follows `docs/modules/_TEMPLATE.md`.

**Trust order unchanged:** `AGENTS.md` → `CODEX_PROJECT_GUIDE.md` / `DB_MAP.md` /
`CODEX_WORKFLOWS.md` / `SECURITY.md` → current code. These module docs sit alongside the
canonical guide, not above it. If a module doc disagrees with code, code wins — fix the doc.

## Modules

| Module | Route(s) | Page / feature | Doc | Status |
|---|---|---|---|---|
| Overview & Activity | `/overview`, `/activity` | OverviewPage, ActivityPage | [overview.md](modules/overview.md) | ✅ |
| Notifications | `/notifications` | NotificationsPage | [notifications.md](modules/notifications.md) | ✅ |
| Quotes & Estimates | `/orders/estimates`, `/orders/estimates/:id` | QuotesPage, QuoteDetailsPage | [quotes.md](modules/quotes.md) | ✅ |
| Customers & Leads | `/orders/customers` | OrdersCustomersPage | [customers.md](modules/customers.md) | ✅ |
| Design Workflow | `/design`, `/design/:id` | DesignPage, DesignTaskPage | [design.md](modules/design.md) | ✅ |
| Orders / Production | `/orders/production`, `/orders/production/:id`, `/orders/ready-to-ship` | OrdersProduction* | [orders-production.md](modules/orders-production.md) | ✅ |
| Logistics | `/logistics` | LogisticsPage (stub) + quote/order/customer delivery UI | [logistics.md](modules/logistics.md) | ✅ |
| Catalog | `/catalog/products` | features/catalog | [catalog.md](modules/catalog.md) | ✅ |
| Contractors | `/contractors` | ContractorsPage | [contractors.md](modules/contractors.md) | ✅ |
| Sample Stock | `/stock/samples` | SampleStockPage | [sample-stock.md](modules/sample-stock.md) | ✅ |
| Finances | `/finances` | FinancesPage, features/finances | [finances.md](modules/finances.md) | ✅ |
| Marketing | `/marketing` | MarketingPage | [marketing.md](modules/marketing.md) | ✅ |
| Team / HR | `/team`, `/settings/members` | TeamPage, TeamMembersPage | [team-hr.md](modules/team-hr.md) | ✅ |
| Profile | `/profile` | ProfilePage | [profile.md](modules/profile.md) | ✅ |
| Admin Observability | `/admin/observability` | AdminObservabilityPage | [admin-observability.md](modules/admin-observability.md) | ✅ |
| ToSho AI | (drawer, no route) | netlify/functions/tosho-ai | [tosho-ai.md](modules/tosho-ai.md) | ✅ |
| Auth & Onboarding | `/login`, `/invite`, `/reset-password`, `/update-password` | LoginPage (inline), InvitePage, … | [auth.md](modules/auth.md) | ✅ |
| Вчасно (integration) | — (inside Finances) | netlify/functions/vchasno-upload | [vchasno.md](modules/vchasno.md) | ✅ |

## Cross-cutting concerns (not a single screen)

These span every module — documented once, linked from the module docs:

| Concern | Where it lives today |
|---|---|
| Permissions / module access | `src/lib/permissions.ts`, `workspaceMemberDirectory.ts`; guide §"Frontend Auth And Permissions" |
| Avatars & logos | `avatar-kit.tsx` + `workspaceMemberDirectory.ts` + `avatarUrl.ts`; `customerLogo.ts` — see [[feedback_avatars_canonical]] |
| Notifications delivery | in-app + Telegram + web push; guide §Notifications, `docs/TELEGRAM_NOTIFICATIONS_DESIGN.md` |
| Attachments & storage | guide §"Attachments And Storage"; `docs/SECURITY.md` (bucket ACLs) |
| Datetime conventions | deadlines = floating wall-clock, reminder_at = UTC, team events = Europe/Kiev |
| Pricing source of truth | `quote_item_runs` via `computeRunSalePricing`; `quotes.total`/`unit_price` are stale snapshots |
| Cron / reminders | Supabase pg_cron (not Netlify scheduler); `docs/` reminders + `scripts/reminders-cron.sql` |

## Canonical docs (start here, always)

- [AGENTS.md](../AGENTS.md) — required read order, trust order, working rules, **Fix/Feature task workflows**
- [CODEX_PROJECT_GUIDE.md](CODEX_PROJECT_GUIDE.md) — project snapshot, directory map, canonical product areas
- [DB_MAP.md](DB_MAP.md) — schema, roles, storage, cross-table behavior
- [CODEX_WORKFLOWS.md](CODEX_WORKFLOWS.md) — implementation + verification patterns per task type
- [SECURITY.md](SECURITY.md) — RLS/functions/auth/secrets baseline + role-simulation verification
- [AUDIT-2026-07-11.md](AUDIT-2026-07-11.md) — current known issues (P0 fixed; P1/P2 backlog)
- [LARGE_FILES_MAP.md](LARGE_FILES_MAP.md) — offsets for the giant page files

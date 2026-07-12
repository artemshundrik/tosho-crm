# Orders / Production

> Turn approved quotes into trackable production orders (documents, statuses, readiness) and manage their lifecycle to shipment.

## At a glance

- **Routes:** `/orders/production` → `OrdersProductionPage` (registry/kanban) · `/orders/production/:id` → `OrdersProductionDetailsRoutePage` (thin auth guard, `src/pages/OrdersProductionDetailsRoutePage.tsx:6`) → `OrdersProductionDetailsPage` (detail) · `/orders/ready-to-ship` → `OrdersReadyToShipPage` — **static stub, 10 lines, no data yet** (`src/pages/OrdersReadyToShipPage.tsx`).
- **Feature dir:** `src/features/orders/` — `orderRecords.ts` (derivation + all writes), `config.ts` (static option lists: payment methods, incoterms, status sections, readiness columns, `ORDER_DOCUMENT_EXECUTOR`).
- **Key files:** `OrdersProductionPage.tsx` (~1,229 lines), `OrdersProductionDetailsPage.tsx` (~2,577), `src/features/orders/orderRecords.ts` (~1,634).
- **Main tables (`tosho`):** `orders`, `order_items` (schema `scripts/orders-schema.sql`; `orders.quote_id` is **UNIQUE** — one order per quote, `:7`). **But the UI is NOT these tables alone** — see Data flow.
- **Access / permissions:** nav `moduleKey: "orders"` (`src/layout/AppLayout.tsx:447-448`). RLS gated by `public.is_team_member(team_id)`.
- **Workflow:** `CODEX_WORKFLOWS.md` §5 "Orders / Production Change"; guide `CODEX_PROJECT_GUIDE.md` §"Production / Orders / Logistics" + §"Order Model".
- **Related:** [quotes.md](quotes.md) (approved quotes derive orders), [customers.md](customers.md) (customer/lead identity + reqs), finances (`src/features/finances/*` consumes `loadDerivedOrders`), logistics (delivery points).

## Overview

An "order" shown in production is a **derived record**, not a row read. `loadDerivedOrders(teamId, userId)` (`orderRecords.ts:988`) assembles `DerivedOrderRecord`s from two sources: **stored** orders (`tosho.orders`/`order_items`, `source:"stored"`) and **derived** records synthesized live from approved quotes that have not been materialized yet (`source:"derived"`, `loadApprovedQuoteDerivedOrders:581`). Managers work the registry as a readiness pipeline, fill counterparty/legal data, then create a real order + generate contract/specification docs on the detail page.

## Data flow

- **Assembly:** stored orders load first; for each stored order the linked quote, quote items, quote **runs**, customers/leads, catalog models, method names, and approved design assets are joined in. Approved-quote derived records are computed in parallel, then **deduped**: any derived record whose `quoteId` is already a stored order is dropped (`orderRecords.ts:1370-1373`). Result = `[...stored, ...pendingDerived]`.
- **Pricing — SOURCE OF TRUTH (same as quotes):** per-item qty/unitPrice/lineTotal are **recomputed from `quote_item_runs`** via `getRunUnitPrice`/`getRunLineTotal` (`:80-95`), overriding the stale `order_items`/`quote_items` snapshots. `orders.total` is a snapshot; the live total falls back to summed line totals. See [[project_quote_pricing_source]].
- **Design approval:** there is **no `design_tasks` table** — approved visual/layout assets come from `activity_log` rows `action='design_task'` metadata (`:601-608`, `:1028-1036`); drives `hasApprovedVisualization`/`hasApprovedLayout` and blockers.
- **Readiness:** derived records compute `readinessSteps`/`blockers`/`readinessColumn` (`counterparty`→`design`→`ready`) on the fly (`:888-912`); stored records read the persisted `readiness_*` columns.
- **Writes (client-side, anon key, RLS-enforced):** `createOrderFromApprovedQuote` (`:1397`, inserts order + items, refuses leads or any blocker), `updateOrderStatuses` (`:1526`), `updateOrderDocumentSettings` (`:1555`), `markOrderDocumentCreated` (`:1604`).
- **Detail page** loads the **entire** derived set and `.find(e => e.id === id)` — twice (`OrdersProductionDetailsPage.tsx:1201,1182`); it only ever resolves **stored** orders (derived records route to the quote instead — see Gotchas).

## Permissions & access

Module `"orders"` gates the nav entries. RLS is enabled in `scripts/access-lockout.sql:294-330` (NOT in `orders-schema.sql`): `orders`/`order_items` `select/insert/update/delete` all gated by `public.is_team_member(team_id)` (block-aware), and `anon` SELECT revoked. All order writes go through the browser's anon-key client, so these policies are the real enforcement (service-role Netlify functions bypass, but none write orders here).

## Gotchas / conservative zones

- **Derived ≠ stored.** A "pending" order in the list is a live projection of an approved quote; `openRecord` sends `source:"stored"` → `/orders/production/:id` but `source:"derived"` → `/orders/estimates/:quoteId` (`OrdersProductionPage.tsx:372-378`). The production **detail page never renders derived records.**
- **Schema-tolerant reads/writes.** `listStoredOrders`/`listStoredOrderItems` retry with a reduced column set and swallow missing-relation errors (`:528-579`, `isMissingOrdersColumnMessage`/`isMissingOrdersRelationMessage`) so the UI survives un-migrated DBs. Adding a column means updating both `baseColumns` and `extendedColumns`.
- **`orders.quote_id` UNIQUE + explicit pre-check** (`:1417-1434`) — creating an order is idempotent per quote.
- **List cache:** `sessionStorage` `orders-production-page-cache:${teamId}` (`OrdersProductionPage.tsx:394`) shows stale data before refresh.
- **Blockers are load-bearing:** order creation and doc readiness derive from `blockers`/`readinessSteps`; changing the readiness rules (`:888-912`) silently gates document generation.

## Known issues (see `docs/AUDIT-2026-07-11.md` #5–6)

- **Perf P1 — `loadDerivedOrders` is the app's hot path (~10 call sites) with no cache:** finances (`features/finances/api.ts:260`, `FinanceDashboard.tsx:70`, `FinanceMargin.tsx:74`), `CustomerLeadQuickViewDialog.tsx:515`, `CommandPalette.tsx:649` (rebuilds on debounced keystrokes), `OrdersProductionPage.tsx:391`, `OrdersProductionDetailsPage.tsx:1182,1201`, `OrdersCustomersPage.tsx:669,1475,1582`, plus `loadOrderCreationDraft`/`createOrderFromApprovedQuote` from `QuoteDetailsPage.tsx`.
  - **Double N+1:** one `getQuoteRuns` query per quote (`orderRecords.ts:650` and `:1027`). Fix: batch one `.in("quote_id", …)` like `listQuoteItemsForQuotes`.
  - **Unbounded:** `listStoredOrders` (`:528`) and approved `listQuotes` (`:582`) have no `.limit` — grow forever, always loaded whole.
  - **"Load everything to display one":** detail page builds the full dataset to `.find(id)`, twice.
- **Perf P1 — index #6:** confirm `quote_item_runs(quote_id)` exists, else the N+1 becomes N sequential scans.

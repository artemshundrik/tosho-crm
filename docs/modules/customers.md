# Customers & Leads

> The CRM party book — company records (замовники) and prospects (ліди), their contacts, logos, delivery points, and related quotes/orders/design history.

## At a glance

- **Routes:** `/orders/customers` → `OrdersCustomersPage` (`src/pages/OrdersCustomersPage.tsx`, ~4,208 lines). Registered in `src/App.tsx:906`; tab-switched between "customers" and "leads" in one page.
- **Feature dir:** none; components live in `src/components/customers/` (`CustomerDialog.tsx`, `LeadDialog.tsx`, `CustomerLeadQuickViewDialog.tsx`, `DeliveryPointsSection.tsx`, `NovaPoshtaControls.tsx`, `useCustomerEditor.ts`, `useCustomerLeadCreate.tsx`).
- **Key files:** `src/lib/customerLogo.ts` (logo ingest/normalize), `src/lib/customerDeliveryPoints.ts` (Логістика jsonb), `src/lib/customerLegalEntities.ts` (legal-entity jsonb), `src/lib/customerLtv.ts` (frontend-only LTV/RFM), `src/lib/companyNameSearch.ts` (Cyrillic-aware fuzzy match). API helpers in `src/lib/toshoApi.ts`: `listCustomersBySearch` (`:550`), `listLeadsBySearch` (`:656`), `listCustomerQuotes` (`:1933`).
- **Main tables (`tosho`):** `customers`, `leads`, `crm_contacts` (see Gotchas — not used by the frontend). Repeatable data (`contacts`, `legal_entities`, `delivery_points`) lives as **jsonb columns**, not child tables.
- **Access / permissions:** team-scoped RLS; quote-managers are further narrowed to their own rows in the page query (see Permissions).
- **Workflow:** `CODEX_WORKFLOWS.md` §6 "Customers / Leads Change".
- **Related:** [quotes.md](quotes.md) (`customer_id`/`customer_name` link), [orders-production.md](orders-production.md) (`loadDerivedOrders`), [logistics.md](logistics.md) (delivery points + Nova Poshta). Memory: [[project_customer_logistics]], [[project_customer_card_redesign]], [[project_nova_poshta_integration]].

## Overview

Two sibling entities backed by two tables. A **lead** (`leads.company_name`) is a prospect; a **customer** (`customers.name`) is a converted/active company. They share almost the same shape — `legal_name`, `manager`/`manager_user_id`, `payment_type`, `logo_url`, `legal_entities` jsonb, `delivery_points` jsonb, `reminder_at`/`event_at`, `notes` — but customers add multi-contact (`contacts` jsonb), accountant/signatory, IBAN, and Dropbox folder linkage (`dropbox_client_path`/`dropbox_shared_url`, `OrdersCustomersPage.tsx:239`). The page renders a searchable, infinite-scrolling table per tab; each row opens `CustomerDialog`/`LeadDialog` for edit and `CustomerLeadQuickViewDialog` for a read-only 360° view.

## Data flow

- **List:** `loadCustomers` (`OrdersCustomersPage.tsx:1813`) queries `customers` with `count: "exact"`, paginated by offset, `.order("name")`. Search uses `companyNameSearch.ts` variants (short-query prefix path vs. substring `.or(name/legal_name)`), with column-fallback for older schemas (`logo_url`/`manager` may be absent → `no_logo`/`base` variants). Leads mirror this.
- **Logo chain (canonical):** `customerLogo.ts` fetches a source URL/file, center-crops + re-encodes to 128px WebP, uploads to the `public-assets` bucket at `teams/{teamId}/customer-logos/{entityType}/{ownerKey}/...` (`:202`), and stores the public URL in `logo_url`. `normalizeCustomerLogoUrl` (`:24`) strips inline `data:` URIs and raw REST (`/rest/v1/`) URLs so they never reach the UI. Quotes read a pre-normalized `customer_logo_url` (`toshoApi.ts:542`). Rendering always goes through `EntityAvatar src={logo_url}` (e.g. `OrdersCustomersPage.tsx:3397`) — never a raw `<img>`.
- **Delivery points (Логістика tab):** `delivery_points` jsonb array parsed/serialized by `customerDeliveryPoints.ts` (snake_case on disk, camelCase in memory; single-default invariant via `ensureSingleDefault`). `appendDeliveryPointToParty` (`:192`) is a read-modify-write dedup used when a quote form saves an address back to the party book.
- **Quick view:** `CustomerLeadQuickViewDialog` resolves the party by id or name, then gathers related quotes (`listCustomerQuotes` + a name/title `.or` scan of `quotes`), orders, and design tasks (`activity_log` `action='design_task'`).

## Permissions & access

- RLS is team-scoped on `customers`/`leads`. In addition, the page **client-side narrows quote-managers to their own book**: when `isManagerUser` (`isQuoteManagerJobRole`, `OrdersCustomersPage.tsx:1138`), the query adds `manager_user_id.eq(userId)` (or `.or(manager_user_id, manager label)`); non-managers see all and get a manager filter dropdown (`:1840`).
- `crm_contacts` has full RLS (`scripts/access-lockout.sql:238`) with inline membership + `is_user_blocked` lockout gating — consistent with the [[project_access_lockout]] model.
- Writes (create/update/delete) go directly through the authenticated Supabase client; no privileged Netlify function in this module. Manager reassignment fires `notifyCustomerLeadManagerAssigned` (`workflowNotifications`).

## Gotchas / conservative zones

- **`crm_contacts` is effectively dead in the frontend.** Zero references in `src/` — contacts are stored inline as the `contacts` jsonb on `customers`. The table exists only with RLS policies (`access-lockout.sql`) and a fayna-cleanup reference; treat it as legacy/reserved, not the contact source of truth. **(Uncertain: whether any non-tracked/legacy path still writes it.)**
- **Nova Poshta refs are jsonb keys, not columns.** `np_city_ref`/`np_warehouse_ref` live inside each `delivery_points` entry (`customerDeliveryPoints.ts:29`), reserved so the NP API can backfill City/Warehouse refs without a schema change (Phase 1 autocomplete shipped — [[project_nova_poshta_integration]]). Do not add sibling `np_*` table columns.
- **Two code paths, always.** Per §6, any identity/field change must be applied to **both** customer and lead branches, and downstream to quote/order/design quick views that match parties **by name**, not just id (`CustomerLeadQuickViewDialog.tsx:487`) — a rename can silently orphan history.
- **`payment_type`** is `"invoice" | "cash"` (`:1665`); anything not `"cash"` collapses to invoice. Cash mode is the [[project_customer_card_redesign]] feature.
- **Schema-fallback ladders** (`no_logo`/`base`, `LeadColumnsVariant`) exist because prod/older DBs may lack columns — preserve them when editing selects.

## Known issues (see `docs/AUDIT-2026-07-11.md`)

- **Perf P1 (finding #5):** `CustomerLeadQuickViewDialog` calls `loadDerivedOrders(teamId, userId)` (`CustomerLeadQuickViewDialog.tsx:515`) — the app's whole-team hot path (stored orders + approved quotes + quote items/runs + design activity) — just to filter down to **one** party's orders. Same dialog also scans 200 `activity_log` design rows and, for name resolution, can pull up to **1000** leads (`:426`). Bound this to the single customer/lead instead. `customerLtv.ts` reuses the same unbounded `loadDerivedOrders` for the LTV/RFM table (explicitly a "READ-ONLY EXPERIMENT", `customerLtv.ts:3`).
- **Related:** the batched customer/lead enrichment in `toshoApi.ts` correctly uses `.in(...)` (audit line 154) — the over-fetch is specifically the derived-orders reuse, not the list query.

# Logistics (Nova Poshta address directory)

> Capture Nova Poshta (and other-carrier) delivery details for quotes/orders, backed by a live NP city/warehouse autocomplete. Phase 1 only — no ТТН yet.

## At a glance

- **Routes:** `/logistics` → `LogisticsPage` (`src/pages/LogisticsPage.tsx`) — currently a **stub** (heading + placeholder text, 10 lines). The real delivery UX lives in the quote form, order dialog, and customer/lead cards.
- **Proxy fn:** `netlify/functions/nova-poshta.ts` — auth-gated proxy to the NP public API; the `NOVA_POSHTA_API_KEY` secret lives **only** here (server env), never in the front end.
- **Key files:** `src/lib/novaPoshtaApi.ts` (client + NP response parsing), `src/components/customers/NovaPoshtaControls.tsx` (`NpCityCombobox` / `NpWarehouseCombobox`), `src/lib/customerDeliveryPoints.ts` (delivery-points model), `src/components/quotes/QuoteDeliveryFields.tsx` (quote delivery form + `QuoteDeliveryDetails`), `src/components/orders/OrderDeliveryDialog.tsx`, `src/components/customers/DeliveryPointsSection.tsx`.
- **Main tables (`tosho`):** no dedicated table. Delivery data is **jsonb**: `customers.delivery_points` / `leads.delivery_points` (address book) and `quotes.delivery_type` + `quotes.delivery_details` (per-quote snapshot). `np_city_ref` / `np_warehouse_ref` fields are **reserved for Phase 2 (ТТН)**.
- **Access / permissions:** module key `logistics`, nav item in group `operations` (`AppLayout.tsx:451`), `DEFAULT_MODULE_ACCESS.logistics = false` (`workspaceMemberDirectory.ts:144`). Proxy requires a valid JWT + workspace membership. NP-shaped data is edited wherever quotes/customers are edited, not only under `/logistics`.
- **Workflow:** none dedicated; see `CODEX_WORKFLOWS.md` Production/Orders patterns. NP integration plan: [[project_nova_poshta_integration]], [[project_customer_logistics]].
- **Related:** [customers.md](customers.md) (delivery-points address book on customer/lead cards), [orders-production.md](orders-production.md) (orders read delivery from their quote), [quotes.md](quotes.md).

## Overview

Phase 1 shipped a **Nova Poshta address directory**: as a manager fills the delivery
section of a quote (or edits it on an order), city and warehouse fields autocomplete
against the live NP catalog. There is no standalone logistics screen yet — `/logistics`
is a placeholder (`LogisticsPage.tsx:1`). The functional surfaces are:

1. **Quote form** — `QuoteDeliveryFields` renders per delivery type (`nova_poshta` /
   `pickup` / `taxi` / `cargo`, from `DELIVERY_TYPE_OPTIONS` in `quotes-page/config.ts:168`);
   only the `nova_poshta` branch uses the NP comboboxes.
2. **Order** — `OrderDeliveryDialog` reuses `QuoteDeliveryFields` and writes back to the
   quote (orders read delivery from their originating quote, `OrderDeliveryDialog.tsx:73`).
3. **Customer/lead card** — `DeliveryPointsSection` is a saved-address book; NP-typed rows
   can be picked into a quote via the "Адреса з картки клієнта" selector.

## Data flow

- **Proxy contract:** single `POST` to `/.netlify/functions/nova-poshta` with
  `{ calledMethod, methodProperties }`. The function injects the secret `apiKey`, forces
  `modelName` from a **method whitelist** (`ALLOWED_METHODS`: `searchSettlements`,
  `searchSettlementStreets`, `getWarehouses`, `getSettlementAreas` — all `Address`, read-only),
  calls `https://api.novaposhta.ua/v2.0/json/`, and returns `{ data: [...] }`
  (`nova-poshta.ts:12,15,112`).
- **Client:** `src/lib/novaPoshtaApi.ts` — `searchNpSettlements` (city autocomplete) and
  `listNpWarehouses` (branch/postomat list). **All NP response-shape parsing is centralized
  here** (`novaPoshtaApi.ts:6`) so a field-shape surprise on first live call is a one-place
  fix. City `ref` = `DeliveryCity` (falls back to `Ref`); this is the ref later used for
  `getWarehouses` and future ТТН (`novaPoshtaApi.ts:64-77`).
- **Graceful fallback:** if the server has no key, the proxy returns a 500 whose message the
  client maps to `NovaPoshtaNotConfiguredError`; the comboboxes then **downgrade to plain
  text inputs** so managers can still type addresses manually (`novaPoshtaApi.ts:13,40`;
  `NovaPoshtaControls.tsx:103,207`).
- **Persistence:** selecting a settlement/warehouse fills `city`/`address` **and** stashes
  `npCityRef`/`npWarehouseRef` on the quote's `delivery_details` snapshot
  (`QuoteDeliveryFields.tsx:162-231`). Address-book rows carry the same `np_city_ref` /
  `np_warehouse_ref` (`customerDeliveryPoints.ts:97,137`). Manual-entry rows leave the refs
  `null` — they are reserved to be backfilled once ТТН lands.
- **Snapshot vs. book:** `quotes.delivery_details` is an **immutable snapshot**; it holds a
  soft `deliveryPointId` back-reference to the book row, but editing/deleting the book row
  does not mutate the snapshot (`QuoteDeliveryFields.tsx:19-24`). `appendDeliveryPointToParty`
  dedupes on `type|city|address` so re-saving from quotes doesn't create duplicate book rows
  (`customerDeliveryPoints.ts:184-214`).

## Permissions & access

The proxy authorizes **auth-first**: it requires a Bearer JWT and resolves a workspace via
`my_workspace_id` / `current_workspace_id` RPC (fallback `memberships_view`) **before** it
even checks the API key, so config is never disclosed to anonymous callers
(`nova-poshta.ts:74-92`; commit `dc27000`). Only whitelisted read-only `Address` methods are
proxied — no ТТН/payment methods are reachable. The `logistics` module key gates the nav
item and is **off by default** (`DEFAULT_MODULE_ACCESS.logistics = false`); the `logistics`
job role gets broad quote access (`permissions.ts:157`). Note: the delivery editors ship
inside the quotes/customers modules, so a user without the `logistics` module can still edit
NP delivery data through a quote.

## Gotchas / conservative zones

- **`/logistics` is a stub** — do not assume module logic lives there; it is `LogisticsPage.tsx`
  (10 lines). Real code is in quotes/orders/customers components listed above.
- **Comboboxes are deliberately NOT Radix Popover** — a Radix trigger on `<Input>` intercepted
  pointer/focus and made the field untypeable; they use a hand-rolled absolute dropdown closed
  via `onMouseDown`+`preventDefault` (`NovaPoshtaControls.tsx:24-30`; commit `4d56aa4`). Don't
  "modernize" back to Radix without re-testing typeability.
- **NP response shape is unverified against a live call** — the source comments flag that
  field names (`Ref`/`Present`/`DeliveryCity`/`Warehouses`…) should be re-checked on first
  real use (`nova-poshta.ts:10`, `novaPoshtaApi.ts:6`). Treat parsing as provisional.
- **`np_*_ref` fields are reserved, not yet exercised** — they are captured but nothing
  consumes them until ТТН (Phase 2). Keep writing them; don't repurpose.
- **`delivery_details` column may not exist on older DBs** — `toshoApi.ts` has
  missing-column fallbacks that drop the field on write/read (`toshoApi.ts:900,948`); keep that
  resilience if you touch quote persistence.

## Future — Phase 2 (ТТН)

Creating waybills (ТТН), tracking, and printing are **not implemented**. The plumbing is
staged: `np_city_ref`/`np_warehouse_ref` on both the book and the quote snapshot, plus the
receiver `contactName`/`contactPhone` captured in `QuoteDeliveryFields`, are the inputs a
future `InternetDocument`-family integration will need. That will require new (non-whitelisted)
NP methods and almost certainly a real logistics table/screen. See [[project_nova_poshta_integration]].

## Known issues

- No entry in `docs/AUDIT-2026-07-11.md` for this module (Phase 1 post-dates it). Open latent
  risks: (1) NP field-shape parsing untested against production data; (2) `/logistics` route is
  an empty stub while a nav item advertises it — a user who is granted the `logistics` module
  lands on a blank page.

# Sample Stock

> Warehouse inventory for physical sample/promo goods, with a stock-in/out movement ledger.

## At a glance

- **Routes:** `/stock/samples` → `SampleStockPage` (`src/pages/SampleStockPage.tsx`, ~1,120 lines — single self-contained page, no feature dir). Registered at `src/App.tsx:1003`, lazy-loaded `src/App.tsx:78`, preloaded `src/routes/routePreload.ts:27`.
- **Nav:** "Склад", operations group, `moduleKey: "stock"` — `src/layout/AppLayout.tsx:460`; `ROUTES.sampleStock = "/stock/samples"` (`AppLayout.tsx:426`). Command-palette entry `src/components/app/CommandPalette.tsx:382`.
- **Main tables (`tosho`):** `sample_stock_items` (inventory rows) + `sample_stock_movements` (append-only ledger). DDL/RPC/RLS all live in `scripts/sample-stock-schema.sql`; seed in `scripts/sample-stock-seed-from-numbers.sql`.
- **Movement RPC:** `tosho.adjust_sample_stock_item(p_item_id, p_team_id, p_movement_type, p_quantity, p_comment)` (`scripts/sample-stock-schema.sql:103`) — the only path that writes a ledger row.
- **Access / permissions:** module key `stock`, gated by `ModuleRouteGate` (`App.tsx:529`) on the `moduleAccess.stock` flag or Super Admin. Default access: Super Admin + SEO on, others off unless toggled (`CODEX_WORKFLOWS.md:172`). Team-scoped RLS via `public.is_team_member(team_id)`.
- **Workflow:** `CODEX_WORKFLOWS.md` §7A "Sample Stock Change".
- **Related:** [overview.md](overview.md). Deliberately **separate from the product catalog** used by quote configuration — see [quotes.md](quotes.md); do not conflate (`DB_MAP.md:198`).

## Overview

Operational stock tracking for sample/promotional items the team physically holds. Each row (`sample_stock_items`) carries `name`, `visual_ref`, `sku`, `category`, `color`, `specifications`, `quantity_on_hand`, `reserved_quantity`, `unit_price`, `currency`, `location`, `comments`, `is_archived` (`scripts/sample-stock-schema.sql:4`). The page is a filterable list (desktop table + mobile cards) with create/edit in a `Sheet`, a movement `Sheet`, and hard-delete confirm. Status badges (`getStockStatus`, `SampleStockPage.tsx:203`) are derived client-side: `archived` → `out_of_stock` (qty ≤ 0) → `reserved` (reserved > 0) → `low_stock` (available ≤ `LOW_STOCK_THRESHOLD = 10`, `tsx:98`) → `in_stock`. Available = on-hand − reserved (`tsx:195`).

## Data flow

- **Load:** `loadItems` (`SampleStockPage.tsx:315`) selects **only** `sample_stock_items` filtered by `team_id`, ordered by archived/name/color. It does **not** read the movements table.
- **Item create/edit:** `handleSave` (`tsx:558`) writes directly via `.update()`/`.insert()` on `sample_stock_items`. `currency` is **hardcoded to `"UAH"`** on every save (`tsx:589`), even though the schema/type allow `USD`/`EUR`.
- **Stock movements:** `handleMovement` (`tsx:625`) calls the `adjust_sample_stock_item` RPC. The function (SECURITY INVOKER, `for update` row lock) computes next on-hand/reserved, updates the item, and **inserts a `sample_stock_movements` row** capturing prev/next quantities and `auth.uid()` as `created_by` (`scripts/sample-stock-schema.sql:170`). Movement types: `incoming`, `outgoing`, `reserve`, `release`, `adjustment` (`adjustment` sets an absolute on-hand). RPC-side guards: outgoing/reserve can't exceed available, release can't exceed reserved (`schema.sql:146`).
- **Delete:** `handleDelete` (`tsx:659`) hard-deletes the item; movements cascade (`on delete cascade`, `schema.sql:47`).
- **Missing-table UX:** load errors matching "could not find the table"/"schema cache" set `schemaMissing` and render a hint to apply the SQL scripts (`tsx:344`, `tsx:696`) — this module is provisioned by **manually running `scripts/sample-stock-schema.sql`**, not a migrations-dir migration.

## Permissions & access

Route gated by `ModuleRouteGate moduleKey="stock"` (`App.tsx:1005`) — passes if Super Admin or `moduleAccess.stock === true` (`App.tsx:551`). Note the `financeRoleAllowed` special-case in that component is finance-only and does **not** apply to stock. DB: both tables have RLS enabled with select/insert/update/delete policies keyed on `public.is_team_member(team_id)` (falling back to `true` only if that helper is absent — `schema.sql:211`). The RPC is `grant execute … to authenticated` (`schema.sql:206`) and runs as invoker, so RLS still applies.

## Gotchas / conservative zones

- **Ledger is write-only in the UI.** `sample_stock_movements` is inserted by the RPC but read/displayed **nowhere** in the frontend (verified: no `sample_stock_movements` reference in `src/`). There is no movement-history view yet.
- **Item edits bypass the ledger.** Editing `quantity_on_hand`/`reserved_quantity` through the item `Sheet` uses a plain `.update()` (`tsx:596`), so it does **not** create a movement row. The ledger is therefore *not* a complete audit trail of on-hand changes — only the movement `Sheet` (RPC) records history. Prefer RPC movements for balance changes (`CODEX_WORKFLOWS.md:171`).
- **Unique identity index** on `(team_id, lower(name), coalesce(sku,''), coalesce(color,''))` (`schema.sql:77`) — duplicate name+sku+color inserts fail; the error surfaces in `formError`.
- **Not the catalog.** Do not use catalog/quote-config tables for sample balances, or vice-versa (`DB_MAP.md:198`).
- **Currency hardcoding** (above) means `USD`/`EUR` values entered elsewhere would be silently overwritten to UAH on any edit.

## Known issues

No entries in `docs/AUDIT-2026-07-11.md` reference this module. Open observations (not tracked audit findings): (1) no UI to view the movement ledger despite it being populated; (2) direct-edit path bypasses movement logging; (3) `currency` hardcoded to UAH on save.

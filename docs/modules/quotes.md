# Quotes & Estimates

> Create, price, and track customer quotes (кошториси/estimates) through their status lifecycle.

## At a glance

- **Routes:** `/orders/estimates` → `QuotesPage` (list/kanban) · `/orders/estimates/:id` → `QuoteDetailsPage` (detail). **The detail route is UUID-based, NOT the quote number** (`TS-0326-XXXX`) — see [[project_routes_quirks]].
- **Feature dir:** `src/features/quotes/` (`quotes-page/`, `quote-details/` — each has its own `config`)
- **Key files:** `src/pages/QuotesPage.tsx` (~7,990 lines), `src/pages/QuoteDetailsPage.tsx` (~9,900), `src/lib/quoteRuns.ts` (pricing math), `src/lib/toshoApi.ts` (`listQuotes`, `getQuoteRuns`, `listQuoteItemsForQuotes`), `NewQuoteDialog.tsx`
- **Main tables (`tosho`):** `quotes`, `quote_items`, `quote_item_runs`, `quote_sets`, `quote_set_items`, `quote_attachments`, `quote_comments`, `quote_status_history`, `quote_counters`
- **Access / permissions:** `src/lib/permissions.ts` (`canEditQuoteContent` etc.); quotes are team-scoped via RLS. Conservative zone — quote workflow **state** and pricing.
- **Workflow:** `CODEX_WORKFLOWS.md` §3 "Quote Workflow Change"
- **Related:** [orders-production.md](orders-production.md) (approved quotes derive orders), [customers.md](customers.md), [design.md](design.md)

## Overview

Quotes are the estimating core. A quote has line **items**, and each item has priced **runs**
(`quote_item_runs`) — quantity tiers with computed sale pricing. The list view (`QuotesPage`)
is a paginated kanban by status; the detail view (`QuoteDetailsPage`) edits items, runs, brief,
notes, comments, attachments, and drives status transitions. Approved quotes feed the orders
module via derived records (see [orders-production.md](orders-production.md)).

## Data flow

- **List:** `listQuotes({ teamId, status })` (`toshoApi.ts:386`) — paginated via `range`. Items
  batched with `listQuoteItemsForQuotes` (`toshoApi.ts:1961`, single `.in("quote_id", …)`).
- **Pricing — SOURCE OF TRUTH:** the real sale price is `quote_item_runs` computed through
  `computeRunSalePricing` (`src/lib/quoteRuns.ts`). **`quote_items.unit_price` and `quotes.total`
  are stale snapshots — never treat them as the live price.** See [[project_quote_pricing_source]].
- **Runs load:** `getQuoteRuns(quoteId, teamId)` (`toshoApi.ts:1157`) fetches runs for one quote.
  ⚠️ Currently called per-quote in a loop (N+1) during order derivation — see Known issues.

## Permissions & access

Team-scoped RLS on all quote tables (an authenticated user sees only their team's quotes).
Content editing gated by `permissions.ts` predicates. `quote-comments.ts` (Netlify) authorizes
via a user-scoped RLS visibility check on the quote before notifying mentions.

## Gotchas / conservative zones

- **UUID route**, not quote number — links must use `quote.id`.
- **Pricing snapshots lie** — always derive from runs.
- **Giant files** — edit `QuoteDetailsPage.tsx` / `QuotesPage.tsx` via `docs/LARGE_FILES_MAP.md` offsets, not a top-to-bottom read.
- **Check `error` on every write** — the pricing-runs delete path historically ignored it (see Known issues).

## Known issues (see `docs/AUDIT-2026-07-11.md`)

- **Perf P1:** `getQuoteRuns` N+1 in `orderRecords.ts` — batch into one `.in("quote_id", …)`.
- **Frontend P1:** `QuoteDetailsPage` is a 142-`useState` god-component with no memo boundaries → keystroke re-render storms; decompose along state clusters (runs/comments/brief/notes/dialogs).
- **Tooling P1:** `QuoteDetailsPage.tsx:1293` deletes `quote_item_runs` (the pricing SoT) without capturing `error`, then proceeds — the "looks applied but was rejected" bug class.
- **Security (P0, FIXED):** the leaked `tosho.v_quotes_list` view exposed this module's data to anon; revoked 2026-07-11.

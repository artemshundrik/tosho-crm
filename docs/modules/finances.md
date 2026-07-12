# Finances (Фінанси)

> ERP-lite cash-basis money accounting for the агенція — income, receivables, expenses, taxes, payroll and reconciliations, sliced by legal entity / channel («контур»).

## At a glance

- **Routes:** `/finances` → `FinancesPage` (`src/pages/FinancesPage.tsx`, ~206 lines). Single page, 11 sub-sections switched by a `?tab=` query param (`dashboard`, `sales`, `expenses`, `payroll`, `taxes`, `calendar`, `accounts`, `margin`, `reconciliation`, `reports`, `settings`).
- **Feature dir:** `src/features/finances/` — one component per section + shared `api.ts`, `types.ts`, `documentHtml.ts`, `vchasnoStatus.ts`, `pdf/`.
- **Key files:** `api.ts` (~1033 lines, all Supabase CRUD + `normalize*`), `types.ts` (domain types, labels, `paymentUahValue`, `formatLegalEntityLabel`), `FinanceSales.tsx` (wraps `FinanceInvoices`+`FinancePayments`), `FinancePayroll.tsx` (reuses `src/lib/payroll.ts`), `documentHtml.ts`/`pdf/renderInvoicePdf.tsx` (doc generation), `netlify/functions/vchasno-upload.ts`.
- **Main tables (`tosho`):** `finance_legal_entities`, `finance_accounts`, `finance_order_meta` (PK `quote_id`), `finance_invoices`, `finance_payments`, `finance_expense_categories`, `finance_expenses`, `finance_expense_allocations`, `finance_taxes`, `finance_payout_meta` (PK `team_id,user_id,period`). Payroll amounts live in `payroll_entries` (workspace-scoped, PK `workspace_id,user_id,period`) — finance only overlays payout status/entity. Schemas: `scripts/finances-schema.sql`, `finances-expenses-schema.sql`, `finances-payout-meta-schema.sql`, `finances-taxes-schema.sql`.
- **Access / permissions:** module key `finance`. DB gate `tosho.has_finance_access(team_id)` (`scripts/finances-access-rls.sql`) — RLS on all 10 finance tables. Frontend mirror in `App.tsx:546` (`financeRoleAllowed`). Allowed roles: `owner` (access_role) OR job_role in `seo`/`accountant`/`chief_accountant`. In-page **sensitive** gate (`canSeeSensitive`) narrows further to owner + `chief_accountant`.
- **Workflow:** No dedicated `CODEX_WORKFLOWS.md` section yet; design lives in `docs/FINANCES_DESIGN.md` (**DRAFT**, but code is ahead of it).
- **Related:** [orders-production.md](orders-production.md) (payments/invoices/expenses bind to derived orders via `quote_id`), [vchasno.md](vchasno.md) (invoice → Вчасно EDM), [team-hr.md](team-hr.md) (payroll shares `payroll_entries`).

## Overview

The Finances module is the CRM's management-accounting layer. Its organizing concept is the **контур / channel** — a `(legal_entity + account)` pair. Every payment lands in a `finance_account` (каса/гаманець), which belongs to a `finance_legal_entity` (ТОВ / ФОП / pseudo-«individual»), so the dashboard can break income down by entity and by cash box. Accounting is **cash-basis**: income is recognized when money actually arrives (`finance_payments`), not when an invoice is issued. Off-books channels (cash/crypto/personal_card, `is_sensitive`) are visible only to top roles.

Sub-sections: **Dashboard** (income + receivables + per-контур/per-каса rollup), **Реєстр продажів** (`FinanceSales` → Рахунки + Оплати), **Витрати** (fixed + variable, with 1-expense-to-N-orders allocation), **Виплати команді** (payroll), **Податки** (ПДВ/ЄП/ЄСВ/ВЗ), **Платіжний календар**, **Каси та рахунки**, **Маржа** (top-roles only), **Звірки** (reconciliation acts → PDF/Excel), **Звіти**, **Налаштування** (entities/accounts/categories). `docs/FINANCES_DESIGN.md` still says DRAFT/«код не пишемо», but the code is fully built — trust the code.

## Data flow

- **All reads/writes go through `src/features/finances/api.ts`** — one `list*`/`create*`/`update*`/`delete*` set per table, each hitting `supabase.schema("tosho")` and mapping snake_case rows to camelCase via `normalize*`. Numeric columns are coerced with `toNumber`/`toNullableNumber` (Postgres numerics arrive as strings).
- **Orders are derived, not stored.** Payments and invoices reference an order by `quote_id` (the stable derived-order id), never an `orders` row. `listOrdersForFinance` (`api.ts:259`) calls `loadDerivedOrders` (`src/features/orders/orderRecords.ts`) for the picker. Dashboard/Margin/Reports also call `loadDerivedOrders` directly for customer names.
- **VAT is computed inclusive** (`computeVatAmount`, `api.ts:489`): `amount * rate / (100 + rate)` — Ukraine default where the total already includes ПДВ.
- **Receivables** (Dashboard `receivables`, `FinanceDashboard.tsx:150`): active (`invoiceIsReceivable`) invoice `amount` minus payments summed by `quote_id` (`paidByQuote`); positive remainder = дебіторка, grouped by customer.
- **Payroll:** `FinancePayroll` loads amounts from `payroll_entries` via `loadPayrollEntries` (`src/lib/payroll.ts`, workspace-scoped) and overlays entity/account/paid-status from `finance_payout_meta` via `listPayoutMeta`/`upsertPayoutMeta`. Amount edits are debounced 600ms into `upsertPayrollEntry`.
- **Documents:** invoices render to HTML (`documentHtml.ts` → `openPrintableDocument` → `window.print()`), to `.xls` (`downloadHtmlAsExcel`, an HTML table), and to PDF (`pdf/renderInvoicePdf.tsx`, `@react-pdf`). PDF base64 is POSTed to `/.netlify/functions/vchasno-upload` for Вчасно EDM; status badges come from `vchasnoStatus.ts` reading `tosho.vchasno_documents`.

## Permissions & access

- **DB RLS** (`finances-access-rls.sql`): `has_finance_access` is `security definer`, requires membership in `public.team_members` for the team AND a `tosho.memberships` row with role `owner` or job_role `seo`/`accountant`/`chief_accountant`. Applied as select/insert/update/delete policies on all 10 finance tables. The migration also backfills `team_member_profiles.module_access.finance` to match.
- **Frontend route gate** (`App.tsx:546`) recomputes the same predicate as `financeRoleAllowed` so authorized roles pass even if the `module_access` flag lags.
- **In-page sensitivity** (`FinancesPage.tsx:78` `canSeeSensitive`): owner + `chief_accountant` only. Hides the **Маржа** tab entirely, and filters sensitive-account payments/accounts out of Dashboard, Payments, Accounts, Reports. Note: `accountant`/`seo` reach the module but not margin or grey channels.
- **Vchasno upload** (`vchasno-upload.ts`) does its own auth: user-scoped Supabase client + a `module_access.vchasno` / `vchasno_send` check; tokens are per-legal-entity env vars — see [vchasno.md](vchasno.md).

## Gotchas / conservative zones

- **`docs/FINANCES_DESIGN.md` is stale as a status source** — it says "код не пишемо" but all 11 sections are shipped and RLS is applied. Use it for *intent*, code for *truth*.
- **Payments/invoices/expenses key off `quote_id`, not an orders table.** Don't "fix" this to join `orders` — the order layer is derived (`orderRecords.ts`). `finance_order_meta` is a PK-`quote_id` overlay; don't break derivation.
- **Cash basis** — never treat an issued invoice as income. Income = `finance_payments` only.
- **Payroll SoT is `payroll_entries`** (workspace-scoped, shared with the old team-HR payroll). `finance_payout_meta` is only the payout *overlay* (which entity/account/paid). The standalone `/payroll` page was removed; this is now the only payroll UI. Departed members (`employmentStatus` rejected/inactive) appear struck-through **only** in past months where they have an entry (`FinancePayroll.tsx:138`), never future months.
- **VAT is inclusive** — changing `computeVatAmount` silently reprices every invoice.

## Known issues

- **Duplicated money formatters (audit-worthy).** Four independent implementations: the canonical `formatOrderMoney` (`orders/orderRecords.ts:510`) is re-wrapped as a local `const uah = …` in `FinanceDashboard.tsx:33`, `FinanceMargin.tsx:27`, `FinanceReports.tsx:37`; `FinancePayroll.tsx:35-42` rolls its own `fmtUAH0`/`fmtUAH2`/`formatUAH` («грн», hides kopecks); `documentHtml.ts:15` has `fmtMoney`; `pdf/InvoiceDocument.tsx:8` has yet another `Intl.NumberFormat`. Consolidate into one shared UAH formatter.
- **Print/export HTML hand-rolled** — `finances/documentHtml.ts` is named in `docs/AUDIT-2026-07-11.md:135` as one of ×4-5 hand-rolled print/export paths; intended fix is a shared `src/lib/printDocument.ts`.
- **Design doc drift** — `FINANCES_DESIGN.md` §6 lists tables (`finance_documents`, `finance_reconciliations`, `finance_suppliers`, `finance_team_contracts/payouts`) that were **not** built as separate tables; reconciliations generate on the fly (no snapshot table), suppliers are a free-text `supplier_name` column on `finance_expenses`, and payouts are the `finance_payout_meta` overlay. Verify before assuming a table exists.
- **Security posture (good):** `AUDIT-2026-07-11.md:44` confirms `finance_*` and `payroll_entries` have RLS enabled (not in the anon-leak set). No open P0 for this module.

# Product Catalog

> Manage the product model library (типи → види → моделі) that feeds quote item configuration.

## At a glance

- **Routes:** `/catalog/products` → `ProductCatalogPage` (lazy, `App.tsx:70,955`). Nav item gated by module key `catalog` (`AppLayout.tsx:450`).
- **Feature dir:** `src/features/catalog/ProductCatalogPage/` — `index.tsx` (592 lines) orchestrates hooks + components; heavy logic in `hooks/useModelEditor.ts` (1,918 lines) and `hooks/useCatalogData.ts`.
- **Key files:** `hooks/useCatalogData.ts` (load/cache), `hooks/useModelEditor.ts` (CRUD + image import), `hooks/useCategoryManager.ts` (type/kind CRUD), `hooks/useFilters.ts` (search/validation/badges), `components/SimpleModelCard.tsx` + `SimpleModelGrid.tsx` (the **only** `React.memo` in the repo). `src/types/catalog.ts`, `src/constants/catalog.ts`, `src/utils/catalogUtils.ts` (`validateModel`, `exportToCSV`). Netlify: `catalog-image-import.ts`, `catalog-avanprint-import.ts`.
- **Main tables (`tosho`):** `catalog_types` → `catalog_kinds` → `catalog_models`; `catalog_methods` + `catalog_model_methods` (M:N), `catalog_price_tiers`, `catalog_print_positions`. **Variants are NOT a table** — stored on `catalog_models.metadata.variants` (`CODEX_PROJECT_GUIDE.md:146`).
- **Access / permissions:** module key `catalog`, default **off** (`workspaceMemberDirectory.ts:146`). Data scoped only by client-side `.eq("team_id", …)` — see Known issues (RLS off).
- **Workflow:** `CODEX_WORKFLOWS.md` §7 "Catalog Change".
- **Related:** [quotes.md](quotes.md) — quotes consume models via `listCatalogModelsByIds` (`toshoApi.ts:222`) and snapshot the picked variant into `quote_items.metadata.catalogVariant`.

## Overview

The catalog is a three-level tree: **types** (категорії, e.g. "Одяг", with a `quote_type` of merch/print/other), **kinds** (види, e.g. "Футболка"), and **models** (concrete products). Each model carries a price (fixed or quantity **tiers**), decoration **methods**, an image, and rich `metadata` (SKU, supplier/Avantprint links, colour variants, brand, specs, sizes — `types/catalog.ts:48`). Kinds also own reusable **methods** and **print positions**. The catalog is the source library for quote item configuration; it is not customer- or order-facing.

## Data flow

- **Metadata load** (`useCatalogData.ts:252`): one parallel batch fetches types, kinds, model id→kind (for counts only), methods, and print positions. Models arrays start empty; kinds get a `modelCount`.
- **Model bodies** load separately via `loadModelPayload` (`:122`) — a fixed **~3 batched queries** (`catalog_models`, then `catalog_model_methods` + `catalog_price_tiers` via `.in("model_id", …)`) regardless of catalog size. Two entry points: `ensureKindModelsLoaded` (lazy, per clicked kind) and `ensureAllModelsLoaded` (eager, whole catalog). `index.tsx:92` fires the eager load once metadata arrives so validation/error badges are accurate **globally**, not just for the open kind.
- **Cache:** `usePageCache` under key `catalog:v2:${teamId}` (`:44`); background-refreshes when stale > 5 min. `INITIAL_CATALOG` is `[]`.
- **Validation:** `validateModel` (in `catalogUtils`) drives `filteredGlobalModels`, the "incomplete only" filter, and per-type/per-kind badge counts (`useFilters.ts:99`).
- **Writes:** `useModelEditor` writes `catalog_models` + `catalog_price_tiers` + `catalog_model_methods`; `useCategoryManager` writes `catalog_types`/`catalog_kinds`. Both mutate the in-memory `catalog` and re-cache.

## Redesign (perf notes)

Sticky full-height shell: `h-[calc(100dvh-7rem)]` with `min-h-0` sidebar + scroll pane (`index.tsx:365`). The grid/cards are the repo's only memoized components; to keep them from re-rendering on unrelated page updates (dialogs, hover, search typing), handlers are wrapped in a local `useStableCallback` (`index.tsx:44`) that keeps a stable identity while always calling the latest closure — avoids rewriting the 1,918-line `useModelEditor` with per-handler `useCallback`. Page is `lazyWithRetry`-imported. See [[project_catalog_redesign]].

## Image import

- **`catalog-image-import.ts`** — verifies JWT, then fetches a body-supplied `sourceUrl`, transcodes to WebP (original + preview 640 + thumb 160 via `sharp`), and uploads to the `public-assets` bucket (`useModelEditor.ts:30`) with the **service-role** client. Called from `useModelEditor.ts:455` and `QuotesPage.tsx:1795`.
- **`catalog-avanprint-import.ts`** — scrapes an avanprint.ua product page into a draft (name/SKU/photo/variants/methods). URL is validated against a host allowlist (`AVANPRINT_HOSTS`, `:43,438`). Confirm-before-create: parsed draft is persisted through the same image pipeline only on user action (`CODEX_PROJECT_GUIDE.md:151`).

## Permissions & access

Nav visibility is gated by the `catalog` module key (default **false** — opt-in per member). There is **no server-side team scoping**: every query filters by `.eq("team_id", …)` on the client only, because the catalog tables have RLS off (below). Import functions authenticate the JWT via `userClient.auth.getUser()` before acting.

## Gotchas / conservative zones

- **Variants live in `metadata.variants`**, not a table; the first variant inherits `metadata.baseVariantName` (`CODEX_PROJECT_GUIDE.md:147`). Variant photos must use the same WebP pipeline as model photos (`:149`).
- **Downstream quotes** snapshot the chosen variant into `quote_items.metadata.catalogVariant`; changing catalog model fields can affect quote display — verify quote consumers (`CODEX_WORKFLOWS.md:157`).
- `catalog_models.metadata` is untyped JSON at the DB layer; narrow it through `CatalogModelMetadata` (`types/catalog.ts:48`).
- `useModelEditor.ts` is huge — navigate by the `.from("catalog_…")` write sites, don't top-to-bottom read.

## Known issues (see `docs/AUDIT-2026-07-11.md`)

- **Security P0 (SSRF, OPEN):** `catalog-image-import.ts` fetches an arbitrary body-supplied `sourceUrl` with **no domain allowlist** and writes to a body-supplied bucket/path via the service role (finding #4, audit `:67`). The sibling avanprint import validates its host; this one doesn't. Fix = add a URL/host allowlist (audit `:167`).
- **Security (lower severity, OPEN):** all 7 `catalog_*` tables are **RLS-off + anon-granted** (audit `:38-45`) — low confidentiality (catalog data), but violates deny-by-default; decision pending on whether catalog is intentionally public. Tidy by revoking anon or enabling team-scoped RLS.

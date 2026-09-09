# Tosho CRM DB Map

Purpose: practical schema and entity map for Codex. This is not a full DB dump. It focuses on what current tracked code actually uses.

## Trust Note

- Trust current code and tracked SQL over handoff prose when they disagree.
- This map reflects tracked code as of April 19, 2026.

## Schema Defaults

- Main application schema: `tosho`
- Public schema is used selectively for:
  - `push_subscriptions`
  - helper functions such as `assert_quote_lock_from_quote_id()`
- Frontend commonly uses `supabase.schema("tosho")`
- Some compatibility code still probes both `tosho` and `public` for membership-related objects

### Date and time columns — read this before writing one

Every timestamp column in `tosho` is `timestamptz` (there is not a single
`timestamp without time zone`), but they do NOT all mean the same thing:

- `quotes.deadline_at`, `customer_deadline_at`, `design_deadline_at` hold a
  **floating wall clock** — the number the user picked, labelled `+00`. The
  offset is a label, not a value.
- `*.reminder_at` (contractors, customers, leads) hold a **true UTC instant**.
- Absences, birthdays, invoice dates and the rest of `finance_*` use plain
  `date`.

Picking the wrong one has already shipped a bug: the quote wizard wrote a
deadline as a real UTC instant, so one deadline meant three different times.
The conventions, the helpers to use, and how to choose between them:
[docs/DATETIME.md](DATETIME.md).

## Tenancy And Access Model

- `workspace_id`
  - top-level tenant boundary
  - resolved through `memberships_view` and workspace helpers

- `team_id`
  - operational grouping used across quotes, design, orders, and activity
  - often resolved through `team_members`

- `user_id`
  - auth user identity carried through memberships, team profiles, notifications, and activity

- `memberships_view`
  - primary source for `workspace_id`, `access_role`, and `job_role`

- `team_members`
  - still used to resolve operational `team_id`

- `team_members_view`
  - enriched member lookup, especially for mentions and directory-style reads

- `workspace_member_directory`
  - directory-like member view/shape with module access information

### RLS: per-row check vs once-per-query — read this before writing a policy

The default way to express access is the canonical helper
`public.is_team_member(team_id)`. It carries **two** conditions, not one:
membership in the team, and the block gate (`and not
tosho.is_user_blocked(auth.uid())`). Swapping it for a bare `exists` over
`public.team_members` silently drops the second one — that is why the standing
rule has always been "go through the helper".

But the helper takes `team_id`, so it is row-correlated: the planner calls it
for **every row** of the table. On the 26 799-row supplier pool that cost 5.8 s
instead of 0.3 s on every word typed into quote search (measured 09.09.2026) —
26 799 identical membership checks, every one returning the same answer.

So on a large table the same two conditions may be written **uncorrelated**, so
that each is computed once per query instead of once per row:

```sql
using (
  team_id in (select public.get_my_team_ids())
  and not (select tosho.is_user_blocked((select auth.uid())))
)
```

`get_my_team_ids()` and `is_user_blocked()` are exactly the two halves that
`is_team_member` is built from, so this opens no new door — **provided both
halves are present**. The second conjunct is not optional: without it a blocked
employee reads the table again.

When to switch:

- the table is over ~10 000 rows **and** some query scans many of its rows
  (search, feed, export) — both conditions together, not either one;
- below that line keep `is_team_member(team_id)`: it is shorter and harder to
  get wrong.

How to verify (both steps, not one):

- before — compare query time under `authenticated` against the owner; that gap
  *is* the price of the access check, and it tells you whether this is even the
  problem;
- after — check that old and new expressions agree for **every** real member,
  blocked ones included, and run the `rls-verifier` agent.

As of 09.09.2026 exactly one table uses the uncorrelated form,
`tosho.supplier_products`. The other 39 tables (124 policies) stay on the
helper; the largest of them is `audit_log` at 3 694 rows, well under the line.
`check:db-guards` watches the dangerous half of this: a policy that resolves
membership without reaching any block gate gets reported.

One more thing the text of a policy does not tell you: a helper that is **not**
`SECURITY DEFINER` reads its tables through RLS, so its answer already depends on
what the caller is allowed to see. The two-argument
`tosho.is_workspace_admin/owner(workspace_id, user_id)` overloads are plain
`STABLE` functions, and on `tosho.memberships` that is precisely what supplies the
block gate their bodies are missing: `memberships_select_member` is block-aware, a
blocked caller sees zero rows (their own included), and an `UPDATE`/`DELETE` whose
`WHERE` touches table columns must satisfy the SELECT policies too — so no row is
ever found. Verified on prod 09.09.2026 inside `begin/rollback`: blocked admin
`DELETE 0`, blocked owner `UPDATE 0`, self-delete `DELETE 0`, active admin
`DELETE 1`; the same two-argument helper evaluated around RLS returns `true`.

Read that as a warning, not a pattern to copy. The gate is real but indirect, and
it holds only while the SELECT policy stays block-aware — change that policy and
two other policies silently open. In a new policy put the gate where it can be
read: the one-argument helper, or an explicit conjunct.

## Core Quote And CRM Tables

- `quotes`
  - central business record for estimates / quote lifecycle
  - key fields seen in code:
    - `team_id`
    - `customer_id`
    - `number`
    - `status`
    - `created_by`
    - `assigned_to`
    - delivery/deadline fields

- `quote_items`
  - line items under a quote

- `quote_item_runs`
  - pricing/calculation run rows for quote items

- `quote_attachments`
  - quote-bound attachments and file metadata
  - very important for storage cleanup and observability

- `quote_comments`
  - threaded comments for estimate details

- `quote_status_history`
  - explicit quote status change history

- `quote_sets`
- `quote_set_items`
  - reusable quote grouping/set layer

- `v_quotes_list`
  - view used in at least one list path

## Customers, Leads, And Related Entities

- `customers`
  - current CRM customer entities

- `leads`
  - leads/prospects
  - tracked schema in [scripts/leads-schema.sql](/Users/artem/Projects/tosho-crm/scripts/leads-schema.sql)

- `clients`
  - appears in search results, but not a primary current frontend domain

## Design Task Model

This is the most important non-obvious part of the repo.

- There is no evidence in tracked code of a primary `design_tasks` table driving the UI.
- Design tasks are mostly represented as `activity_log` rows with:
  - `action = 'design_task'`
  - `entity_type = 'design_task'` in some flows
  - important metadata fields such as:
    - `quote_id`
    - `status`
    - `design_task_number`
    - `design_task_type`
    - `assignee_user_id`
    - `collaborator_user_ids`
    - `collaborator_labels`
    - `collaborator_avatar_urls`
    - design output metadata

- Related design-task events also live in `activity_log`, including:
  - `design_task_status`
  - `design_task_assignment`
  - `design_task_collaborators`
  - `design_task_estimate`
  - `design_task_title`
  - `design_task_deadline`
  - `design_task_type`
  - `design_task_brief_version`
  - `design_task_brief_change_request`
  - `design_output_upload`
  - `design_output_selection`
  - `design_task_attachment`

- Separate table:
  - `design_task_timer_sessions`
    - timer/running-work state for design tasks

Practical implication:
- any design-task schema or metadata change has unusually wide blast radius

## Orders / Production Model

- Stored tables:
  - `orders`
  - `order_items`

- But the production UI is not explained by those tables alone.
- [src/features/orders/orderRecords.ts](/Users/artem/Projects/tosho-crm/src/features/orders/orderRecords.ts) builds derived order records by combining:
  - stored `orders`
  - stored `order_items`
  - approved quotes
  - quote items and quote runs
  - customer/lead info
  - approved design assets derived from design-task activity

Practical implication:
- production bugs often need cross-table and cross-entity analysis, not just `orders` inspection

## Team / HR Tables

- `team_member_profiles`
  - current team profile / HR state
  - tracked schema in [scripts/team-member-profiles.sql](/Users/artem/Projects/tosho-crm/scripts/team-member-profiles.sql)
  - stores:
    - names
    - avatar refs
    - availability
    - employment status
    - probation fields
    - manager linkage
    - module access metadata

- `team_member_manager_rates`
  - manager-rate and compensation-related logic

- `team_member_employment_events`
  - employment status event log

- `team_member_probation_events`
  - probation event log

- `team_absences`
  - журнал відсутностей: один рядок = одна людина × діапазон дат × тип
    (`vacation` / `day_off` / `sick_leave` / `other`)
  - tracked schema: [scripts/team-absences.sql](/Users/artem/Projects/tosho-crm/scripts/team-absences.sql)
    + [scripts/team-absences-quotas.sql](/Users/artem/Projects/tosho-crm/scripts/team-absences-quotas.sql)
  - `status` (`pending` / `approved` / `declined` / `cancelled`) — **джерело правди
    і для календаря, і для норм дизайнерів**. Норму й квоту ріжуть ЛИШЕ `approved`
    (`src/lib/designerPayroll.ts` фільтрує явно; знімеш фільтр — pending почне
    тихо зменшувати зарплатні нормо-дні)
  - RLS: читає будь-який учасник воркспейсу, пише owner/CEO
  - «хто зараз відсутній» на `/team` виводиться звідси, а не з
    `team_member_profiles.availability_status`

- `team_absence_quotas`
  - річні ліміти на людину в РОБОЧИХ днях; рядка може не бути — тоді діють
    дефолти 18 / 6 / 10 (`src/lib/teamAbsenceCalendar.ts`)
  - RLS: свій рядок бачить кожен, усі — лише owner/CEO; пише owner/CEO

- `team_absence_events`
  - слід рішень по відсутностях; пише лише service-role функція

- RPC `team_absence_balances(p_year int)`
  - `security definer`; повертає квоту/використано по трьох типах
  - **гейт приватності залишків**: не-owner/CEO отримує рівно один рядок — свій
  - «використано» = унікальні робочі дні approved-записів за рік, з урахуванням
    `ua_workday_exceptions`

## Catalog / Product Configuration Tables

- `catalog_models`
  - core product model data for quotes and catalog UI
  - `metadata` is a jsonb bag: `sku`, `supplierUrl`, `avantprintUrl`,
    `configuratorPreset`, `specPreset`, `imageAsset {bucket, path}`, `source`,
    `brand`, `description`, `specs`, `sizes`. **Never select it whole from a list
    screen** — pull the scalars with `metadata->>key` arrows
    (`CATALOG_MODEL_SCALAR_COLUMNS` in `src/lib/catalogVariantRows.ts`). The quote
    window used to take the blob and paid 1041 kB per open (REQ-178#p9).
  - `metadata.variants` is **gone** — colours live in `catalog_variants` (below).
    The generated column `search_skus` and `tosho.catalog_model_search_skus()` are
    gone with it; article search now goes to two trigram indexes:
    `catalog_models_sku_trgm` on `(metadata->>'sku')` for the model's own article
    and `catalog_variants_sku_trgm` for colour codes. Both are needed — of 71
    models with an article, 15 have no variants at all.
    ([scripts/catalog-drop-search-skus.sql](/Users/artem/Projects/tosho-crm/scripts/catalog-drop-search-skus.sql))

- `catalog_variants`
  - one row per colour of a model: `sku`, `image_bucket` + `image_path`,
    `is_active`, `sort_order`. **Source of truth** since REQ-178#p9; the app writes
    rows through `persistCatalogVariants()` and never through `metadata`.
  - image URLs are **derived** from `bucket` + `path` (`src/lib/catalogAssetUrl.ts`),
    never stored — storing all four URLs cost 563 kB of the old blob.
  - `quote_items.catalog_variant_id` references it `on delete set null`, so
    deleting a row silently erases which colour a quote sold. That is why writes
    upsert first and only then remove what is genuinely absent.
  - `tosho.sync_catalog_variants()` still mirrors `metadata.variants` → rows, but
    **only when the `variants` key is present**, as a bridge for code deployed
    before the flip. Drop it once the new code has settled.
    ([scripts/catalog-variants-table.sql](/Users/artem/Projects/tosho-crm/scripts/catalog-variants-table.sql),
    [scripts/catalog-variants-source-of-truth.sql](/Users/artem/Projects/tosho-crm/scripts/catalog-variants-source-of-truth.sql))

- `catalog_types`
- `catalog_methods`
- `catalog_model_methods`
- `catalog_price_tiers`
- `catalog_print_positions`
- `catalog_kinds`

These tables together power the product catalog and quote item configuration.

- `supplier_products`
  - the supplier pool: one row per colour/size offer of a supplier, keyed by
    `(supplier_slug, external_key)`; loaded by `scripts/load-supplier-feed.mjs`
    (GitHub Actions `supplier-feeds`, daily 06:00 Kyiv; Bergamo crawled weekly).
    `attrs` carries per-source extras (`color`, `sizes`, `sitePrice`, `methods`,
    `printPlaces`, Avanprint `description` — 9.5 MB in total, never select it whole).
  - the app reads it only through RPCs, all `security invoker` under the
    uncorrelated RLS policy described above:
    `tosho.search_supplier_pool(p_terms, p_per_supplier)` (quote wizard and the
    `/suppliers` search; the list of visible sources lives in the function body),
    `tosho.supplier_pool_summary()`,
    `tosho.list_supplier_products(p_slug, p_terms, p_category, p_limit, p_offset)`
    (pages by distinct `name`, so one product's colours never split across pages;
    its CTE keeps only `id`+`name` on purpose — materialising `attrs` cost 1–3 s),
    `tosho.supplier_pool_categories(p_slug)`.
    ([scripts/catalog-supplier-products.sql](/Users/artem/Projects/tosho-crm/scripts/catalog-supplier-products.sql),
    [scripts/supplier-pool-search.sql](/Users/artem/Projects/tosho-crm/scripts/supplier-pool-search.sql),
    [scripts/supplier-pool-page.sql](/Users/artem/Projects/tosho-crm/scripts/supplier-pool-page.sql))

## Sample Stock / Warehouse Samples

- `sample_stock_items`
  - operational stock rows for sample/promotional goods
  - key fields include `team_id`, `name`, `visual_ref`, `sku`, `category`, `color`, `specifications`, `quantity_on_hand`, `reserved_quantity`, `unit_price`, `location`, `comments`, and `is_archived`

- `sample_stock_movements`
  - append-only movement log for stock changes
  - movement types are `incoming`, `outgoing`, `reserve`, `release`, and `adjustment`
  - stores previous/next on-hand and reserved quantities for auditability

Practical implication:
- sample stock is separate from catalog configuration; do not use catalog model tables for warehouse sample balances.

## Notifications, Activity, And Runtime

- `notifications`
  - in-app notification rows

- `activity_log`
  - very high-value table
  - used for:
    - general operational timeline
    - design task model
    - some workflow-derived reads
    - observability metrics

- `activity_read_state`
  - notification/activity read state

- `push_subscriptions`
  - `public` schema table
  - browser push endpoints
  - tracked schema in [scripts/push-subscriptions.sql](/Users/artem/Projects/tosho-crm/scripts/push-subscriptions.sql)

- `runtime_errors`
  - runtime error sink written by frontend logging

- `support_requests`
  - ToSho AI ticket/thread header rows
  - stores mode, status, priority, domain, route context, assignee, and AI confidence

- `support_messages`
  - threaded user / assistant / human messages under a ToSho AI request

- `support_feedback`
  - per-message feedback loop for `helpful` / `not_helpful`

- `support_knowledge_items`
  - curated workspace knowledge base used by ToSho AI
  - stores title, summary, body, tags, keywords, and source attribution

- `_healthcheck`
  - lightweight health probe table/view used by frontend helper

## Observability And Backup Tables

- `admin_observability_snapshots`
  - snapshot table for storage/database/admin metrics
  - tracked schema in [scripts/admin-observability.sql](/Users/artem/Projects/tosho-crm/scripts/admin-observability.sql)

- `backup_runs`
  - storage backup execution history used in admin observability

- `stack_versions`
  - what npm knows about each dependency: `latest_version`, `latest_seen_at`
    (when *we* first saw that version, not its publish date) and `advisories`
  - `advisories` are only valid for `advisories_version` — the installed version
    they were fetched for; a mismatch means the check is stale and the page must
    not show them (see [scripts/stack-advisories-version.sql](/Users/artem/Projects/tosho-crm/scripts/stack-advisories-version.sql))
  - written daily by `netlify/functions/stack-versions.ts` (pg_cron job
    `stack-versions`), read by Dev → Стек and by the nightly system digest
  - installed versions are NOT here — they live in the committed snapshot
    `src/data/stackSnapshot.generated.ts`
  - RLS: owner/CEO only, via `tosho.can_read_all_feature_adoption()`
  - tracked schema in [scripts/stack-schema.sql](/Users/artem/Projects/tosho-crm/scripts/stack-schema.sql)

## Trigger-Filled Columns (types gotcha)

Some `NOT NULL` columns are never passed by application code — a `BEFORE INSERT`
trigger fills them. The type generator cannot see triggers, so such a column
would be generated as **required** in `Insert` and break `tsc` on working code.

The fact lives on the column itself: its `COMMENT` carries the marker
`[fills-by-trigger]`, and [scripts/gen-db-types.mjs](/Users/artem/Projects/tosho-crm/scripts/gen-db-types.mjs)
makes those columns optional on insert while keeping them non-null on read. The
generator refuses the marker if the table has no `BEFORE INSERT` trigger at all.

- `catalog_methods.directory_id` — bound by `catalog_methods_bind_directory`,
  which finds or creates the `tosho.method_directory` row by normalized name
  ([scripts/catalog-methods-trigger-comment.sql](/Users/artem/Projects/tosho-crm/scripts/catalog-methods-trigger-comment.sql))

## Important Stored Functions And Helpers Seen In Code

- `tosho.my_workspace_id()`
- `tosho.current_workspace_id()`
  - workspace resolution candidates

- `tosho.capture_admin_observability_snapshot(p_team_id uuid)`
  - observability capture function

- `tosho.get_admin_attachment_audit(p_workspace_id uuid)`
  - attachment audit/reporting function

- `tosho.get_stack_platform()`
  - Postgres version, `tosho` table/function counts, active cron count, database
    and storage size for the Dev → Стек footnote; SECURITY DEFINER because the
    numbers live in system catalogs, gated by the owner/CEO predicate inside

- `tosho.supplier_pool_summary()`, `tosho.list_supplier_products(...)`, `tosho.supplier_pool_categories(p_slug)`
  - read-only RPCs behind `/suppliers`; SECURITY INVOKER on purpose — the pool's
    RLS already answers "which team", so there is nothing to elevate

- `public.assert_quote_lock_from_quote_id()`
  - quote lock helper

- `next_design_task_number(...)`
  - RPC used by design task number generation

## Storage Layer

- Buckets currently visible in code/docs:
  - `attachments`
  - `avatars`
  - `public-assets`

- Internal storage tables referenced in docs/SQL tooling:
  - `storage.buckets`
  - `storage.objects`

## Relationship Heuristics

- `quotes.id` is a major join point for:
  - `quote_items`
  - `quote_item_runs`
  - `quote_attachments`
  - `quote_comments`
  - `quote_status_history`
  - `quote_sets`
  - design-task activity via `activity_log.entity_id` or `metadata.quote_id`

- `customers.id` feeds quotes, customers screens, customer quick views, and derived orders
- `leads.id` feeds lead views and can be matched back from quote/customer-like names in derived workflows
- `team_member_profiles.user_id + workspace_id` is the core team-profile identity
- `notifications.user_id` and `push_subscriptions.user_id` form the notification delivery chain

## Common Mistaken Assumptions To Avoid

- Do not assume design tasks live in a dedicated `design_tasks` table.
- Do not assume production UI is a thin wrapper around `tosho.orders`.
- Do not assume `public` is the primary app schema.
- Do not assume old docs describe every live table or metadata contract correctly.

## When Codex Should Start Here

- schema/table choice
- permissions, workspace boundaries, or RLS assumptions
- design-task or order cross-entity behavior
- notifications, observability, attachment storage, or runtime logging

# Tosho CRM Project Guide

Purpose: compact working memory for Codex and humans. Read this before broad repo search.

## Source Of Truth

For coding work in this repo, trust sources in this order:

1. `AGENTS.md`
2. this file
3. [docs/DB_MAP.md](/Users/artem/Projects/tosho-crm/docs/DB_MAP.md)
4. [docs/CODEX_WORKFLOWS.md](/Users/artem/Projects/tosho-crm/docs/CODEX_WORKFLOWS.md)
5. current tracked code in `src`, `netlify/functions`, `scripts`, `ops`, `netlify.toml`
6. older operational/handoff docs

If older docs conflict with current code, current code wins.

## Current-State Caveats

These are important and current as of April 19, 2026:

- Design tasks are mostly represented as `activity_log` rows with `action = 'design_task'` plus metadata, not as a dedicated `design_tasks` table.
- Orders/production views combine stored order rows and derived records from approved quotes in [src/features/orders/orderRecords.ts](/Users/artem/Projects/tosho-crm/src/features/orders/orderRecords.ts).
- Backup docs contain legacy snippets. The tracked active LaunchAgent is [ops/com.tosho.crm.backup.plist](/Users/artem/Projects/tosho-crm/ops/com.tosho.crm.backup.plist), which points to `scripts/backup-storage-and-upload.sh`.
- Storage backup currently uses tracked helpers `scripts/backup-storage.sh` and `scripts/backup-storage-if-needed.sh`; they write archives to `backups/storage` and offsite upload/reporting runs through `scripts/backup-storage-and-upload.sh`.
- Some handoff docs are useful for ops context, but they are not canonical sources for coding decisions.

## Project Snapshot

- Stack: React 18 + TypeScript + Vite frontend, Supabase backend, Netlify Functions for privileged/server-side logic.
- Main schema: `tosho`
- Public schema is used selectively for integration tables and helper functions.
- App domains:
  - overview and activity
  - quotes / estimates
  - customers and leads
  - design workflow
  - production / orders / ready-to-ship / logistics
  - product catalog
  - contractors
  - team management and HR
  - notifications
  - admin observability

## Directory Map

- Frontend entry:
  [src/main.tsx](/Users/artem/Projects/tosho-crm/src/main.tsx)
  [src/App.tsx](/Users/artem/Projects/tosho-crm/src/App.tsx)

- Auth and tenant context:
  [src/auth/AuthProvider.tsx](/Users/artem/Projects/tosho-crm/src/auth/AuthProvider.tsx)
  [src/lib/workspace.ts](/Users/artem/Projects/tosho-crm/src/lib/workspace.ts)
  [src/lib/permissions.ts](/Users/artem/Projects/tosho-crm/src/lib/permissions.ts)
  [src/lib/workspaceMemberDirectory.ts](/Users/artem/Projects/tosho-crm/src/lib/workspaceMemberDirectory.ts)

- Frontend data and shared logic:
  [src/lib/toshoApi.ts](/Users/artem/Projects/tosho-crm/src/lib/toshoApi.ts)
  [src/lib/customerLogo.ts](/Users/artem/Projects/tosho-crm/src/lib/customerLogo.ts)
  [src/lib/avatarUrl.ts](/Users/artem/Projects/tosho-crm/src/lib/avatarUrl.ts)
  [src/lib/attachmentPreview.ts](/Users/artem/Projects/tosho-crm/src/lib/attachmentPreview.ts)
  [src/lib/workflowNotifications.ts](/Users/artem/Projects/tosho-crm/src/lib/workflowNotifications.ts)
  [src/lib/designTaskActivity.ts](/Users/artem/Projects/tosho-crm/src/lib/designTaskActivity.ts)
  [src/lib/designTaskTimer.ts](/Users/artem/Projects/tosho-crm/src/lib/designTaskTimer.ts)
  [src/lib/runtimeErrorLogger.ts](/Users/artem/Projects/tosho-crm/src/lib/runtimeErrorLogger.ts)

- Feature directories:
  [src/features/quotes](/Users/artem/Projects/tosho-crm/src/features/quotes)
  [src/features/orders](/Users/artem/Projects/tosho-crm/src/features/orders)
  [src/features/catalog/ProductCatalogPage/index.tsx](/Users/artem/Projects/tosho-crm/src/features/catalog/ProductCatalogPage/index.tsx)

- Server functions:
  [/netlify/functions](/Users/artem/Projects/tosho-crm/netlify/functions)

- SQL and maintenance scripts:
  [/scripts](/Users/artem/Projects/tosho-crm/scripts)

- Netlify config:
  [netlify.toml](/Users/artem/Projects/tosho-crm/netlify.toml)

- Ops/local automation:
  [/ops](/Users/artem/Projects/tosho-crm/ops)

## Navigation Surfaces

When changing a route or top-level module, these files often all matter:

- route definitions and guards in [src/App.tsx](/Users/artem/Projects/tosho-crm/src/App.tsx)
- route preloading in [src/routes/routePreload.ts](/Users/artem/Projects/tosho-crm/src/routes/routePreload.ts)
- sidebar and shell in [src/layout/AppLayout.tsx](/Users/artem/Projects/tosho-crm/src/layout/AppLayout.tsx)
- command navigation in [src/components/app/CommandPalette.tsx](/Users/artem/Projects/tosho-crm/src/components/app/CommandPalette.tsx)
- mobile tabs in [src/components/app/TabBar.tsx](/Users/artem/Projects/tosho-crm/src/components/app/TabBar.tsx)
- runtime route logging in `getRuntimeRouteContext()` inside [src/App.tsx](/Users/artem/Projects/tosho-crm/src/App.tsx)

## Canonical Product Areas

### Overview And Activity

- [src/pages/OverviewPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OverviewPage.tsx)
- [src/pages/ActivityPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/ActivityPage.tsx)

### Quotes And Estimating

- [src/pages/OrdersEstimatesPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersEstimatesPage.tsx)
- [src/pages/OrdersEstimateDetailsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersEstimateDetailsPage.tsx)
- [src/pages/QuotesPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/QuotesPage.tsx)
- [src/pages/QuoteDetailsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/QuoteDetailsPage.tsx)
- [src/features/quotes/quotes-page/config.ts](/Users/artem/Projects/tosho-crm/src/features/quotes/quotes-page/config.ts)
- [src/features/quotes/quote-details/config.tsx](/Users/artem/Projects/tosho-crm/src/features/quotes/quote-details/config.tsx)
- [src/lib/toshoApi.ts](/Users/artem/Projects/tosho-crm/src/lib/toshoApi.ts)

### Customers And Leads

- [src/pages/OrdersCustomersPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersCustomersPage.tsx)
- [src/components/customers](/Users/artem/Projects/tosho-crm/src/components/customers)
- customer and lead fetch helpers in [src/lib/toshoApi.ts](/Users/artem/Projects/tosho-crm/src/lib/toshoApi.ts)

### Design Workflow

- [src/pages/DesignPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/DesignPage.tsx)
- [src/pages/DesignTaskPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/DesignTaskPage.tsx)
- [src/lib/designTaskActivity.ts](/Users/artem/Projects/tosho-crm/src/lib/designTaskActivity.ts)
- [src/lib/designTaskTimer.ts](/Users/artem/Projects/tosho-crm/src/lib/designTaskTimer.ts)
- [src/lib/workflowNotifications.ts](/Users/artem/Projects/tosho-crm/src/lib/workflowNotifications.ts)

### Production / Orders / Logistics

- [src/pages/OrdersProductionPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersProductionPage.tsx)
- [src/pages/OrdersProductionDetailsRoutePage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersProductionDetailsRoutePage.tsx)
- [src/pages/OrdersReadyToShipPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersReadyToShipPage.tsx)
- [src/pages/LogisticsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/LogisticsPage.tsx)
- [src/features/orders/orderRecords.ts](/Users/artem/Projects/tosho-crm/src/features/orders/orderRecords.ts)
- [src/features/orders/config.ts](/Users/artem/Projects/tosho-crm/src/features/orders/config.ts)

### Catalog

- [src/features/catalog/ProductCatalogPage/index.tsx](/Users/artem/Projects/tosho-crm/src/features/catalog/ProductCatalogPage/index.tsx)
- catalog hooks and components under [src/features/catalog/ProductCatalogPage](/Users/artem/Projects/tosho-crm/src/features/catalog/ProductCatalogPage)

### Contractors

- [src/pages/ContractorsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/ContractorsPage.tsx)
- [scripts/contractors-schema.sql](/Users/artem/Projects/tosho-crm/scripts/contractors-schema.sql)

### Team / HR

- [src/pages/TeamPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/TeamPage.tsx)
- [src/pages/TeamMembersPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/TeamMembersPage.tsx)
- [netlify/functions/team-member-employment.ts](/Users/artem/Projects/tosho-crm/netlify/functions/team-member-employment.ts)
- [netlify/functions/team-member-probation.ts](/Users/artem/Projects/tosho-crm/netlify/functions/team-member-probation.ts)
- [scripts/team-member-profiles.sql](/Users/artem/Projects/tosho-crm/scripts/team-member-profiles.sql)

### Notifications

- [src/pages/NotificationsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/NotificationsPage.tsx)
- [src/lib/pushNotifications.ts](/Users/artem/Projects/tosho-crm/src/lib/pushNotifications.ts)
- [netlify/functions/_notificationDelivery.ts](/Users/artem/Projects/tosho-crm/netlify/functions/_notificationDelivery.ts)
- [netlify/functions/notify-users.ts](/Users/artem/Projects/tosho-crm/netlify/functions/notify-users.ts)

### Admin Observability

- [src/pages/AdminObservabilityPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/AdminObservabilityPage.tsx)
- [src/components/admin-observability/ObservabilityPanels.tsx](/Users/artem/Projects/tosho-crm/src/components/admin-observability/ObservabilityPanels.tsx)
- [scripts/admin-observability.sql](/Users/artem/Projects/tosho-crm/scripts/admin-observability.sql)
- [netlify/functions/admin-attachment-audit.ts](/Users/artem/Projects/tosho-crm/netlify/functions/admin-attachment-audit.ts)

## Current Routes

- `/overview`
- `/activity`
- `/notifications`
- `/team`
- `/orders/customers`
- `/orders/estimates`
- `/orders/estimates/:id`
- `/orders/production`
- `/orders/production/:id`
- `/orders/ready-to-ship`
- `/catalog/products`
- `/logistics`
- `/design`
- `/design/:id`
- `/contractors`
- `/settings/members`
- `/profile`
- `/admin/observability`

## Architecture Patterns To Remember

### Frontend Auth And Permissions

- Frontend uses anon Supabase client plus RLS.
- Auth/team context is resolved in [src/auth/AuthProvider.tsx](/Users/artem/Projects/tosho-crm/src/auth/AuthProvider.tsx).
- Workspace and membership resolution should go through [src/lib/workspace.ts](/Users/artem/Projects/tosho-crm/src/lib/workspace.ts).
- Permission logic should reuse [src/lib/permissions.ts](/Users/artem/Projects/tosho-crm/src/lib/permissions.ts).
- Module access also lives in workspace member directory metadata, not only in `access_role`.

### Frontend UI Tokens

- New UI states should prefer semantic tokens and shared tone helpers/components instead of raw palette classes.
- For badges, chips, avatar markers, and similar status surfaces, implement light/dark-safe token classes on the first pass.
- If a visual pattern repeats, treat it as a component or reusable style contract, not a one-off page patch.

### Avatar And Logo Sources

- Team/user avatars should go through the canonical path:
  [src/lib/workspaceMemberDirectory.ts](/Users/artem/Projects/tosho-crm/src/lib/workspaceMemberDirectory.ts)
  [src/lib/avatarUrl.ts](/Users/artem/Projects/tosho-crm/src/lib/avatarUrl.ts)
  [src/components/app/avatar-kit.tsx](/Users/artem/Projects/tosho-crm/src/components/app/avatar-kit.tsx)
- Customer/lead/company logos should go through normalized logo sources from:
  [src/lib/customerLogo.ts](/Users/artem/Projects/tosho-crm/src/lib/customerLogo.ts)
  and already-normalized `customer_logo_url` reads from
  [src/lib/toshoApi.ts](/Users/artem/Projects/tosho-crm/src/lib/toshoApi.ts)
- For overview/notifications/design surfaces, prefer reusing cached member/logo directories over adding fresh per-card lookups.
- Do not render raw Supabase REST URLs, raw storage paths, or page-local avatar/logo fallback logic if a shared helper already exists.

### Performance Guardrail

- Any code change should be reviewed for first-render cost, query count, and cache reuse, not only for visual correctness.
- Reuse existing cached directories/helpers before adding new fetches.
- Keep list queries bounded and avoid N+1 fetch patterns inside page render paths.
- When a page already has an established lightweight fetch shape, preserve or improve it instead of expanding the data load opportunistically.

### Netlify Function Pattern

- Most privileged serverless flows use:
  - user-scoped client with `SUPABASE_ANON_KEY` + bearer token
  - admin client with `SUPABASE_SERVICE_ROLE_KEY`
- This pattern is canonical for permission-checked writes.

### Design Task Model

- Design tasks are primarily `activity_log` entities with `action = 'design_task'`.
- Shared design work is modeled as `1 primary assignee + collaborator metadata` on the same design-task activity row, not as duplicated tasks or equal multi-assignee ownership.
- Related history often uses additional `activity_log` actions such as:
  - `design_task_status`
  - `design_task_assignment`
  - `design_task_collaborators`
  - `design_task_estimate`
  - `design_output_upload`
  - `design_output_selection`
- Timer data is stored separately in `design_task_timer_sessions`.
- Changing design-task metadata contracts can affect:
  - design pages
  - quote details
  - customer quick views
  - order derivation
  - observability SQL
  - attachment migration/audit scripts

### Order Model

- Production/order UI is not driven by one table alone.
- [src/features/orders/orderRecords.ts](/Users/artem/Projects/tosho-crm/src/features/orders/orderRecords.ts) merges:
  - stored `tosho.orders`
  - `tosho.order_items`
  - approved quotes
  - quote runs and quote items
  - customer/lead data
  - approved design assets from design-task activity
- When production screens look “wrong”, inspect `orderRecords.ts` before blaming one table.

### Attachments And Storage

- Attachment and preview behavior is centralized in [src/lib/attachmentPreview.ts](/Users/artem/Projects/tosho-crm/src/lib/attachmentPreview.ts).
- Variant naming convention:
  - `__thumb.webp`
  - `__preview.webp`
- Server-generated previews matter for PDF and TIFF paths.
- Storage migrations and cleanup scripts are already split by asset type under `scripts/`.

### Notifications

- Notification delivery has two layers:
  - in-app rows in `notifications`
  - optional browser push via `push_subscriptions`
- Workflow notifications are coordinated through [src/lib/workflowNotifications.ts](/Users/artem/Projects/tosho-crm/src/lib/workflowNotifications.ts).

## Environment Map

- `.env.local`
  - local runtime and dev secrets
  - frontend-safe `VITE_*`
  - some local script/function testing secrets

- `.env.backup`
  - backup and ops secrets
  - not the source of truth for general application runtime

- Netlify environment
  - server-side production secrets for functions

## Docs Status

Use these as coding sources:

- `AGENTS.md`
- `docs/CODEX_PROJECT_GUIDE.md`
- `docs/DB_MAP.md`
- `docs/CODEX_WORKFLOWS.md`

Use these as operational context, not primary coding truth:

- [docs/BACKUP.md](/Users/artem/Projects/tosho-crm/docs/BACKUP.md)
- [docs/SERVICES_ACCESS_REGISTRY.md](/Users/artem/Projects/tosho-crm/docs/SERVICES_ACCESS_REGISTRY.md)
- [docs/DIRECTOR_ACCESS_HANDOFF.md](/Users/artem/Projects/tosho-crm/docs/DIRECTOR_ACCESS_HANDOFF.md)
- [docs/HANDOFF_SIMPLE_TEMPLATE_UA.md](/Users/artem/Projects/tosho-crm/docs/HANDOFF_SIMPLE_TEMPLATE_UA.md)
- [docs/ONEPASSWORD_FILL_CHECKLIST.md](/Users/artem/Projects/tosho-crm/docs/ONEPASSWORD_FILL_CHECKLIST.md)

## Search Hints For Codex

- Quote or estimate task:
  start with `src/lib/toshoApi.ts`, `OrdersEstimatesPage`, `OrdersEstimateDetailsPage`, `QuotesPage`, `QuoteDetailsPage`

- Customer or lead task:
  start with `OrdersCustomersPage` and `toshoApi.ts`

- Design task or design board task:
  start with `DesignPage`, `DesignTaskPage`, `designTaskActivity.ts`, `workflowNotifications.ts`

- Production or logistics task:
  start with `features/orders/orderRecords.ts`, `OrdersProductionPage`, `OrdersProductionDetailsPage`, `features/orders/config.ts`

- Permission or access task:
  start with `AuthProvider`, `workspace.ts`, `permissions.ts`, `workspaceMemberDirectory.ts`, `TeamMembersPage`

- Storage or preview task:
  start with `attachmentPreview.ts` and the relevant storage script

- Push or reminder task:
  start with `_notificationDelivery.ts`, `workflowNotifications.ts`, and the relevant Netlify function

- Admin monitoring or cleanup task:
  start with `AdminObservabilityPage.tsx`, `ObservabilityPanels.tsx`, and `scripts/admin-observability.sql`

- Dropbox integration task:
  start with `netlify/functions/_lib/dropbox.service.ts` and the `dropbox-*` functions

## Default Task Heuristic

For a new task:

1. read this guide
2. open only the domain-specific files
3. open `DB_MAP` if data shape matters
4. open `CODEX_WORKFLOWS` if implementation pattern matters
5. only then use broader search

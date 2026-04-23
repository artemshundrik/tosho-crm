# Tosho CRM Workflows

Purpose: safe implementation and verification rules for this repo.

## 0. Preflight

Before changing code:

1. Read `AGENTS.md`.
2. Read [docs/CODEX_PROJECT_GUIDE.md](/Users/artem/Projects/tosho-crm/docs/CODEX_PROJECT_GUIDE.md).
3. If data shape matters, read [docs/DB_MAP.md](/Users/artem/Projects/tosho-crm/docs/DB_MAP.md).
4. Prefer current code over older prose docs when they disagree.
5. If the task is in backup/ops territory, verify the actual tracked files and local machine state before assuming the docs are fully current.

## 1. New Frontend Change

Use when the task is mainly UI or client behavior.

1. Start from the route/page entrypoint.
2. Open the page file.
3. Open the closest `src/lib/*` or `src/features/*` helper.
4. Reuse permission, workspace, and data helpers before adding new fetch/util layers.
5. If the change spans multiple files or types, verify with `npm run build`.
6. Check the change for avoidable render/query regressions before finishing.

UI implementation rules:

- if a new badge, status chip, avatar marker, or tone state is introduced, prefer a reusable component or a local/shared tone helper instead of repeating raw class strings
- prefer semantic design tokens such as `info/success/warning/danger` surfaces over hardcoded palette classes like `pink-50`, `sky-50`, `violet-200`, etc.
- new UI states must be valid in both light and dark theme on the first implementation, not patched later
- when a pattern repeats more than once on a page or across modules, consolidate it before adding more one-off variants
- avatar surfaces must reuse the canonical member/avatar helpers rather than page-local URL assembly
- customer/lead/company logo surfaces must reuse normalized logo helpers and `EntityAvatar`, not raw table values without normalization
- watch for performance regressions: avoid N+1 fetches, reuse cached member/logo directories, and keep overview/list queries bounded
- after a major feature or multi-step UI iteration, update the Codex docs in the same task instead of leaving the final contract only in conversation history

## 2. New Route Or Module Change

When adding or changing a top-level route/module, inspect all relevant surfaces:

- [src/App.tsx](/Users/artem/Projects/tosho-crm/src/App.tsx)
- [src/routes/routePreload.ts](/Users/artem/Projects/tosho-crm/src/routes/routePreload.ts)
- [src/layout/AppLayout.tsx](/Users/artem/Projects/tosho-crm/src/layout/AppLayout.tsx)
- [src/components/app/CommandPalette.tsx](/Users/artem/Projects/tosho-crm/src/components/app/CommandPalette.tsx)
- [src/components/app/TabBar.tsx](/Users/artem/Projects/tosho-crm/src/components/app/TabBar.tsx) for mobile top-level modules
- `getRuntimeRouteContext()` in [src/App.tsx](/Users/artem/Projects/tosho-crm/src/App.tsx) for runtime error labeling
- [src/lib/workspaceMemberDirectory.ts](/Users/artem/Projects/tosho-crm/src/lib/workspaceMemberDirectory.ts) and [src/pages/TeamMembersPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/TeamMembersPage.tsx) if module access changes

## 3. Quote Workflow Change

Read first:

- [src/lib/toshoApi.ts](/Users/artem/Projects/tosho-crm/src/lib/toshoApi.ts)
- [src/pages/OrdersEstimatesPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersEstimatesPage.tsx)
- [src/pages/OrdersEstimateDetailsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersEstimateDetailsPage.tsx)
- [src/pages/QuotesPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/QuotesPage.tsx)
- [src/pages/QuoteDetailsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/QuoteDetailsPage.tsx)
- [src/lib/workflowNotifications.ts](/Users/artem/Projects/tosho-crm/src/lib/workflowNotifications.ts)

Checklist:

- preserve `team_id` and workspace boundary assumptions
- check whether status changes should notify users
- check whether quote comments, attachments, design tasks, or derived orders depend on the changed field/state
- avoid duplicating existing quote fetch logic

## 4. Design Task Workflow Change

Design tasks are activity-log backed. Start there conceptually.

Read first:

- [src/pages/DesignPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/DesignPage.tsx)
- [src/pages/DesignTaskPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/DesignTaskPage.tsx)
- [src/lib/designTaskActivity.ts](/Users/artem/Projects/tosho-crm/src/lib/designTaskActivity.ts)
- [src/lib/designTaskTimer.ts](/Users/artem/Projects/tosho-crm/src/lib/designTaskTimer.ts)
- [src/lib/workflowNotifications.ts](/Users/artem/Projects/tosho-crm/src/lib/workflowNotifications.ts)
- [src/lib/customerLogo.ts](/Users/artem/Projects/tosho-crm/src/lib/customerLogo.ts) when customer/lead branding appears on design surfaces
- [src/features/orders/orderRecords.ts](/Users/artem/Projects/tosho-crm/src/features/orders/orderRecords.ts) if outputs or approvals matter downstream
- [scripts/admin-observability.sql](/Users/artem/Projects/tosho-crm/scripts/admin-observability.sql) if design metadata affects observability

Checklist:

- confirm assignee behavior
- treat design-task ownership as `1 primary assignee + optional collaborators`, not equal multi-assignee ownership
- confirm stakeholder notifications
- confirm quote linkage
- confirm metadata fields used by downstream readers
- confirm display metadata such as `design_task_number`, `quote_number`, `customer_name`, `customer_logo_url`, and assignee avatar/name fallbacks used by overview/notifications/design lists
- confirm role-based edit restrictions for designers vs managers/admins

## 4A. Overview / Activity / Notifications Visual Identity Change

Read first:

- [src/pages/OverviewPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OverviewPage.tsx)
- [src/pages/ActivityPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/ActivityPage.tsx)
- [src/pages/NotificationsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/NotificationsPage.tsx)
- [src/lib/customerLogo.ts](/Users/artem/Projects/tosho-crm/src/lib/customerLogo.ts)
- [src/lib/workspaceMemberDirectory.ts](/Users/artem/Projects/tosho-crm/src/lib/workspaceMemberDirectory.ts)
- [src/lib/avatarUrl.ts](/Users/artem/Projects/tosho-crm/src/lib/avatarUrl.ts)
- [src/components/app/avatar-kit.tsx](/Users/artem/Projects/tosho-crm/src/components/app/avatar-kit.tsx)

Checklist:

- do not invent a new avatar/logo resolution path for overview cards or feed rows
- prefer cached member/logo directories over repeated per-row fetches
- if a card shows a quote or design task, confirm that number/title/logo are derived from the same normalized metadata/source used elsewhere in the app
- if activity cards show actors, confirm avatar fallback works by `user_id` and by normalized display name when `user_id` is absent
- inspect whether the change increased first-load queries or widened existing query result sets

## 5. Orders / Production Change

Read first:

- [src/features/orders/orderRecords.ts](/Users/artem/Projects/tosho-crm/src/features/orders/orderRecords.ts)
- [src/features/orders/config.ts](/Users/artem/Projects/tosho-crm/src/features/orders/config.ts)
- [src/pages/OrdersProductionPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersProductionPage.tsx)
- [src/pages/OrdersProductionDetailsPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersProductionDetailsPage.tsx)
- [src/pages/OrdersReadyToShipPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersReadyToShipPage.tsx)

Checklist:

- determine whether the issue is in stored order rows or derived order assembly
- check design approvals and quote-derived readiness logic
- check customer/contact/legal-entity derivation when UI looks incomplete

## 6. Customers / Leads Change

Read first:

- [src/pages/OrdersCustomersPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/OrdersCustomersPage.tsx)
- customer dialogs/components under [src/components/customers](/Users/artem/Projects/tosho-crm/src/components/customers)
- [src/lib/toshoApi.ts](/Users/artem/Projects/tosho-crm/src/lib/toshoApi.ts)

Checklist:

- check both customer and lead paths
- confirm related quotes, orders, and design-task quick views if identity fields change

## 7. Catalog Change

Read first:

- [src/features/catalog/ProductCatalogPage/index.tsx](/Users/artem/Projects/tosho-crm/src/features/catalog/ProductCatalogPage/index.tsx)
- nearby hooks/components under `src/features/catalog/ProductCatalogPage`

Checklist:

- keep catalog hooks modular
- verify downstream quote consumers if catalog schema or model fields change

## 8. Permissions / Membership / Module Access Change

Read first:

- [src/auth/AuthProvider.tsx](/Users/artem/Projects/tosho-crm/src/auth/AuthProvider.tsx)
- [src/lib/workspace.ts](/Users/artem/Projects/tosho-crm/src/lib/workspace.ts)
- [src/lib/permissions.ts](/Users/artem/Projects/tosho-crm/src/lib/permissions.ts)
- [src/lib/workspaceMemberDirectory.ts](/Users/artem/Projects/tosho-crm/src/lib/workspaceMemberDirectory.ts)
- [src/pages/TeamMembersPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/TeamMembersPage.tsx)

Rules:

- do not introduce ad hoc role normalization
- do not bypass workspace resolution helpers
- keep frontend and serverless permission checks aligned
- remember that module access can be independent from `access_role`

## 9. Netlify Function Change

Canonical pattern:

1. Validate env vars early.
2. Read auth token from `Authorization` header when the function is user initiated.
3. Build user-scoped client with anon key and bearer token for auth/RLS gating.
4. Build admin client with service-role key only for privileged operations.
5. Return explicit JSON status codes.

Reference files:

- [netlify/functions/quote-comments.ts](/Users/artem/Projects/tosho-crm/netlify/functions/quote-comments.ts)
- [netlify/functions/team-member-employment.ts](/Users/artem/Projects/tosho-crm/netlify/functions/team-member-employment.ts)
- [netlify/functions/team-member-probation.ts](/Users/artem/Projects/tosho-crm/netlify/functions/team-member-probation.ts)
- [netlify/functions/_notificationDelivery.ts](/Users/artem/Projects/tosho-crm/netlify/functions/_notificationDelivery.ts)

Do not:

- use service-role as the only gate for user-driven actions
- hide permission failures behind generic `500` responses when `401` or `403` is correct

## 10. Notifications Change

Read first:

- [src/lib/workflowNotifications.ts](/Users/artem/Projects/tosho-crm/src/lib/workflowNotifications.ts)
- [netlify/functions/_notificationDelivery.ts](/Users/artem/Projects/tosho-crm/netlify/functions/_notificationDelivery.ts)
- [docs/push-notifications.md](/Users/artem/Projects/tosho-crm/docs/push-notifications.md)

Checklist:

- identify the recipient set
- exclude the actor when appropriate
- dedupe push endpoints
- disable stale push subscriptions on `404` and `410`

## 10A. ToSho AI / Support Domain Change

Read first:

- [src/features/tosho-ai/ToShoAiConsole.tsx](/Users/artem/Projects/tosho-crm/src/features/tosho-ai/ToShoAiConsole.tsx)
- [src/components/app/ToShoAiLauncherButton.tsx](/Users/artem/Projects/tosho-crm/src/components/app/ToShoAiLauncherButton.tsx)
- [src/lib/toshoAi.ts](/Users/artem/Projects/tosho-crm/src/lib/toshoAi.ts)
- [netlify/functions/tosho-ai.ts](/Users/artem/Projects/tosho-crm/netlify/functions/tosho-ai.ts)
- [scripts/tosho-ai.sql](/Users/artem/Projects/tosho-crm/scripts/tosho-ai.sql)

Checklist:

- preserve the user-scoped auth check first, privileged write second pattern
- keep route context, entity ids, and runtime-error context attached to the request
- avoid notifying the actor about their own escalation
- keep knowledge items curated and attributed; do not silently turn raw chat logs into canonical answers
- watch first-render cost in the launcher/sheet and avoid loading ToSho AI data when the surface is closed
- keep ToSho AI as a drawer-first shell surface unless the task explicitly reintroduces a top-level route
- keep the floating launcher hidden while the drawer is open
- avoid hover/focus animation patterns on the launcher that shift layout or visibly jitter
- keep the drawer header brand-only and do not duplicate the main `Шо треба?` heading in the same header row
- prefer divider-separated sections over nested card-inside-card composition when refining the ToSho AI drawer UI
- verify `OPENAI_API_KEY`, `OPENAI_MODEL`, `TELEGRAM_SUPPORT_BOT_TOKEN`, `TELEGRAM_SUPPORT_CHAT_ID`, and `TOSHO_APP_BASE_URL` assumptions before debugging runtime behavior

## 11. Attachment / Storage Change

Read first:

- [src/lib/attachmentPreview.ts](/Users/artem/Projects/tosho-crm/src/lib/attachmentPreview.ts)
- relevant migration/audit script in [/scripts](/Users/artem/Projects/tosho-crm/scripts)
- [src/pages/AdminObservabilityPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/AdminObservabilityPage.tsx) if cleanup metrics are affected

Checklist:

- preserve variant naming conventions
- preserve signed URL behavior
- treat raster and PDF/TIFF preview paths separately
- confirm whether deletion must remove original plus variants

## 12. Observability Change

Read first:

- [src/pages/AdminObservabilityPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/AdminObservabilityPage.tsx)
- [src/components/admin-observability/ObservabilityPanels.tsx](/Users/artem/Projects/tosho-crm/src/components/admin-observability/ObservabilityPanels.tsx)
- [scripts/admin-observability.sql](/Users/artem/Projects/tosho-crm/scripts/admin-observability.sql)

Checklist:

- determine whether the page uses snapshot data, live data, or audit-function output
- avoid adding expensive broad queries directly in the page when a snapshot or server-side function is more appropriate
- keep backup status and attachment audit behavior intact unless the task explicitly changes them

## 13. Backup / Ops Change

Treat backup work as an ops area, not a normal app area.

Read first:

- [ops/com.tosho.crm.backup.plist](/Users/artem/Projects/tosho-crm/ops/com.tosho.crm.backup.plist)
- [docs/BACKUP.md](/Users/artem/Projects/tosho-crm/docs/BACKUP.md)
- [docs/SERVICES_ACCESS_REGISTRY.md](/Users/artem/Projects/tosho-crm/docs/SERVICES_ACCESS_REGISTRY.md)

Rules:

- verify the actual tracked script path before changing docs or automation
- verify local launchd state if the task is machine-specific
- do not assume storage-backup flow is fully reproducible from git alone

## 14. Schema Change

When changing schema:

1. Find the closest existing SQL script in [/scripts](/Users/artem/Projects/tosho-crm/scripts).
2. Prefer additive changes over destructive changes.
3. Search `src`, `netlify/functions`, and `scripts` for every affected table/column/metadata field.
4. Check for compatibility fallbacks already present in code.
5. Update coding docs if the schema change alters future navigation or implementation patterns.

Minimum verification:

- `npm run build`
- targeted search for old names and affected metadata keys
- inspect the main page/function paths that rely on the change
- if the change affects a list/dashboard/feed, explicitly sanity-check that it did not introduce obvious performance regressions such as N+1 fetches, unbounded reads, or duplicate directory/logo loads

## 15. Docs Change

If updating docs:

- keep `AGENTS.md`, `CODEX_PROJECT_GUIDE.md`, `DB_MAP.md`, and `CODEX_WORKFLOWS.md` aligned with current code
- if an operational doc is partly legacy, say so explicitly instead of silently pretending it is canonical
- prefer short current-state caveats over large speculative cleanup

## 16. Verification Strategy

Use the lightest check that matches the scope.

- one-file UI tweak:
  - build only if imports/types/shared logic changed

- shared frontend logic or multi-file TS change:
  - `npm run build`

- serverless change:
  - inspect function for env/auth/status-code pattern
  - run `npm run build` if shared TS imports changed

- storage/migration script change:
  - verify env assumptions
  - verify target buckets/paths
  - do not run destructive cleanup unless explicitly intended

- route/module change:
  - verify all navigation surfaces listed in section 2

## 17. Prompt Shortcuts For Codex

Useful task openers:

- `Use AGENTS.md and docs/CODEX_PROJECT_GUIDE.md first.`
- `Use docs/DB_MAP.md and verify table impact before editing.`
- `Follow docs/CODEX_WORKFLOWS.md for this Netlify function change.`
- `Do not broad-search the repo; start from the canonical files in the guide.`

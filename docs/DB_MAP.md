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

## Catalog / Product Configuration Tables

- `catalog_models`
  - core product model data for quotes and catalog UI

- `catalog_types`
- `catalog_methods`
- `catalog_model_methods`
- `catalog_price_tiers`
- `catalog_print_positions`
- `catalog_kinds`

These tables together power the product catalog and quote item configuration.

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

- `_healthcheck`
  - lightweight health probe table/view used by frontend helper

## Observability And Backup Tables

- `admin_observability_snapshots`
  - snapshot table for storage/database/admin metrics
  - tracked schema in [scripts/admin-observability.sql](/Users/artem/Projects/tosho-crm/scripts/admin-observability.sql)

- `backup_runs`
  - storage backup execution history used in admin observability

## Important Stored Functions And Helpers Seen In Code

- `tosho.my_workspace_id()`
- `tosho.current_workspace_id()`
  - workspace resolution candidates

- `tosho.capture_admin_observability_snapshot(p_team_id uuid)`
  - observability capture function

- `tosho.get_admin_attachment_audit(p_workspace_id uuid)`
  - attachment audit/reporting function

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

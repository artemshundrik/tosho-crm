# Director Access Handoff

Status note for Codex and engineering work:
- this is an executive handoff / ops document, not the primary source of truth for coding decisions
- for coding, architecture, schema, and implementation patterns use:
  - [AGENTS.md](/Users/artem/Projects/tosho-crm/AGENTS.md)
  - [docs/CODEX_PROJECT_GUIDE.md](/Users/artem/Projects/tosho-crm/docs/CODEX_PROJECT_GUIDE.md)
  - [docs/DB_MAP.md](/Users/artem/Projects/tosho-crm/docs/DB_MAP.md)
  - [docs/CODEX_WORKFLOWS.md](/Users/artem/Projects/tosho-crm/docs/CODEX_WORKFLOWS.md)
- if this document conflicts with current tracked code, current code wins

## Purpose

This document defines which critical accesses the director must have for `Tosho CRM`, where they should be stored, and what each one is used for.

Primary rule:
- all real credentials must live in `1Password`
- local `.env` files are working copies only
- no secrets should be transferred in chat, email, or random notes

## Recommended 1Password structure

Create these vault items:

1. `Tosho CRM / Supabase`
2. `Tosho CRM / Netlify`
3. `Tosho CRM / Dropbox`
4. `Tosho CRM / Web Push`
5. `Tosho CRM / Backups`
6. `Tosho CRM / Recovery Notes`

If needed, group them inside one vault:
- `Tosho CRM - Executive Access`

## Access list for director

### 1. Supabase

Criticality:
- highest

Purpose:
- database access
- auth and users
- storage buckets
- SQL editor
- service credentials

Director should have:
- access to Supabase project dashboard
- project URL
- anon key
- service role key
- storage bucket names used by CRM
- database backup connection details

Store in `1Password` item:
- `Tosho CRM / Supabase`

Suggested fields:
- `Project URL`
- `Project Ref`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_AVATAR_BUCKET`
- `VITE_SUPABASE_ITEM_VISUAL_BUCKET`
- `Admin URL`
- `Owner`
- `Last verified`

### 2. Netlify

Criticality:
- highest

Purpose:
- frontend hosting
- environment variables for server functions
- deploy control

Director should have:
- access to Netlify site/project
- ability to view and manage environment variables
- deploy and rollback visibility

Store in `1Password` item:
- `Tosho CRM / Netlify`

Suggested fields:
- `Site name`
- `Site URL`
- `Admin URL`
- `Team/Workspace`
- `Owner`
- `Notes about deploy flow`

### 3. Dropbox

Criticality:
- high

Purpose:
- CRM Dropbox integration
- offsite backup upload

Director should have:
- access to Dropbox app credentials
- refresh token
- backup root path
- business Dropbox folder context

Store in `1Password` item:
- `Tosho CRM / Dropbox`

Suggested fields:
- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_BACKUP_ROOT`
- `VITE_DROPBOX_TEST_SHARED_URL`
- `Dropbox App Console URL`
- `Owner`
- `Last verified`

### 4. Web Push

Criticality:
- medium

Purpose:
- browser push notifications

Director should have:
- visibility of public/private VAPID keys
- subject used for notifications

Store in `1Password` item:
- `Tosho CRM / Web Push`

Suggested fields:
- `VITE_WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- `Owner`
- `Last verified`

### 5. Backups

Criticality:
- highest

Purpose:
- database restore
- storage backup and restore
- disaster recovery

Director should have:
- backup root location
- DB backup connection string
- storage S3 backup credentials
- storage bucket list
- retention settings
- restore procedure reference

Store in `1Password` item:
- `Tosho CRM / Backups`

Suggested fields:
- `BACKUP_ROOT`
- `BACKUP_WORKSPACE_ID`
- `BACKUP_DB_URL`
- `BACKUP_INCLUDE_STORAGE`
- `STORAGE_S3_ENDPOINT`
- `STORAGE_S3_ACCESS_KEY_ID`
- `STORAGE_S3_SECRET_ACCESS_KEY`
- `STORAGE_BUCKETS`
- `KEEP_ARCHIVES`
- `KEEP_STORAGE_ARCHIVES`
- `DROPBOX_RETENTION_DATABASE_DAILY`
- `DROPBOX_RETENTION_DATABASE_WEEKLY`
- `DROPBOX_RETENTION_DATABASE_MONTHLY`
- `DROPBOX_RETENTION_STORAGE_DAILY`
- `DROPBOX_RETENTION_STORAGE_WEEKLY`
- `DROPBOX_RETENTION_STORAGE_MONTHLY`
- `PSQL_BIN`
- `Restore doc`

### 6. Recovery Notes

Criticality:
- highest

Purpose:
- business continuity
- fast recovery if a technical owner becomes unavailable

Store in `1Password` item:
- `Tosho CRM / Recovery Notes`

Suggested fields:
- `What is hosted where`
- `How to deploy`
- `How to restore DB`
- `How to restore Storage`
- `Who currently owns technical access`
- `Which services are business-critical`
- `Which secrets are tier-1`
- `Links to docs`

## Tier-1 secrets

These must always exist in `1Password` and be verified:

- `SUPABASE_SERVICE_ROLE_KEY`
- `BACKUP_DB_URL`
- `STORAGE_S3_SECRET_ACCESS_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

## What director should receive in practice

Minimum:
- read access to all items above
- access to the actual vendor dashboards where recovery may be needed

Preferred:
- full access in `1Password`
- admin access to Supabase and Netlify
- access to Dropbox app configuration and backup folder

## What should not be used for handoff

- `.env.local`
- `.env.backup`
- chat messages
- email threads
- random markdown notes with pasted credentials

These are not source-of-truth systems.

## Current project references

- service registry: `docs/SERVICES_ACCESS_REGISTRY.md`
- backup docs: `docs/BACKUP.md`
- push docs: `docs/push-notifications.md`

## Handoff checklist

1. Create all six items in `1Password`
2. Fill each item with current real values
3. Add director access to the vault or items
4. Verify Supabase dashboard access
5. Verify Netlify dashboard access
6. Verify Dropbox app and backup path access
7. Verify backup and restore notes are understandable without developer context
8. Mark each item with `Last verified`

# 1Password Fill Checklist

Status note:
- this is an ops/handoff fill plan, not a coding-source document
- for coding decisions and repo navigation use:
  - [AGENTS.md](/Users/artem/Projects/tosho-crm/AGENTS.md)
  - [docs/CODEX_PROJECT_GUIDE.md](/Users/artem/Projects/tosho-crm/docs/CODEX_PROJECT_GUIDE.md)
  - [docs/DB_MAP.md](/Users/artem/Projects/tosho-crm/docs/DB_MAP.md)
  - [docs/CODEX_WORKFLOWS.md](/Users/artem/Projects/tosho-crm/docs/CODEX_WORKFLOWS.md)
- values and confirmations in this file are operational snapshots and may lag behind current code or local machine state

## Purpose

This checklist is the practical version of the handoff docs.
It shows:

- which `1Password` items should exist
- which fields are already confirmed from code, env files, or the live database
- which fields still need manual verification in vendor dashboards
- which gaps in the current setup should be fixed before executive handoff is considered complete

Do not paste real secrets into git.
Use this file only as a fill plan.

## Confirmed from this repo and database

Confirmed without exposing secrets:

- local `.env.local` exists and currently contains:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `VITE_SUPABASE_AVATAR_BUCKET`
  - `VITE_WEB_PUSH_PUBLIC_KEY`
  - `DROPBOX_APP_KEY`
  - `DROPBOX_APP_SECRET`
  - `DROPBOX_REFRESH_TOKEN`
  - `VITE_DROPBOX_TEST_SHARED_URL`
- local `.env.backup` exists and currently contains:
  - `BACKUP_ROOT`
  - `BACKUP_WORKSPACE_ID`
  - `BACKUP_DB_URL`
  - `BACKUP_INCLUDE_STORAGE`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
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
- live Supabase storage buckets currently visible in the database:
  - `attachments`
  - `avatars`
  - `public-assets`
- live database contains recovery-relevant internal tables:
  - `tosho.backup_runs`
  - `tosho.admin_observability_snapshots`
  - `tosho.runtime_errors`
  - `vault.secrets`
  - `storage.buckets`
  - `storage.objects`
- latest confirmed monitoring data seen in the database:
  - latest `backup_runs` rows include:
    - `database / success / daily / 2026-04-21T13:29:29Z`
    - `storage / success / weekly / 2026-04-19T10:08:04Z`
  - `admin_observability_snapshots`: `14` rows in the verified backup dump

## Item 1: `Tosho CRM / Supabase`

Fill these fields:

- `Project URL`
  Source: copy from `VITE_SUPABASE_URL`
- `Project Ref`
  Source: extract from Supabase URL or copy from Supabase dashboard
- `Admin URL`
  Format: `https://supabase.com/dashboard/project/<project-ref>`
- `VITE_SUPABASE_URL`
  Status: confirmed present in `.env.local`
- `VITE_SUPABASE_ANON_KEY`
  Status: confirmed present in `.env.local`
- `SUPABASE_URL`
  Status: required by Netlify Functions, verify in Netlify env
- `SUPABASE_ANON_KEY`
  Status: required by Netlify Functions, verify in Netlify env
- `SUPABASE_SERVICE_ROLE_KEY`
  Status: confirmed present in `.env.local`; verify same value in Netlify env
- `VITE_SUPABASE_AVATAR_BUCKET`
  Status: confirmed present in `.env.local`
- `VITE_SUPABASE_ITEM_VISUAL_BUCKET`
  Status: not currently present in local `.env.local`
  Action: either store the explicit value or note that code defaults to `attachments`
- `Actual storage buckets in use`
  Fill with: `attachments, avatars, public-assets`
- `Owner`
- `Director Access`
- `Last verified`
- `Notes`

## Item 2: `Tosho CRM / Netlify`

Fill these fields:

- `Site name`
  Source: Netlify dashboard
- `Site URL`
  Source: Netlify dashboard
- `Admin URL`
  Source: Netlify dashboard
- `Team/Workspace`
  Source: Netlify dashboard
- `Build command`
  Fill with: `npm run build`
- `Publish directory`
  Fill with: `dist`
- `Functions directory`
  Fill with: `netlify/functions`
- `Runtime env vars`
  Include at minimum:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `WEB_PUSH_VAPID_PUBLIC_KEY`
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
  - `WEB_PUSH_VAPID_SUBJECT`
  - `APP_URL` or `URL` or `SITE_URL`
- `Owner`
- `Director Access`
- `Last verified`
- `Notes about deploy flow`

## Item 3: `Tosho CRM / Dropbox`

Fill these fields:

- `DROPBOX_APP_KEY`
  Status: confirmed present in `.env.local`
- `DROPBOX_APP_SECRET`
  Status: confirmed present in `.env.local`
- `DROPBOX_REFRESH_TOKEN`
  Status: confirmed present in `.env.local`
- `DROPBOX_BACKUP_ROOT`
  Status: required by scripts and docs; verify the exact runtime value in the environment that runs backups
- `VITE_DROPBOX_TEST_SHARED_URL`
  Status: confirmed present in `.env.local`
- `Dropbox App Console URL`
  Source: Dropbox developer console
- `Dropbox account / team`
- `Owner`
- `Director Access`
- `Last verified`
- `Notes`

Important note:

- Dropbox secrets are currently confirmed in `.env.local`, not in `.env.backup`
- for executive handoff this is too fragile
- preferred state is to store the real Dropbox backup values in `1Password` and mirror them into the backup environment intentionally

## Item 4: `Tosho CRM / Web Push`

Fill these fields:

- `VITE_WEB_PUSH_PUBLIC_KEY`
  Status: confirmed present in `.env.local`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
  Status: verify in Netlify env
- `WEB_PUSH_VAPID_PRIVATE_KEY`
  Status: verify in Netlify env
- `WEB_PUSH_VAPID_SUBJECT`
  Status: verify in Netlify env
- `Owner`
- `Director Access`
- `Last verified`
- `Notes`

## Item 5: `Tosho CRM / Backups`

Fill these fields:

- `BACKUP_ROOT`
  Status: confirmed present in `.env.backup`
- `BACKUP_WORKSPACE_ID`
  Status: confirmed present in `.env.backup`
- `BACKUP_DB_URL`
  Status: confirmed present in `.env.backup`
- `BACKUP_INCLUDE_STORAGE`
  Status: confirmed present in `.env.backup`
- `SUPABASE_URL`
  Status: confirmed present in `.env.backup`
- `SUPABASE_SERVICE_ROLE_KEY`
  Status: confirmed present in `.env.backup`
- `STORAGE_S3_ENDPOINT`
  Status: confirmed present in `.env.backup`
- `STORAGE_S3_ACCESS_KEY_ID`
  Status: confirmed present in `.env.backup`
- `STORAGE_S3_SECRET_ACCESS_KEY`
  Status: confirmed present in `.env.backup`
- `STORAGE_BUCKETS`
  Status: confirmed present in `.env.backup`
  Action: verify it matches live buckets and intended backup scope
- `KEEP_ARCHIVES`
  Status: confirmed present in `.env.backup`
- `KEEP_STORAGE_ARCHIVES`
  Status: confirmed present in `.env.backup`
- `DROPBOX_RETENTION_DATABASE_DAILY`
  Status: confirmed present in `.env.backup`
- `DROPBOX_RETENTION_DATABASE_WEEKLY`
  Status: confirmed present in `.env.backup`
- `DROPBOX_RETENTION_DATABASE_MONTHLY`
  Status: confirmed present in `.env.backup`
- `DROPBOX_RETENTION_STORAGE_DAILY`
  Status: confirmed present in `.env.backup`
- `DROPBOX_RETENTION_STORAGE_WEEKLY`
  Status: confirmed present in `.env.backup`
- `DROPBOX_RETENTION_STORAGE_MONTHLY`
  Status: confirmed present in `.env.backup`
- `PSQL_BIN`
  Status: not confirmed in current `.env.backup`
  Action: optional, only if non-default binary path is required
- `Restore doc`
  Fill with: `docs/BACKUP.md`
- `Last successful backup record seen`
  Fill with:
  - `database / success / daily / 2026-04-21T13:29:29Z`
  - `storage / success / weekly / 2026-04-19T10:08:04Z`
- `Owner`
- `Director Access`
- `Last verified`
- `Notes`

## Item 6: `Tosho CRM / Recovery Notes`

Fill these fields:

- `What is hosted where`
  Fill with:
  - frontend and functions: Netlify
  - database/auth/storage/realtime: Supabase
  - offsite backup destination: Dropbox
  - FX source: Minfin public URL
- `How to deploy`
  Fill with:
  - Netlify builds with `npm run build`
  - frontend publish directory is `dist`
  - server functions live in `netlify/functions`
- `How to restore DB`
  Fill with:
  - use `docs/BACKUP.md`
  - use `TARGET_DB_URL`
  - require explicit restore confirmation
- `How to restore Storage`
  Fill with:
  - use `docs/BACKUP.md`
  - requires `STORAGE_S3_*`
  - verify exact backup script state before relying on it
- `Who currently owns technical access`
- `Which services are business-critical`
  Fill with:
  - Supabase
  - Netlify
  - Dropbox
- `Which secrets are tier-1`
  Fill with:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `BACKUP_DB_URL`
  - `STORAGE_S3_SECRET_ACCESS_KEY`
  - `DROPBOX_APP_SECRET`
  - `DROPBOX_REFRESH_TOKEN`
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
- `Operational visibility`
  Fill with:
  - latest `backup_runs` row seen in DB
  - latest `admin_observability_snapshots` timestamp
- `Links to docs`
  Fill with:
  - `docs/DIRECTOR_ACCESS_HANDOFF.md`
  - `docs/SERVICES_ACCESS_REGISTRY.md`
  - `docs/BACKUP.md`
  - `docs/push-notifications.md`
- `Open risks`
  Fill with the risks from the next section

## Gaps to fix before handoff is complete

### 1. Backup automation must use current tracked script paths

Tracked backup runners now include:

- `scripts/backup-offsite.sh`
- `scripts/backup-database-and-upload.sh`
- `scripts/backup-database.sh`
- `scripts/backup-database-if-needed.sh`
- `scripts/backup-storage-and-upload.sh`
- `scripts/backup-storage.sh`
- `scripts/backup-storage-if-needed.sh`

These helpers are now tracked in the repo.

Impact:

- if a local machine still points to older backup script names, scheduled runs can fail even though the repo is correct
- handoff notes should reference the current tracked script names, not older local-history paths

Action:

- verify the local `launchd` job now points to `scripts/backup-offsite.sh`
- when debugging, use the tracked helper names above rather than older local-history script names

### 2. Dropbox backup root is not confirmed in the real backup env

Impact:

- offsite upload destination may be documented but not actually portable

Action:

- confirm the real `DROPBOX_BACKUP_ROOT`
- place it in `1Password`
- ensure the backup runtime uses that exact value

### 3. Some effective values exist only by code defaults

Known examples:

- `VITE_SUPABASE_ITEM_VISUAL_BUCKET` defaults to `attachments`
- `DROPBOX_RETENTION_STORAGE_DAILY` may be implicit instead of explicit
- `PSQL_BIN` may be implicit instead of explicit

Impact:

- recovery depends on developer knowledge or code reading instead of the password manager

Action:

- record explicit values in `1Password`, even where the app can fall back to defaults

## Completion checklist

- Create all six `1Password` items
- Fill all confirmed fields from current working values
- Verify vendor dashboard access for Supabase, Netlify, and Dropbox
- Confirm the actual backup runtime path and destination
- Record `Last verified` on every item
- Run one executive-style recovery walkthrough using only `1Password` plus docs

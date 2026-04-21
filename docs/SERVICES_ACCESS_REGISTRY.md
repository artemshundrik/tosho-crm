# Services And Access Registry

Status note:
- this is an ops/secrets registry document
- for coding and implementation decisions, trust:
  - [AGENTS.md](/Users/artem/Projects/tosho-crm/AGENTS.md)
  - [docs/CODEX_PROJECT_GUIDE.md](/Users/artem/Projects/tosho-crm/docs/CODEX_PROJECT_GUIDE.md)
  - [docs/DB_MAP.md](/Users/artem/Projects/tosho-crm/docs/DB_MAP.md)
  - [docs/CODEX_WORKFLOWS.md](/Users/artem/Projects/tosho-crm/docs/CODEX_WORKFLOWS.md)
- if this registry conflicts with current tracked code, current tracked code wins

## Recommended approach

For this CRM, the simplest and most stable setup is:

1. Keep the real secrets outside git:
   - local app/runtime secrets in `.env.local`
   - backup and ops secrets in `.env.backup`
   - hosting secrets in Netlify environment variables
   - long-term source of truth in a password manager such as `1Password`, `Bitwarden`, or `KeePass`
2. Keep only templates and documentation in git:
   - `.env.local.example`
   - `.env.backup.example`
   - this registry file
3. Separate variables by responsibility instead of by service only:
   - `frontend/public` values prefixed with `VITE_`
   - `server/private` values for Netlify Functions
   - `ops/backup` values for scripts and launchd jobs

This is already close to the current project structure, so the best move is to formalize it instead of introducing Vault, AWS Secrets Manager, or another heavy solution.

## Current services in this CRM

### 1. Supabase

Role:
- main database
- auth
- storage buckets
- realtime

Used in:
- frontend client: `src/lib/supabaseClient.ts`
- Netlify Functions: multiple files in `netlify/functions`
- maintenance scripts: multiple files in `scripts`
- backup/restore docs: `docs/BACKUP.md`

Variables in use:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_AVATAR_BUCKET`
- `VITE_SUPABASE_ITEM_VISUAL_BUCKET`
- `SUPABASE_CANONICAL_AVATAR_BUCKET`
- `SUPABASE_AVATAR_SOURCE_BUCKETS`
- `BACKUP_DB_URL`
- `STORAGE_S3_ENDPOINT`
- `STORAGE_S3_ACCESS_KEY_ID`
- `STORAGE_S3_SECRET_ACCESS_KEY`
- `STORAGE_BUCKETS`

Notes:
- `VITE_*` values are exposed to the frontend bundle and must never contain privileged credentials.
- `SUPABASE_SERVICE_ROLE_KEY` is the most sensitive runtime secret in this repo.
- DB backup and storage backup credentials should stay in `.env.backup`, not in `.env.local`.

### 2. Netlify

Role:
- hosts the frontend build
- runs server-side functions

Used in:
- `netlify.toml`
- `netlify/functions/*`

Variables in use:
- `APP_URL`
- `URL`
- `SITE_URL`
- Netlify-hosted copies of:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `WEB_PUSH_VAPID_PUBLIC_KEY`
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
  - `WEB_PUSH_VAPID_SUBJECT`

Notes:
- Netlify should be treated as the runtime source for server-side secrets.
- Local `.env.local` may mirror some of these only for local function testing.

### 3. Dropbox API

Role:
- backup upload
- CRM file/folder integration
- test shared-link checks

Used in:
- `netlify/functions/_lib/dropbox.service.ts`
- `netlify/functions/dropbox-*`
- `scripts/upload-backups-dropbox.mjs`
- `docs/BACKUP.md`

Variables in use:
- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_BACKUP_ROOT`
- `VITE_DROPBOX_TEST_SHARED_URL`

Notes:
- `DROPBOX_REFRESH_TOKEN` is a private server-side secret.
- `VITE_DROPBOX_TEST_SHARED_URL` is not a secret, but should still be documented as integration config.
- Dropbox credentials currently appear to be split between `.env.local` and `.env.backup`; better to keep them in `.env.backup` and only duplicate locally when a script/function explicitly needs them.

### 4. Web Push / VAPID

Role:
- browser push notifications

Used in:
- `docs/push-notifications.md`
- `src/lib/pushNotifications.ts`
- `netlify/functions/_notificationDelivery.ts`
- `netlify/functions/notify-users.ts`

Variables in use:
- `VITE_WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`

Notes:
- `VITE_WEB_PUSH_PUBLIC_KEY` is safe for frontend use.
- private VAPID key must live only in Netlify or a local private env file for testing.

### 5. Backup and restore tooling

Role:
- DB and Storage backups
- offsite copies
- local macOS automation via launchd

Used in:
- `docs/BACKUP.md`
- `scripts/backup*.sh`
- `scripts/restore.sh`
- `scripts/report-backup-run.mjs`
- `ops/com.tosho.crm.backup.plist`

Variables in use:
- `BACKUP_ROOT`
- `BACKUP_WORKSPACE_ID`
- `BACKUP_DB_URL`
- `BACKUP_INCLUDE_STORAGE`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KEEP_ARCHIVES`
- `KEEP_STORAGE_ARCHIVES`
- `DROPBOX_RETENTION_DATABASE_DAILY`
- `DROPBOX_RETENTION_DATABASE_WEEKLY`
- `DROPBOX_RETENTION_DATABASE_MONTHLY`
- `DROPBOX_RETENTION_STORAGE_DAILY`
- `DROPBOX_RETENTION_STORAGE_WEEKLY`
- `DROPBOX_RETENTION_STORAGE_MONTHLY`
- `DROPBOX_BACKUP_FORCE_WEEKLY`
- `DROPBOX_BACKUP_FORCE_MONTHLY`
- `PSQL_BIN`

Notes:
- these should stay isolated in `.env.backup`
- `ops/com.tosho.crm.backup.plist` already sources `.env.backup`, which is the right pattern
- as of April 21, 2026, the tracked active LaunchAgent command is `scripts/backup-offsite.sh`
- treat older backup-automation references as legacy local-history, not the current tracked default
- the tracked database helper scripts are `scripts/backup-database.sh` and `scripts/backup-database-if-needed.sh`
- the tracked storage helper scripts are `scripts/backup-storage.sh` and `scripts/backup-storage-if-needed.sh`
- Dropbox upload and backup-run reporting resolve their env files from the repo root, which avoids `launchd` cwd issues
- recommended operational state is enough Dropbox and Supabase reporting config in `.env.backup` for backup runtime to work without `.env.local`

### 6. Minfin

Role:
- FX rates source

Used in:
- `src/lib/minfinFx.ts`
- `netlify/functions/fx-rates.ts`

Config:
- no secret found
- fixed public URL: `https://minfin.com.ua/ua/currency/mb/`

## Where secrets currently live

### `.env.local`

Current variable groups found:
- frontend Supabase config
- local privileged Supabase key
- frontend push public key
- Dropbox API credentials
- Dropbox shared-link test config

Assessment:
- acceptable for local development
- too mixed for long-term maintenance because app runtime and integration secrets are stored together

### `.env.backup`

Current variable groups found:
- DB backup connection
- backup reporting Supabase config
- storage S3 backup config
- Dropbox backup upload config
- backup retention config

Assessment:
- structure is good
- should remain strictly for backup/ops concerns
- tracked template now includes the core Dropbox and backup-reporting values

### Netlify environment

Expected variable groups found in code/docs:
- Supabase server credentials
- web push private keys
- app URL values

Assessment:
- correct place for production server-side secrets
- should be documented as runtime source of truth for functions

## Recommended final structure

### 1. Password manager as the master record

Create one vault item per integration:
- `Tosho CRM / Supabase`
- `Tosho CRM / Netlify`
- `Tosho CRM / Dropbox API`
- `Tosho CRM / Web Push`
- `Tosho CRM / Backups`

For each item store:
- service name
- owner
- purpose
- variables
- console/admin URL
- rotation note
- last verified date

### 2. Git-tracked templates only

Keep in repo:
- `.env.local.example`
- `.env.backup.example`
- `docs/SERVICES_ACCESS_REGISTRY.md`

Do not keep real values in repo.

### 3. Separation rule

Use this rule consistently:

- `.env.local`
  - frontend-safe `VITE_*`
  - local-only dev secrets needed to run scripts/functions on one machine
- `.env.backup`
  - backup, restore, retention, offsite upload
- Netlify env
  - production function secrets
- password manager
  - master documentation and recovery source

## Concrete cleanup recommendations

1. Move Dropbox secrets to `.env.backup` as the default private home.
2. Keep only `VITE_DROPBOX_TEST_SHARED_URL` in `.env.local` unless local Dropbox testing requires more.
3. Keep `SUPABASE_SERVICE_ROLE_KEY` out of frontend-focused onboarding docs.
4. Treat `.env.local` as local runtime only, not as the canonical registry.
5. Add owner and rotation metadata in the password manager, not in code.

## Sensitive variables to treat as tier-1 secrets

- `SUPABASE_SERVICE_ROLE_KEY`
- `BACKUP_DB_URL`
- `STORAGE_S3_SECRET_ACCESS_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

## Files reviewed for this registry

- `src/lib/supabaseClient.ts`
- `netlify/functions/_lib/dropbox.service.ts`
- `docs/BACKUP.md`
- `docs/push-notifications.md`
- `netlify.toml`
- `.env.local`
- `.env.backup`
- `ops/com.tosho.crm.backup.plist`
- scripts and functions referencing `process.env` or `import.meta.env`

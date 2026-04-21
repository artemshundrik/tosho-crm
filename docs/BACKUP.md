# Backup and Restore (minimal setup)

Status note:
- this is an ops document for backup/restore
- for coding decisions and repo navigation, trust:
  - [AGENTS.md](/Users/artem/Projects/tosho-crm/AGENTS.md)
  - [docs/CODEX_PROJECT_GUIDE.md](/Users/artem/Projects/tosho-crm/docs/CODEX_PROJECT_GUIDE.md)
  - [docs/DB_MAP.md](/Users/artem/Projects/tosho-crm/docs/DB_MAP.md)
  - [docs/CODEX_WORKFLOWS.md](/Users/artem/Projects/tosho-crm/docs/CODEX_WORKFLOWS.md)
- machine-local backup state can differ from tracked docs

This project uses Supabase. Supabase is the source of truth for database backups.
This repo keeps a separate repo-side backup flow for:
- Database archives
- Storage buckets archives
- Offsite copy of these archives to Dropbox
- Secrets backup (`.env`, API keys) in a password/secrets manager

Status note as of April 21, 2026:
- the tracked active LaunchAgent in this repo is [ops/com.tosho.crm.backup.plist](/Users/artem/Projects/tosho-crm/ops/com.tosho.crm.backup.plist)
- that LaunchAgent runs `scripts/backup-offsite.sh`
- the tracked database helpers are `scripts/backup-database.sh` and `scripts/backup-database-if-needed.sh`
- the tracked storage helpers are `scripts/backup-storage.sh` and `scripts/backup-storage-if-needed.sh`
- `scripts/report-backup-run.mjs` and `scripts/upload-backups-dropbox.mjs` load `.env.backup` and `.env.local` relative to the repo root, so they work correctly under `launchd`

## 1. Requirements

- `pg_dump` and `pg_restore` installed (PostgreSQL client tools)
- `tar`
- Optional for Storage backup/restore: `aws` CLI
- `node` for Dropbox upload flow

## 2. Environment variables

Set these before backup:

```bash
export BACKUP_ROOT='./backups'
export KEEP_STORAGE_ARCHIVES='8'
```

Optional Storage backup:

```bash
export STORAGE_S3_ENDPOINT='https://<project-ref>.supabase.co/storage/v1/s3'
export STORAGE_S3_ACCESS_KEY_ID='...'
export STORAGE_S3_SECRET_ACCESS_KEY='...'
export STORAGE_BUCKETS='public-assets,fayna-saas'
```

Dropbox offsite upload uses the existing Dropbox API app credentials. They can live
in `.env.local` or `.env.backup`:

```bash
export DROPBOX_APP_KEY='...'
export DROPBOX_APP_SECRET='...'
export DROPBOX_REFRESH_TOKEN='...'
export DROPBOX_BACKUP_ROOT='/Tosho Team Folder/CRM Backups'
```

## 3. Run database backup

```bash
bash scripts/backup-database-and-upload.sh
```

This creates a DB archive under `backups/database` and uploads it to Dropbox:

- `/Tosho Team Folder/CRM Backups/database/daily`
- `/Tosho Team Folder/CRM Backups/database/weekly`
- `/Tosho Team Folder/CRM Backups/database/monthly`

Schedule behavior:
- daily archive upload every day
- weekly copy every Sunday
- monthly copy on the 1st day of the month

## 4. Run storage backup

```bash
bash scripts/backup-storage-and-upload.sh
```

## 5. Run restore

Set restore target DB and explicit confirmation:

```bash
export TARGET_DB_URL='postgresql://...'
export RESTORE_CONFIRM='YES'
bash scripts/restore.sh backups/YYYYMMDD-HHMMSSZ.tar.gz
```

Optional restore Storage too:

```bash
export RESTORE_STORAGE='1'
export STORAGE_S3_ENDPOINT='https://<project-ref>.supabase.co/storage/v1/s3'
export STORAGE_S3_ACCESS_KEY_ID='...'
export STORAGE_S3_SECRET_ACCESS_KEY='...'
bash scripts/restore.sh backups/YYYYMMDD-HHMMSSZ.tar.gz
```

## 6. Legacy DB archive cron example (optional)

This is not the current tracked default automation path. The current tracked LaunchAgent uses the storage/Dropbox flow described below.

Example crontab entry:

```cron
30 2 * * * cd /Users/artem/Projects/tosho-crm && /bin/bash scripts/backup.sh >> /Users/artem/Projects/tosho-crm/backups/backup.log 2>&1
```

## 7. macOS auto backup when computer is ON (recommended)

If your laptop is often off/asleep at 02:30, use `launchd` instead of cron.
This runs on login and then checks every hour.

1) Create env file with secrets:

```bash
cat > /Users/artem/Projects/tosho-crm/.env.backup <<'EOF'
export BACKUP_ROOT='/Users/artem/Projects/tosho-crm/backups'
export BACKUP_DB_URL='postgresql://postgres.nqqabedngnndtltzvqyi:REPLACE_WITH_URLENCODED_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require'
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='REPLACE_WITH_SERVICE_ROLE_KEY'
EOF
chmod 600 /Users/artem/Projects/tosho-crm/.env.backup
```

2) Create LaunchAgent:

```bash
cat > ~/Library/LaunchAgents/com.tosho.crm.backup.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.tosho.crm.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>source /Users/artem/Projects/tosho-crm/.env.backup && export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/bin:/bin:/usr/sbin:/sbin" && /bin/bash /Users/artem/Projects/tosho-crm/scripts/backup-offsite.sh >> /Users/artem/Projects/tosho-crm/backups/backup.log 2>&1</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>/Users/artem/Projects/tosho-crm/backups/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/artem/Projects/tosho-crm/backups/launchd.log</string>
</dict>
</plist>
EOF
```

3) Load agent:

```bash
launchctl unload ~/Library/LaunchAgents/com.tosho.crm.backup.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.tosho.crm.backup.plist
```

4) Verify:

```bash
launchctl list | grep com.tosho.crm.backup
tail -n 50 /Users/artem/Projects/tosho-crm/backups/backup.log
```

## 8. Offsite copy to Dropbox (recommended)

This project already includes a Dropbox API integration. Database backups upload to:

- `/Tosho Team Folder/CRM Backups/database/daily`
- `/Tosho Team Folder/CRM Backups/database/weekly`
- `/Tosho Team Folder/CRM Backups/database/monthly`

Storage backups upload to:

- `/Tosho Team Folder/CRM Backups/storage/weekly`
- `/Tosho Team Folder/CRM Backups/storage/monthly`

Database schedule:
- daily every day
- weekly every Sunday
- monthly on the 1st day of the month

Storage schedule:
- weekly every Sunday
- monthly on the 1st day of the month

Retention:
- Database daily: keep 14
- Database weekly: keep 8
- Database monthly: keep 12
- Storage weekly: keep 8
- Storage monthly: keep 6
- Local Storage archives: keep 8

Add Dropbox vars to `.env.backup`:

```bash
cat >> /Users/artem/Projects/tosho-crm/.env.backup <<'EOF'
export DROPBOX_APP_KEY='REPLACE_WITH_DROPBOX_APP_KEY'
export DROPBOX_APP_SECRET='REPLACE_WITH_DROPBOX_APP_SECRET'
export DROPBOX_REFRESH_TOKEN='REPLACE_WITH_DROPBOX_REFRESH_TOKEN'
export DROPBOX_BACKUP_ROOT='/Tosho Team Folder/CRM Backups'
EOF
```

Backup-run reporting to `tosho.backup_runs` also reads these vars from `.env.backup`:

```bash
cat >> /Users/artem/Projects/tosho-crm/.env.backup <<'EOF'
export BACKUP_WORKSPACE_ID='REPLACE_WITH_WORKSPACE_ID'
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='REPLACE_WITH_SERVICE_ROLE_KEY'
EOF
```

Recommended operational state:
- keep all backup automation secrets in `.env.backup`
- do not rely on `.env.local` for `launchd` backup runs
- keep `.env.local` focused on app/dev runtime concerns

Test database upload manually:

```bash
source /Users/artem/Projects/tosho-crm/.env.backup
cd /Users/artem/Projects/tosho-crm
bash scripts/backup-database-and-upload.sh
```

Test storage upload manually:

```bash
source /Users/artem/Projects/tosho-crm/.env.backup
cd /Users/artem/Projects/tosho-crm
bash scripts/backup-storage-and-upload.sh
```

## 9. Current tracked LaunchAgent command

Use:

- `/bin/bash /Users/artem/Projects/tosho-crm/scripts/backup-offsite.sh`

Reload agent:

```bash
launchctl unload ~/Library/LaunchAgents/com.tosho.crm.backup.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.tosho.crm.backup.plist
launchctl kickstart -k gui/$(id -u)/com.tosho.crm.backup
```

## 10. Minimal operational policy

- Keep daily DB archives outside Supabase as a secondary recovery path
- Run Storage backup weekly/monthly
- Upload DB and Storage archives to Dropbox
- Keep DB daily archives: 14
- Keep DB weekly archives: 8
- Keep DB monthly archives: 12
- Keep Storage weekly archives: 8
- Keep Storage monthly archives: 6
- Test Storage restore at least once per month on a test location

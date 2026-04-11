# Backup and Restore (minimal setup)

This project uses Supabase. Supabase is the source of truth for database backups.
This repo keeps a separate backup flow only for Storage files:
- Storage buckets backup as a separate weekly/monthly flow
- Offsite copy of the Storage archive (Dropbox API)
- Secrets backup (`.env`, API keys) in a password/secrets manager

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

## 3. Run storage backup

```bash
bash scripts/backup-storage-and-upload.sh
```

## 4. Run restore

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

## 5. Cron (daily at 02:30)

Example crontab entry:

```cron
30 2 * * * cd /Users/artem/Projects/tosho-crm && /bin/bash scripts/backup.sh >> /Users/artem/Projects/tosho-crm/backups/backup.log 2>&1
```

## 6. macOS auto backup when computer is ON (recommended)

If your laptop is often off/asleep at 02:30, use `launchd` instead of cron.
This runs on login and then checks every hour. If today's backup already exists, it skips.

1) Create env file with secrets:

```bash
cat > /Users/artem/Projects/tosho-crm/.env.backup <<'EOF'
export BACKUP_ROOT='/Users/artem/Projects/tosho-crm/backups'
export BACKUP_DB_URL='postgresql://postgres.nqqabedngnndtltzvqyi:REPLACE_WITH_URLENCODED_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require'
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
    <string>source /Users/artem/Projects/tosho-crm/.env.backup && export PATH="/opt/homebrew/opt/libpq/bin:/usr/bin:/bin:/usr/sbin:/sbin" && /bin/bash /Users/artem/Projects/tosho-crm/scripts/backup-if-needed.sh >> /Users/artem/Projects/tosho-crm/backups/backup.log 2>&1</string>
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

## 7. Offsite copy to Dropbox (recommended)

This project already includes a Dropbox API integration. Storage backups upload to:

- `/Tosho Team Folder/CRM Backups/storage/weekly`
- `/Tosho Team Folder/CRM Backups/storage/monthly`

Storage schedule:
- weekly every Sunday
- monthly on the 1st day of the month

Retention:
- Storage weekly: keep 8
- Storage monthly: keep 6
- Local Storage archives: keep 8

Add Dropbox vars to `.env.backup` or `.env.local`:

```bash
cat >> /Users/artem/Projects/tosho-crm/.env.backup <<'EOF'
export DROPBOX_APP_KEY='REPLACE_WITH_DROPBOX_APP_KEY'
export DROPBOX_APP_SECRET='REPLACE_WITH_DROPBOX_APP_SECRET'
export DROPBOX_REFRESH_TOKEN='REPLACE_WITH_DROPBOX_REFRESH_TOKEN'
export DROPBOX_BACKUP_ROOT='/Tosho Team Folder/CRM Backups'
EOF
```

Test upload manually:

```bash
source /Users/artem/Projects/tosho-crm/.env.backup
cd /Users/artem/Projects/tosho-crm
node scripts/upload-backups-dropbox.mjs
```

## 8. Update LaunchAgent command

Use:

- `/bin/bash /Users/artem/Projects/tosho-crm/scripts/backup-storage-and-upload.sh`

Reload agent:

```bash
launchctl unload ~/Library/LaunchAgents/com.tosho.crm.backup.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.tosho.crm.backup.plist
launchctl kickstart -k gui/$(id -u)/com.tosho.crm.backup
```

## 9. Minimal operational policy

- Rely on Supabase for DB backups
- Run Storage backup weekly/monthly only
- Keep Storage weekly archives: 8
- Keep Storage monthly archives: 6
- Test Storage restore at least once per month on a test location

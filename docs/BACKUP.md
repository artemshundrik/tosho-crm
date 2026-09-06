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

### Dropped connections during the dump

`pg_dump` runs from a laptop over the Supabase pooler, so the connection
occasionally dies mid-dump ("server closed the connection unexpectedly", at a
different table every time). Two guards in `scripts/backup.sh` handle it:

- **TCP keepalives on the dump connection** (`DB_DUMP_CONN_PARAMS`, appended to
  `BACKUP_DB_URL` as query parameters). Without them the kernel spends its full
  retransmission budget before giving up: measured on `tosho.backup_runs` for
  12–31.08.2026, every failed run took 927–1095 s while a healthy one takes
  64–203 s. Keepalives surface a dead peer in about a minute instead.
- **Three dump attempts** 60 s apart (`DB_DUMP_ATTEMPTS`, `DB_DUMP_RETRY_DELAY`).
  Each failed attempt is logged, so a rise in drops stays visible.

Together they turn a ~17-minute failed run into a ~3-minute successful one. Both
knobs are env-overridable; setting `DB_DUMP_CONN_PARAMS=` empty leaves the URL
untouched.

## 4. Run storage backup

```bash
bash scripts/backup-storage-and-upload.sh
```

Storage backup keeps a persistent local mirror at `${BACKUP_STORAGE_ROOT}/.mirror/<bucket>`
(default `backups/storage/.mirror/<bucket>`). Each run does `aws s3 sync --delete` into
that mirror, so only new/changed objects are downloaded — the weekly run transfers just
the delta instead of re-pulling every bucket. The dated `*-storage.tar.gz` archive is then
built from hardlinks into the mirror (no extra download, ~no extra disk until tar compresses).

Notes:
- The **first** run after introducing the mirror downloads everything once (mirror is empty);
  every run afterwards is delta-only. This was the fix for the Supabase "Disk IO Budget" /
  Storage Egress spikes — previously sync targeted a throwaway timestamped dir, so it
  re-downloaded all objects (~18GB) every Sunday.
- The mirror costs ~one bucket's worth of local disk persistently. It is excluded from the
  tar archive and from the `*.tar.gz` retention prune. Safe to delete to reclaim space — the
  next run just re-mirrors (one full egress pull again).
- `--delete` makes the mirror a faithful snapshot of current bucket state. History of objects
  deleted from storage is still preserved in the older dated archives (retention: 8 weekly).

Failure/staleness safeguards (added after the 2026-07-12 incident, where an offline Sunday run
wrote a 280-byte empty archive that was uploaded to Dropbox and marked "success"):
- `backup.sh` now counts captured buckets. If a network/DNS/credential failure makes **every**
  bucket "missing or inaccessible", it fails loud (exit 1) and writes **no** archive — instead of
  taring up an empty one that downstream reporting treats as success. No archive means the
  "archive for today already exists" guard is not poisoned, so the next hourly retry can still run.
- `backup-storage-if-needed.sh` self-heals a missed schedule: on any day, if the newest local
  storage archive is missing or older than `STORAGE_MAX_AGE_DAYS` (default 8), it runs even
  off-schedule. So an offline Sunday recovers on the next hourly tick once the network returns,
  instead of waiting a full week.
- To manually force a fresh weekly archive + Dropbox upload (bypasses the Sunday-only schedule):
  `source .env.backup && DROPBOX_BACKUP_FORCE_WEEKLY=1 bash scripts/backup-storage-and-upload.sh`.

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
# Use the SESSION pooler (port 5432), NOT the transaction pooler (6543):
# pg_dump needs a real session, and the script's idle_in_transaction guard
# (PGOPTIONS) only applies over a session/direct connection. The transaction
# pooler ignores those startup options and is unreliable for pg_dump.
export BACKUP_DB_URL='postgresql://postgres.nqqabedngnndtltzvqyi:REPLACE_WITH_URLENCODED_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='REPLACE_WITH_SERVICE_ROLE_KEY'
EOF
chmod 600 /Users/artem/Projects/tosho-crm/.env.backup
```

> Server-side safety net: the `postgres` role has
> `idle_in_transaction_session_timeout=10min` set, so a future interrupted
> `pg_dump` can no longer leave a transaction open for days and block DDL/VACUUM.

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

Upload resilience: every Dropbox API/content call retries transient failures
(network errors, request timeouts, HTTP 429, 5xx) with exponential backoff and
honors `Retry-After`; non-retriable 4xx (auth, path conflicts) fail fast. Tunable
via `.env.backup`:
- `DROPBOX_MAX_RETRY_ATTEMPTS` (default 5)
- `DROPBOX_REQUEST_TIMEOUT_MS` (default 300000 — per-request cap so a stalled
  socket can't hang the launchd run)

Known limit: chunked upload sessions restart from the beginning on the next run if
a chunk's success is never acknowledged (no mid-session resume) — self-heals on the
next scheduled run.

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

## 10. Morning watchdog (REQ-205)

```bash
node scripts/backup-watchdog.mjs             # human output, exit 0/1
node scripts/backup-watchdog.mjs --json      # same, machine-readable
node scripts/backup-watchdog.mjs --telegram  # also message the owner when red
```

Checks the things that **only exist on this Mac** and therefore cannot be seen by the
`system-alerts` cron on Netlify, which reads `tosho.backup_runs` — i.e. whatever the backup
scripts said about themselves:

- each bucket's mirror under `${BACKUP_STORAGE_ROOT}/.mirror/` exists and is non-empty
  (a vanished mirror makes the next weekly run re-pull the whole bucket — the egress hole
  that was closed in July, and the log would still read "success");
- newest DB archive younger than 2 days, newest storage archive younger than
  `STORAGE_ARCHIVE_MAX_AGE_DAYS` (8 — after self-healing has had its chance);
- neither archive is suspiciously small (the 280-byte empty archive of 2026-07-12);
- free disk is at least 1.5× the mirror size, so the next run has room for the tar;
- the last `tosho.backup_runs` row per section did not fail.

**Silent when green** — a daily "backup is fine" becomes background within a week, and then
it will not register on the day it matters. Exit code 0 and one line on stdout; nothing sent.

Thresholds live in `scripts/lib/backupWatchdog.mjs` and are covered by
`scripts/lib/backupWatchdog.test.mjs` — a watchdog that is wrong about a threshold fails
silently in both directions.

`--telegram` needs `TELEGRAM_BOT_TOKEN` in the environment; the token is deliberately **not**
stored on disk. The recipient is resolved at run time: the `owner` from `memberships_view`,
then their `telegram_chat_id` from `tosho.user_notification_settings`.

Scheduled daily at 08:51 as the Claude scheduled task `backup-watchdog`
(`~/.claude/scheduled-tasks/backup-watchdog/SKILL.md`), which fetches the token via
`netlify env:get` and runs the command above. It runs while the Claude app is open; if the
app was closed at 08:51 the task runs on the next launch.

## 11. Minimal operational policy

- Keep daily DB archives outside Supabase as a secondary recovery path
- Run Storage backup weekly/monthly
- Upload DB and Storage archives to Dropbox
- Keep DB daily archives: 14
- Keep DB weekly archives: 8
- Keep DB monthly archives: 12
- Keep Storage weekly archives: 8
- Keep Storage monthly archives: 6
- Test Storage restore at least once per month on a test location

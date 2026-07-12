# Cron shared-secret gate — activation runbook

Closes AUDIT-2026-07-11 P1 #1: six pg_cron-triggered functions were publicly invokable
with the service-role key (notification spam + `activity-log-retention` DoS). The code guard
(`netlify/functions/_cronAuth.ts`) is **enforce-if-configured**: it deploys safely and stays a
no-op until `CRON_SHARED_SECRET` is set, so nothing breaks before the steps below.

**Gated functions:** `customer-lead-reminders`, `quote-deadline-reminders`, `contractor-reminders`,
`team-events-reminders`, `probation-reminders`, `activity-log-retention`.

## Activation (do the steps in order — no breakage window)

1. **Generate one secret** (keep it — you'll paste the same value in steps 2 and 3):
   ```sh
   openssl rand -hex 32
   ```

2. **DB side — let pg_cron send it.** Apply as a database setting (NOT committed to git), then
   re-run the cron file so the jobs attach the `x-cron-key` header:
   ```sh
   cd /Users/artem/Projects/tosho-crm
   set -a; source .env.backup; set +a
   PSQL="${PSQL_BIN:-/opt/homebrew/opt/libpq/bin/psql}"
   "$PSQL" "$BACKUP_DB_URL" -c "ALTER DATABASE postgres SET app.cron_secret = '<SECRET>';"
   "$PSQL" "$BACKUP_DB_URL" -f scripts/reminders-cron.sql   # re-schedules with the header
   ```
   (pg_cron background workers pick up the database-level setting on their next connection.)

3. **Netlify side — let the functions require it.** Set the env var, then redeploy so the running
   functions see it:
   - Netlify UI → Site config → Environment variables → add `CRON_SHARED_SECRET = <SECRET>`
     (or `netlify env:set CRON_SHARED_SECRET <SECRET>` if the CLI is installed/linked).
   - Trigger a redeploy (env changes only take effect on the next deploy).

Order matters only in that the cron jobs should be sending the header (step 2) before or at the
same time as the functions start requiring it (step 3). Because the guard is enforce-if-configured,
doing step 2 first is always safe.

## Verify

```sh
# Unauthenticated call must now be rejected:
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://tosho.pro/.netlify/functions/quote-deadline-reminders           # expect 401

# With the secret it succeeds:
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H "x-cron-key: <SECRET>" \
  https://tosho.pro/.netlify/functions/quote-deadline-reminders           # expect 200
```
Then confirm the scheduled runs still succeed:
```sql
select jobname, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 10;   -- expect succeeded
```

## Rollback

Unset `CRON_SHARED_SECRET` (functions revert to allow) — but this reopens the hole. Prefer rotating
the secret (repeat steps 1–3 with a new value) over disabling the gate.

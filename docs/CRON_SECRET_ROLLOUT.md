# Cron shared-secret gate — activation runbook

Closes AUDIT-2026-07-11 P1 #1: six pg_cron-triggered functions were publicly invokable
with the service-role key (notification spam + `activity-log-retention` DoS). The code guard
(`netlify/functions/_cronAuth.ts`) is **enforce-if-configured**: it deploys safely and stays a
no-op until `CRON_SHARED_SECRET` is set in the Netlify env, so nothing breaks before activation.

**Gated functions:** `customer-lead-reminders`, `quote-deadline-reminders`, `contractor-reminders`,
`team-events-reminders`, `probation-reminders`, `activity-log-retention`.

## Current status (2026-07-12)

- ✅ **Code guard shipped** (commit `387bc43`) — enforce-if-configured, live but dormant.
- ✅ **DB side provisioned by the assistant** — a secret is stored in the locked table
  `tosho.cron_config` (RLS on, no anon/authenticated grant — proven unreadable externally), and
  the four active cron jobs were rescheduled to send it as the `x-cron-key` header.
- ⏳ **Remaining — YOUR one step:** set `CRON_SHARED_SECRET` in the Netlify env (below), then redeploy.

Until that last step, the functions still accept unauthenticated calls (the hole stays open), but
nothing is broken.

## The one remaining step (Netlify)

Set the env var to the **same secret** the assistant stored in the DB (it was shared in chat):

- Netlify UI → Site config → Environment variables → add `CRON_SHARED_SECRET = <secret>`
  (or `netlify env:set CRON_SHARED_SECRET <secret>` if the CLI is installed/linked).
- **Trigger a redeploy** — env changes only take effect on the next deploy.

That's it. After the redeploy the gate is active.

## Verify (after the redeploy)

```sh
# Unauthenticated call must now be rejected:
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://tosho.pro/.netlify/functions/quote-deadline-reminders            # expect 401
```
Then confirm the scheduled runs still succeed (they carry the header from the DB):
```sql
select jobname, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 10;               -- expect succeeded
```

## How the secret is stored (for reference / rotation)

The `postgres` role on Supabase can't `ALTER DATABASE ... SET` a custom GUC, so the secret lives in
a locked table instead of `current_setting`:

```sql
-- one-time (already done): create + lock the store
create table if not exists tosho.cron_config (key text primary key, value text not null);
alter table tosho.cron_config enable row level security;
revoke all on tosho.cron_config from anon, authenticated, public;

-- set / rotate the secret, then re-run scripts/reminders-cron.sql to pick it up:
insert into tosho.cron_config(key, value) values ('cron_secret', '<new-secret>')
  on conflict (key) do update set value = excluded.value;
```
The cron jobs read it inline: `jsonb_build_object('x-cron-key', (select value from tosho.cron_config where key='cron_secret'))`.

**To rotate:** update the row above, then set the same new value in Netlify env and redeploy.

## Rollback

Unset `CRON_SHARED_SECRET` in Netlify (functions revert to allow) — but this reopens the hole.
Prefer rotating the secret over disabling the gate.

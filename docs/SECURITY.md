# SECURITY.md

Security baseline for this repo. **Read before shipping any change that touches RLS,
storage buckets, Netlify functions, auth, privileged Supabase writes, secrets, or
webhooks.** Every rule below maps to a real incident found in this codebase — they are
not hypothetical.

This database is shared by `tosho` (the app) and historical tables in `public`. The
Supabase `anon` key is public (it ships in the JS bundle), so "anyone on the internet"
can act as the `anon` role. Treat `anon` and even `authenticated` as potentially hostile.

## Non-negotiable rules

### 1. Every table has RLS, deny-by-default
- New tables: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + explicit policies. Never
  leave a table RLS-off while it has `GRANT SELECT` to `anon`/`authenticated` — that is
  a public data leak. (This is exactly how employee PII in `user_profiles` /
  `team_member_*_events` was readable with no login.)
- Sensitive HR/finance/payroll tables: gate reads to owner/admin via the canonical
  helpers `tosho.is_workspace_admin/owner/member(workspace_id)` or
  `public.has_team_role(team_id, roles[])` / `is_team_member(team_id)`.
- Directory-type tables (names/emails): readable by members, never by `anon`.
- Reference/catalog data may be world-readable, but decide it on purpose.

### 2. Storage buckets are scoped to team/owner
- Bucket policies must check ownership/team membership, not just `bucket_id = '...'`.
  A `bucket_id`-only policy = any authenticated user reads every file. Path convention
  is `teams/<team_id>/...`; scope policies to it.

### 3. Netlify functions verify BOTH authentication and authorization
Authentication ≠ authorization. A logged-in employee is not automatically allowed to do
the thing. For every function:
- **Authn**: verify the caller's JWT. Canonical pattern:
  ```ts
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await userClient.auth.getUser(); // 401 if absent
  ```
- **Authz**: after you know who they are, check they may perform THIS action against
  THIS target before the privileged (service-role) write. Mirror the existing
  `canManageTeam` / owner-admin checks. (A missing authz guard on the invite
  create-path let any employee invite themselves as owner and escalate to full owner.)
- **Never trust** `user_id` / `role` / `workspace_id` from the request body — derive
  identity from the verified JWT. Body values are attacker-controlled.
- **Service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS — server-side only,
  never returned/logged. Do the user-scoped check first, privileged write second.
- **Cron functions** (reminders, retention) are public URLs hit by Supabase pg_cron.
  They must require a shared secret header; otherwise anyone can trigger them
  (notification spam, audit-log deletion). If you add the secret, update the pg_cron
  job that calls the URL in the same change.
- **No debug/test endpoints in prod.** (`dropbox-test.ts` shipped unauthenticated and
  leaked Dropbox listings + the account email.)

### 4. Webhooks fail closed
- Verify the provider signature/secret; if the secret env var is missing, reject (401),
  do not accept. Compare with `crypto.timingSafeEqual`, not `===`.

### 5. Secrets
- `service_role`, OpenAI, Dropbox, DB password → server env only, never in `src/` or git.
  The only key allowed in client code is `VITE_SUPABASE_ANON_KEY`.
- `.env*` (except `*.example`) stay gitignored.

## Pre-merge checklist

- [ ] New table → RLS enabled + policy added + `anon`/non-member proven to get nothing.
- [ ] New Netlify function → JWT verified AND authorization checked AND body-supplied
      identity not trusted.
- [ ] New cron function → shared-secret gate + pg_cron job updated.
- [ ] No new client-side secret; no service-role key reaching the browser/response.
- [ ] New webhook → fail-closed signature check.
- [ ] Ran `npx tsc --noEmit` + `npm run lint`.

## Verify by simulating the role (don't assume — prove)

RLS/grant claims must be proven, not eyeballed. Using `psql` + `BACKUP_DB_URL` (see
[reference: apply prod SQL] / `.env.backup`):

```sql
-- anon must get nothing on sensitive tables:
set role anon;
select count(*) from tosho.<table>;        -- expect 0 or "permission denied"
reset role;

-- a specific authenticated user (claims are txn-local: keep it in ONE transaction):
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<user-uuid>","role":"authenticated"}', true);
select count(*) from tosho.<table>;        -- expect only what they may see
rollback;
```

Sweep for the classic leak — tables with RLS off that `anon` can still read:
```sql
select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('tosho','public') and c.relkind='r' and c.relrowsecurity=false;
```

## When in doubt

Run the `/security-review` skill before declaring done on any change in the surfaces
listed at the top. For prod RLS/grant changes, follow the safe protocol: full backup →
dry-run in a `BEGIN; ... ROLLBACK;` transaction with role simulation → `COMMIT` →
post-verify. See [docs/BACKUP.md](BACKUP.md).

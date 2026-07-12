// Shared-secret gate for pg_cron-triggered functions (reminders + retention).
//
// Enforce-if-configured rollout: once CRON_SHARED_SECRET is set in the Netlify env,
// a matching `x-cron-key` header is REQUIRED (fail closed). While the env var is unset
// (pre-cutover) requests are allowed, so this guard deploys safely BEFORE the secret is
// provisioned and the existing cron keeps working. Activation steps + the pg_cron side
// live in docs/CRON_SECRET_ROLLOUT.md and scripts/reminders-cron.sql.
import { timingSafeEqual } from "crypto";

type CronEvent = { headers?: Record<string, string | undefined> };
type Denial = { statusCode: number; headers: Record<string, string>; body: string };

export function assertCronAuthorized(event: CronEvent): Denial | null {
  const expected = process.env.CRON_SHARED_SECRET;
  if (!expected) return null; // not yet configured — allow (rollout window)

  const headers = event.headers ?? {};
  const provided = headers["x-cron-key"] ?? headers["X-Cron-Key"];

  let ok = false;
  if (typeof provided === "string" && provided.length === expected.length) {
    ok = timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }
  if (ok) return null;

  return {
    statusCode: 401,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ error: "Unauthorized (cron)" }),
  };
}

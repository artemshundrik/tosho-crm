# Notifications

> Per-user work alerts delivered across three channels — in-app, web push, and Telegram (`@ToShoCRM_bot`).

## At a glance

- **Routes:** `/notifications` → `NotificationsPage` (`src/pages/NotificationsPage.tsx`, ~1,466 lines; `App.tsx:86,878`, `routes/routePreload.ts:12`)
- **Feature dir:** none — page + `src/lib/*` helpers + `netlify/functions/*`
- **Key files:** `src/lib/workflowNotifications.ts` (producers), `src/lib/designTaskActivity.ts:68` (`notifyUsers` client caller), `netlify/functions/notify-users.ts` (HTTP entry), `netlify/functions/_notificationDelivery.ts` (fan-out core), `_telegram.ts`, `telegram-webhook.ts`, `_notificationCategories.ts`, `src/lib/pushNotifications.ts`, `src/lib/notificationCategories.ts`, `src/lib/notifications.ts`, `src/lib/inAppNotificationPreferences.ts`
- **Main tables:** `public.notifications` (in-app rows), `public.push_subscriptions`, `public.activity_read_state`, `tosho.user_notification_settings` (Telegram link + `channel_prefs`), `tosho.telegram_link_tokens` (nonce linking). ⚠️ `notifications`/`push_subscriptions` live in **`public`**, not `tosho`.
- **Access / permissions:** `notifications` read is RLS-scoped to `user_id = auth.uid()`; `user_notification_settings` RLS is own-row only. No module key — every user has `/notifications`. Category **visibility** by role via `isCategoryVisibleForRole` (`notificationCategories.ts:71`).
- **Workflow:** `CODEX_WORKFLOWS.md` §10 "Notifications Change"
- **Related:** [quotes.md](quotes.md), [design.md](design.md), [customers.md](customers.md); design doc `docs/TELEGRAM_NOTIFICATIONS_DESIGN.md`, `docs/DB_MAP.md` §Notifications, `docs/push-notifications.md`

## Overview

Two producer paths feed the same delivery core. **App events** (quote/design/contract status changes, assignments) call `notifyUsers` from `workflowNotifications.ts`, which POSTs to `notify-users.ts`. **Scheduled reminders** (customer follow-up, quote deadline, contractor, team events, probation) are fired by Supabase **pg_cron** (`scripts/reminders-cron.sql`) hitting the reminder Netlify functions, which call `deliverNotifications` directly with a service-role client. Both land in `_notificationDelivery.ts:235`, which writes the in-app row then fans out to push and Telegram. `NotificationsPage` renders the user's rows and hosts the per-category channel-preference matrix.

## Data flow

- **List/read:** `NotificationsPage.tsx:520` reads own `notifications` (limit 200); realtime `INSERT` subscription refreshes live (`:738`). Read state marked via `notifications.read_at` (`:803`); a separate global unread badge uses `activity_read_state` (`AppLayout.tsx:1154`).
- **Delivery core:** `deliverNotifications` inserts rows (`insertNotificationRows`), then `deliverPush` (VAPID web-push, dedupes endpoints, disables stale subs on 404/410 — `:170`) and `deliverTelegram` (`:193`, clears `telegram_chat_id` on 403 bot-block). Channel gating reads `user_notification_settings.channel_prefs` per **category** via `isChannelEnabled` (default = on).
- **Category vs. tone:** `notifications.type` is **visual tone** (`info`/`success`/`warning`), **not** the event category. The gating category is a separate `deliverNotifications({ category })` arg; `notify-users.ts:104` infers `"design"` from an `/design` href when not passed explicitly.
- **dedupeByHref:** reminders insert one-at-a-time and swallow `23505`; a partial unique index `notifications_user_reminder_href_unique` on `(user_id, href)` where href contains `reminder=` enforces idempotent re-runs (`scripts/notifications-reminder-dedupe.sql`).
- **No-auth fallback:** `notifyUsers` without a session token inserts in-app rows directly (RLS), skipping push/Telegram (`designTaskActivity.ts:85`).

## Permissions & access

- In-app rows are RLS-protected per recipient; the settings matrix writes only the caller's `user_notification_settings` row (`NotificationsPage.tsx:505`, via the tosho-bound `db` proxy).
- Telegram linking: profile generates a single-use `nonce` → `telegram_link_tokens`; `telegram-webhook.ts` verifies `X-Telegram-Bot-Api-Secret-Token` with `timingSafeEqual` and writes `telegram_chat_id` with the service-role client. Bot `/settings` callbacks toggle the same `channel_prefs` row (fail-closed on secret mismatch).
- Reminder cron endpoints are **public/unauthenticated** by design (`reminders-cron.sql:84`) — noted, not yet gated with a shared secret.

## Gotchas / conservative zones

- **Schema split:** `notifications` + `push_subscriptions` are `public`; `user_notification_settings` + `telegram_link_tokens` are `tosho`. Use the right client.
- **Keep `notificationCategories.ts` (frontend) and `_notificationCategories.ts` (backend) in sync** — same category keys and role visibility, duplicated intentionally.
- **Producers must pass a canonical `category`** or channel gating silently defaults to on for every channel.
- **Don't confuse `type` (tone) with category** when adding a notification kind.
- Telegram phases 2–3 (in-bot settings) may be uncommitted vs. prod — re-register the webhook with `allowed_updates` incl. `callback_query` after deploy (`TELEGRAM_NOTIFICATIONS_DESIGN.md` §12).

## Known issues (see `docs/AUDIT-2026-07-11.md`)

- **Security (finding #3, `notify-users.ts:89-100`): authenticated but NOT authorized.** The function verifies the caller's JWT but performs **no recipient/team check** — any logged-in user can POST arbitrary `userIds` with attacker-chosen `title`/`body`/`href`, pushing forged in-app/push/Telegram notifications to anyone (internal phishing via `href`). Still open. Fix pattern: user-scoped RLS/team check before the service-role write, as in `quote-comments.ts` / `dropbox-export.ts`.
- **Follow-up (`TELEGRAM_NOTIFICATIONS_DESIGN.md` §13):** RLS lets a user set their own `telegram_chat_id`; low-risk self-spam only. Mitigation: BEFORE-UPDATE trigger restricting client-set `chat_id`.
- Reminder cron endpoints lack a shared-secret gate (see [[project_function_authz_audit]]).

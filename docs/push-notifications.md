# Push Notifications Setup

## What was added

- `public/push-sw.js` for browser push handling
- `public.push_subscriptions` table via `scripts/push-subscriptions.sql`
- frontend subscription sync via `src/lib/pushNotifications.ts`
- UI controls in notifications dropdown/page
- server delivery in:
  - `netlify/functions/notify-users.ts`
  - `netlify/functions/quote-comments.ts`
  - `netlify/functions/quote-deadline-reminders.ts`
  - `netlify/functions/team-events-reminders.ts`

## Local/frontend env

Already set in `.env.local`:

- `VITE_WEB_PUSH_PUBLIC_KEY`

## Netlify env vars

Add these in Netlify site settings:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended subject:

- `mailto:hello@tosho.agency`

## Database

Run in Supabase SQL editor:

- `scripts/push-subscriptions.sql`

## Generate new VAPID keys

```bash
npm run generate:vapid
```

Copy:

- `VITE_WEB_PUSH_PUBLIC_KEY` to frontend env
- `WEB_PUSH_VAPID_PUBLIC_KEY` to Netlify env
- `WEB_PUSH_VAPID_PRIVATE_KEY` to Netlify env

## UX flow

1. User opens notifications
2. Clicks `Увімкнути push`
3. Browser asks permission
4. Subscription is saved in `push_subscriptions`
5. Any future `notifyUsers()` / mention / deadline reminder delivers:
   - in-app notification row
   - browser push through service worker

## Scheduled team reminders

- `netlify/functions/team-events-reminders.ts` runs hourly
- sends team-wide reminders for:
  - birthdays happening today
  - work anniversaries happening today
  - vacation start dates happening today
  - vacation end dates happening today
- reminders are deduped by event key in notification `href`

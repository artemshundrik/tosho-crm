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
  - `netlify/functions/customer-lead-reminders.ts`
  - `netlify/functions/contractor-reminders.ts`
  - `netlify/functions/quote-markup-reminders.ts`
  - `netlify/functions/site-listing-reminders.ts`
  - `netlify/functions/team-events-reminders-background.ts`

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

- `netlify/functions/team-events-reminders-background.ts` runs hourly
- sends team-wide reminders for:
  - birthdays happening today
  - work anniversaries happening today
  - vacation start dates happening today
  - vacation end dates happening today
- reminders are deduped by event key in notification `href`

## Quote, customer, and lead reminders

- `netlify/functions/quote-deadline-reminders.ts` runs every minute for quote deadlines
- quote deadline reminders use a 30-day catch-up window and scan upcoming deadlines so “за 1 день” reminders are not skipped
- `netlify/functions/quote-markup-reminders.ts` (REQ-328) — once a working day (Mon–Fri, first tick after 08:00 Kyiv) reminds price approvers about a below-floor request pending since yesterday or longer; one reminder per quote per approver, same recipients and price text as the first ping (`src/lib/quoteMarkupNotice.ts`)
- `netlify/functions/site-listing-reminders.ts` (REQ-311#p17) — first tick of each working hour (Mon–Fri, 08:00–21:00 Kyiv) tells the people picked in the «На сайт» block header (`tosho.site_listing_settings`, REQ-311#p18; no choice = owner only; always intersected with `hasSiteListingAccess`) about Totobi models that appeared in the «На сайт» queue or got a price after being awaited; one message per tick, memory in `tosho.site_listing_announcements`, category `supplier_new_models`
- `netlify/functions/customer-lead-reminders.ts` runs every minute
- sends due reminders from customer and lead communication tabs to the assigned manager
- reminders are deduped by event key in notification `href`
- the scheduled job has a 30-day catch-up window so reminders are not lost when the browser was closed

## Contractor and supplier reminders

- `netlify/functions/contractor-reminders.ts` runs every minute
- sends due contractor/supplier reminders to active workspace members
- reminders are deduped by event key in notification `href`
- the scheduled job has a 30-day catch-up window

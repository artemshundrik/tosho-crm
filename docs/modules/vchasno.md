# Вчасно (Vchasno) — EDM integration

> Push finance documents (invoices/acts) from the CRM into the Вчасно electronic-document
> system. Not a route/screen — an integration surfaced inside Finances.

## At a glance

- **Surface:** no dedicated route — actions live in the Finances module (invoices → "надіслати у Вчасно")
- **Key files:** `netlify/functions/vchasno-upload.ts` (service-role push), `src/lib/vchasnoStatus.ts` (status mapping), Finance invoice UI
- **Main tables (`tosho`):** `vchasno_documents` (CRM-side record of pushed docs + status)
- **Access:** finance-scoped (`has_finance_access`); the Вчасно token is set under Налаштування компанії → Співробітники
- **Related:** [finances.md](finances.md), [notifications.md](notifications.md)
- **Design doc:** `docs/VCHASNO_DESIGN.md` (authoritative for the full flow) — see [[project_vchasno_integration]]

## Overview

The CRM generates invoice/act documents and pushes them to Вчасно via `vchasno-upload.ts`.
There are **3 cabinets / 3 tokens** (per legal entity/contour). The КЕП (qualified e-signature)
step stays **manual** in Вчасно — the CRM does not sign. On push, the result is notified across
CRM + Telegram + web push (shared `deliverNotifications`).

## Data flow

CRM invoice → `vchasno-upload.ts` (service role, token per cabinet) → Вчасно API; the CRM keeps
a `vchasno_documents` row tracking the external doc + status, mapped for display by
`vchasnoStatus.ts`.

## Gotchas / conservative zones

- **КЕП is manual** — never assume the CRM signs or completes a document.
- **3 tokens** — the correct cabinet/token depends on the invoice's legal entity/contour.
- Token is a secret — server-side only, never in `src/`.

## Known issues

No dedicated `docs/AUDIT-2026-07-11.md` finding. `docs/VCHASNO_DESIGN.md` is the source of truth;
verify token/cabinet wiring against current code before changes.

# ToSho AI / Support

> Embedded AI support/command layer: answers CRM how-to questions, escalates/routes cases, and runs controlled live analytics — surfaced as a drawer, not a route.

## At a glance

- **Routes:** none. It's a floating launcher → slide-over `Sheet` mounted in the app shell (`src/layout/AppLayout.tsx:2230` `Sheet`, `:2255` `ToShoAiConsole`, `:2270` `ToShoAiLauncherButton`). Deep-linked via drawer query params, never a `/tosho-ai` page (`CODEX_PROJECT_GUIDE.md:202`).
- **Feature dir:** `src/features/tosho-ai/ToShoAiConsole.tsx` (~2,900 lines) — the whole chat UI.
- **Key files:** `netlify/functions/tosho-ai.ts` (~8,040 lines, all server logic), `src/lib/toshoAi.ts` (`buildToShoAiRouteContext:265`, `callToShoAiApi:352` → `POST /.netlify/functions/tosho-ai`), `ToShoAiLauncherButton.tsx`.
- **Main tables (`tosho`):** `support_requests` (thread headers), `support_messages` (user/assistant/human/system turns), `support_feedback` (per-message helpful/not_helpful, unique per request+message+user), `support_knowledge_items` (curated KB, `vector(512)` embeddings). Schema + RLS in `scripts/tosho-ai.sql`; seed in `scripts/tosho-ai-seed.sql`.
- **Access / permissions:** no module key. Any authenticated member sees the launcher. Server derives `canManageQueue` / `canManageKnowledge` from role (`tosho-ai.ts:3350`); RLS gates who reads others' cases (see below).
- **Workflow:** `CODEX_WORKFLOWS.md` §10A.
- **LLM / provider:** OpenAI **Responses API** (`/v1/responses`), model `OPENAI_MODEL` (default `gpt-5.4`, `tosho-ai.ts:6752`), `reasoning.effort: "medium"`, structured-JSON schema output. Embeddings: `text-embedding-3-small` @ 512 dims (`:3594`). No `OPENAI_API_KEY` ⇒ deterministic heuristic fallback (`buildFallbackDecision:6602`).
- **Related:** [notifications.md](notifications.md) (routing/escalation notify), [quotes.md](quotes.md) (AI can create real quote packs).

## Overview

ToSho AI is an embedded "command layer" (persona/system prompt at `tosho-ai.ts:6826`, Ukrainian, calm/premium tone). A member types free-form; the model classifies intent into a **mode** (`ask` / `fix` / `route` / `resolve`) and returns a structured `AssistantDecision` (`:273`) with title, markdown answer, status, priority, `domain` (general/orders/design/logistics/catalog/…), confidence, and escalation/notify flags. It grounds answers in three sources: curated `support_knowledge_items` (embedding or keyword retrieval), recent runtime errors for the current route, and — for a whitelisted set of intents — a live CRM analytics snapshot via an OpenAI **function-calling tool** `get_crm_analytics` (`CRM_TOOL_DEFINITIONS:6390`). It can also draft and **create real quote packs** from a natural-language brief (`createQuotePackFromDraft:1956`).

## Data flow

- **Client → server:** all actions go through one Netlify function (`action` in `{bootstrap, send, feedback, update_request, upsert_knowledge, delete_knowledge, mention_suggestions}`, dispatched at `tosho-ai.ts:7963`). `bootstrap` builds a snapshot (requests list, selected thread, knowledge); `send` runs the full decision pipeline.
- **`send` pipeline (`handleSend:7313`):** load prior messages + runtime errors → retrieve knowledge → `runCrmToolCalling` (optional) → OpenAI structured decision → rank routing recipients (`rankRoutingRecipients:7511`) → persist request + user/assistant messages → notify + Telegram if escalating.
- **Auth:** function requires a Bearer token; uses a **user-scoped anon client** for `auth.getUser` + membership, and a **service-role admin client** for reads/writes (`:7951`-`7957`). Quote-pack writes deliberately use the **user client** so quote RLS applies (`:1814`).
- **Diagnostics** (OpenAI latency/tokens, CRM tool calls, knowledge retrieval) are stored in `support_messages.metadata` and `support_requests.context` for observability.

## Permissions & access

- **RLS (`scripts/tosho-ai.sql:333`+):** a user reads a `support_request` (and its messages/feedback) only if they created it, are its assignee, or hold `access_role in (owner,admin)` or `job_role in (seo,manager,pm)`. `support_knowledge_items` select requires `status='active'` OR the same elevated roles. Tables are `authenticated`-granted select only; all writes go through the service-role function.
- **Server capability gates:** `canManageQueue` (owner/admin/seo/manager/pm) guards `update_request` and analytics like queue/payroll; `canManageKnowledge` (owner/admin/seo/manager) guards `upsert_knowledge`/`delete_knowledge` (`:7765`, `:7805`, `:7893`).
- **Escalation/notify:** `notifyRoutingRecipients:7290` writes in-app notifications via `deliverNotifications` (shared with [notifications.md](notifications.md)); `sendTelegramEscalation:7251` posts to `TELEGRAM_SUPPORT_BOT_TOKEN`/`TELEGRAM_SUPPORT_CHAT_ID`.

## Gotchas / conservative zones

- **UI is drawer-only** — do not reintroduce a top-level route; keep it auto-first (user types before choosing a mode) and chat-shaped, per `CODEX_PROJECT_GUIDE.md:189`-`205` and `CODEX_WORKFLOWS.md` §10A.
- **Analytics is intent-whitelisted** — `get_crm_analytics` only serves `detectSupportedAnalyticsIntent` matches (`CRM_CAPABILITY_BOUNDARIES`); it is not a general DB query tool. Don't widen casually.
- **Quote-pack creation writes real `quotes`/`quote_items`** through the user client (RLS-enforced) — a genuine side-effect, not a preview. `cleanupAiQuoteRows:1911` deletes drafts.
- **Env-dependent behavior** — missing `OPENAI_API_KEY` silently degrades to heuristics; missing Telegram/base-URL env just skips those steps. Verify Netlify env when the assistant "feels dumb."
- **Two Supabase clients** — mixing user vs admin client changes what RLS enforces; keep quote writes on the user client.

## Known issues

- Not covered in `docs/AUDIT-2026-07-11.md`. No open audit findings tracked for this module.
- **Uncertainty:** the client wiring (`callToShoAi*`) lives in `src/lib/toshoAi.ts` (confirmed `fetch("/.netlify/functions/tosho-ai")` at `:352`); the console's own network layer imports these helpers. Exact per-role UI affordances (who sees the queue/knowledge admin panels inside the drawer) are enforced server-side via `canManageQueue`/`canManageKnowledge` but were not exhaustively traced in the 2,900-line `ToShoAiConsole.tsx`.

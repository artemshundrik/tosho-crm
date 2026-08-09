# CLAUDE.md

Claude Code uses the same project guidance as Codex. **Read [AGENTS.md](AGENTS.md) first** — it lists required reading, trust order, working rules, and the route/module checklist.

## Canonical docs (in trust order)

1. [AGENTS.md](AGENTS.md)
2. [docs/CODEX_PROJECT_GUIDE.md](docs/CODEX_PROJECT_GUIDE.md) — project snapshot, directory map, navigation surfaces, canonical product areas
3. [docs/DB_MAP.md](docs/DB_MAP.md) — schema/roles/storage/cross-table behavior
4. [docs/CODEX_WORKFLOWS.md](docs/CODEX_WORKFLOWS.md) — implementation + verification patterns per task type
5. [docs/SECURITY.md](docs/SECURITY.md) — security baseline + pre-merge checklist for RLS/storage/functions/auth/secrets/webhooks
6. [docs/DEPLOY_POLICY.md](docs/DEPLOY_POLICY.md) — коли пушимо, скільки коштує деплой, бюджет кредитів
7. Current tracked code in `src`, `netlify/functions`, `scripts`, `ops`, `netlify.toml`
8. Tracked SQL in `scripts/*.sql`
9. Ops/handoff docs (`docs/BACKUP.md`, `docs/SERVICES_ACCESS_REGISTRY.md`, etc.)
10. Local machine state for machine-specific tasks

If older docs conflict with current code, current code wins.

## Claude Code-specific notes

- **NEVER `git push` on your own initiative.** A push = a Netlify production deploy = ~15 credits flat, and the budget is ≈40 deploys/month. Commit locally as much as you like (free), verify with `npx tsc --noEmit` + `npm run lint`, then **end the turn by reporting the batch** ("накопичено N комітів, готові до викочування" + list) and wait. Push only when Artem says «пушимо»/«викочуй»/«деплой», or for a hotfix on a broken prod. A `PreToolUse` hook enforces this — do not work around it, and never re-add `Bash(git push *)` to an `allow` list. Full policy: [docs/DEPLOY_POLICY.md](docs/DEPLOY_POLICY.md).
- **Do NOT auto-start the dev preview.** Never call `preview_start` (or any `mcp__Claude_Preview__*` tool) on your own initiative — not after edits, not "just in case", not because a `PostToolUse` hook reminder suggests it. Ignore those hook hints in this repo. The user prefers to run `npm run dev` themselves and gets annoyed by surprise preview spawns. Only start preview when the user **explicitly** asks ("підніми preview", "запусти dev", "start the server"). Default verification is `npx tsc --noEmit` + `npm run lint` — that's enough to confirm a change is clean.
- **Тему коміта пиши людською — її читає керівництво.** Кожен успішний деплой автоматично потрапляє в розділ «Релізи», і тема коміта стає рядком у звіті. Пиши, ЩО тепер працює інакше з погляду людини, яка користується CRM, а не як це зроблено: «поля дати й часу тепер мають спільну панель вибору», а не «DateTimeInput і DateTimePicker». Технічні деталі — у тіло коміта, там їм і місце. Якщо без технічної назви ніяк, AI перекаже тему автоматично, але це запасний варіант, а не норма: за заміром такі коміти становлять ~10%. Деталі: [scripts/lib/releaseCommits.mjs](scripts/lib/releaseCommits.mjs).
- Dev server (when explicitly requested): `preview_start` name `dev`, port 5173. For tasks involving Netlify Functions or `/.netlify/functions/*`, use `npx netlify dev` on `http://localhost:8888` instead — see [docs/CODEX_WORKFLOWS.md](docs/CODEX_WORKFLOWS.md) §0.
- Verification: `npx tsc --noEmit` for types, `npm run lint` for lint, `npm run build` for full type+build.
- Tosho schema, not `public`, unless code explicitly says otherwise.
- Quote details route is UUID-based: `/orders/estimates/:id` (NOT quote number like `TS-0326-XXXX`).

## Витрати: субагенти й довжина сесії

Заміряно на сесії 2026-08-08/09 (розділ «Запити на доробку»): **96 млн ефективних токенів**, із них 52 млн — 28 субагентів, 26 млн — перечитування розмови на кожному з 652 кроків, і лише 6% — власні відповіді. Висновки нижче — з цього заміру, а не з припущень.

- **Рецензент — лише там, де помилка дорога.** База, RLS, автентифікація, спільні примітиви, гроші — так. Механічний UI — ні: там досить `tsc` + `lint` + тестів. Найдорожчий субагент тієї сесії витратив 6.3 млн на перевірку меню з трьох крапок, де найгірший наслідок — негарна кнопка. Рецензії справді ловлять справжнє (витік приватних карток через журнал аудиту, мовчазне вбивство історії подій, відсутній `dataTransfer` у Firefox) — саме тому їх треба берегти для місць, де вони окупаються.
- **Клади вміст файлу в завдання, а не посилай субагента шукати.** Він стартує з нуля й читає репозиторій сам; коли потрібний код уже в промпті, виходить приблизно вдвічі дешевше. Посилати шукати варто лише тоді, коли сам не знаєш, де воно.
- **Дрібну правку роби сам, не запускай агента.** Запуск коштує більше за саму правку. Орієнтир: якщо знаєш файл і зміна в межах кількох десятків рядків — роби руками. Виправлення захисту форм у тій сесії зайняло 4 хвилини й майже нічого, бо місце було відоме.
- **Довгі сесії ріж.** Кожен крок перечитує всю попередню розмову, тож вартість росте квадратично від довжини. Коли робота переходить у нову фазу (обговорення → план → реалізація → налагодження), дешевше почати нову розмову з коротким підсумком, ніж тягнути мегабайти історії. Ознака, що час різати: розмова почалась з одного, а йдеться вже про зовсім інше.
- **Дешевша модель для механічного.** Для однозначних задач із готовим кодом у завданні став `model: "sonnet"` — у тій сесії такі агенти відпрацювали не гірше за втричі меншу ціну.
- **Не став двох агентів на одне й те саме.** Два рецензенти незалежно знайшли ту саму розбіжність гейтів аудиту — корисно як підтвердження, але вдвічі дорожче за один прохід.

## Large files navigation

`src/pages/QuoteDetailsPage.tsx` (~9560 lines), `DesignTaskPage.tsx` (~9786), `QuotesPage.tsx` (~7990), `DesignPage.tsx` (~6348) — `Read` paginates at 2000 lines. Jump directly using offsets in [docs/LARGE_FILES_MAP.md](docs/LARGE_FILES_MAP.md) instead of re-scanning from line 1.

## Skills to invoke for this repo

Most skills auto-trigger from request wording. These two are easy to miss and matter here:

- **`/security-review`** — run before declaring done on any change that touches auth, RLS, Netlify Functions, privileged Supabase writes, attachment ACLs, or admin observability. This repo has plenty of those surfaces. Pair it with the baseline + pre-merge checklist in [docs/SECURITY.md](docs/SECURITY.md).
- **`/review`** — run before opening a PR with multi-file changes or any quote/order/design-workflow logic. Independent second opinion catches the cross-file regressions our giant pages tend to hide.

UI work auto-triggers `ui-ux-pro-max`; backend/Supabase work auto-triggers `anthropic-skills:server` — no need to invoke manually.

## What NOT to repeat

The Codex docs already cover: directory map, canonical helpers (avatars/logos/permissions/orders), route/module checklist, schema conventions, conservative-change zones, performance review dimension, SQL migration policy. Don't duplicate them here — link instead and update the source.

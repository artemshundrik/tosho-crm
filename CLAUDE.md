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

- **NEVER `git push` on your own initiative.** A push = a Netlify production deploy = ~15 credits flat, and the budget is ≈40 deploys/month. Commit locally as much as you like (free), verify with `npm run check` (не самими `typecheck`+`lint` — див. нижче), then **end the turn by reporting the batch** ("накопичено N комітів, готові до викочування" + list) and wait. Push only when Artem says «пушимо»/«викочуй»/«деплой», or for a hotfix on a broken prod. A `PreToolUse` hook enforces this — do not work around it, and never re-add `Bash(git push *)` to an `allow` list. Full policy: [docs/DEPLOY_POLICY.md](docs/DEPLOY_POLICY.md).
- **Прев'ю: не для звички, а для перевірки поведінки.** Не піднімай `preview_start` після кожної правки, «про всяк випадок» чи через підказку хука — за замовчуванням перевірка це `npm run check:fast`. **Але якщо задача про поведінку інтерфейсу** (чи закривається вікно, чи спрацьовує кнопка, чи не питає зайвого) — прев'ю підняти ОБОВ'ЯЗКОВО, проклацати живцем і закрити після себе. Дозволено Артемом 2026-08-09 після конкретного випадку: я «полагодив» підтвердження закриття порожньої форми, не відкривши застосунок, написав зелений тест на власну гіпотезу — і полагодив шлях, який не був зламаний, бо кнопка «Скасувати» захисту взагалі не питає. **Зелений `tsc` не знає нічого про поведінку кнопки.** Якщо доказу очима немає — картка не називається готовою, а в звіті пишеться «у браузері не перевіряв».
- **Робота робиться в Claude Code, не в Cowork.** Cowork і Telegram — це вхід: завести задачу, подивитись чергу, посунути статус. Виконання — сесія тут, із текою репозиторію. Рішення Артема 2026-08-09 після доказу: Cowork на задачі «закривати дровер по кліку повз» змінив 2 дровери з 8, не зробив коміта й доповів «пофіксив». Причина не в моделі, а в тому, що там немає ні тестів, ні рецензентів, ні можливості відкрити застосунок. Скіл `tosho-request` не повинен натякати, що вміє виконувати.
- **Велика картка живе чеклістом.** Якщо задача не закривається одним заходом, заведи їй пункти (`checklist` на картці): деплой не закриває картку з незакритим чеклістом і лишає її в «Готово локально» з підписом «частина в проді». Без пунктів хвіст зникає тихо — так загубились REQ-9, REQ-36 і REQ-56, поки цього гейта не було ([docs/DEV_REQUESTS_DESIGN.md](docs/DEV_REQUESTS_DESIGN.md) §4.5).
- **Дрібницю записуй, навіть коли робиш її одразу.** Артем попросив полагодити щось дрібне в цій же сесії — спершу рядок у полицю «Дрібниці: <напрям>» (скіл `tosho-request`), потім робота, потім `Закриває: REQ-N#pM` у коміті. Не «або записати, або зробити»: і те, і те. Полиця — єдине місце, де видно, що напрям рухається; дрібниця, зроблена мовчки, у звіті не існує, і день із чотирма правками виглядає як день без жодної. Записано 29.08.2026 після того, як я зробив чотири правки інтерфейсу й не записав жодної, прочитавши «просить зробити — це робота, а не картка» як дозвіл не чіпати дошку.
- **Беручись за картку — познач її, закінчивши — закрий трейлером.** Ставиш `in_progress` на початку (через `dev-request-board`), а в кінці коміта пишеш окремим рядком **з початку рядка, без відступу** `Закриває: REQ-N` (пункт чекліста — `Закриває: REQ-180#p1`, кілька — через кому): гак `scripts/hooks/post-commit` за цим рядком переведе картку в «Готово локально», а плагін релізів — у «Викочено» після деплою.
  **Голий `REQ-N` посеред тексту більше нічого не закриває — і коміт із ним не створюється взагалі**: гак `scripts/hooks/commit-msg` зупиняє його й показує, що робити. Причина в тому, що номер проситься в текст саме там, де пояснюєш причину («стара картка REQ-17 сюди не потрапляє»), і так тричі за дев'ять днів у «Готово локально» їхала картка без жодного рядка коду під нею; з REQ-17 деплой устиг зробити «Викочено», а звідти вже тільки SQL по проду. Довідкову згадку пиши словами: «картка 17», «задача про ТТН». Деталі — [scripts/hooks/README.md](scripts/hooks/README.md) і §9.1 [docs/DEV_REQUESTS_DESIGN.md](docs/DEV_REQUESTS_DESIGN.md).
- **Тему коміта пиши людською — її читає керівництво.** Кожен успішний деплой автоматично потрапляє в розділ «Релізи», і тема коміта стає рядком у звіті. Пиши, ЩО тепер працює інакше з погляду людини, яка користується CRM, а не як це зроблено: «поля дати й часу тепер мають спільну панель вибору», а не «DateTimeInput і DateTimePicker». Технічні деталі — у тіло коміта, там їм і місце. Якщо без технічної назви ніяк, AI перекаже тему автоматично, але це запасний варіант, а не норма: за заміром такі коміти становлять ~10%. Деталі: [scripts/lib/releaseCommits.mjs](scripts/lib/releaseCommits.mjs).
- Dev server (when explicitly requested): `preview_start` name `dev`, port 5173. For tasks involving Netlify Functions or `/.netlify/functions/*`, use `npx netlify dev` on `http://localhost:8888` instead — see [docs/CODEX_WORKFLOWS.md](docs/CODEX_WORKFLOWS.md) §0.
- **Перевірка: `npm run check:fast` під час роботи, `npm run check` перед тим, як казати «готово до викочування».**
  `typecheck` + `lint` — це НЕ «чисто»: перед пушем ганяються шістнадцять перевірок, і чотири
  з них — ратчети, які ростуть непомітно з кожним комітом (розмір гігантів, борг компілятора,
  заглушки правил хуків, типи Netlify-функцій). Замір 28.08.2026: я весь день звітував «типи й
  лінт чисті», а пуш зупинявся тричі поспіль — і виносити модулі з чотирьох гігантів довелось
  одночасно, коли контекст кожної правки вже вивітрився.
  `check:fast` — секунди (типи, типи функцій, ратчети розміру й заглушок), ганяй після кожної
  правки в гіганта. `check` — те саме, що хук перед пушем, ~2 хв, один список на два входи
  (`scripts/run-checks.sh`). Окремі команди (`npm run typecheck`, `npm run lint`, `npm run build`)
  лишаються для точкової діагностики.
- **Перевірку типів робить TypeScript 7, і в скриптах він названий повним шляхом** — `node node_modules/tsc7/bin/tsc`. Причина в пастці, на якій я сам обпікся 27.08.2026: пакет стоїть аліасом `tsc7@npm:typescript@7` (бо `typescript-eslint` ще має peer `<6.1` і тримає в проєкті шістку), а npm при цьому **перехоплює `node_modules/.bin/tsc`** — тобто голий `tsc`/`npx tsc` мовчки стає сімкою. Мій «замір TS 6» так і вийшов заміром TS 7, і я мало не сказав, що приросту немає. Пишеш новий скрипт із перевіркою типів — став повний шлях, щоб було видно, який це компілятор.
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

`src/pages/QuoteDetailsPage.tsx` (~9900 lines), `DesignTaskPage.tsx` (~12864), `QuotesPage.tsx` (~8380), `DesignPage.tsx` (~6010) — станом на 27.08.2026 — `Read` paginates at 2000 lines. Jump directly using offsets in [docs/LARGE_FILES_MAP.md](docs/LARGE_FILES_MAP.md) instead of re-scanning from line 1.

## Skills to invoke for this repo

Most skills auto-trigger from request wording. These two are easy to miss and matter here:

- **`/security-review`** — run before declaring done on any change that touches auth, RLS, Netlify Functions, privileged Supabase writes, attachment ACLs, or admin observability. This repo has plenty of those surfaces. Pair it with the baseline + pre-merge checklist in [docs/SECURITY.md](docs/SECURITY.md).
- **`/review`** — run before opening a PR with multi-file changes or any quote/order/design-workflow logic. Independent second opinion catches the cross-file regressions our giant pages tend to hide.

UI work auto-triggers `ui-ux-pro-max`; backend/Supabase work auto-triggers `anthropic-skills:server` — no need to invoke manually.

## What NOT to repeat

The Codex docs already cover: directory map, canonical helpers (avatars/logos/permissions/orders), route/module checklist, schema conventions, conservative-change zones, performance review dimension, SQL migration policy. Don't duplicate them here — link instead and update the source.

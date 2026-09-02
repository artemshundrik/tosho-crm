# CLAUDE.md

Claude Code uses the same project guidance as Codex. **Read [AGENTS.md](AGENTS.md) first** — required reading, trust order, route/module checklist.

Причини й випадки, з яких виросли правила нижче, лежать окремо: [docs/CLAUDE_RULES_RATIONALE.md](docs/CLAUDE_RULES_RATIONALE.md). Читай його, коли правило треба оскаржити або уточнити.

## Canonical docs (in trust order)

1. [AGENTS.md](AGENTS.md)
2. [docs/CODEX_PROJECT_GUIDE.md](docs/CODEX_PROJECT_GUIDE.md) — snapshot, directory map, product areas
3. [docs/DB_MAP.md](docs/DB_MAP.md) — schema/roles/storage/cross-table behavior
4. [docs/CODEX_WORKFLOWS.md](docs/CODEX_WORKFLOWS.md) — implementation + verification per task type
5. [docs/SECURITY.md](docs/SECURITY.md) — security baseline + pre-merge checklist
6. [docs/DEPLOY_POLICY.md](docs/DEPLOY_POLICY.md) — коли пушимо, бюджет кредитів
7. Tracked code (`src`, `netlify/functions`, `scripts`, `ops`, `netlify.toml`) and SQL (`scripts/*.sql`)
8. Ops/handoff docs (`docs/BACKUP.md`, `docs/SERVICES_ACCESS_REGISTRY.md`, …)

If older docs conflict with current code, current code wins.

## Правила

- **NEVER `git push` on your own initiative.** Пуш = прод-деплой = 15 кредитів ≈ $0.15: це ціна, не квота. Комить локально скільки треба, перевіряй `npm run check`, закінчуй хід звітом «накопичено N комітів, готові до викочування» + список — і чекай. Пушиш лише на «пушимо»/«викочуй»/«деплой» або на гарячий фікс зламаного проду. Гак це стереже: не обходь його й не повертай `Bash(git push *)` в `allow`.
- **Перевірка: `npm run check:fast` під час роботи, `npm run check` перед словами «готово до викочування».** `typecheck` + `lint` — це НЕ «чисто»: чотири з сімнадцяти перевірок ратчети й ростуть непомітно. Окремі команди — для точкової діагностики; повна перевірка тепер 11 с.
- **Лінт — `oxlint`; типи — TypeScript 7, аліаса `tsc7` більше немає.** За ESLint лишився тільки борг компілятора, і той у CI ([чому](eslint.compiler.config.mjs)).
- **Прев'ю — не для звички, а для перевірки поведінки.** За замовчуванням перевірка це `npm run check:fast`. Але якщо задача про поведінку інтерфейсу (чи закривається вікно, чи спрацьовує кнопка, чи не питає зайвого) — прев'ю підняти ОБОВ'ЯЗКОВО, проклацати живцем, закрити після себе. Немає доказу очима — картка не «готова», а в звіті стоїть «у браузері не перевіряв».
- **Беручись за картку — постав `in_progress`, закінчивши — закрий трейлером.** Окремим рядком з початку рядка, без відступу: `Закриває: REQ-N` (пункт чекліста — `Закриває: REQ-180#p1`, кілька — через кому). Голий `REQ-N` у тексті нічого не закриває, і `commit-msg` такий коміт не пропустить; довідкову згадку пиши словами («картка 17»).
- **Велика картка живе чеклістом.** Не закривається одним заходом — заведи `checklist`: деплой не закриє картку з незакритими пунктами.
- **Дрібницю записуй, навіть коли робиш її одразу.** Спершу рядок у полицю «Дрібниці: <напрям>» (скіл `tosho-request`), потім робота, потім `Закриває: REQ-N#pM`. Не «або-або»: і те, і те.
- **Тему коміта пиши людською — її читає керівництво.** Що тепер працює інакше з погляду користувача CRM, а не як це зроблено. Технічне — у тіло коміта.
- **Робота робиться тут, не в Cowork.** Cowork і Telegram — вхід: завести задачу, глянути чергу, посунути статус. Виконання — сесія з текою репозиторію.
- Tosho schema, not `public`, unless code explicitly says otherwise.
- Quote details route is UUID-based: `/orders/estimates/:id` (NOT `TS-0326-XXXX`).
- Dev server (when explicitly requested): `preview_start` name `dev`, port 5173. Netlify Functions — `npx netlify dev` на `http://localhost:8888` ([docs/CODEX_WORKFLOWS.md](docs/CODEX_WORKFLOWS.md) §0).

## Витрати

Заміри й приклади — у [rationale](docs/CLAUDE_RULES_RATIONALE.md#витрати-звідки-взялися-цифри).

- **Рецензент — лише там, де помилка дорога**: база, RLS, автентифікація, спільні примітиви, гроші. Механічний UI — ні, там досить `tsc` + `lint` + тестів.
- **Дрібну правку роби сам.** Знаєш файл і зміна в межах кількох десятків рядків — руками; запуск агента коштує більше за саму правку.
- **Клади вміст файлу в завдання, а не посилай субагента шукати** — виходить удвічі дешевше. Шукати посилай, лише коли сам не знаєш, де воно.
- **Дешевша модель для механічного**: однозначна задача з готовим кодом у промпті — `model: "sonnet"`.
- **Не став двох агентів на одне й те саме.**
- **Довгі сесії ріж.** Нова фаза (обговорення → план → реалізація → налагодження) — нова розмова з коротким підсумком. Повертатись у стару велику сесію після паузи більшої за годину найдорожче з усього: кеш холодний, і контекст переписується наново.

## Large files navigation

`QuoteDetailsPage.tsx` (~7540 рядків), `DesignTaskPage.tsx` (~12863), `QuotesPage.tsx` (~8315), `DesignPage.tsx` (~5985) — станом на 02.09.2026. `Read` ріже по 2000 рядків, тож стрибай за офсетами з [docs/LARGE_FILES_MAP.md](docs/LARGE_FILES_MAP.md), а не скануй з першого рядка.

## Skills

Більшість скілів вмикаються самі зі слів запиту. Ці два легко проґавити:

- **`/security-review`** — перед «готово» на будь-якій зміні, що чіпає auth, RLS, Netlify-функції, привілейовані записи в Supabase, ACL вкладень чи адмінську спостережність. Пара до [docs/SECURITY.md](docs/SECURITY.md).
- **`/review`** — перед PR із багатофайловими змінами або логікою прорахунків/замовлень/дизайн-потоку.

UI-роботу підхоплює `ui-ux-pro-max`, бекенд — `anthropic-skills:server`; вручну кликати не треба.

## What NOT to repeat

Codex-доки вже описують: directory map, canonical helpers (avatars/logos/permissions/orders), route/module checklist, schema conventions, conservative-change zones, performance review dimension, SQL migration policy. Не дублюй — лінкуй і оновлюй джерело.

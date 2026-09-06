# Контур мовчазних поломок — план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Зробити так, щоб виклик RPC із чужою схемою або чужими іменами аргументів падав перед пушем, а не мовчав пів року в проді.

**Architecture:** Детермінована частина йде в ратчет `check:rpc-contracts` — чистий розбирач у `scripts/lib/` під юніт-тестами плюс тонка обгортка, що ходить у живу базу через `psql`. Суб'єктивна частина (звірка з чеклістом безпеки, приміряння ролей у RLS) — у двох проєктних підагентах на дешевій моделі. Окремо — замір вартості прев'ю й перепис політики деплою під результат.

**Tech Stack:** Node 24 (ESM, `.mjs`), vitest, `@babel/parser` (розбір TS/TSX — `typescript@7` AST-API більше не віддає), `psql` через `execFileSync`, `pg_proc` / `pg_get_function_identity_arguments`, `.claude/agents/*.md`.

**Spec:** [docs/superpowers/specs/2026-09-06-silent-breakage-loop-design.md](../specs/2026-09-06-silent-breakage-loop-design.md)

## Global Constraints

- Схема — `tosho`, не `public`, якщо код явно не каже інакше.
- Лінт — `oxlint` (`npm run lint`), типи — TypeScript 7 (`npm run typecheck`). Під час роботи — `npm run check:fast`, перед словами «готово до викочування» — `npm run check`.
- **Агент НЕ пушить сам.** Коміти накопичуються локально; пуш — лише за прямою командою Артема.
- Тема коміта — людською мовою, про те, що тепер працює інакше з погляду користувача CRM. Технічне — у тіло.
- Трейлер `Закриває: REQ-N` або `Закриває: REQ-N#pM` — окремим рядком з початку рядка, без відступу. Довідкові згадки картки — словами («картка про підагентів»), інакше `commit-msg` відхилить коміт.
- `.claude/agents/*.md` комітяться, а **репозиторій публічний**: рядок підключення до бази писати лише за іменем змінної (`BACKUP_DB_URL`), ніколи значенням.
- Перевірки, що ходять у живу базу, без `.env.backup` **мовчки пропускаються** — та сама угода, що в `check-cron-endpoints.mjs` і `check-db-guards.mjs`.
- Порядок задач має значення: ратчет пишеться до правки, щоб спіймати справжній баг на живому дереві.

---

### Task 1: Розбирач викликів `.rpc()`

Чиста робота з розбором коду, без бази. Окремий модуль, бо перевірка, яка зупиняє пуш, мусить сама бути перевіреною.

**Files:**
- Create: `scripts/lib/rpcContracts.mjs`
- Test: `scripts/lib/rpcContracts.test.mjs`
- Modify: `package.json` (додати `@babel/parser` у `devDependencies`)

**Interfaces:**
- Produces:
  - `extractRpcCalls(source: string, fileName?: string): Array<{ line: number, schema: string | null, name: string | null, args: string[], spread: boolean }>` — `schema: null` = не розібрали отримувача, `name: null` = ім'я зібране зі змінної.
  - `mismatches(calls, signatures): Array<{ call, kind, detail: string }>`, де `kind` ∈ `missing-function | unknown-arg | dynamic-name | unresolved-schema | spread-args`, а `signatures` це `Map<"схема.ім'я", Set<аргумент>>`.
  - `FATAL: Set<string>` — які `kind` зупиняють пуш (`missing-function`, `unknown-arg`). Решта — до відома.

**Чому парсер, а не регулярки — перевірено, не припущено.** Перший підхід розбирав текст і дав дві хибні тривоги на робочому коді: у docblock самого `src/lib/toshoRpc.ts` написано `client.rpc(...)` як приклад, а в `orderRecords.ts:2521` отримувач загорнутий у каст `(supabase.schema("tosho") as unknown as T)`.

**Чому не компілятор.** `typescript@7.0.2` більше НЕ віддає класичний AST-API: `require("typescript")` експортує рівно `version` і `versionMajorMinor`. Перевірено 06.09.2026.

- [ ] **Step 1: Додати парсер у залежності**

`@babel/parser` уже лежить у дереві, але транзитивно (через `@babel/core`). Перевірка, що зупиняє пуш, не має залежати від чужого підграфа:

```bash
npm install --save-dev @babel/parser
```

- [ ] **Step 2: Написати тест, що падає**

```js
// scripts/lib/rpcContracts.test.mjs
import { describe, expect, it } from "vitest";

import { extractRpcCalls, mismatches } from "./rpcContracts.mjs";

/**
 * Перевірка, яка зупиняє пуш, мусить сама бути перевіреною (REQ-104): помилка
 * в один бік пропускає зламаний виклик на прод, у другий — блокує кожен пуш,
 * і тоді перевірку просто вимкнуть. Обидва боки нижче.
 */

const one = (source, file = "input.ts") => extractRpcCalls(source, file)[0];

describe("схема виклику", () => {
  // Правила зчитані з src/lib/supabaseClient.ts, а не вигадані:
  // db = supabase.schema("tosho") (рядок 71), supabase — сирий клієнт (рядок 119).
  it("db.rpc іде в tosho", () => {
    expect(one('await db.rpc("absence_today");').schema).toBe("tosho");
  });

  it("supabase.rpc іде в public", () => {
    expect(one('await supabase.rpc("acquire_entity_lock", { p_id: 1 });').schema).toBe("public");
  });

  it("явна .schema() перемагає ім'я змінної", () => {
    expect(one('await admin\n  .schema("tosho")\n  .rpc("x", { a: 1 });').schema).toBe("tosho");
  });

  it("клієнт у Netlify-функції без .schema() — це public", () => {
    expect(one('await adminClient.rpc("x", { a: 1 });').schema).toBe("public");
  });

  it("каст у дужках не ховає схему", () => {
    // Саме так написано в orderRecords.ts:2521 — розбір тексту тут помилявся.
    const src = 'await (supabase.schema("tosho") as unknown as T).rpc("next_document_number", { p_kind: 1 });';
    expect(one(src).schema).toBe("tosho");
  });
});

describe("що не рахується викликом", () => {
  it("згадка в рядковому коментарі", () => {
    expect(extractRpcCalls('// приклад: client.rpc("nope")\nawait db.rpc("real");').map((c) => c.name)).toEqual(["real"]);
  });

  it("згадка в docblock", () => {
    // У src/lib/toshoRpc.ts така згадка справді є — на ній падав розбір тексту.
    expect(extractRpcCalls('/** див. client.rpc(...) */\nawait db.rpc("real");').map((c) => c.name)).toEqual(["real"]);
  });

  it("згадка всередині рядка", () => {
    expect(extractRpcCalls('const s = "текст із client.rpc(fake)";')).toEqual([]);
  });
});

describe("витяг виклику", () => {
  it("бере справжній зламаний виклик із activity-log-retention", () => {
    // Фікстура — дослівно те, що пів року мовчало в проді (06.09.2026).
    const source = [
      'const { data, error } = await adminClient.rpc("archive_activity_log_all", {',
      "  batch_limit: 5000,",
      "  max_rounds: 50,",
      "});",
    ].join("\n");

    expect(extractRpcCalls(source)).toEqual([
      { line: 1, schema: "public", name: "archive_activity_log_all", args: ["batch_limit", "max_rounds"], spread: false },
    ]);
  });

  it("бере виклик без аргументів", () => {
    expect(extractRpcCalls('await db.rpc("absence_today")')).toEqual([
      { line: 1, schema: "tosho", name: "absence_today", args: [], spread: false },
    ]);
  });

  it("бачить скорочений запис", () => {
    expect(one('await db.rpc("x", { p_team_id, p_kind })').args).toEqual(["p_team_id", "p_kind"]);
  });

  it("не плутається у вкладеному об'єкті", () => {
    expect(one('await db.rpc("x", { p_payload: { inner: 1 }, p_id: 2 })').args).toEqual(["p_payload", "p_id"]);
  });

  it("розбирає TSX", () => {
    expect(one('const a = <div onClick={() => db.rpc("y", { p_id: 1 })} />;', "C.tsx").name).toBe("y");
  });
});

describe("чого статично не знаємо — кажемо чесно", () => {
  it("динамічне ім'я", () => {
    // nova-poshta.ts і create-workspace-invite.ts справді так роблять.
    expect(one('await userClient.schema("tosho").rpc(rpcName)').name).toBeNull();
  });

  it("розсипані аргументи", () => {
    expect(one('await db.rpc("x", { ...base, p_id: 1 })').spread).toBe(true);
  });

  it("аргументи передані змінною", () => {
    expect(one('await db.rpc("x", params)').spread).toBe(true);
  });
});

describe("звірка з базою", () => {
  const signatures = new Map([
    ["tosho.archive_activity_log_all", new Set(["p_batch_limit", "p_max_rounds"])],
    ["tosho.get_audit_log", new Set(["p_actor_user_id", "p_entity_id", "p_limit"])],
  ]);

  it("ловить справжній баг: чужа схема", () => {
    const calls = [{ line: 44, schema: "public", name: "archive_activity_log_all", args: [], spread: false }];
    expect(mismatches(calls, signatures)[0].kind).toBe("missing-function");
  });

  it("у підказці називає схему, де функція насправді є", () => {
    const calls = [{ line: 44, schema: "public", name: "archive_activity_log_all", args: [], spread: false }];
    expect(mismatches(calls, signatures)[0].detail).toContain("tosho");
  });

  it("ловить справжній баг: чужі імена аргументів", () => {
    const calls = [{ line: 44, schema: "tosho", name: "archive_activity_log_all", args: ["batch_limit", "max_rounds"], spread: false }];
    expect(mismatches(calls, signatures).map((f) => f.kind)).toEqual(["unknown-arg", "unknown-arg"]);
  });

  it("пропущений аргумент — НЕ помилка: у нього може бути значення за замовчуванням", () => {
    // tosho.get_audit_log справді кличеться без p_actor_user_id (queries.ts:99).
    const calls = [{ line: 99, schema: "tosho", name: "get_audit_log", args: ["p_entity_id", "p_limit"], spread: false }];
    expect(mismatches(calls, signatures)).toEqual([]);
  });

  it("правильний виклик не дає нічого", () => {
    const calls = [{ line: 44, schema: "tosho", name: "archive_activity_log_all", args: ["p_batch_limit", "p_max_rounds"], spread: false }];
    expect(mismatches(calls, signatures)).toEqual([]);
  });

  it("динамічне ім'я звітується, але пуш не зупиняє", () => {
    const calls = [{ line: 64, schema: "tosho", name: null, args: [], spread: false }];
    const found = mismatches(calls, signatures);
    expect(found[0].kind).toBe("dynamic-name");
  });
});
```

- [ ] **Step 3: Прогнати тест і переконатись, що падає**

Run: `npx vitest run scripts/lib/rpcContracts.test.mjs`
Expected: FAIL — `Failed to load ./rpcContracts.mjs` (модуля ще немає).

- [ ] **Step 4: Написати модуль**

Файл: `scripts/lib/rpcContracts.mjs`.

```js
/**
 * Розбір викликів .rpc() у дереві й звірка з сигнатурами живої бази.
 *
 * НАВІЩО. 06.09.2026 знайшлось, що activity-log-retention пів року не
 * архівувала нічого: виклик ішов у схему public замість tosho і з іменами
 * аргументів batch_limit / max_rounds замість p_batch_limit / p_max_rounds.
 * PostgREST відповідає на це 404, функція — 500, а крон рапортує «succeeded»,
 * бо net.http_post не знає про відповідь.
 *
 * ЧОМУ ЦЬОГО НЕ ЛОВИЛО НІЩО. `tsc` мовчить, бо клієнти в netlify/functions
 * створюються без генерика <Database> (у src/ він є, і там саме tsc це й
 * стереже). `oxlint` дивиться на синтаксис. `check-netlify-functions` — на
 * імена файлів. `check-cron-endpoints` — на адресу, за якою стукає крон, а не
 * на виклик усередині функції.
 *
 * ЧОМУ ПАРСЕР, А НЕ РЕГУЛЯРКИ. Перший підхід розбирав текст і дав дві хибні
 * тривоги на робочому коді: у docblock самого src/lib/toshoRpc.ts написано
 * `client.rpc(...)` як приклад, а в orderRecords.ts отримувач загорнутий у
 * TypeScript-каст `(supabase.schema("tosho") as unknown as T)`.
 *
 * ЧОМУ САМЕ @babel/parser. Класичний AST-API компілятора більше не доступний:
 * typescript@7 експортує лише `version` і `versionMajorMinor`. @babel/parser
 * розбирає і TS, і TSX, і вже лежить у дереві — але транзитивно, тому в
 * package.json він доданий ЯВНО: перевірка, що зупиняє пуш, не має залежати
 * від пакета, який зникне з чужого підграфа при наступному оновленні.
 *
 * МЕЖА. Ратчет звіряє контракт виклику — схему, ім'я, імена аргументів. Чи має
 * право ця функція кликати цей RPC — питання до агента function-reviewer.
 */

import { parse } from "@babel/parser";

/** Зняти обгортки, за якими ховається справжній отримувач: x as T, x!, x satisfies T. */
function unwrap(node) {
  while (node && (node.type === "TSAsExpression" || node.type === "TSNonNullExpression"
      || node.type === "TSSatisfiesExpression" || node.type === "TSTypeAssertion")) {
    node = node.expression;
  }
  return node;
}

/**
 * Схема, у яку піде виклик.
 *
 * Правила зчитані з коду, а не вигадані (src/lib/supabaseClient.ts):
 *   db.rpc(…)             → tosho    (db = supabase.schema("tosho"), рядок 71)
 *   supabase.rpc(…)       → public   (сирий клієнт, рядок 119)
 *   x.schema("y").rpc(…)  → y
 *   client.rpc(…)         → public   (createClient у функціях — без db.schema)
 *
 * Не розібрали — null. Мовчки підставити «public» тут не можна: саме такий
 * мовчазний дефолт і був багом.
 */
function resolveSchema(receiver) {
  const node = unwrap(receiver);
  if (!node) return null;

  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression"
      && !node.callee.computed && node.callee.property?.name === "schema") {
    const arg = node.arguments[0];
    return arg?.type === "StringLiteral" ? arg.value : null;
  }
  if (node.type === "Identifier") return node.name === "db" ? "tosho" : "public";
  if (node.type === "MemberExpression" && !node.computed) {
    return node.property?.name === "db" ? "tosho" : "public";
  }
  return null;
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    walk(node[key], visit);
  }
}

/** Усі виклики `.rpc(…)` у файлі. */
export function extractRpcCalls(source, fileName = "input.ts") {
  const isTsx = fileName.endsWith(".tsx");
  const ast = parse(source, {
    sourceType: "module",
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    errorRecovery: true,
    plugins: isTsx ? ["typescript", "jsx"] : ["typescript"],
  });

  const calls = [];
  walk(ast.program, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = node.callee;
    if (callee?.type !== "MemberExpression" || callee.computed || callee.property?.name !== "rpc") return;

    const [nameArg, paramsArg] = node.arguments;
    const name = nameArg?.type === "StringLiteral" ? nameArg.value : null;

    const args = [];
    let spread = false;
    if (paramsArg) {
      if (paramsArg.type === "ObjectExpression") {
        for (const prop of paramsArg.properties) {
          if (prop.type !== "ObjectProperty" || prop.computed) { spread = true; continue; }
          const key = prop.key;
          if (key?.type === "Identifier") args.push(key.name);
          else if (key?.type === "StringLiteral") args.push(key.value);
          else spread = true;
        }
      } else {
        spread = true; // аргументи передані змінною
      }
    }

    calls.push({ line: node.loc.start.line, schema: resolveSchema(callee.object), name, args, spread });
  });

  return calls;
}

/** Розходження, через які пуш зупиняється. Решта — до відома. */
export const FATAL = new Set(["missing-function", "unknown-arg"]);

/**
 * Звірити виклики з сигнатурами бази.
 *
 * ЩО ЗУПИНЯЄ ПУШ: функції немає у вказаній схемі; аргумент, якого немає серед
 * параметрів.
 *
 * ЩО ЛИШЕ ДО ВІДОМА: динамічне ім'я, нерозібраний отримувач, розсипані
 * аргументи. Так справді написано в робочому коді (обгортка callToshoRpc у
 * src/lib/toshoRpc.ts, перебір кандидатів у nova-poshta.ts), і падати на цьому
 * означало б валити пуш на справному — після чого перевірку вимкнули б
 * першого ж дня.
 *
 * ЩО НЕ ВВАЖАЄМО РОЗХОДЖЕННЯМ ЗОВСІМ: пропущений аргумент. У параметра може
 * бути значення за замовчуванням, і tosho.get_audit_log справді кличеться без
 * p_actor_user_id.
 */
export function mismatches(calls, signatures) {
  const found = [];

  for (const call of calls) {
    if (call.name === null) {
      found.push({ call, kind: "dynamic-name", detail: "ім'я RPC зібране зі змінної — звірити статично не можна" });
      continue;
    }
    if (call.schema === null) {
      found.push({ call, kind: "unresolved-schema", detail: "не видно, у яку схему піде виклик" });
      continue;
    }
    if (call.spread) {
      found.push({ call, kind: "spread-args", detail: "аргументи зібрані розсипанням — імена статично не видно" });
      continue;
    }

    const key = `${call.schema}.${call.name}`;
    const signature = signatures.get(key);
    if (!signature) {
      const elsewhere = [...signatures.keys()].filter((k) => k.endsWith(`.${call.name}`));
      found.push({
        call,
        kind: "missing-function",
        detail: elsewhere.length > 0
          ? `у схемі ${call.schema} такої функції немає — вона є як ${elsewhere.join(", ")}`
          : `функції ${key} немає в базі`,
      });
      continue;
    }

    for (const arg of call.args) {
      if (!signature.has(arg)) {
        found.push({
          call,
          kind: "unknown-arg",
          detail: `${key} не має параметра «${arg}»; є: ${[...signature].sort().join(", ") || "жодного"}`,
        });
      }
    }
  }

  return found;
}
```

- [ ] **Step 5: Прогнати тест і переконатись, що проходить**

Run: `npx vitest run scripts/lib/rpcContracts.test.mjs`
Expected: PASS, усі 22 тести.

- [ ] **Step 6: Коміт**

```bash
git add scripts/lib/rpcContracts.mjs scripts/lib/rpcContracts.test.mjs package.json package-lock.json
git commit -F - <<'EOF'
Розбирач викликів до бази — основа для перевірки, що зупинить мовчазні поломки

Чиста частина майбутнього ратчета: дістає з коду виклики .rpc(), визначає
схему за отримувачем (db → tosho, supabase → public, явна .schema() понад
усе) і збирає імена аргументів. Не розібрав отримувача — каже про це, а не
підставляє public: саме такий мовчазний дефолт і був багом у чистці журналу
активності.

Розбір іде через @babel/parser, а не через регулярки: текстовий підхід
спотикався на згадці .rpc(...) в docblock і на TypeScript-касті в дужках.
Класичний AST-API компілятора для цього не годиться — typescript@7 його
більше не експортує.

Фікстурою в тестах лежить справжній зламаний виклик — регресія зафіксована.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Ратчет `check:rpc-contracts`

**Files:**
- Create: `scripts/check-rpc-contracts.mjs`
- Modify: `package.json` (скрипт `check:rpc-contracts`)
- Modify: `scripts/run-checks.sh` (рядок у `FULL_CHECKS`, поруч із «адреси кронів»)

**Interfaces:**
- Consumes: `extractRpcCalls`, `mismatches`, `FATAL` із `scripts/lib/rpcContracts.mjs` (Task 1).
- Produces: `npm run check:rpc-contracts`; код виходу 1 лише на `FATAL`, 0 при відсутності бази.

**Ключове рішення: не все розходження зупиняє пуш.** У дереві є шість викликів, де ім'я RPC збирається під час роботи — обгортка `callToshoRpc` (`src/lib/toshoRpc.ts:34`), перебір кандидатів у `nova-poshta.ts:64`, `create-workspace-invite.ts:113`, `vchasno-upload.ts:93`, `nova-poshta-marking.ts:44`, `workspace.ts:32`. Це справний код. Падати на ньому означало б валити пуш на робочому — після чого перевірку вимкнули б першого ж дня (та сама логіка, що в шапці `db-guards-baseline.mjs`). Тому вони друкуються рядком «не звірено», а пуш зупиняють лише `missing-function` і `unknown-arg`.

- [ ] **Step 1: Написати ратчет**

Файл: `scripts/check-rpc-contracts.mjs`. **`#!/usr/bin/env node` — рівно перший рядок**: коментар над ним Node вважає синтаксичною помилкою.

```js
#!/usr/bin/env node
/**
 * Чи існують у базі RPC, які кличе це дерево — з тією схемою й тими іменами
 * аргументів, які написані у виклику.
 *
 * НАВІЩО. Реальний випадок 06.09.2026: activity-log-retention кликала
 * archive_activity_log_all без .schema("tosho") і з іменами batch_limit /
 * max_rounds замість p_batch_limit / p_max_rounds. PostgREST відповідав 404,
 * функція — 500, крон рапортував «succeeded» (net.http_post не знає про
 * відповідь), дошка здоров'я світилась зеленим. Журнал активності не
 * архівувався з 06.03.2026.
 *
 * ЧОМУ ПЕРЕД ПУШЕМ. Це єдиний момент, коли обидві половини правди поруч:
 * робоче дерево (яким стане прод) і жива база.
 *
 * БЕЗ БАЗИ ПІД РУКОЮ (CI, свіжий клон) — мовчки пропускаємо. Та сама угода,
 * що в check-cron-endpoints.mjs.
 *
 * БАЗОВОГО РІВНЯ НЕМАЄ НАВМИСНО: на день заведення в дереві було рівно одне
 * справжнє розходження — той самий баг. Гасити не було чого.
 *
 * Запуск: npm run check:rpc-contracts
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { extractRpcCalls, mismatches, FATAL } from "./lib/rpcContracts.mjs";

const ROOTS = ["netlify/functions", "src"];
const SOURCE_EXT = /\.(ts|tsx|mts|mjs)$/u;
const REPO = fileURLToPath(new URL("../", import.meta.url));

const psql = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const dbUrl = process.env.BACKUP_DB_URL || "";

if (!dbUrl || !existsSync(psql)) {
  console.log("Виклики RPC: бази під рукою немає — звірку пропускаю.");
  process.exit(0);
}

/**
 * Лише ВХІДНІ параметри. proargnames містить і OUT — у public.acquire_entity_lock
 * їх сім, і без фільтра кожен виклик виглядав би так, ніби він забув аргументи.
 * pg_get_function_identity_arguments дає рівно вхідні.
 */
const SQL = `
select n.nspname || '.' || p.proname,
       coalesce(pg_get_function_identity_arguments(p.oid), '')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'tosho')
  and p.prokind in ('f', 'p')
`;

let rows = "";
try {
  rows = execFileSync(psql, [dbUrl, "-X", "-A", "-t", "-F", "|", "-c", SQL], {
    encoding: "utf8",
    timeout: 15_000,
  });
} catch (error) {
  console.log(`Виклики RPC: база не відповіла (${error.message.split("\n")[0]}) — звірку пропускаю.`);
  process.exit(0);
}

/** "p_batch_limit integer, p_max_rounds integer" → Set{p_batch_limit, p_max_rounds} */
const parseArgNames = (identityArgs) =>
  new Set(
    identityArgs
      .split(",")
      .map((chunk) => chunk.trim().split(/\s+/u)[0])
      .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(name))
  );

const signatures = new Map();
for (const line of rows.split("\n")) {
  const sep = line.indexOf("|");
  if (sep === -1) continue;
  const key = line.slice(0, sep).trim();
  if (!key) continue;
  const args = parseArgNames(line.slice(sep + 1));
  // Перевантаження: беремо об'єднання імен — виклик правильний, якщо підходить
  // хоч до однієї сигнатури.
  const existing = signatures.get(key);
  if (existing) for (const a of args) existing.add(a);
  else signatures.set(key, args);
}

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(path);
    } else if (SOURCE_EXT.test(entry.name)) {
      files.push(path);
    }
  }
};
for (const root of ROOTS) {
  const abs = join(REPO, root);
  if (existsSync(abs)) walk(abs);
}

const fatal = [];
const notes = [];
let checked = 0;

for (const file of files) {
  const rel = relative(REPO, file);
  let calls;
  try {
    calls = extractRpcCalls(readFileSync(file, "utf8"), file);
  } catch (error) {
    notes.push({ file: rel, line: 0, detail: `не вдалось розібрати: ${error.message.split("\n")[0]}` });
    continue;
  }
  checked += calls.length;
  for (const found of mismatches(calls, signatures)) {
    const item = { file: rel, line: found.call.line, detail: found.detail, kind: found.kind };
    if (FATAL.has(found.kind)) fatal.push(item);
    else notes.push(item);
  }
}

if (notes.length > 0) {
  console.log(`Виклики RPC: ${notes.length} не звірено (ім'я або схема збираються під час роботи):`);
  for (const n of notes) console.log(`  ${n.file}:${n.line} — ${n.detail}`);
}

if (fatal.length > 0) {
  console.error("\nВиклики RPC розходяться з базою:\n");
  for (const p of fatal) {
    console.error(`  ${p.file}:${p.line}`);
    console.error(`    ${p.detail}`);
  }
  console.error("\nPostgREST відповість на такий виклик 404, функція — 500, а крон");
  console.error("рапортуватиме «succeeded»: net.http_post не знає про відповідь.");
  console.error("Полагодьте виклик або застосуйте SQL, який створює функцію.");
  process.exit(1);
}

console.log(`Виклики RPC: ${checked} звірено з базою — розходжень немає.`);
```

- [ ] **Step 2: Прогнати на живому дереві — ратчет МУСИТЬ впасти**

Це головний доказ, що перевірка робоча: у дереві ще лежить справжній баг.

Run: `set -a; . ./.env.backup; set +a; node scripts/check-rpc-contracts.mjs`

Expected (перевірено 06.09.2026 на цьому самому дереві):

```
Виклики RPC: 6 не звірено (ім'я або схема збираються під час роботи):
  netlify/functions/create-workspace-invite.ts:113 — ім'я RPC зібране зі змінної — звірити статично не можна
  netlify/functions/nova-poshta-marking.ts:44 — ім'я RPC зібране зі змінної — звірити статично не можна
  netlify/functions/nova-poshta.ts:64 — ім'я RPC зібране зі змінної — звірити статично не можна
  netlify/functions/vchasno-upload.ts:93 — ім'я RPC зібране зі змінної — звірити статично не можна
  src/lib/toshoRpc.ts:34 — ім'я RPC зібране зі змінної — звірити статично не можна
  src/lib/workspace.ts:32 — ім'я RPC зібране зі змінної — звірити статично не можна

Виклики RPC розходяться з базою:

  netlify/functions/activity-log-retention.ts:44
    у схемі public такої функції немає — вона є як tosho.archive_activity_log_all
```

Код виходу: 1.

**Список «не звірено» має містити рівно ці шість рядків, а фатальна знахідка — рівно одну.** Більше фатальних — розбирач помиляється, і перевірку в такому вигляді підключати не можна: вона валитиме пуш на справному коді.

- [ ] **Step 3: Підключити в `package.json`**

Додати в `scripts`, поруч із `check:db-guards`:

```json
"check:rpc-contracts": "node scripts/check-rpc-contracts.mjs",
```

- [ ] **Step 4: Підключити в `run-checks.sh`**

У блоці `FULL_CHECKS` (не у `FAST_CHECKS` — перевірка ходить у базу), одразу після рядка «адреси кронів»:

```
виклики RPC|set -a; . ./.env.backup 2>/dev/null; set +a; node scripts/check-rpc-contracts.mjs
```

- [ ] **Step 5: Прогнати повну перевірку — вона теж має впасти**

Run: `npm run check`
Expected: FAIL, у підсумку `✖ не пройшли: виклики RPC`.

- [ ] **Step 6: Коміт**

```bash
git add scripts/check-rpc-contracts.mjs package.json scripts/run-checks.sh
git commit -F - <<'EOF'
Перевірка перед пушем ловить виклики до бази, яких у базі немає

Ратчет звіряє кожен .rpc() у дереві з pg_proc живої бази: чи є така функція в
тій схемі, куди піде виклик, і чи має вона названі аргументи. Без бази під
рукою мовчить — та сама угода, що в перевірці адрес кронів.

Пуш зупиняють лише два випадки: функції немає й аргумента немає. Шість
викликів, де ім'я збирається під час роботи, друкуються рядком «не звірено» —
це справний код, і падати на ньому означало б вимкнути перевірку першого ж дня.

Заведено з падінням: у дереві лежить справжній зламаний виклик у чистці
журналу активності, і перевірка його бачить. Правка — наступним комітом.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Полагодити чистку журналу активності

**Files:**
- Modify: `netlify/functions/activity-log-retention.ts:44`

**Interfaces:**
- Consumes: ратчет із Task 2 (він зеленіє й цим підтверджує правку).

- [ ] **Step 1: Виправити виклик**

Замінити:

```ts
    const { data, error } = await adminClient.rpc("archive_activity_log_all", {
      batch_limit: 5000,
      max_rounds: 50,
    });
```

на:

```ts
    // .schema("tosho") і префікс p_ обов'язкові: RPC живе в tosho, а PostgREST
    // добирає функцію за ІМЕНАМИ аргументів. Без цього — 404, 500 і мовчазна
    // тиша, бо крон бачить лише «запит поставлено в чергу».
    const { data, error } = await adminClient
      .schema("tosho")
      .rpc("archive_activity_log_all", {
        p_batch_limit: 5000,
        p_max_rounds: 50,
      });
```

- [ ] **Step 2: Прогнати ратчет — тепер має пройти**

Run: `set -a; . ./.env.backup; set +a; node scripts/check-rpc-contracts.mjs`
Expected: PASS — `Виклики RPC: N звірено з базою — розходжень немає.`

- [ ] **Step 3: Прогнати повну перевірку**

Run: `npm run check`
Expected: `[перевірки] ✓ усе чисто`

- [ ] **Step 4: Коміт**

```bash
git add netlify/functions/activity-log-retention.ts
git commit -F - <<'EOF'
Журнал активності знову чиститься — прострочені записи їдуть в архів

Виклик до бази йшов у схему public замість tosho і з іменами аргументів
batch_limit / max_rounds замість p_batch_limit / p_max_rounds. PostgREST
відповідав 404, функція — 500, а крон рапортував «succeeded», бо
net.http_post не знає про відповідь.

Наслідок був вимірний: архів стояв на 06.03.2026, у журналі накопичилось
10 095 рядків від 02.01.2026.

Закриває: REQ-217#p4

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: ПІСЛЯ ДЕПЛОЮ — звірити рух даних**

Правка не вважається доведеною, поки цифри не зрушили. Крон стріляє о 00:40 UTC; після першого прогону:

```sql
select
  (select count(*) from public.activity_log) as journal_rows,
  (select min(created_at)::date from public.activity_log) as oldest_live,
  (select count(*) from tosho.activity_log_archive) as archive_rows,
  (select max(created_at)::date from tosho.activity_log_archive) as newest_archived;
```

Expected: `archive_rows` > 181, `newest_archived` > 2026-03-06, `journal_rows` < 10 095.

Було на 06.09.2026: `10095 | 2026-01-02 | 181 | 2026-03-06`.

---

### Task 4: Підагент `rls-verifier`

**Files:**
- Create: `.claude/agents/rls-verifier.md`

- [ ] **Step 1: Написати агента**

```markdown
---
name: rls-verifier
description: Приміряє ролі до таблиці або політики й повертає таблицю «хто що бачить і що може записати». Використовуй, коли зміна чіпає RLS, гранти або нову таблицю — замість переказу політик словами.
tools: Bash
model: sonnet
---

Ти перевіряєш RLS на живій базі й повертаєш ФАКТИ, а не переказ політик.

## Підключення

`psql` лежить за шляхом `/opt/homebrew/opt/libpq/bin/psql`.

Рядок підключення — у змінній `BACKUP_DB_URL`, але в оточенні її НЕМА: вона
лежить у файлі `.env.backup` у корені репозиторію. Підвантаж його так само, як
це роблять перевірки в `scripts/run-checks.sh`:

    set -a; . ./.env.backup; set +a
    /opt/homebrew/opt/libpq/bin/psql "$BACKUP_DB_URL" -X -c "…"

Підставляй саме `"$BACKUP_DB_URL"` і **ніколи не друкуй значення** — ні у
виводі команди, ні у звіті.

Немає змінної або немає psql — так і скажи. Не вигадуй результат і не роби
висновків із тексту політик: питання саме в тому, що база робить насправді.

## Що робити

**Спершу прочитай `docs/SECURITY.md`, розділи «Verify by simulating the role
(don't assume — prove)» і «Prove WRITES too».** Там лежить канонічний спосіб
приміряти роль і готові запити — бери їх звідти, не вигадуй своїх. Цей файл —
джерело правди; якщо він розійшовся з тим, що написано тут, правий він.

На вхід приходить таблиця (або політика). Для кожної з ролей — `anon`,
`authenticated` із чужої команди і `authenticated` зі своєї — приміряй її й
прочитай рядки назад.

**Записи перевіряй обов'язково.** `docs/SECURITY.md` окремо попереджає:
заблокований запис падає МОВЧКИ, тож «insert не впав» ще нічого не доводить —
читай рядок назад.

**Нічого не комітити.** Кожна проба — усередині `begin; … rollback;`.

## Що повертати

Таблицю такого вигляду й нічого зайвого:

| Роль | select | insert | update | delete |
|---|---|---|---|---|
| anon | 0 рядків | відмова | відмова | відмова |
| authenticated (чужа команда) | 0 рядків | відмова | відмова | відмова |
| authenticated (своя команда) | 14 рядків | ок | ок | відмова |

Під таблицею — рядок про те, що з цього НЕ так, якщо щось не так.

## Чого не робити

- Не пропонувати правок політик — це не твоя робота, ти міряєш.
- Не робити висновку «схоже, захищено» з тексту політики. Тільки з прочитаних рядків.
- Не чіпати таблиці, про які не питали.
```

- [ ] **Step 2: Перевірити, що в файлі немає рядка підключення**

Run: `grep -nE "postgres(ql)?://|@[a-z0-9.-]+\.supabase\." .claude/agents/rls-verifier.md`
Expected: нічого не знайдено (код виходу 1). Репозиторій публічний — це не формальність.

- [ ] **Step 3: Прогнати агента на живій таблиці**

**Потрібна НОВА сесія.** Claude Code читає `.claude/agents/` на старті, тож щойно створений агент у тій самій сесії не викликається («Agent type not found») — перевірено 06.09.2026.

Викликати `rls-verifier` на таблиці `tosho.dev_requests` і переконатись, що повертається таблиця з числами, а не переказ політик.

Рецепт усередині агента перевірено окремо, руками, 06.09.2026 — він дає:
`anon` → permission denied (гранту немає зовсім), `authenticated` без claims → 0 рядків,
`authenticated` зі справжнім user_id → 246 рядків.

- [ ] **Step 4: Коміт**

```bash
git add .claude/agents/rls-verifier.md
git commit -F - <<'EOF'
Перевірка доступів до таблиці тепер дає таблицю фактів, а не переказ політик

Проєктний підагент на дешевій моделі: приміряє anon, authenticated і
конкретного користувача, читає рядки назад і повертає «хто що бачить і що
може записати». Проби — у транзакції з rollback.

Рядок підключення в файлі лише за іменем змінної: .claude/agents комітяться,
а репозиторій публічний.

Закриває: REQ-108#p2

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Підагент `function-reviewer`

**Files:**
- Create: `.claude/agents/function-reviewer.md`

- [ ] **Step 1: Звірити, що розділи, на які агент посилатиметься, справді існують**

Run: `grep -n '^#\{1,3\} ' docs/SECURITY.md`

Expected: у списку є «Netlify functions verify BOTH authentication and authorization»,
«Webhooks fail closed», «Secrets», «Pre-merge checklist» і «Rule 0 — the owner is not a finding».

Назви розійшлись — виправити посилання в агенті, а не переказувати вміст: чекліст
живе в одному місці (CLAUDE.md, «не дублюй — лінкуй і оновлюй джерело»).

- [ ] **Step 2: Написати агента**

```markdown
---
name: function-reviewer
description: Звіряє дифф Netlify-функції з чеклістом docs/SECURITY.md — JWT, авторизація дії, service-role, коди відповідей, схема тіла. Дешева механічна звірка ПЕРЕД комітом, не заміна /security-review.
tools: Read, Grep, Bash
model: sonnet
---

Ти звіряєш дифф Netlify-функції з чеклістом безпеки. Це механічна звірка перед
комітом, а не рецензія: не переписуй код і не пропонуй рефакторингу.

## Звідки береш критерії

**Джерело правди — `docs/SECURITY.md`.** Прочитай його першим ділом, а саме:
розділ «Netlify functions verify BOTH authentication and authorization»
(канонічний зразок коду з `auth.getUser()`), «Webhooks fail closed», «Secrets»
і «Pre-merge checklist».

Переказувати чекліст сюди навмисно не стали: він живе в одному місці й там
оновлюється. Якщо цей файл розійшовся з `docs/SECURITY.md` — правий той.

Стисло, щоб знати, що шукати: перевірка JWT (крон-функції — через
`assertCronAuthorized` у `netlify/functions/_cronAuth.ts`); авторизація САМЕ
ДІЇ, а не лише входу; `SUPABASE_SERVICE_ROLE_KEY` тільки там, де без нього не
можна, і свідомо; відмова кодом 401/403, а не 500; тіло за оголошеною схемою,
а не `JSON.parse` як є; жодних службових полів і текстів помилок бази у
відповіді.

## Чого НЕ перевіряєш

**Імена й схеми RPC.** Це вже робить `npm run check:rpc-contracts` —
детерміновано й безкоштовно. Дублювати означає платити токенами за роботу,
яка коштує нуль.

## Як звітувати

Список знахідок, найважча зверху. Кожна — три рядки:

    файл:рядок — що не так
    Чим це загрожує: <конкретний сценарій, не «потенційна вразливість»>
    Як має бути: <рядок коду або посилання на місце, де вже зроблено правильно>

Знахідок немає — так і скажи одним рядком. Не вигадуй зауважень, щоб звіт
виглядав змістовним.

**Owner бачить усе — це не знахідка.** Власник команди має повний доступ за
задумом; писати про це як про діру означає засмічувати звіт.
```

- [ ] **Step 3: Прогнати агента на справжньому диффі**

**Потрібна НОВА сесія** — з тієї ж причини, що й у Task 4.

Викликати `function-reviewer` на диффі з Task 3 (`git show` коміта з правкою retention) і переконатись, що він **не** повідомляє про імена аргументів RPC — це зона ратчета, і дублювання тут було б помилкою.

- [ ] **Step 4: Коміт**

```bash
git add .claude/agents/function-reviewer.md
git commit -F - <<'EOF'
Звірка серверної функції з правилами безпеки стала дешевою й однаковою

Проєктний підагент на дешевій моделі замість дорогого рецензента там, де
перевірка механічна: JWT, авторизація дії, service-role, коди 401/403
замість 500, схема тіла, витік у відповідь.

Імена й схеми RPC агент навмисно НЕ дивиться — це вже робить ратчет
перевірки викликів, детерміновано й безкоштовно.

Закриває: REQ-108#p3

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Закрити ратчет у картці підагентів

**Files:** немає — це бухгалтерія дошки.

- [ ] **Step 1: Закрити пункт про ратчет**

Ратчет зроблено в Task 2, але трейлер туди не поставили навмисно: коміт заводив перевірку, яка ще падала. Тепер вона зелена.

```bash
git commit --allow-empty -F - <<'EOF'
Перевірка викликів до бази доведена до кінця

Ратчет заведено, справжній баг ним спійманий і полагоджений, повна
перевірка зелена.

Закриває: REQ-108#p1

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

**Альтернатива, якщо порожній коміт не подобається:** поставити цей трейлер у коміт Task 3 замість окремого. Тоді Task 6 не потрібен.

---

### Task 7: Чесна політика деплою (без заміру)

**РІШЕННЯ 06.09.2026: заміру НЕ робимо.** Прев'ю потрібне рівно для одного з чотирьох вжитків — показати комусь зміну за посиланням. Решту закривають `npm run build && npm run preview` (заміри, Playwright) і ратчет із Task 2 (мовчазні поломки). Отже число з Credit usage breakdown ні на що не впливало б, а коштувало б 0 або 15 кредитів.

Лишається безкоштовна половина: у політиці стоїть твердження, якого ніхто не перевіряв.

**Files:**
- Modify: `docs/DEPLOY_POLICY.md` (§5.3 і §3.3)

`netlify.toml` НЕ чіпаємо — рядок `ignore` лишається як є, і платної збірки цей блок не спричиняє взагалі.

- [ ] **Step 1: Виправити неправду в §5.3**

Зараз там: «Документація Netlify каже однозначно: `deploy-preview` і `branch-deploy` коштують **0 кредитів** (перевірено 29.08.2026)».

Слово «перевірено» тут неправда: §2 того самого файлу в рядку таблиці чесно пише «за документацією Netlify», і жодного branch-деплою за 300 деплоїв не було. Замінити на:

```markdown
Документація Netlify каже, що `deploy-preview` і `branch-deploy` коштують
**0 кредитів**. Заміром ми це НЕ перевіряли й не плануємо: за останні 300
деплоїв усі 300 були `production`, тобто перевіряти нема на чому, а
спеціальний branch-деплой заради заміру коштував би рівно те, що міряє.

Рядок лишається не заради економії, а тому, що PR-збірки тут не потрібні:
робот оновлення залежностей відкриватиме PR-и регулярно, і без цього рядка
кожен із них перетворювався б на збірку ще до злиття. Перевіряє PR-и
GitHub Actions, безкоштовно.

Якщо колись знадобиться показати зміну людині за посиланням — це єдиний
вжиток прев'ю, який нічим не замінюється, — тоді й міряємо.
```

- [ ] **Step 2: Переписати §3.3 — три відповіді замість однієї**

Зараз §3.3 каже «Перевірка перед викочуванням — це `npm run dev` на localhost». Це одна відповідь на три різні питання, і для двох із них вона хибна. Замінити на:

```markdown
### 3.3 Де ми дивимось на зміну до викочування

Три різні потреби — три різні відповіді. Прод не є жодною з них.

**Подивитись на інтерфейс** — `npm run dev` на localhost. Безкоштовно й
необмежено.

**Зміряти продуктивність** — `npm run build && npm run preview`. Dev-сервер
завищує час рендеру приблизно вдесятеро, тож будь-яке число з нього
недоведене. Наскрізні перевірки (`npm run e2e`) — теж проти зібраного.

**Не пропустити мовчазну поломку** — це не робота ока. Цілий клас поломок
не видно ні в браузері, ні в логах: крон стукає за адресою, якої більше
немає; виклик до бази йде в чужу схему; в'юха читає повз RLS. Їх ловлять
ратчети в `npm run check` — `check-cron-endpoints`, `check-rpc-contracts`,
`check-db-guards`. Реальна ціна пропуску: чистка журналу активності мовчала
з березня по вересень 2026, і жодна кількість переглядів у браузері цього
не показала б.

**Ніколи не деплоїмо в прод «щоб подивитись».**
```

- [ ] **Step 3: Перевірити, що документація не розійшлась із деревом**

Run: `npm run check:docs-drift`
Expected: ок.

- [ ] **Step 4: Коміт**

```bash
git add docs/DEPLOY_POLICY.md
git commit -F - <<'EOF'
Правила деплою більше не видають припущення за перевірений факт

§5.3 писав «перевірено 29.08.2026» про вартість прев'ю, хоча §2 того самого
файлу зізнавався, що число взяте з документації Netlify. Тепер там сказано
прямо: заміром не перевіряли й не плануємо — за 300 деплоїв усі 300 були
production, тож перевіряти нема на чому, а спеціальний branch-деплой заради
заміру коштував би рівно те, що міряє.

§3.3 відповідав «дивись локально» на три різні питання. Тепер їх троє:
інтерфейс — dev-сервер, продуктивність — зібраний застосунок (dev завищує
вдесятеро), мовчазні поломки — ратчети, бо це взагалі не робота ока.

Закриває: REQ-103#p3, REQ-103#p4

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

**Пункти REQ-103#p1 і #p2 (увімкнути branch deploys, зміряти) стали зайвими.** Знімати їх має людина в CRM — ззовні пункти лише дописуються.

---

### Task 8: Закрити хвости картки про витрати

**Files:** немає — бухгалтерія дошки й одна звірка з базою.

- [ ] **Step 1: Підтвердити, що крон справді на п'яти хвилинах**

```sql
select jobname, schedule, active from cron.job where jobname = 'reminders-minute';
```

Expected: `reminders-minute | */5 * * * * | t`

- [ ] **Step 2: Порахувати фактичну частоту**

```sql
select count(*) from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'reminders-minute' and d.start_time > now() - interval '24 hours';
```

Expected: ≈288 (а не 1440).

- [ ] **Step 3: Закрити пункт про частоту**

```bash
git commit --allow-empty -F - <<'EOF'
Нагадування прокидаються раз на п'ять хвилин — підтверджено на проді

Крон стоїть на */5, за добу рівно 288 прогонів замість 1440.

Закриває: REQ-217#p1

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: p2 (звірити білінг) — дія Артема, агент не закриває**

Витрати Netlify з сесії не читаються: `NETLIFY_API_TOKEN` живе в оточенні
Netlify, і жодна локальна змінна його не замінює. Число бере Артем — інтентом
`hosting_usage` у боті (`netlify/functions/_adminAssistant.ts`) або в
Team → Billing → Credit usage breakdown.

Порівняти з ~13 кредитами на добу до зміни; очікуємо ~3.

**Пункт лишається відкритим, доки число не названо.** Закривати його комітом
«схоже, впало» означало б поставити в звіт факт, якого ніхто не бачив.

---

## Порядок і залежності

```
Task 1 (розбирач + тести)
   └─> Task 2 (ратчет, падає на живому багу)
          └─> Task 3 (правка, ратчет зеленіє)  ──> Task 3 Step 5 після деплою
                 ├─> Task 4 (rls-verifier)        [незалежний, можна паралельно]
                 ├─> Task 5 (function-reviewer)   [залежить від Task 2: знає, чого НЕ дивитись]
                 └─> Task 6 (закрити пункт ратчета)

Task 7 (чесна політика) [окремо, 0 кредитів, дії Артема НЕ потребує]
Task 8 (хвости витрат)  [окремо, лише звірка]
```

## Що вважається зробленим

| Блок | Доказ |
|---|---|
| Task 1 | `npx vitest run scripts/lib/rpcContracts.test.mjs` — 22 тести зелені |
| Task 2 | Ратчет **падає** на дереві до правки: рівно 1 фатальна знахідка (`activity-log-retention.ts:44`) і рівно 6 рядків «не звірено» |
| Task 3 | Ратчет зеленіє; після деплою `tosho.activity_log_archive` зрушив із 06.03.2026 |
| Task 4 | Агент повертає таблицю з числами; у файлі немає рядка підключення |
| Task 5 | Агент на диффі retention **не** повідомляє про імена аргументів RPC |
| Task 7 | У §5.3 немає слова «перевірено» про незміряне; §3.3 дає три відповіді замість однієї |
| Task 8 | ≈288 прогонів за добу; число витрат від бота |

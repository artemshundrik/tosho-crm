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

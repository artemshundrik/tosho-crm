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

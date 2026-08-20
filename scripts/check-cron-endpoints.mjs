#!/usr/bin/env node
/**
 * Чи стукають крони на проді за адресами, які після цього пушу ще існуватимуть.
 *
 * НАВІЩО. Розклад крона живе в БАЗІ, а не в коді: `cron.job.command` містить
 * URL рядком. Перейменували файл функції — база про це не дізнається. Джоб і
 * далі шле POST за старою адресою, Netlify відповідає 404, і поломка МОВЧАЗНА
 * з обох боків: у `cron.job_run_details` стоїть «succeeded» (net.http_post
 * лише поставив запит у чергу й нічого не знає про відповідь), а на дошці
 * здоровʼя джоб зелений.
 *
 * Реальний випадок 20.08.2026: ea2f418 перейменував team-events-reminders у
 * team-events-reminders-background, оновив scripts/reminders-cron.sql — але
 * SQL на прод не поїхав. Нагадування про дні народження й відпустки мовчали
 * добу; знайшлось лише тому, що поруч був інший інцидент і хтось відкрив логи.
 *
 * ЧОМУ САМЕ ПЕРЕД ПУШЕМ. Це єдиний момент, коли обидві половини правди поруч:
 * робоче дерево (яким стане прод) і жива база. Після деплою розходження вже
 * коштує тиші в сповіщеннях, а до пушу воно виправляється одним psql.
 *
 * Немає доступу до бази (CI, свіжий клон, чужа машина) — просто мовчимо:
 * перевірка з даних, яких немає, гірша за її відсутність.
 *
 * Запуск: node scripts/check-cron-endpoints.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = new URL("../netlify/functions/", import.meta.url);

const psql = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const dbUrl = process.env.BACKUP_DB_URL || "";

if (!dbUrl || !existsSync(psql)) {
  console.log("Крони: бази під рукою немає — перевірку адрес пропускаю.");
  process.exit(0);
}

let rows = "";
try {
  rows = execFileSync(
    psql,
    [
      dbUrl,
      "-X",
      "-A",
      "-t",
      "-F",
      "|",
      "-c",
      "select jobname, coalesce((regexp_match(command, 'functions/([A-Za-z0-9_-]+)'))[1], '') from cron.job where active",
    ],
    { encoding: "utf8", timeout: 15_000 }
  );
} catch (error) {
  // База не відповіла — це не привід зупиняти пуш.
  console.log(`Крони: база не відповіла (${error.message.split("\n")[0]}) — перевірку пропускаю.`);
  process.exit(0);
}

const functionNames = new Set(
  readdirSync(fileURLToPath(FUNCTIONS_DIR), { withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && entry.name.includes("."))
    .map((entry) => entry.name.slice(0, entry.name.lastIndexOf(".")))
);

const broken = [];
let checked = 0;

for (const line of rows.split("\n")) {
  const [jobname, fn] = line.split("|");
  if (!jobname || !fn) continue;
  checked += 1;
  if (!functionNames.has(fn.trim())) broken.push({ jobname: jobname.trim(), fn: fn.trim() });
}

if (broken.length > 0) {
  console.error("\nКрони на проді стукають за адресами, яких у цьому дереві немає:\n");
  for (const item of broken) {
    console.error(`  ${item.jobname} → /.netlify/functions/${item.fn}`);
    const guess = [...functionNames].find(
      (name) => name.startsWith(item.fn) || item.fn.startsWith(name)
    );
    if (guess) console.error(`    → у дереві є «${guess}» — схоже, SQL не застосували на проді`);
  }
  console.error("\nПісля пушу цей джоб отримуватиме 404, а журнал крона показуватиме «succeeded».");
  console.error("Застосуйте SQL із розкладом і пушніть ще раз:");
  console.error('  set -a; source .env.backup; set +a; psql "$BACKUP_DB_URL" -f scripts/reminders-cron.sql');
  process.exit(1);
}

console.log(`Крони: ${checked} адрес звірено з функціями — усі на місці.`);

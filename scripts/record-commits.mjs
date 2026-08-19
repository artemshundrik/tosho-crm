#!/usr/bin/env node
/**
 * Записує коміти локального репозиторію в tosho.commits.
 *
 * НАВІЩО: сторінка «Релізи» брала коміти з релізів, а релізи пише деплой. Тож
 * поки не запушив — дня на сторінці не існувало, хоча години за нього вже
 * записані. Цей скрипт відв'язує «коли зроблено» від «коли викочено»: рядок
 * з'являється в мить коміта.
 *
 * ЗАПУСК — з гака post-commit (одразу після коміта) і з pre-push (підмітання
 * того, що гак пропустив: коміти до встановлення гака, робота без мережі,
 * інша машина). Виклик ідемпотентний за sha, тож повторів можна не боятись.
 *
 * Руками:
 *   set -a; source .env.backup; set +a
 *   node scripts/record-commits.mjs [--dry] [--limit=N] [--all]
 *
 * ЧОГО НЕ РОБИТЬ: не чіпає tosho.releases. Там інша відповідь — на питання
 * «що викочено», і її дає деплой.
 */

import { execFileSync } from "node:child_process";
import { collect } from "./lib/releaseCommits.mjs";

const DRY = process.argv.includes("--dry");
const ALL = process.argv.includes("--all");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8)) || 60;
const DB_URL = process.env.BACKUP_DB_URL;

if (!DB_URL) {
  // Мовчки: скрипт запускається з гака, і крик на кожен коміт нікому не потрібен.
  process.exit(0);
}

const psql = (sql) =>
  execFileSync("psql", [DB_URL, "-tAq", "-c", sql], { encoding: "utf8" }).trim();

/** Одинарні лапки — єдине, що ламає рядок у літералі. */
const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);

// Беремо останні LIMIT комітів, а не «все від останнього записаного»: так
// скрипт сам латає дірки, якщо кілька комітів пройшли повз гак.
const range = ALL ? "" : `-${LIMIT}`;
const commits = collect(range);

if (commits.length === 0) process.exit(0);

if (DRY) {
  for (const c of commits) console.log(`${c.sha}  ${c.at}  ${c.type}(${c.scope ?? "—"}) ${c.subject}`);
  console.log(`\n--dry: ${commits.length} комітів, нічого не записано.`);
  process.exit(0);
}

// Один запит на всю пачку: гак не має права коштувати секунди.
const values = commits
  .map(
    (c) =>
      `(${q(c.sha)}, ${q(c.at)}::timestamptz, ${q(c.at)}, ${q(c.type || "other")}, ${q(c.scope)}, ` +
      `${q(c.subject || "(без теми)")}, ${Number(c.ins) || 0}, ${Number(c.del) || 0})`
  )
  .join(",\n");

// Тему й обсяг оновлюємо: коміт міг бути виправлений через --amend, і тоді
// правдива саме нова версія. plain не чіпаємо — його дописує релізний конвеєр.
psql(
  `insert into tosho.commits (sha, committed_at, committed_local, type, scope, subject, ins, del)
   values ${values}
   on conflict (sha) do update
     set committed_at = excluded.committed_at,
         committed_local = excluded.committed_local,
         type = excluded.type,
         scope = excluded.scope,
         subject = excluded.subject,
         ins = excluded.ins,
         del = excluded.del`
);

if (process.env.TOSHO_COMMITS_VERBOSE) {
  console.log(`[коміти] записано ${commits.length}`);
}

#!/usr/bin/env node
/**
 * Завантажує робочі години з локальних транскриптів Claude Code у
 * tosho.work_sessions.
 *
 * НАВІЩО: оцінка за комітами бачить лише те, що ними закінчилось. 7 серпня
 * вона показала ≈6 год від 11:58, хоча робота йшла з 08:50 — ранок пішов на
 * розбір і планування. У транскриптах кожне повідомлення має позначку часу,
 * тож такий ранок видно.
 *
 * ЧОМУ ЗАПУСКАЄТЬСЯ РУКАМИ, А НЕ ПЛАГІНОМ ДЕПЛОЮ: транскрипти лежать локально
 * (~/.claude/projects), Netlify до них доступу не має. Тож на відміну від
 * релізів це не автоматика, а команда — і сторінка чесно показує, доки саме
 * дані свіжі.
 *
 * Запуск:
 *   set -a; source .env.backup; set +a
 *   node scripts/record-work-hours.mjs [--dry] [--since=YYYY-MM-DD]
 */

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");
const SINCE = process.argv.find((a) => a.startsWith("--since="))?.slice(8) ?? "";
const DB_URL = process.env.BACKUP_DB_URL;

if (!DB_URL) {
  console.error("Немає BACKUP_DB_URL. Спершу: set -a; source .env.backup; set +a");
  process.exit(1);
}

/**
 * Пауза, що рве сесію, і розігрів перед першою реплікою. Пороги менші за
 * комітні (120/30): повідомлення в діалозі йдуть щільно, і півгодинна тиша
 * тут уже означає, що людина відійшла.
 */
const GAP_MIN = 30;
const WARMUP_MIN = 5;

/** Київ = UTC+3. Зсуваємо мітку й далі працюємо з нею як із настінним часом. */
const KYIV_OFFSET_MS = 3 * 60 * 60 * 1000;

const psql = (sql) =>
  execFileSync("psql", [DB_URL, "-tAq", "-c", sql], { encoding: "utf8" }).trim();

/** Тека транскриптів цього проєкту: шлях із слешами через дефіси. */
const projectDir = join(
  homedir(),
  ".claude",
  "projects",
  process.cwd().replace(/\//g, "-")
);

if (!existsSync(projectDir)) {
  console.error(`Немає теки транскриптів: ${projectDir}`);
  process.exit(1);
}

const files = readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"));
console.log(`Читаю ${files.length} сесій…`);

/** day → масив міток часу (мс, київська стіна). */
const byDay = new Map();

for (const file of files) {
  const stream = createInterface({
    input: createReadStream(join(projectDir, file)),
    crlfDelay: Infinity,
  });
  for await (const line of stream) {
    if (!line.trim()) continue;
    let stamp;
    try {
      stamp = JSON.parse(line).timestamp;
    } catch {
      continue; // обірваний рядок наприкінці активної сесії — не привід падати
    }
    if (!stamp) continue;
    const kyiv = Date.parse(stamp) + KYIV_OFFSET_MS;
    if (Number.isNaN(kyiv)) continue;
    const day = new Date(kyiv).toISOString().slice(0, 10);
    if (SINCE && day < SINCE) continue;
    const list = byDay.get(day) ?? [];
    list.push(kyiv);
    byDay.set(day, list);
  }
}

const minutesOfDay = (ms) => {
  const d = new Date(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

const rows = Array.from(byDay.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([day, stamps]) => {
    stamps.sort((a, b) => a - b);
    const blocks = [];
    let start = stamps[0];
    let prev = stamps[0];
    for (const stamp of stamps.slice(1).concat([stamps[stamps.length - 1] + GAP_MIN * 60_000 * 2])) {
      if (stamp - prev > GAP_MIN * 60_000) {
        blocks.push({ from: minutesOfDay(start), to: minutesOfDay(prev) });
        start = stamp;
      }
      prev = stamp;
    }
    const worked = blocks.reduce((sum, b) => sum + (b.to - b.from), 0);
    const hours = (worked + blocks.length * WARMUP_MIN) / 60;
    return { day, hours: Math.round(hours * 100) / 100, blocks };
  });

const total = rows.reduce((sum, r) => sum + r.hours, 0);
console.log(`Днів: ${rows.length}, разом ≈${Math.round(total)} год`);
rows.slice(-5).forEach((r) => {
  const spans = r.blocks
    .map((b) => `${String(Math.floor(b.from / 60)).padStart(2, "0")}:${String(b.from % 60).padStart(2, "0")}`)
    .join(" · ");
  console.log(`  ${r.day}: ≈${r.hours} год  ${spans}`);
});

if (DRY) {
  console.log("\n--dry: нічого не записано.");
  process.exit(0);
}

for (const row of rows) {
  const payload = JSON.stringify(row.blocks).replace(/'/g, "''");
  psql(
    `insert into tosho.work_sessions (day, hours, blocks, source)
     values ('${row.day}', ${row.hours}, '${payload}'::jsonb, 'claude_code')
     on conflict (day) do update
       set hours = excluded.hours, blocks = excluded.blocks, updated_at = now()`
  );
}

console.log(`Записано ${rows.length} днів у tosho.work_sessions.`);

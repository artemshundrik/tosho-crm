#!/usr/bin/env node
/**
 * Сторож бекапа: щоранку дивиться на файли, яких не видно з хмари.
 *
 * Запуск:
 *   node scripts/backup-watchdog.mjs             # людський вивід, код виходу 0/1
 *   node scripts/backup-watchdog.mjs --json      # те саме машинно
 *   node scripts/backup-watchdog.mjs --telegram  # ще й написати власнику, якщо червоне
 *
 * Токен бота НЕ зберігається на диску: `--telegram` бере його з оточення
 * (TELEGRAM_BOT_TOKEN), а запланована задача підставляє його на льоту з
 * `netlify env:get`. Адресат — власник; його chat_id лежить у
 * tosho.user_notification_settings і резолвиться на місці.
 *
 * Мовчить, коли все гаразд: код 0 і рядок «усе чисто». Червоне — код 1 і
 * перелік проблем. Правила й пороги живуть у lib/backupWatchdog.mjs, тут лише
 * збір фактів.
 *
 * ЧОМУ НЕ NETLIFY-ФУНКЦІЯ: дзеркало `backups/storage/.mirror/` лежить на маку
 * Артема й у жодну базу не потрапляє. Крон system-alerts бачить тільки записи
 * в `tosho.backup_runs` — тобто те, що скрипт САМ про себе сказав. Порожнє
 * дзеркало він назве успіхом.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { assessBackups, formatBytes, watchdogMessage } from "./lib/backupWatchdog.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Той самий читач .env, що й у report-backup-run.mjs: формат `export KEY=...`. */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = normalized.indexOf("=");
    if (eq <= 0) continue;
    const key = normalized.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    let value = normalized.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env.backup"));
loadEnvFile(path.join(repoRoot, ".env.local"));

const backupRoot = process.env.BACKUP_ROOT?.trim() || path.join(repoRoot, "backups");
const storageRoot = process.env.BACKUP_STORAGE_ROOT?.trim() || path.join(backupRoot, "storage");
const dbRoot = path.join(backupRoot, "database");
const mirrorRoot = path.join(storageRoot, ".mirror");
const buckets = (process.env.STORAGE_BUCKETS?.trim() || "avatars,attachments,public-assets")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

/** Найновіший файл за суфіксом. `.sha256` поруч із архівом — не архів. */
function newestFile(dir, suffix) {
  if (!fs.existsSync(dir)) return { name: null, mtime: null, bytes: null };
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => {
      const stat = fs.statSync(path.join(dir, entry.name));
      return { name: entry.name, mtime: stat.mtime.toISOString(), bytes: stat.size, at: stat.mtimeMs };
    })
    .sort((a, b) => b.at - a.at);
  const newest = entries[0];
  return newest
    ? { name: newest.name, mtime: newest.mtime, bytes: newest.bytes }
    : { name: null, mtime: null, bytes: null };
}

/**
 * Скільки файлів у теці. Рахуємо через `find`, а не рекурсією по fs: дзеркало
 * містить десятки тисяч обʼєктів, і нам треба лише «нуль чи не нуль».
 */
function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  try {
    const out = execFileSync("/usr/bin/find", [dir, "-type", "f"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return out.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function dirBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  try {
    const out = execFileSync("/usr/bin/du", ["-sk", dir], { encoding: "utf8" });
    return Number(out.trim().split(/\s+/)[0]) * 1024;
  } catch {
    return 0;
  }
}

function freeBytes(dir) {
  try {
    const out = execFileSync("/bin/df", ["-k", dir], { encoding: "utf8" });
    const line = out.trim().split("\n").at(-1) ?? "";
    return Number(line.split(/\s+/)[3]) * 1024;
  } catch {
    return null;
  }
}

/** Останній запис журналу по кожному розділу. Порожньо — не проблема сама по собі. */
async function lastRuns() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const rows = [];
    for (const section of ["database", "storage"]) {
      const { data, error } = await supabase
        .schema("tosho")
        .from("backup_runs")
        .select("section,status,finished_at,error_message")
        .eq("section", section)
        .order("finished_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = (data ?? [])[0];
      if (row) {
        rows.push({
          section: row.section,
          status: row.status,
          finishedAt: row.finished_at ?? null,
          error: row.error_message ?? null,
        });
      }
    }
    return rows;
  } catch (error) {
    // Недоступна база — це не поломка бекапа. Мовчимо про неї в алерті й
    // згадуємо лише у виводі: інакше сторож будив би Артема через власний
    // Wi-Fi.
    console.error(`[сторож] журнал недоступний: ${error?.message ?? error}`);
    return [];
  }
}

const now = new Date();
const mirrors = buckets.map((bucket) => {
  const dir = path.join(mirrorRoot, bucket);
  const exists = fs.existsSync(dir);
  return { bucket, exists, fileCount: exists ? countFiles(dir) : 0 };
});

const facts = {
  mirrors,
  mirrorBytes: dirBytes(mirrorRoot),
  freeBytes: freeBytes(backupRoot),
  newestDbArchive: newestFile(dbRoot, "-database.tar.gz"),
  newestStorageArchive: newestFile(storageRoot, "-storage.tar.gz"),
  lastRuns: await lastRuns(),
};

/**
 * Chat_id власника. Саме власника, а не всієї команди: це аварія на конкретній
 * машині, і решті команди з неї нема чого робити.
 */
async function ownerChatId() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: owners, error: ownersError } = await supabase
    .schema("tosho")
    .from("memberships_view")
    .select("user_id")
    .eq("access_role", "owner")
    .limit(5);
  if (ownersError) throw ownersError;
  const ids = (owners ?? []).map((row) => row.user_id).filter(Boolean);
  if (ids.length === 0) return null;

  const { data: settings, error: settingsError } = await supabase
    .schema("tosho")
    .from("user_notification_settings")
    .select("telegram_chat_id")
    .in("user_id", ids)
    .not("telegram_chat_id", "is", null)
    .limit(1);
  if (settingsError) throw settingsError;
  return (settings ?? [])[0]?.telegram_chat_id ?? null;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.error("[сторож] TELEGRAM_BOT_TOKEN не заданий — повідомлення не пішло");
    return false;
  }
  const chatId = await ownerChatId();
  if (!chatId) {
    console.error("[сторож] у власника не привʼязаний Telegram — повідомлення не пішло");
    return false;
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!response.ok) {
    console.error(`[сторож] Telegram відповів ${response.status}`);
    return false;
  }
  return true;
}

const problems = assessBackups(facts, now);
const dayLabel = now.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
const message = watchdogMessage(problems, dayLabel);

// Шлемо ЛИШЕ коли червоне. Щоденне «бекап у нормі» перетворює сторожа на фон
// за тиждень, і тоді він не спрацює й тоді, коли справді горітиме.
let sent = false;
if (message && process.argv.includes("--telegram")) {
  sent = await sendTelegram(message);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ok: problems.length === 0, problems, message, sent, facts }, null, 2));
} else if (message) {
  console.log(message);
  if (process.argv.includes("--telegram")) console.log(sent ? "\n→ надіслано в Telegram" : "\n→ у Telegram НЕ пішло");
} else {
  console.log(
    `✓ Бекап у нормі — дзеркало ${formatBytes(facts.mirrorBytes)}, ` +
      `база ${facts.newestDbArchive.name ?? "—"}, сховище ${facts.newestStorageArchive.name ?? "—"}`
  );
}

process.exit(problems.length === 0 ? 0 : 1);

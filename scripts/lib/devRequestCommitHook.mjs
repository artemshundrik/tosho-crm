/**
 * Після коміта: знайти в його темі номери карток і сказати дошці, що код є.
 *
 * НАВІЩО ХУК, А НЕ ПАМ'ЯТЬ ЛЮДИНИ. Статус «Готово локально» означає рівно один
 * факт — код закомічено. Поки його ставили руками, дошка показувала не стан
 * справ, а те, що хтось не забув її оновити. Хук прибирає «не забув» із
 * ланцюжка: коміт є → картка рухається.
 *
 * ХУК НІКОЛИ НЕ ВАЛИТЬ КОМІТ. Немає мережі, немає токена, ендпоінт відповів
 * помилкою — це попередження в консоль і вихід 0. Коміт уже стався й важливіший
 * за рядок на дошці; версія «не записав картку, тому й коміта не буде» — гірша
 * з усіх можливих.
 *
 * Кличеться з scripts/hooks/post-commit. Як увімкнути — там же, у шапці.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Куди стукати. Змінна оточення — щоб можна було перевірити на `netlify dev`. */
export const BOARD_URL =
  process.env.TOSHO_BOARD_URL || "https://tosho.pro/.netlify/functions/dev-request-board";

/** Той самий файл, з якого бере токен скіл tosho-request. */
export const TOKEN_FILE = join(homedir(), ".claude", "skills", "tosho-request", ".env");

/** Скільки чекаємо відповіді. Довше — це вже помітна пауза після кожного коміта. */
const TIMEOUT_MS = 6000;

/**
 * Згадка картки в темі коміта.
 *
 * По краях — заборона літери й цифри, і це не причіпка: без неї «PREQ-4» і
 * «REQ-42abc» пролізли б і зрушили чужу картку. Ціна хибного спрацювання —
 * «Готово локально» на картці, під яку немає коду, тобто рівно та брехня, від
 * якої весь цей механізм і будували.
 *
 * Регістр не важливий: `REQ-4`, `req-4`, `Req-4` — та сама картка.
 */
const MENTION = /(?<![\p{L}\p{N}_])REQ-(\d{1,6})(?![\p{L}\p{N}])/giu;

/** Стеля на одну тему. Двадцять карток в одному коміті — це вже не коміт, а помилка розбору. */
export const MAX_NUMBERS = 20;

/**
 * Усі згадки `REQ-<число>` з повідомлення коміта — у порядку появи, без дублів.
 *
 * Порядок появи, а не за зростанням: перша названа картка — головна в цьому
 * коміті, і в підсумку хука вона має стояти першою.
 */
export function extractRequestNumbers(message) {
  if (typeof message !== "string" || message === "") return [];

  const numbers = [];
  for (const match of message.matchAll(MENTION)) {
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number <= 0) continue;
    if (numbers.includes(number)) continue;
    numbers.push(number);
    if (numbers.length >= MAX_NUMBERS) break;
  }
  return numbers;
}

/**
 * Значення з файла виду KEY=value.
 *
 * Свій розбір, а не залежність: хук мусить працювати з голим node, ще до
 * будь-якого `npm install`, — інакше він тихо помирає рівно там, де його ніхто
 * не перевіряє.
 */
export function readEnvValue(text, key) {
  if (typeof text !== "string") return null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || match[1] !== key) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) return value;
  }
  return null;
}

/** Токен: спершу оточення (як у скіла), потім файл скіла. Немає — тихо виходимо. */
export function readToken() {
  const fromEnv = (process.env.TOSHO_CAPTURE_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return readEnvValue(readFileSync(TOKEN_FILE, "utf8"), "TOSHO_CAPTURE_TOKEN");
  } catch {
    // Файла немає — це нормальний стан на чужій машині.
    return null;
  }
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }).trim();
}

async function main() {
  // Тіло коміта теж читаємо: номер картки могли дописати рядком нижче теми.
  const numbers = extractRequestNumbers(git(["log", "-1", "--pretty=%B"]));
  if (numbers.length === 0) return;

  const token = readToken();
  if (!token) {
    console.warn(
      "[запити] у темі коміта є REQ-номер, але токена немає — картку не оновив.\n" +
        `           Поклади TOSHO_CAPTURE_TOKEN у ${TOKEN_FILE} або в оточення.`
    );
    return;
  }

  const sha = git(["rev-parse", "--short", "HEAD"]);

  const response = await fetch(BOARD_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-capture-token": token },
    body: JSON.stringify({ action: "commit", numbers, sha }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const reason = payload?.error ? `: ${payload.error}` : ` (HTTP ${response.status})`;
    console.warn(`[запити] дошку не оновив${reason}`);
    return;
  }

  // Готовий людський підсумок від ендпоінта — переказувати його своїми словами
  // означало б завести другий текст про те саме.
  console.log(payload?.message ?? `[запити] коміт ${sha} зафіксовано`);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entry === import.meta.url) {
  main().catch((error) => {
    // Єдиний вихід із помилкою, який тут може бути, — надрукований текст.
    console.warn(`[запити] хук не спрацював: ${error?.message ?? error}`);
  });
}

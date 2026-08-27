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
 *
 * ХВІСТ `#p1` — АДРЕСА ПУНКТА ЧЕКЛІСТА, а не картки. `REQ-180` каже «ця робота
 * стосується картки 180», `REQ-180#p1` — «закрито пункт p1». Різниця не
 * косметична: накопичувачу дрібниць («Дрібниці: <напрям>») статус ставити не
 * можна взагалі — він полиця, а не задача, і «Викочено» вбило б цілий напрям
 * без вороття (§4.5 docs/DEV_REQUESTS_DESIGN.md).
 *
 * `#` СТОЇТЬ І В ЗАБОРОНІ ПІСЛЯ. Без нього «REQ-180#p1abc» відкотився б до
 * голого «REQ-180»: необов'язкова група не збіглась би, а решта підійшла. Тобто
 * ОДРУК В АДРЕСІ мовчки перетворювався б на згадку картки — рівно найгірший з
 * можливих наслідків. Тепер зіпсована адреса не збігається взагалі й проходить
 * повз, як звичайний текст.
 *
 * ЛІТЕРА В АДРЕСІ — БУДЬ-ЯКА, і це не «про всяк випадок». Тут стояло рівно `p`,
 * а на дошці є картки з пунктами на `t` (REQ-123: `t1`, `t2`, `t3`). Коміт із
 * чесною згадкою `REQ-123#t3` не збігався ВЗАГАЛІ — ні як пункт, ні як картка, —
 * і гак мовчки не робив нічого: ні помилки, ні рядка в консолі. Знайдено
 * 27.08.2026, коли пункт про TypeScript 7 не закрився після своєї ж роботи.
 */
const MENTION = /(?<![\p{L}\p{N}_])REQ-(\d{1,6})(?:#([a-z]\d{1,4}))?(?![\p{L}\p{N}#])/giu;

/** Стеля на одну тему. Двадцять карток в одному коміті — це вже не коміт, а помилка розбору. */
export const MAX_NUMBERS = 20;

/**
 * Усі згадки з повідомлення коміта — у порядку появи, без дублів.
 *
 * Повертає `[{ number, item }]`, де `item` — адреса пункта (`"p1"`) або `null`
 * для згадки самої картки.
 *
 * Порядок появи, а не за зростанням: перша названа картка — головна в цьому
 * коміті, і в підсумку хука вона має стояти першою.
 *
 * Дублем вважається пара «номер + адреса», а не самий номер: `REQ-180#p1` і
 * `REQ-180#p2` в одному коміті — це два різні закриті пункти, і схлопнути їх в
 * один означало б тихо загубити роботу.
 */
export function extractMentions(message) {
  if (typeof message !== "string" || message === "") return [];

  const mentions = [];
  const seen = new Set();
  for (const match of message.matchAll(MENTION)) {
    const number = Number(match[1]);
    if (!Number.isInteger(number) || number <= 0) continue;
    const item = match[2] ? match[2].toLowerCase() : null;
    const key = `${number}#${item ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({ number, item });
    if (mentions.length >= MAX_NUMBERS) break;
  }
  return mentions;
}

/**
 * Номери карток без адреси пункта.
 *
 * АДРЕСОВАНІ СЮДИ НЕ ПОТРАПЛЯЮТЬ, і це головна страховка всього механізму.
 * Поки нова функція не в проді, старий сервер просто не побачить незнайомого
 * поля `items` і не зробить нічого. Якби номер лежав ще й тут, той самий старий
 * сервер поставив би накопичувачу «Готово локально» — тобто механізм убив би
 * напрям рівно в ті кілька комітів, поки будує сам себе.
 */
export function extractRequestNumbers(message) {
  return extractMentions(message)
    .filter((mention) => mention.item === null)
    .map((mention) => mention.number);
}

/** Адресовані згадки: `[{ number, item }]`, готові до поля `items` запиту. */
export function extractChecklistMentions(message) {
  return extractMentions(message).filter((mention) => mention.item !== null);
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
  // Адреса пункта (`REQ-180#p1`) там і живе — тема пишеться для керівництва.
  const message = git(["log", "-1", "--pretty=%B"]);
  const numbers = extractRequestNumbers(message);
  const items = extractChecklistMentions(message);
  if (numbers.length === 0 && items.length === 0) return;

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
    body: JSON.stringify({ action: "commit", numbers, items, sha }),
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

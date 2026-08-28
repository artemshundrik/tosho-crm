/**
 * Після коміта: прочитати трейлер «Закриває:» і сказати дошці, що код є.
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
 * ЩО САМЕ ЧИТАЄТЬСЯ. Тільки рядок `Закриває: REQ-17` — не тема, не проза, не
 * випадкова згадка номера в поясненні. Чому так, і чим за це заплачено тричі за
 * дев'ять днів, — у коментарі до TRAILER_KEY нижче.
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
 * Як виглядає згадка картки.
 *
 * Сама по собі вона вже нічого не закриває — рішення ухвалює трейлер
 * (TRAILER_KEY нижче). Але точність тут потрібна не менша: те, що збіглось у
 * трейлері, поїде на дошку без жодної людської перевірки.
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
 * Ключ трейлера, яким коміт ЗАКРИВАЄ картку.
 *
 * ЧОМУ ОКРЕМИЙ РЯДОК, А НЕ ЗГАДКА В ТЕКСТІ. До 28.08.2026 хук читав усе
 * повідомлення й рухав кожну картку, чий номер там траплявся. Але `REQ-N`
 * проситься в текст саме там, де пояснюєш ПРИЧИНУ («стара картка REQ-17
 * заведена в травні сюди не потрапляє»), — тобто пастка спрацьовувала на
 * найкраще написаних комітах. Тричі за дев'ять днів: REQ-62, REQ-69 з REQ-133
 * і REQ-17, якому деплой устиг поставити «Викочено» на роботі, якої ніхто не
 * починав.
 *
 * ЧОМУ НЕ ЕВРИСТИКА «НА ПОЧАТКУ РЯДКА». Тіло коміта загортається по 78
 * символів, і те, що згадка опинилась усередині рядка, — випадковість
 * переносу, а не намір автора. У тому самому REQ-17 одне слово довше в
 * попередньому реченні — і згадка стояла б на початку рядка. Правило, яке
 * залежить від ширини абзацу, це не правило.
 *
 * Тепер намір заявляється явно, і вгадувати нема чого:
 *
 *     Закриває: REQ-17
 *     Закриває: REQ-180#p1, REQ-199#p2
 *
 * Решта тексту — проза: скільки б там не було `REQ-N`, дошка не зрушить.
 * Щоб проза не з'їдала намір мовчки, коміт із згадкою повз трейлер узагалі не
 * створюється — див. scripts/lib/devRequestCommitGate.mjs.
 */
export const TRAILER_KEY = "Закриває";

/**
 * Рядок трейлера. Регістр не важливий, відступ і пробіли навколо двокрапки —
 * теж: людина пише текст, а не заповнює форму.
 */
const TRAILER = /^[ \t]*закриває[ \t]*:[ \t]*(.*)$/i;

/** Рядок-коментар git (`# …`). Значущий `#` у `REQ-180#p1` стоїть не на початку. */
const COMMENT = /^[ \t]*#/;

/**
 * Усі згадки в даному тексті — у порядку появи, без дублів.
 *
 * Це СИРИЙ сканер: він не знає, трейлер перед ним чи проза. Рішення «що з цим
 * робити» ухвалюють ті, хто його кличе: extractMentions() — по трейлерах,
 * findProseMentions() — по всьому іншому.
 *
 * Дублем вважається пара «номер + адреса», а не самий номер: `REQ-180#p1` і
 * `REQ-180#p2` — це два різні закриті пункти, і схлопнути їх в один означало б
 * тихо загубити роботу.
 */
export function scanMentions(text) {
  if (typeof text !== "string" || text === "") return [];

  const mentions = [];
  const seen = new Set();
  for (const match of text.matchAll(MENTION)) {
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

/** Рядки повідомлення без коментарів git — так само, як їх побачить сам коміт. */
function lines(message) {
  if (typeof message !== "string" || message === "") return [];
  return message.split("\n").filter((line) => !COMMENT.test(line));
}

/**
 * Що заявлено в трейлерах: `[{ number, item }]` у порядку появи, без дублів.
 *
 * Порядок появи, а не за зростанням: перша названа картка — головна в цьому
 * коміті, і в підсумку хука вона має стояти першою.
 */
export function extractMentions(message) {
  const declared = lines(message)
    .map((line) => line.match(TRAILER))
    .filter(Boolean)
    .map((match) => match[1]);
  return scanMentions(declared.join("\n"));
}

/**
 * Згадки, які лежать повз трейлер, — з номером рядка, щоб гейт показав місце.
 *
 * Саме вони раніше рухали чужі картки. Тепер вони не роблять нічого, а гейт на
 * них зупиняє коміт: мовчки пропустити означало б, що людина написала
 * «закриває», а дошка не зрушила — та сама брехня, тільки в інший бік.
 */
export function findProseMentions(message) {
  const found = [];
  lines(message).forEach((line, index) => {
    if (TRAILER.test(line)) return;
    for (const mention of scanMentions(line)) {
      found.push({ ...mention, line: index + 1, text: line.trim() });
    }
  });
  return found;
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
  // Повне повідомлення, але значущі в ньому лише рядки «Закриває:» — тема
  // пишеться для керівництва, а проза лишається прозою.
  const message = git(["log", "-1", "--pretty=%B"]);
  const numbers = extractRequestNumbers(message);
  const items = extractChecklistMentions(message);
  if (numbers.length === 0 && items.length === 0) return;

  const token = readToken();
  if (!token) {
    console.warn(
      "[запити] коміт закриває картку, але токена немає — дошку не оновив.\n" +
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

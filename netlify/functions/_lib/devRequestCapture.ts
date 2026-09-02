import { timingSafeEqual } from "crypto";

import { moduleKeyLabel } from "../../../src/lib/projectMap";
import { buildDevRequestMeta, formatRequestNumber, KIND_LABELS, PRIORITY_LABELS } from "./devRequestBot";
import { clampDraftText, type DevRequestKind, type DevRequestPriority } from "./devRequestDraft";

/**
 * Чиста частина ендпоінта захоплення задач (netlify/functions/dev-request-capture.ts):
 * звірка токена, розбір тіла запиту й побудова відповіді.
 *
 * НАВІЩО ОКРЕМИЙ МОДУЛЬ. Сам ендпоінт живцем не перевіриш: він ходить у
 * Supabase службовим ключем і платить OpenAI. Усе, що можна перевірити тестами,
 * винесено сюди — тут немає ні мережі, ні бази, ні process.env.
 */

/**
 * Заголовок із персональним токеном.
 *
 * НЕ Authorization: у решті функцій цього проєкту Authorization означає рівно
 * одне — Supabase JWT живої людини. Токен захоплення
 * — інша сутність (спільний секрет, не сесія), і сісти на той самий заголовок
 * означало б, що два різні гейти виглядають однаково.
 */
export const CAPTURE_TOKEN_HEADER = "x-capture-token";

/**
 * Коротше — це не задача, а промах по клавіші.
 *
 * Розбір коштує грошей, тож поріг стоїть ДО виклику моделі.
 */
export const MIN_TEXT_CHARS = 3;

/** Куди веде посилання у відповіді: дошка запитів. */
export const CAPTURE_BOARD_PATH = "/dev/backlog";

/**
 * Заголовок без огляду на регістр.
 *
 * Netlify у v1-обгортці віддає ключі в нижньому регістрі, але покладатись на це
 * не варто: локальний netlify dev і тести передають об'єкт як є.
 */
export function readHeader(
  headers: Record<string, string | undefined> | undefined,
  name: string
): string | null {
  if (!headers) return null;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return typeof value === "string" ? value : null;
  }
  return null;
}

/**
 * Звірка спільного секрету за сталий час.
 *
 * Довжину порівнюємо в БАЙТАХ, а не в символах: timingSafeEqual кидає на
 * буферах різної довжини, і токен із не-ASCII символом (а це просто чийсь
 * випадковий пароль, не обов'язково hex) валив би функцію 500-кою замість
 * чесної 401.
 */
export function tokenMatches(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Порожній, обрізаний чи явно не-uuid ідентифікатор власника — не привід іти в базу. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type CaptureBodyResult =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

/**
 * Тіло запиту: `{ "text": "..." }`.
 *
 * Помилки українською й по-людськи — їх читає не сервер, а власник у вікні
 * Cowork, і «Invalid JSON body» йому нічого не пояснює.
 */
export function parseCaptureBody(raw: string | null | undefined): CaptureBodyResult {
  let payload: unknown;
  try {
    payload = JSON.parse(raw ?? "{}");
  } catch {
    return { ok: false, status: 400, error: "Тіло запиту не читається як JSON." };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "Очікую об'єкт виду { \"text\": \"...\" }." };
  }

  const rawText = (payload as { text?: unknown }).text;
  if (typeof rawText !== "string") {
    return { ok: false, status: 400, error: "Немає поля text — нічого записувати." };
  }

  // clampDraftText різатиме «полотно» до тієї ж межі, що й решта входів розбору,
  // тож поріг довжини рахуємо вже по тому, що реально поїде в модель.
  const text = clampDraftText(rawText);
  if (text.length < MIN_TEXT_CHARS) {
    return {
      ok: false,
      status: 400,
      error: `Текст задачі закороткий — треба хоча б ${MIN_TEXT_CHARS} символи.`,
    };
  }

  return { ok: true, text };
}

export type CaptureResponseInput = {
  number: number;
  title: string;
  kind: DevRequestKind;
  /** Ключ напрямку. Невідомий — у відповіді буде null, а не вигаданий підпис. */
  moduleKey: string | null;
  priority: DevRequestPriority;
  /** «Схоже, це вже працює: …». Картку це не скасовує. */
  existingFeature: string | null;
  /** Абсолютне посилання на дошку. */
  url: string;
  /** false — модель не відповіла, картка створена з сирого тексту. */
  drafted: boolean;
};

export type CaptureResponse = {
  ok: true;
  number: string;
  title: string;
  kind: string;
  module: string | null;
  priority: string;
  url: string;
  existingFeature?: string;
  message: string;
};

/**
 * Відповідь для Cowork.
 *
 * Поля розібрані окремо (щоб їх можна було читати кодом), плюс готовий `message`
 * — рядок, який Cowork просто показує власнику й нічого не переказує своїми
 * словами. Переказ моделлю тут був би зайвим витком: усе потрібне вже склали.
 *
 * `drafted: false` НЕ ховаємо: назвою тоді став перший рядок сказаного, а тип і
 * пріоритет — за замовчуванням. Мовчати про це означало б віддати картку, яка
 * виглядає класифікованою, хоча її ніхто не класифікував.
 */
export function buildCaptureResponse(input: CaptureResponseInput): CaptureResponse {
  const label = formatRequestNumber(input.number);
  const meta = buildDevRequestMeta(input);
  const existing = (input.existingFeature ?? "").trim();

  const lines = [`📝 ${label} — записав`, input.title];
  if (meta) lines.push(meta);
  if (existing) lines.push(`💡 Схоже, це вже працює: ${existing}`);
  if (!input.drafted) {
    lines.push("⚠️ Розбір не спрацював — записав як є, тип і назву варто підправити на дошці.");
  }
  lines.push(input.url);

  return {
    ok: true,
    number: label,
    title: input.title,
    kind: KIND_LABELS[input.kind],
    module: moduleKeyLabel(input.moduleKey),
    priority: PRIORITY_LABELS[input.priority],
    url: input.url,
    // Ключ з'являється, лише коли є що сказати: порожнє поле в JSON виглядало б
    // як «перевірили й не знайшли», хоча перевірка просто нічого не дала.
    ...(existing ? { existingFeature: existing } : {}),
    message: lines.join("\n"),
  };
}

/**
 * Повтор того самого запиту.
 *
 * Для людини це не помилка, а факт — те саме, що бачить людина в боті.
 */
export const CAPTURE_DUPLICATE_MESSAGE = "Цю задачу вже записано ✅";

/** «раз / рази / разів» — лічильник читає людина, і «2 разів» її спиняє. */
export function timesWord(count: number): string {
  const tail = Math.abs(count) % 10;
  const hundred = Math.abs(count) % 100;
  if (tail === 1 && hundred !== 11) return "раз";
  if (tail >= 2 && tail <= 4 && (hundred < 12 || hundred > 14)) return "рази";
  return "разів";
}

export type CaptureMergeInput = {
  /** Номер картки, до якої долучили. */
  number: number;
  title: string;
  kind: DevRequestKind;
  moduleKey: string | null;
  /** Скільки разів це просили ПІСЛЯ долучення. */
  askedByCount: number;
  url: string;
};

export type CaptureMergeResponse = {
  ok: true;
  /** Головна відмінність від звичайної відповіді: нової картки НЕ з'явилось. */
  merged: true;
  number: string;
  title: string;
  askedByCount: number;
  url: string;
  message: string;
};

/**
 * Відповідь, коли сказане долучили до наявної картки.
 *
 * ЧОМУ ЦЕ ГУЧНО, А НЕ ТИХО. Рішення «нової картки не буде» ухвалює модель, і
 * помилитись вона може. Тому відповідь називає картку, показує лічильник і
 * прямо каже, як передумати: людина має побачити вибір ОДРАЗУ, а не знайти
 * своє прохання чужим абзацом через тиждень.
 */
export function buildCaptureMergeResponse(input: CaptureMergeInput): CaptureMergeResponse {
  const label = formatRequestNumber(input.number);
  // Рядок збирається тут, а не через buildDevRequestMeta: там пріоритет
  // обов'язковий, а долучення його не міняє — показати чужий пріоритет як
  // наслідок цієї дії було б неправдою.
  const meta = [KIND_LABELS[input.kind], moduleKeyLabel(input.moduleKey)]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  const lines = [`🔗 ${label} — долучив до наявної картки`, input.title];
  if (meta) lines.push(meta);
  lines.push(`Просили вже ${input.askedByCount} ${timesWord(input.askedByCount)}`);
  lines.push("Не те? Скажи — заведу окремою карткою.");
  lines.push(input.url);

  return {
    ok: true,
    merged: true,
    number: label,
    title: input.title,
    askedByCount: input.askedByCount,
    url: input.url,
    message: lines.join("\n"),
  };
}

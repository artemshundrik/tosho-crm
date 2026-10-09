import { pluralUk } from "../../../src/lib/lastSeen";
import { formatRatePercent } from "../../../src/lib/quoteDealType";
import { QUIET_HOURS_TIME_ZONE, isQuietHour } from "./quietHours";

/**
 * Нагадування про запит на ціну нижче дна, який ніхто не вирішив (REQ-328).
 *
 * ЗВІДКИ. TS-1026-0002: менеджер попросив підтвердити ціну 01.10 о 16:35,
 * сповіщення в Telegram пішло всім погоджувачам і Telegram його прийняв — і
 * на цьому все. Запит висів вісім днів, прорахунок стояв замкнений (КП клієнту
 * не відправити), поки менеджер не написав погоджувачу в особисті. Погоджувач
 * був певен, що сповіщення не приходило: одне повідомлення серед інших за
 * тиждень просто загубилось.
 *
 * ЯК. Раз на день, зранку першого робочого вікна, кожному погоджувачу — по
 * одному нагадуванню на прорахунок, поки запит висить. Те саме правило, що
 * в заявках на відсутність (team-events-reminders-background.ts): дата в
 * ключі `reminder=` робить нагадування щоденним, а частковий унікальний
 * індекс гасить повтори, тож крон кожні п'ять хвилин шле лише перше входження.
 *
 * Модуль чистий: час і текст. Хто адресат — src/lib/quoteMarkupNotice.ts,
 * спільний із першим пінгом; хто кличе — netlify/functions/quote-markup-reminders.ts.
 */

const TIME_ZONE = QUIET_HOURS_TIME_ZONE;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Київська дата «YYYY-MM-DD» — межа доби тут, а не в UTC. */
export function kyivDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isKyivWeekend(date: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short" }).format(date);
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * Чому зараз нагадувати не можна — або `null`, якщо можна.
 *
 * Вихідні — свідомо тиша: рішення про ціну чекає робочого дня, як і сам
 * менеджер, що відправить КП. Запит із п'ятниці нагадає про себе в понеділок
 * зранку — дата в ключі не дасть понеділку загубитись.
 */
export function markupReminderPause(now: Date): "quiet-hours" | "weekend" | null {
  if (isQuietHour(now)) return "quiet-hours";
  if (isKyivWeekend(now)) return "weekend";
  return null;
}

/**
 * Чи пора нагадувати про цей запит: подано не сьогодні.
 *
 * Перший пінг іде в мить запиту, тож того самого дня друге повідомлення
 * було б луною. Наступного ранку — вже нагадування.
 */
export function isMarkupReminderDue(requestedAt: string, now: Date): boolean {
  const requested = new Date(requestedAt);
  if (Number.isNaN(requested.getTime())) return false;
  return kyivDateKey(requested) < kyivDateKey(now);
}

/** Скільки календарних днів (за Києвом) висить запит. */
export function markupDaysWaiting(requestedAt: string, now: Date): number {
  const from = Date.parse(`${kyivDateKey(new Date(requestedAt))}T00:00:00Z`);
  const to = Date.parse(`${kyivDateKey(now)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

/** Префікс ключа — за ним шукаємо вже надіслані сьогодні. */
export const MARKUP_REMINDER_KEY_PREFIX = "quote-markup-pending";

/**
 * Посилання на прорахунок із ключем дня.
 *
 * `reminder=` у href — не прикраса: без нього дедуплікація в
 * deliverNotifications мовчки не працює (частковий унікальний індекс).
 */
export function markupReminderHref(quoteId: string, now: Date): string {
  const key = `${MARKUP_REMINDER_KEY_PREFIX}:${quoteId}:${kyivDateKey(now)}`;
  return `/orders/estimates/${quoteId}?reminder=${encodeURIComponent(key)}`;
}

function formatKyivDayMonth(value: string): string {
  return new Intl.DateTimeFormat("uk-UA", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" }).format(
    new Date(value)
  );
}

/**
 * Текст нагадування.
 *
 * «Ціна», а не «накрутка» — те саме прохання Влада, що й у першому пінгу
 * (REQ-325). Скільки днів висить — у заголовку: саме це число відрізняє
 * нагадування від нового запиту, і саме його не було видно вісім днів.
 */
export function buildMarkupReminder(params: {
  quoteNumber: string | null;
  requesterName: string | null;
  /** Готові рядки «Банер · 16 шт.» і «16 323,84 грн (…)» — див. quoteMarkupNotice. */
  runs: Array<{ label: string; price: string }>;
  floorRate: number;
  /** Найраніший із запитів прорахунку. */
  requestedAt: string;
  now: Date;
}): { title: string; body: string } {
  const quoteRef = params.quoteNumber?.trim() ? `#${params.quoteNumber.trim()}` : "прорахунку";
  const who = params.requesterName?.trim() || "Менеджер";
  const days = markupDaysWaiting(params.requestedAt, params.now);
  const waiting = pluralUk(days, "день", "дні", "днів");
  const list = params.runs.map((run) => `${run.label} — ${run.price}`).join(", ");
  const what = params.runs.length === 1 ? "ціну" : "ціни";

  return {
    title: `Ціна чекає рішення ${waiting} — ${quoteRef}`,
    body:
      `${who} просить підтвердити ${what} у ${quoteRef}: ${list}. ` +
      `Запит висить з ${formatKyivDayMonth(params.requestedAt)}; поки рішення немає, пропозицію клієнту не надіслати. ` +
      `Дно — ${formatRatePercent(params.floorRate)} %.`,
  };
}

import { pluralUk } from "@/lib/lastSeen";

import type { DevRequest, RequestStatus } from "./types";

/**
 * Яка дата має значення в кожній колонці — і як за нею сортувати.
 *
 * ЧОМУ ЦЕ ВЗАГАЛІ ПОТРІБНО. Дошка сортувала все за датою створення, включно з
 * «Викочено». Через це релізи ставали в порядок, який нічого не означає:
 * REQ-9 і REQ-11 поїхали в прод одного дня з REQ-48, але були заведені тижнем
 * раніше — і провалились на 18-те й 19-те місце зі списку в 23 картки. Питання
 * «що ми викотили сьогодні» не мало відповіді.
 *
 * ОДНІЄЇ ПРАВИЛЬНОЇ ДАТИ НЕ ІСНУЄ. У кожній колонці своє питання:
 *  - «Вхідні», «У черзі» — «скільки це вже висить?» → дата створення;
 *  - «Викочено» — «коли поїхало?» → дата викочування;
 *  - «В роботі», «Готово локально» — питання про дату ПЕРЕХОДУ в статус,
 *    а такої дати в схемі немає. `updated_at` не підходить: він змінюється від
 *    будь-якої правки, навіть від зміни теми, і мітка «в роботі 5 днів» була б
 *    вигадкою. Тому тут дати немає взагалі — краще нічого, ніж неправда.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Дата, за якою сортується й підписується колонка. null — чесної дати немає. */
export function columnDate(request: DevRequest, status: RequestStatus): string | null {
  if (status === "released") return request.releasedAt ?? request.createdAt;
  if (status === "triage" || status === "queued") return request.createdAt;
  return null;
}

/**
 * Порядок карток у колонці: спершу за релевантною датою (новіші вгорі), а вже
 * потім за номером. Номер як другий ключ — щоб порядок не стрибав, коли кілька
 * карток викотили одним деплоєм і час у них до секунди однаковий.
 */
export function sortColumn(items: DevRequest[], status: RequestStatus): DevRequest[] {
  return [...items].sort((a, b) => {
    const aDate = columnDate(a, status);
    const bDate = columnDate(b, status);
    if (aDate && bDate) {
      const diff = new Date(bDate).getTime() - new Date(aDate).getTime();
      if (diff !== 0) return diff;
    }
    return b.number - a.number;
  });
}

/** Початок доби — щоб «сьогодні» рахувалось календарно, а не «менш ніж 24 години». */
function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/** Скільки календарних днів минуло. Учора о 23:59 — це один день, а не нуль. */
function daysAgo(iso: string, now: Date): number | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.round((startOfDay(now) - startOfDay(new Date(then))) / DAY_MS);
}

/**
 * Підпис дати на картці. У черзі це вік («лежить 3 дні» — сигнал, що картку
 * забули), у викочених — коли поїхало.
 */
export function columnDateLabel(
  request: DevRequest,
  status: RequestStatus,
  now: Date = new Date()
): string | null {
  const iso = columnDate(request, status);
  if (!iso) return null;
  const days = daysAgo(iso, now);
  if (days === null || days < 0) return null;

  if (status === "released") {
    if (days === 0) return "викочено сьогодні";
    if (days === 1) return "викочено вчора";
    if (days < 7) return `викочено ${pluralUk(days, "день", "дні", "днів")} тому`;
    return `викочено ${new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}`;
  }

  if (days === 0) return "сьогодні";
  if (days === 1) return "учора";
  return `лежить ${pluralUk(days, "день", "дні", "днів")}`;
}

/**
 * Корзини для групування за датою.
 *
 * Свідомо НЕ по кожному дню: у «Викочено» двадцять карток дали б чотирнадцять
 * груп по одній-дві, і заголовків стало б більше, ніж карток. Людина мислить
 * «сьогодні / цього тижня / раніше», а не датами.
 */
export type DateBucket = { id: string; label: string; order: number };

export function dateBucket(request: DevRequest, status: RequestStatus, now: Date = new Date()): DateBucket {
  const iso = columnDate(request, status);
  const days = iso ? daysAgo(iso, now) : null;

  if (days === null || days < 0) return { id: "unknown", label: "Без дати", order: 9 };
  if (days === 0) return { id: "today", label: "Сьогодні", order: 0 };
  if (days === 1) return { id: "yesterday", label: "Учора", order: 1 };
  if (days < 7) return { id: "week", label: "Цього тижня", order: 2 };
  if (days < 30) return { id: "month", label: "Цього місяця", order: 3 };
  return { id: "older", label: "Раніше", order: 4 };
}

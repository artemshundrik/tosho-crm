/**
 * Чиста математика робочого календаря відсутностей — без Supabase, щоб її
 * можна було тестувати юнітами (той самий розподіл, що designerPayrollMath vs
 * designerPayroll).
 *
 * ОДИНИЦЯ ЗАЛЕЖИТЬ ВІД ТИПУ (рішення CEO 2026-08-03):
 *  · відпустка — КАЛЕНДАРНІ дні (квота 24, як у ст. 75 КЗпП): вихідні
 *    всередині відпустки квоту їдять, а свята — ні (ст. 78 КЗпП: святкові
 *    дні до відпустки не включаються й подовжують її);
 *  · day-off і лікарняний — РОБОЧІ дні: це відгул і хвороба в робочий день,
 *    календарна арифметика там сенсу не має.
 *
 * Календар один на всю систему: пн–пт, скориговані
 * `tosho.ua_workday_exceptions` (там же живуть державні свята).
 *
 * Дзеркало цієї математики в БД — `tosho.count_absence_quota_days`
 * (scripts/ua-holidays-and-calendar-quotas.sql). Міняючи правило тут, міняй
 * і там: RPC балансів рахує по-своєму.
 */

/** Типи, що мають річну квоту. `other` — без ліміту, вносить лише owner/CEO. */
export const QUOTA_ABSENCE_KINDS = ["vacation", "day_off", "sick_leave"] as const;
export type QuotaAbsenceKind = (typeof QUOTA_ABSENCE_KINDS)[number];

export const DEFAULT_ABSENCE_QUOTAS: Record<QuotaAbsenceKind, number> = {
  vacation: 24,
  day_off: 5,
  sick_leave: 10,
};

/** У чому міряється квота цього типу. */
export const ABSENCE_QUOTA_UNIT: Record<QuotaAbsenceKind, "calendar" | "business"> = {
  vacation: "calendar",
  day_off: "business",
  sick_leave: "business",
};

export const ABSENCE_QUOTA_UNIT_LABEL: Record<"calendar" | "business", string> = {
  calendar: "кал. дн.",
  business: "роб. дн.",
};

/** Мінімум, який потрібен, щоб порахувати дні: сам діапазон. */
export type DateRangeLike = { startDate: string; endDate: string };

/** Перелік дат діапазону включно, як YYYY-MM-DD. Порожньо, якщо кінець < початку. */
export function eachDateKey(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  if (!startKey || !endKey || endKey < startKey) return keys;
  const cursor = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return keys;
  // Захист від абсурдних діапазонів (понад ~10 років) — щоб битий рядок у БД
  // не підвісив рендер сторінки.
  let guard = 0;
  while (cursor <= end && guard < 3700) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return keys;
}

/** Робочий день = пн–пт, якщо виняток календаря не каже інакше. */
export function isBusinessDay(dateKey: string, exceptions?: Map<string, boolean>): boolean {
  const override = exceptions?.get(dateKey);
  if (override !== undefined) return override;
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0 = нд, 6 = сб
  return weekday !== 0 && weekday !== 6;
}

/** Скільки робочих днів у діапазоні [start, end] включно. */
export function countBusinessDays(
  startKey: string,
  endKey: string,
  exceptions?: Map<string, boolean>
): number {
  return eachDateKey(startKey, endKey).filter((key) => isBusinessDay(key, exceptions)).length;
}

/**
 * Робочі дні відсутності, що припадають на конкретний рік.
 * Діапазон може перетинати межу року (новорічна відпустка) — тоді рахуємо
 * лише його частину, бо квота теж річна.
 */
export function countBusinessDaysInYear(
  range: DateRangeLike,
  year: number,
  exceptions?: Map<string, boolean>
): number {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const start = range.startDate < from ? from : range.startDate;
  const end = range.endDate > to ? to : range.endDate;
  return countBusinessDays(start, end, exceptions);
}

/** Календарна тривалість діапазону в днях (для підписів «5 днів поспіль»). */
export function countCalendarDays(range: DateRangeLike): number {
  return eachDateKey(range.startDate, range.endDate).length;
}

/**
 * День, що списує ВІДПУСТКУ: будь-який календарний, окрім явно позначеного
 * неробочим (свято). Звичайний вихідний виняток не має — і тому рахується.
 */
export function isVacationChargeableDay(dateKey: string, exceptions?: Map<string, boolean>): boolean {
  return exceptions?.get(dateKey) !== false;
}

/**
 * Скільки днів квоти з'їсть відсутність у межах року — з урахуванням типу.
 * Діапазон може перетинати межу року (новорічна відпустка), тоді рахуємо
 * лише його частину: квота теж річна.
 */
export function countQuotaDaysInYear(
  kind: QuotaAbsenceKind,
  range: DateRangeLike,
  year: number,
  exceptions?: Map<string, boolean>
): number {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const start = range.startDate < from ? from : range.startDate;
  const end = range.endDate > to ? to : range.endDate;

  if (ABSENCE_QUOTA_UNIT[kind] === "calendar") {
    return eachDateKey(start, end).filter((key) => isVacationChargeableDay(key, exceptions)).length;
  }
  return countBusinessDays(start, end, exceptions);
}

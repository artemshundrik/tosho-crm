/**
 * Постійний тижневий графік людини: які дні вона в офісі, а які — з дому.
 *
 * НАВІЩО ОКРЕМА СУТНІСТЬ, А НЕ ЗАПИСИ В ЖУРНАЛІ. «З дому» дотепер існувало
 * лише як разовий рядок у `tosho.team_absences`: один запис = один діапазон
 * дат. Щоб описати «вівторок і п'ятниця — вдома, і так завжди», керівникові
 * довелось би заводити по два рядки щотижня без кінця (REQ-166).
 *
 * ЗБЕРІГАЄМО ПАТЕРН, А НЕ РОЗГОРНУТІ ДНІ. Матеріалізація дала б ~100 рядків на
 * людину на рік, питання «до якої дати генеруємо» і біль зі зміною графіка
 * заднім числом. Натомість цей модуль розгортає патерн на льоту — і віддає
 * ЗВИЧАЙНІ записи відсутностей, тож планер, дайджест і бот малюють їх тим
 * самим кодом, яким малюють разове «з дому».
 *
 * Чиста математика без Supabase — щоб перевірялась юнітами, як
 * teamAbsenceCalendar.
 */

import { eachDateKey, isBusinessDay } from "@/lib/teamAbsenceCalendar";
import type { TeamAbsence } from "@/lib/teamAbsences";

export const WORK_MODES = ["office", "remote"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  office: "В офісі",
  remote: "З дому",
};

/** ISO-день тижня: 1 — понеділок, 7 — неділя. Той самий рахунок, що в date-fns. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ScheduleDays = Partial<Record<IsoWeekday, WorkMode>>;

export type TeamWorkSchedule = {
  id: string;
  userId: string;
  days: ScheduleDays;
  /** Діє від цієї дати включно. */
  effectiveFrom: string;
  /** null — до скасування. */
  effectiveTo: string | null;
};

/** Порядок днів для редактора й підписів — робочий тиждень попереду. */
export const WEEKDAY_ORDER: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export const WEEKDAY_SHORT_LABELS: Record<IsoWeekday, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Нд",
};

export function isoWeekday(dateKey: string): IsoWeekday {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0 = нд
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/**
 * Невідомий режим — це «запису немає», а не мовчазний офіс: інакше одрук у
 * даних виглядав би як свідомо заданий графік.
 */
export function normalizeWorkMode(value: unknown): WorkMode | null {
  return (WORK_MODES as readonly string[]).includes(value as string) ? (value as WorkMode) : null;
}

/**
 * Дні з jsonb. Ключі там завжди рядки, а значення могло прийти будь-яке —
 * беремо лише те, що розпізнали, і мовчки викидаємо решту.
 */
export function parseScheduleDays(raw: unknown): ScheduleDays {
  if (!raw || typeof raw !== "object") return {};
  const days: ScheduleDays = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const weekday = Number(key);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) continue;
    const mode = normalizeWorkMode(value);
    if (mode) days[weekday as IsoWeekday] = mode;
  }
  return days;
}

/**
 * Графік, чинний на дату. Графік МІНЯЮТЬ, а не накопичують, тож із кількох
 * чинних діє найновіший за датою початку.
 */
export function scheduleForDate(
  schedules: readonly TeamWorkSchedule[],
  dateKey: string
): TeamWorkSchedule | null {
  let found: TeamWorkSchedule | null = null;
  for (const schedule of schedules) {
    if (schedule.effectiveFrom > dateKey) continue;
    if (schedule.effectiveTo && schedule.effectiveTo < dateKey) continue;
    if (!found || schedule.effectiveFrom > found.effectiveFrom) found = schedule;
  }
  return found;
}

/** Записи, які перекривають графік: людини в цей день немає взагалі. */
function occupiedDates(absences: readonly TeamAbsence[]): Map<string, Set<string>> {
  const byUser = new Map<string, Set<string>>();
  for (const absence of absences) {
    // Заявка на погодженні ще нічого не означає — вона не скасовує графік.
    if (absence.status !== "approved") continue;
    const dates = byUser.get(absence.userId) ?? new Set<string>();
    for (const key of eachDateKey(absence.startDate, absence.endDate)) dates.add(key);
    byUser.set(absence.userId, dates);
  }
  return byUser;
}

/**
 * Розгортання графіків у записи «з дому» на вікні дат.
 *
 * ПОРЯДОК СИЛИ, і він зафіксований тестами:
 *  1. вихідний і свято — сильніші за все: свято, що випало на «домашній»
 *     вівторок, лишається святом;
 *  2. погоджена відсутність — сильніша за графік: у відпустці людини немає,
 *     а не «вона з дому»;
 *  3. решта — графік.
 *
 * Офісні дні не породжують нічого: «в офісі» — це норма, і малювати її на
 * планері означало б замалювати весь тиждень усім.
 */
export function expandSchedulesToAbsences(input: {
  schedules: readonly TeamWorkSchedule[];
  from: string;
  to: string;
  /** Винятки робочого календаря: свята й перенесені дні. */
  exceptions?: Map<string, boolean>;
  /** Уже наявні записи журналу — щоб не дублювати й не сперечатись із ними. */
  absences?: readonly TeamAbsence[];
}): TeamAbsence[] {
  const byUser = new Map<string, TeamWorkSchedule[]>();
  for (const schedule of input.schedules) {
    const list = byUser.get(schedule.userId) ?? [];
    list.push(schedule);
    byUser.set(schedule.userId, list);
  }

  const occupied = occupiedDates(input.absences ?? []);
  const rows: TeamAbsence[] = [];

  for (const [userId, schedules] of byUser) {
    const taken = occupied.get(userId);
    for (const dateKey of eachDateKey(input.from, input.to)) {
      if (!isBusinessDay(dateKey, input.exceptions)) continue;
      if (taken?.has(dateKey)) continue;
      const schedule = scheduleForDate(schedules, dateKey);
      if (!schedule) continue;
      if (schedule.days[isoWeekday(dateKey)] !== "remote") continue;
      rows.push({
        // Стабільний id: той самий день дає той самий ключ між рендерами.
        id: `schedule:${schedule.id}:${dateKey}`,
        userId,
        startDate: dateKey,
        endDate: dateKey,
        kind: "wfh",
        // Це не заявка: графік ставить керівник, погоджувати нічого.
        status: "approved",
        comment: "За графіком",
        requestedBy: null,
        decidedBy: null,
        decidedAt: null,
        createdAt: null,
      });
    }
  }

  return rows.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.userId.localeCompare(b.userId));
}

/** Чи це синтетичний запис із графіка, а не рядок журналу. */
export function isScheduleAbsence(absence: Pick<TeamAbsence, "id">): boolean {
  return absence.id.startsWith("schedule:");
}

/** Короткий підпис графіка для картки людини: «Вт, Пт — з дому». */
export function formatScheduleSummary(days: ScheduleDays): string {
  const remote = WEEKDAY_ORDER.filter((day) => days[day] === "remote");
  if (remote.length === 0) return "Щодня в офісі";
  if (remote.length === WEEKDAY_ORDER.filter((day) => days[day]).length) return "Щодня з дому";
  return `${remote.map((day) => WEEKDAY_SHORT_LABELS[day]).join(", ")} — з дому`;
}

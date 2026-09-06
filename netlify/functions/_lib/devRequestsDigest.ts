import type { SupabaseClient } from "@supabase/supabase-js";
import { pluralUk } from "../../../src/lib/lastSeen";

/**
 * Вхідний кошик запитів на доробку — один рядок у тех-звіт власнику.
 *
 * НАВІЩО: картка з Telegram падає в статус `triage` («Вхідні»). Якщо
 * цей стовпчик ніхто не розгрібає, він стає цвинтарем — і це не гіпотеза, а
 * факт із цієї ж бази: у сусідній tosho.support_requests 61 картка з 93
 * застрягла в «чекаємо на людину», остання жива — 10 липня. Ритуалу з
 * календарем свідомо не заводимо: діє те, що щодня муляє очі у звіті, який і
 * так приходить.
 *
 * ЧОМУ ВІК, А НЕ ЛИШЕ КІЛЬКІСТЬ: десять свіжих карток — це система в роботі,
 * а дві, що лежать три тижні, — початок того самого цвинтаря. Голе число не
 * відрізняє одне від одного, тому щойно щось залежалось — у рядок іде вік
 * найстарішої.
 *
 * ЧОМУ МОВЧАННЯ НА ПОРОЖНЬОМУ: рядок «0 запитів» щодня привчає його не читати,
 * і тоді він не спрацює й тоді, коли там буде 20. Порожній кошик = рядка немає.
 */

/**
 * Скільки днів картка може лежати у «Вхідних», поки це нормально.
 *
 * Три, а не 7/14/30 як у решти порогів цього звіту: там черги, які живуть
 * тижнями за задумом (ліди, прорахунки на погодженні), а тут вхідний кошик —
 * його розгрібають, а не ведуть. Заведена в п'ятницю картка нагадає про себе в
 * понеділок, і це рівно та затримка, після якої запит починають забувати.
 */
export const TRIAGE_STALE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Стеля вибірки. Кошик такого розміру — уже сам по собі аварія, і рядок
 * покаже її незалежно від того, 500 там чи 600.
 */
const MAX_ROWS = 500;

/**
 * Дати створення карток, що чекають розбору. Читаємо самі дати, а не рахуємо
 * агрегати в базі: вік і поріг рахує чиста функція нижче, яку видно з тестів.
 *
 * РІВНО `triage`, і це не скорочення переліку відкритих станів. Рядок про
 * КОШИК ВХОДУ: скільки картки чекають, поки їх бодай хтось прочитає. Ні черга,
 * ні «Ідеї» сюди не входять — відкладене вже розібрали й свідомо відклали, і
 * щоденний докір за нього перетворив би звіт на фон, який перестають читати.
 * Вік ідей видно там, де їх дивляться, — у списку «Ідеї» (formatIdleAge).
 */
export async function fetchTriageCreatedAt(
  admin: SupabaseClient,
  teamIds: string[]
): Promise<string[]> {
  if (teamIds.length === 0) return [];

  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select("created_at")
    .in("team_id", teamIds)
    .eq("status", "triage")
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);
  if (error) throw new Error(`dev_requests: ${error.message}`);

  return ((data ?? []) as Array<{ created_at?: string | null }>)
    .map((row) => row.created_at)
    .filter((value): value is string => Boolean(value));
}

export type InboxSummary = {
  total: number;
  /** Вік найстарішої картки в повних добах. 0 — усе заведено сьогодні. */
  oldestDays: number;
  /** Скільки карток перетнули поріг. Саме воно вирішує, чи згадувати вік. */
  stale: number;
};

export function summarizeInbox(
  createdAt: string[],
  now: Date,
  staleDays: number = TRIAGE_STALE_DAYS
): InboxSummary {
  const ages = createdAt
    .map((iso) => ageInDays(iso, now))
    .filter((value): value is number => value !== null);

  return {
    // Не ages.length: битої дати в базі бути не може (колонка not null), але
    // якщо вона трапиться — картку однаково треба порахувати, просто без віку.
    total: createdAt.length,
    oldestDays: ages.length > 0 ? Math.max(...ages) : 0,
    stale: ages.filter((days) => days >= staleDays).length,
  };
}

function ageInDays(iso: string, now: Date): number | null {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return null;
  return Math.floor(Math.max(0, now.getTime() - created) / DAY_MS);
}

/**
 * Рядок у тех-звіт. Три стани, кожен коротший за попередній привід хвилюватись:
 *
 *   немає нічого      → рядка немає взагалі
 *   усе свіже         → «📥 Кошик запитів: 3 нові»
 *   частина залежалась→ «📥 Кошик запитів: 5, з них 2 без руху · найстаріша чекає 12 днів»
 *   залежалось усе    → «📥 Кошик запитів: 5 · найстаріша чекає 12 днів»
 *
 * «з них N без руху» зникає, коли N дорівнює загальному числу: інакше виходить
 * «5, з них 5 без руху» — кваліфікатор, який лише повторює вже сказане.
 */
export function inboxLine(summary: InboxSummary): string | null {
  if (summary.total === 0) return null;

  if (summary.stale === 0) {
    return `📥 Кошик запитів: ${pluralUk(summary.total, "нова", "нові", "нових")}`;
  }

  const partial = summary.stale < summary.total ? `, з них ${summary.stale} без руху` : "";
  const oldest = pluralUk(summary.oldestDays, "день", "дні", "днів");
  return `📥 Кошик запитів: ${summary.total}${partial} · найстаріша чекає ${oldest}`;
}

/* ------------------------------------------------------------------ *
 * Полиця «Сьогодні» і робота в русі — решта ранкового брифінгу дошки.
 *
 * ЧОМУ ЦЕ ТУТ, А НЕ ОКРЕМИМ ЗВІТОМ: тех-звіт і так приходить уранці й і так
 * має рядок про кошик. Другий ранковий лист про ту саму дошку почали б
 * пропускати обидва — а окремий агент, який щоранку каже те саме іншими
 * словами, лише подвоює вартість і кількість місць, де правило може розійтись.
 * ------------------------------------------------------------------ */

/**
 * Скільки днів картка може стояти «в роботі» без жодної зміни, поки це нормально.
 *
 * Сім, а не три як у кошика: кошик розгрібають, а взяту картку роблять, і
 * велика справа тиждень без коміта — це ще робота, а не забуте. Друга поспіль
 * тиша вже означає, що картку відклали й не сказали про це дошці.
 */
export const IN_PROGRESS_STALE_DAYS = 7;

export type BoardCard = {
  label: string;
  /** Остання зміна картки — єдина позначка руху, яка в базі є. */
  updatedAt: string | null;
};

/**
 * Картки полиці «Сьогодні» та стовпчика «В роботі» одним запитом.
 *
 * `today_at` — це і є полиця: її наповнює сама людина в CRM, тож порядок
 * беремо той, у якому клала (dev-requests-today.sql), а не за терміновістю.
 * Полиця — намір на день, і переставляти його за своїм розумінням не можна.
 */
export async function fetchBoardBriefing(
  admin: SupabaseClient,
  teamIds: string[]
): Promise<{ today: BoardCard[]; inProgress: BoardCard[]; queued: number }> {
  if (teamIds.length === 0) return { today: [], inProgress: [], queued: 0 };

  const { data, error } = await admin
    .schema("tosho")
    .from("dev_requests")
    .select("number,status,today_at,updated_at")
    .in("team_id", teamIds)
    .in("status", ["queued", "in_progress"])
    .limit(MAX_ROWS);
  if (error) throw new Error(`dev_requests: ${error.message}`);

  const rows = (data ?? []) as Array<{
    number?: number | null;
    status?: string | null;
    today_at?: string | null;
    updated_at?: string | null;
  }>;

  const toCard = (row: (typeof rows)[number]): BoardCard => ({
    label: `REQ-${row.number}`,
    updatedAt: row.updated_at ?? null,
  });

  const today = rows
    .filter((row) => Boolean(row.today_at))
    .sort((a, b) => String(a.today_at).localeCompare(String(b.today_at)))
    .map(toCard);

  return {
    today,
    inProgress: rows.filter((row) => row.status === "in_progress").map(toCard),
    queued: rows.filter((row) => row.status === "queued").length,
  };
}

/**
 * Рядок про полицю «Сьогодні».
 *
 *   набрано          → «🎯 Сьогодні: REQ-205 · REQ-210»
 *   не набрано, є що → «🎯 Сьогодні: не набрано · у черзі 20»
 *   не набрано й нічого в черзі → рядка немає
 *
 * ЧОМУ ПОРОЖНЯ ПОЛИЦЯ ВСЕ ОДНО ГОВОРИТЬ, на відміну від кошика: кошик — це
 * докір («розберіть»), і щоденний нуль там привчає не читати. А тут порожньо
 * означає «день ще не набраний» — і назвати, скільки лежить напоготові, це
 * відповідь на питання, а не нагадування про борг. Мовчимо лише тоді, коли й
 * черга порожня: тоді сказати справді нічого.
 */
export function todayLine(today: BoardCard[], queued: number): string | null {
  if (today.length > 0) return `🎯 Сьогодні: ${today.map((card) => card.label).join(" · ")}`;
  if (queued > 0) return `🎯 Сьогодні: не набрано · у черзі ${queued}`;
  return null;
}

/**
 * Рядок про роботу в русі.
 *
 *   нічого не взято     → рядка немає
 *   усе рухається       → «🔧 В роботі: 3 картки»
 *   щось застигло       → «🔧 В роботі: 8 карток, з них 2 без змін понад тиждень»
 *
 * ЧОМУ «БЕЗ ЗМІН», А НЕ «В РОБОТІ З»: у базі немає позначки, коли картку взяли
 * в роботу, — є лише `updated_at`, останній дотик будь-якого поля. Назвати це
 * віком картки означало б збрехати точністю, якої немає; «без змін» описує рівно
 * те, що ми справді знаємо.
 */
export function inProgressLine(
  inProgress: BoardCard[],
  now: Date,
  staleDays: number = IN_PROGRESS_STALE_DAYS
): string | null {
  if (inProgress.length === 0) return null;

  const total = pluralUk(inProgress.length, "картка", "картки", "карток");
  const stale = inProgress.filter((card) => {
    const age = card.updatedAt ? ageInDays(card.updatedAt, now) : null;
    return age !== null && age >= staleDays;
  }).length;

  // Той самий принцип, що й у кошика: кваліфікатор, який дорівнює самому
  // числу, нічого не додає.
  if (stale === 0 || stale === inProgress.length) {
    return stale === 0
      ? `🔧 В роботі: ${total}`
      : `🔧 В роботі: ${total} — усі без змін понад тиждень`;
  }
  return `🔧 В роботі: ${total}, з них ${stale} без змін понад тиждень`;
}

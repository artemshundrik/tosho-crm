import type { SupabaseClient } from "@supabase/supabase-js";
import { pluralUk } from "../../../src/lib/lastSeen";

/**
 * Вхідний кошик запитів на доробку — один рядок у тех-звіт власнику.
 *
 * НАВІЩО: картка з Telegram падає в статус `triage` («Треба уточнити»). Якщо
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
 * Скільки днів картка може лежати в «Треба уточнити», поки це нормально.
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

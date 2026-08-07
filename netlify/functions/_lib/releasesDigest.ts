import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildThreads,
  daySessions,
  scopeLabel,
  type ReleaseChange,
  type ScopedChange,
} from "../../../src/lib/releaseHistory";

/**
 * Релізи для дайджестів.
 *
 * ДВІ РІЗНІ ПОДАЧІ ЗА ЗАДУМОМ: власнику в тех-звіт іде рядок із цифрами
 * (зміни, ≈години, топ-справа), а SEO у вечірній — СПРАВИ людською мовою без
 * щоденних цифр. Голі числа комітів щодня стають метрикою тиску: день із
 * двома комітами читається як «лінивий», хоча думання не комітиться. Обсяги
 * для SEO — раз на тиждень, у пʼятницю.
 */

type ReleaseRow = { released_at: string; changes: unknown };

/**
 * Зміни за конкретний київський день. Фільтруємо за часом самого коміта
 * (`at`), а не за released_at: один запис релізу може нести коміти двох діб —
 * вечірні потрапляють у ранковий пуш наступного дня.
 */
export async function fetchDayChanges(
  admin: SupabaseClient,
  dayKey: string
): Promise<ScopedChange[]> {
  const { data, error } = await admin
    .schema("tosho")
    .from("releases")
    .select("released_at, changes")
    .gte("released_at", `${dayKey}T00:00:00+03:00`)
    .lt("released_at", `${shiftDayKey(dayKey, 2)}T00:00:00+03:00`)
    .order("released_at", { ascending: true });
  if (error) throw error;

  const changes: ScopedChange[] = [];
  for (const row of (data ?? []) as ReleaseRow[]) {
    if (!Array.isArray(row.changes)) continue;
    for (const change of row.changes as ReleaseChange[]) {
      const releasedAt = change.at ?? row.released_at;
      if (releasedAt.slice(0, 10) !== dayKey) continue;
      changes.push({ ...change, releasedAt });
    }
  }
  return changes.sort((a, b) => a.releasedAt.localeCompare(b.releasedAt));
}

function shiftDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type DayReleaseSummary = {
  count: number;
  hours: number;
  /** Назва найбільшої справи дня — людська, якщо recorder її переказав. */
  topTitle: string | null;
};

export function summarizeDay(changes: ScopedChange[]): DayReleaseSummary {
  if (changes.length === 0) return { count: 0, hours: 0, topTitle: null };
  const threads = buildThreads(changes);
  const top = threads[0] ?? null;
  return {
    count: changes.length,
    hours: daySessions(changes.map((c) => c.releasedAt)).hours,
    topTitle: top ? (top.lead.plain ?? top.lead.subject) : null,
  };
}

/** Рядок у тех-звіт власнику: цифри доречні, це його власна робота. */
export function techReleaseLine(summary: DayReleaseSummary): string | null {
  if (summary.count === 0) return null;
  const top = summary.topTitle ? ` · топ: «${summary.topTitle}»` : "";
  return `🚀 Реліз за вчора: ${summary.count} змін · ≈${summary.hours} год${top}`;
}

/**
 * Блок для вечірнього бізнес-дайджесту: до трьох справ дня людською мовою.
 * Свідомо без цифр — див. шапку модуля.
 */
export function businessReleaseBullets(changes: ScopedChange[], limit = 3): string[] {
  if (changes.length === 0) return [];
  return buildThreads(changes)
    .slice(0, limit)
    .map((thread) => thread.lead.plain ?? thread.lead.subject);
}

export type WeekReleaseSummary = {
  count: number;
  hours: number;
  topScopes: string[];
};

/** Тижневі обсяги для пʼятничного рядка SEO. Дні передаються вже зібраними. */
export function summarizeWeek(days: ScopedChange[][]): WeekReleaseSummary {
  const all = days.flat();
  const scopeCounts = new Map<string, number>();
  let hours = 0;
  for (const day of days) {
    if (day.length > 0) hours += daySessions(day.map((c) => c.releasedAt)).hours;
  }
  for (const change of all) {
    const label = scopeLabel(change.scope);
    scopeCounts.set(label, (scopeCounts.get(label) ?? 0) + 1);
  }
  return {
    count: all.length,
    hours: Math.round(hours),
    topScopes: Array.from(scopeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([label]) => label),
  };
}

export function weeklyReleaseLine(summary: WeekReleaseSummary): string | null {
  if (summary.count === 0) return null;
  const scopes = summary.topScopes.length > 0 ? ` · найбільше: ${summary.topScopes.join(", ")}` : "";
  return `За тиждень у CRM: ${summary.count} змін · ≈${summary.hours} год${scopes}`;
}

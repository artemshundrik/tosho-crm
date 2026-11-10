import { escapeTelegramHtml } from "../_telegram";
import type { AdminClient, MemberRow } from "./digestDelivery";

/**
 * Ранковий звіт «хто як працював у CRM учора» (REQ-331).
 *
 * ЗВІДКИ ДАНІ.
 *   * Час — tosho.user_activity_daily.sessions: відрізки хвилин київської доби.
 *     Хвилина з'являється лише від руху мишки/клавіатури/прокрутки, проміжок
 *     ≤ 10 хв без руху зараховано, довший — перерва (scripts/user-activity-sessions.sql).
 *
 * ЧОМУ БЕЗ «ЗМІН». До 10.11.2026 звіт рахував ще й правки по людях з трьох
 * журналів. Артем: «вони безполезні» — число правок нічого не каже про
 * роботу (одна велика правка проти сотні автозбережень). Лишився лише час.
 */

export const IDLE_GAP_MINUTES = 10;

/**
 * Службові акаунти, яких у звіті про людей бути не може. За id, бо ім'я
 * міняють; той самий акаунт виключено з відомості (PAYROLL_EXCLUDED_USER_IDS).
 */
export const SERVICE_ACCOUNT_IDS = new Set<string>([
  "e328c5fc-1773-48c0-a5d4-a73f42687c66", // Тиць Клікович — Playwright-перевірки
]);

/** Відрізок роботи: хвилини доби [from, to). */
export type Span = { from: number; to: number };

/** `{[540,600),[640,700)}` → відрізки. supabase-js віддає multirange рядком. */
export function parseMultirange(raw: unknown): Span[] {
  if (typeof raw !== "string") return [];
  const spans: Span[] = [];
  for (const match of raw.matchAll(/\[(\d+),(\d+)\)/g)) {
    spans.push({ from: Number(match[1]), to: Number(match[2]) });
  }
  return spans.sort((a, b) => a.from - b.from);
}

export function clock(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} хв`;
  return m > 0 ? `${h} год ${m} хв` : `${h} год`;
}

export type PersonDay = {
  name: string;
  spans: Span[];
  /** Для дня без відрізків (вкладка зі старим кодом) — лише хвилини. */
  activeMinutes: number;
};

/** Більше перерв у рядок не влазить — далі лише кількість і сума. */
const MAX_LISTED_BREAKS = 3;

export function renderPerson(person: PersonDay): string {
  const lines = [`<b>${escapeTelegramHtml(person.name)}</b>`];
  const active = person.spans.length
    ? person.spans.reduce((sum, s) => sum + (s.to - s.from), 0)
    : person.activeMinutes;

  const parts: string[] = [];
  if (person.spans.length) {
    const first = person.spans[0].from;
    const last = person.spans[person.spans.length - 1].to;
    parts.push(`${clock(first)}–${clock(last)}`);
  }
  if (active > 0) parts.push(`активно ${formatMinutes(active)}`);
  lines.push(parts.join(" · "));

  const breaks: Span[] = [];
  for (let i = 1; i < person.spans.length; i += 1) {
    breaks.push({ from: person.spans[i - 1].to, to: person.spans[i].from });
  }
  if (breaks.length > 0 && breaks.length <= MAX_LISTED_BREAKS) {
    lines.push(`перерви: ${breaks.map((b) => `${clock(b.from)}–${clock(b.to)}`).join(", ")}`);
  } else if (breaks.length > MAX_LISTED_BREAKS) {
    const total = breaks.reduce((sum, b) => sum + (b.to - b.from), 0);
    lines.push(`перерв: ${breaks.length}, разом ${formatMinutes(total)}`);
  }
  return lines.join("\n");
}

export function renderTeamActivity(params: {
  dayLabel: string;
  people: PersonDay[];
  absent: Array<{ name: string; reason: string | null }>;
}): string {
  const people = [...params.people].sort((a, b) => {
    const af = a.spans[0]?.from ?? Number.MAX_SAFE_INTEGER;
    const bf = b.spans[0]?.from ?? Number.MAX_SAFE_INTEGER;
    return af - bf || a.name.localeCompare(b.name, "uk");
  });

  const blocks = [`👥 <b>Робота в CRM · ${escapeTelegramHtml(params.dayLabel)}</b>`];
  for (const person of people) blocks.push(renderPerson(person));
  if (params.absent.length) {
    const list = params.absent
      .map((a) => escapeTelegramHtml(a.reason ? `${a.name} (${a.reason})` : a.name))
      .join(", ");
    blocks.push(`Не заходили: ${list}`);
  }
  blocks.push(
    `<i>Активно — хвилини з рухом мишки чи клавіатури в CRM; пауза понад ${IDLE_GAP_MINUTES} хв — перерва. ` +
      `Телефон, Telegram і пошта сюди не входять.</i>`
  );
  return blocks.join("\n\n");
}

export async function loadTeamActivity(
  admin: AdminClient,
  members: MemberRow[],
  dayKey: string
) {
  const workspaceIds = Array.from(new Set(members.map((m) => m.workspaceId)));
  const activityDays = await admin
    .schema("tosho")
    .from("user_activity_daily")
    .select("user_id,active_minutes,sessions")
    .in("workspace_id", workspaceIds)
    .eq("day", dayKey);
  if (activityDays.error) throw new Error(`user_activity_daily: ${activityDays.error.message}`);

  const minutesByUser = new Map<string, { spans: Span[]; activeMinutes: number }>();
  for (const row of (activityDays.data ?? []) as Array<{
    user_id: string;
    active_minutes: number | null;
    sessions: unknown;
  }>) {
    minutesByUser.set(row.user_id, {
      spans: parseMultirange(row.sessions),
      activeMinutes: row.active_minutes ?? 0,
    });
  }

  return { minutesByUser };
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeTelegramHtml } from "../_telegram";

import { buildCardWidget, type CardData } from "./cardWidget";
import { todayKeyInKiev } from "./digestDates";
import { plural, type WidgetContent } from "./telegramWidgets";

/**
 * Відповідь співробітнику на його заявку (REQ-356#p4, макети 3 і 3б):
 * по центру один значок, «Відпустку погоджено», великі дати, плашки і дрібний
 * рядок, хто вирішив. Не вдалось зібрати — null, і піде звичайний текст.
 */

const ACCUSATIVE: Record<string, string> = {
  vacation: "Відпустку",
  day_off: "Відгул",
  sick_leave: "Лікарняний",
  wfh: "Роботу з дому",
  other: "Відсутність",
};

/** Квота за замовчуванням — та сама, що в tosho.team_absence_balances. */
const DEFAULT_QUOTA: Record<string, { column: string; days: number }> = {
  vacation: { column: "vacation_days", days: 18 },
  day_off: { column: "day_off_days", days: 6 },
  sick_leave: { column: "sick_days", days: 10 },
};

const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

const parts = (key: string) => {
  const [, month, day] = key.split("-").map(Number);
  return { day, month: MONTHS[month - 1] ?? "" };
};

/** «17 – 28 листопада», «30 листопада – 2 грудня», «5 грудня». */
export function bigRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  if (start === end) return `${a.day} ${a.month}`;
  if (a.month === b.month && start.slice(0, 4) === end.slice(0, 4)) return `${a.day} – ${b.day} ${b.month}`;
  return `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export function absenceResultCard(params: {
  kind: string;
  start: string;
  end: string;
  approved: boolean;
  deciderShort: string;
  time: string;
  comment: string | null;
  /** Скільки днів квоти з'їдає (одиниця за типом), якщо відомо. */
  quotaDays: number | null;
  /** Залишок квоти після цієї заявки; null — квоти в типу немає. */
  remaining: number | null;
  todayKey: string;
}): CardData {
  const what = ACCUSATIVE[params.kind] ?? "Відсутність";
  const who = [params.deciderShort, params.time].filter(Boolean).join(", ");
  if (!params.approved) {
    return {
      i: "✕",
      k: "no",
      h: `${what} не погоджено`,
      b: bigRange(params.start, params.end),
      q: (params.comment ?? "").slice(0, 160) || undefined,
      f: who ? `Відхилено · ${who}` : undefined,
    };
  }
  const unit = params.kind === "vacation" ? "кал. дн." : "роб. дн.";
  const until = daysBetween(params.todayKey, params.start);
  const plates = [
    params.quotaDays !== null ? `${params.quotaDays} ${unit}` : "",
    until > 0 ? `до старту ${until} ${plural(until, ["день", "дні", "днів"])}` : until === 0 ? "з сьогодні" : "",
    params.remaining !== null ? `лишиться ${params.remaining} ${unit}` : "",
  ].filter(Boolean);
  return {
    i: "✓",
    k: "ok",
    h: `${what} погоджено`,
    b: bigRange(params.start, params.end),
    p: plates,
    f: who ? `Погоджено · ${who}` : undefined,
  };
}

async function quotaDays(admin: SupabaseClient, workspaceId: string, kind: string, from: string, to: string): Promise<number | null> {
  const { data } = await admin.schema("tosho").rpc("count_absence_quota_days", { _workspace: workspaceId, _kind: kind, _from: from, _to: to });
  return typeof data === "number" ? data : null;
}

/**
 * Залишок як у CRM: квота року мінус погоджені дні цього типу в році.
 * team_absence_balances тут не підходить — вона бере людину з auth.uid().
 */
async function remainingAfter(admin: SupabaseClient, absence: { workspace_id: string; user_id: string; kind: string; start_date: string }): Promise<number | null> {
  const quota = DEFAULT_QUOTA[absence.kind];
  if (!quota) return null;
  const year = absence.start_date.slice(0, 4);
  const [{ data: quotaRow, error: quotaError }, { data: rows, error: rowsError }] = await Promise.all([
    admin
      .schema("tosho")
      .from("team_absence_quotas")
      .select(quota.column)
      .eq("workspace_id", absence.workspace_id)
      .eq("user_id", absence.user_id)
      .eq("year", Number(year))
      .maybeSingle(),
    admin
      .schema("tosho")
      .from("team_absences")
      .select("start_date,end_date")
      .eq("workspace_id", absence.workspace_id)
      .eq("user_id", absence.user_id)
      .eq("kind", absence.kind)
      .eq("status", "approved")
      .lte("start_date", `${year}-12-31`)
      .gte("end_date", `${year}-01-01`)
      .limit(60),
  ]);
  if (quotaError || rowsError) return null;
  const total = Number((quotaRow as Record<string, unknown> | null)?.[quota.column] ?? quota.days);
  const spent = await Promise.all(
    ((rows ?? []) as Array<{ start_date: string; end_date: string }>).map((row) =>
      quotaDays(
        admin,
        absence.workspace_id,
        absence.kind,
        row.start_date < `${year}-01-01` ? `${year}-01-01` : row.start_date,
        row.end_date > `${year}-12-31` ? `${year}-12-31` : row.end_date
      )
    )
  );
  if (spent.some((value) => value === null)) return null;
  return Math.max(0, total - spent.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

export async function loadAbsenceResultWidget(
  admin: SupabaseClient,
  params: {
    absence: { workspace_id: string; user_id: string; kind: string; start_date: string; end_date: string };
    approved: boolean;
    deciderShort: string;
    decidedAt: string;
    comment: string | null;
    /** «Відпустка погоджена» — підпис для старих клієнтів. */
    title: string;
    body: string;
  }
): Promise<WidgetContent | null> {
  try {
    const { absence } = params;
    const [days, remaining] = params.approved
      ? await Promise.all([
          quotaDays(admin, absence.workspace_id, absence.kind, absence.start_date, absence.end_date),
          remainingAfter(admin, absence),
        ])
      : [null, null];
    const time = new Date(params.decidedAt).toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
    const data = absenceResultCard({
      kind: absence.kind,
      start: absence.start_date,
      end: absence.end_date,
      approved: params.approved,
      deciderShort: params.deciderShort,
      time,
      comment: params.comment,
      quotaDays: days,
      remaining,
      todayKey: todayKeyInKiev(new Date()),
    });
    return await buildCardWidget({
      data,
      caption: `<b>${escapeTelegramHtml(params.title)}</b>\n${escapeTelegramHtml(params.body)}`,
    });
  } catch (error) {
    console.warn("[absence-result] widget failed", error);
    return null;
  }
}

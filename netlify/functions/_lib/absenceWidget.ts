import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeTelegramHtml } from "../_telegram";

import { ABSENCE_KIND_LABELS, formatAbsenceRange } from "./absenceSubmit";
import { shiftDays, todayKeyInKiev } from "./digestDates";
import { avatarStyle, loadMemberAvatar } from "./cardWidget";
import { buildAbsenceWidget, type WidgetContent } from "./telegramWidgets";

/**
 * Віджет під заявкою на відсутність: календар на 2–3 тижні, де видно, хто
 * ЩЕ відсутній у ті самі дні. Саме це питання власник ставить собі перед
 * «Погодити», і раніше відповідь була лише в CRM, на вкладці «Календар».
 *
 * Кнопки рішення лишаються під повідомленням, як і були: віджет їх не
 * замінює, а лише показує контекст. Не вдалося зібрати — повертаємо null, і
 * заявка приходить звичайним текстом.
 */

type AbsenceRef = {
  id: string;
  workspace_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  kind: string;
};

const DAY_MS = 86_400_000;
const MIN_DAYS = 14;
const MAX_DAYS = 21;

function dayIndex(fromKey: string, key: string): number {
  return Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

function weekday(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

/** Перший понеділок не пізніше за дату. */
export function mondayOf(key: string): string {
  return shiftDays(key, -((weekday(key) + 6) % 7));
}

/** Скільки днів показати: цілі тижні, щоб накрити заявку, від двох до трьох. */
export function windowLength(windowStart: string, endKey: string): number {
  const weeks = Math.ceil((dayIndex(windowStart, endKey) + 1) / 7);
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, weeks * 7));
}

export async function loadAbsenceRequestWidget(
  admin: SupabaseClient,
  params: {
    absence: AbsenceRef;
    requesterName: string;
    /** «⏳ стартує завтра» для нагадування, інакше порожньо. */
    urgent?: string;
    comment?: string | null;
  }
): Promise<WidgetContent | null> {
  const { absence } = params;
  try {
    const windowStart = mondayOf(absence.start_date);
    const length = windowLength(windowStart, absence.end_date);
    const windowEnd = shiftDays(windowStart, length - 1);
    const lastKey = absence.end_date > windowEnd ? absence.end_date : windowEnd;

    const [overlapResult, holidayResult, avatar] = await Promise.all([
      admin
        .schema("tosho")
        .from("team_absences")
        .select("user_id,start_date,end_date,kind,status")
        .eq("workspace_id", absence.workspace_id)
        .in("status", ["approved", "pending"])
        .neq("id", absence.id)
        // «З дому» — присутність, а не відсутність: у календар не йде.
        .neq("kind", "wfh")
        .lte("start_date", windowEnd)
        .gte("end_date", windowStart)
        .limit(100),
      admin
        .schema("tosho")
        .from("ua_workday_exceptions")
        .select("day,is_workday")
        .eq("workspace_id", absence.workspace_id)
        .gte("day", windowStart)
        .lte("day", lastKey),
      loadMemberAvatar(admin, absence.user_id),
    ]);
    if (overlapResult.error || holidayResult.error) return null;

    type Overlap = { user_id: string; start_date: string; end_date: string; kind: string | null; status: string };
    const overlaps = ((overlapResult.data ?? []) as Overlap[]).filter((row) => row.user_id !== absence.user_id);
    const userIds = Array.from(new Set(overlaps.map((row) => row.user_id)));
    const names = new Map<string, string>();
    if (userIds.length > 0) {
      const { data } = await admin
        .schema("tosho")
        .from("team_member_profiles")
        .select("user_id,full_name,first_name,last_name")
        .eq("workspace_id", absence.workspace_id)
        .in("user_id", userIds);
      for (const row of (data ?? []) as Array<{ user_id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null }>) {
        const composed = [row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(" ");
        names.set(row.user_id, row.full_name?.trim() || composed);
      }
    }

    // Робочий календар: вихідні, крім робочих субот, плюс свята.
    const exceptions = new Map(
      ((holidayResult.data ?? []) as Array<{ day: string; is_workday: boolean | null }>).map((row) => [row.day, row.is_workday === true])
    );
    const isOff = (key: string) => exceptions.get(key) === undefined ? [0, 6].includes(weekday(key)) : !exceptions.get(key);
    const offDays: number[] = [];
    for (let i = 0; i < length; i += 1) if (isOff(shiftDays(windowStart, i))) offDays.push(i);

    // Відпустка рахується календарними днями, решта — робочими (як у квотах).
    const total = dayIndex(absence.start_date, absence.end_date) + 1;
    let working = 0;
    for (let i = 0; i < total; i += 1) if (!isOff(shiftDays(absence.start_date, i))) working += 1;
    const days = absence.kind === "vacation" ? `${total} кал. дн.` : `${working} роб. дн.`;

    const kindLabel = ABSENCE_KIND_LABELS[absence.kind] ?? "Відсутність";
    const range = formatAbsenceRange(absence);
    const todayIndex = dayIndex(windowStart, todayKeyInKiev(new Date()));

    // 40 px у віджеті — беремо вдвічі, щоб на ретіні не мило.
    const requesterAvatar = avatar ? await avatarStyle(avatar, 80, 34).catch(() => undefined) : undefined;

    return buildAbsenceWidget({
      avatarStyle: requesterAvatar,
      title: `Заявка · ${kindLabel.toLowerCase()}`,
      urgent: params.urgent ?? "",
      name: params.requesterName,
      range,
      days,
      comment: params.comment ?? "",
      windowStart,
      length,
      offDays,
      todayIndex: todayIndex >= 0 && todayIndex < length ? todayIndex : -1,
      requester: { from: dayIndex(windowStart, absence.start_date), to: dayIndex(windowStart, absence.end_date) },
      others: overlaps
        .filter((row) => names.get(row.user_id))
        .map((row) => ({
          name: names.get(row.user_id) as string,
          kind: (ABSENCE_KIND_LABELS[(row.kind ?? "other").trim()] ?? "Відсутність").toLowerCase(),
          from: dayIndex(windowStart, row.start_date),
          to: dayIndex(windowStart, row.end_date),
          pending: row.status === "pending",
        })),
      caption:
        `<b>Заявка: ${escapeTelegramHtml(kindLabel.toLowerCase())} — ${escapeTelegramHtml(params.requesterName)}</b>\n` +
        `${escapeTelegramHtml(range)} · ${days}`,
    });
  } catch (error) {
    console.warn("[absence-widget] build failed", error);
    return null;
  }
}

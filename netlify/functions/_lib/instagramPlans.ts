/**
 * Рішення заявок без бази: що записати й кого сповістити. Базу торкається
 * instagramRequests.ts, тут лише правила, тому все це перевіряється тестами.
 */
import {
  addWorkingMinutes,
  canReply,
  isReplyWindowOpen,
  isWorkingTime,
  workingMinutesBetween,
  type RequestAccessShape,
  type RequestActor,
  type WorkHours,
} from "../../../src/features/instagramRequests/rules";

export type InstagramSettings = {
  team_id: string;
  reminder_minutes: number;
  handover_minutes: number;
  work_start_hour: number;
  work_end_hour: number;
  auto_reply_text: string;
  other_reviewer_user_id: string | null;
  round_excluded_user_ids: string[];
  round_cursor_user_id: string | null;
};

export type InstagramRequestRow = RequestAccessShape & {
  created_at: string;
  awaiting_reply: boolean;
  id: string;
  team_id: string;
  external_user_id: string;
  handle: string | null;
  display_name: string | null;
  assigned_at: string | null;
  reminder_due_at: string | null;
  handover_due_at: string | null;
  reminded_at: string | null;
  assignee_notified_at: string | null;
  unassigned_alerted_at: string | null;
  round: number;
  round_user_ids: string[];
  is_overdue: boolean;
  first_response_at: string | null;
  last_client_message_at: string | null;
  last_message_preview: string | null;
  auto_replied_at: string | null;
  ad_id: string | null;
  ad_title: string | null;
  is_test: boolean;
  created_by: string | null;
};

export const workHoursOf = (settings: Pick<InstagramSettings, "work_start_hour" | "work_end_hour">): WorkHours => ({
  startHour: settings.work_start_hour,
  endHour: settings.work_end_hour,
});

/** Призначення з таймером. Лічба стартує від `now`, а поза робочим часом від відкриття дня. */
export function assignmentPatch(
  now: Date,
  userId: string,
  settings: InstagramSettings,
  round: { round: number; roundUserIds: string[]; isOverdue: boolean }
) {
  const hours = workHoursOf(settings);
  return {
    assigned_user_id: userId,
    assigned_at: now.toISOString(),
    reminder_due_at: addWorkingMinutes(now, settings.reminder_minutes, hours).toISOString(),
    handover_due_at: addWorkingMinutes(now, settings.handover_minutes, hours).toISOString(),
    reminded_at: null,
    assignee_notified_at: isWorkingTime(now, hours) ? now.toISOString() : null,
    round: round.round,
    round_user_ids: Array.from(new Set([...round.roundUserIds, userId])),
    is_overdue: round.isOverdue,
  };
}

/** Заявка вже має відповідь: забрати чи передати можна, але таймера більше немає. */
export const assignmentWithoutTimer = (now: Date, userId: string, roundUserIds: string[]) => ({
  assigned_user_id: userId,
  assigned_at: now.toISOString(),
  reminder_due_at: null,
  handover_due_at: null,
  reminded_at: null,
  assignee_notified_at: now.toISOString(),
  round_user_ids: Array.from(new Set([...roundUserIds, userId])),
});

/** Перша відповідь зупиняє таймер: і з CRM, і із застосунку Instagram. */
export function firstResponsePatch(
  request: Pick<InstagramRequestRow, "created_at" | "first_response_at" | "status">,
  at: Date,
  responderId: string | null,
  hours: WorkHours
) {
  if (request.first_response_at) return {};
  // Від приходу заявки, а не від призначення: передача скидає assigned_at, і клієнт,
  // що чекав півтори години, виглядав би як відповідь за дві хвилини.
  const startedAt = new Date(request.created_at);
  return {
    status: request.status === "new" ? ("in_progress" as const) : request.status,
    first_response_at: at.toISOString(),
    first_response_minutes: workingMinutesBetween(startedAt, at, hours),
    first_response_by: responderId,
    reminder_due_at: null,
    handover_due_at: null,
    reminded_at: null,
    is_overdue: false,
  };
}

export type ReplyCheck = { ok: true } | { ok: false; status: number; error: string };

export function checkReply(
  actor: RequestActor,
  request: InstagramRequestRow,
  now: Date,
  assigneeName: string | null
): ReplyCheck {
  if (!canReply(actor, request)) {
    return {
      ok: false,
      status: 409,
      error: assigneeName
        ? `Заявкою вже займається ${assigneeName}. Вашу відповідь не надіслано.`
        : "Відповідати може лише той, хто займається заявкою. Вашу відповідь не надіслано.",
    };
  }
  if (!isReplyWindowOpen(request.last_client_message_at, now)) {
    return { ok: false, status: 409, error: "Минуло 7 днів від останнього повідомлення клієнта. Instagram більше не дає відповісти." };
  }
  return { ok: true };
}

/** Автовідповідь: лише поза робочим часом і лише раз за неробочий проміжок. */
export function shouldAutoReply(
  request: Pick<InstagramRequestRow, "kind" | "auto_replied_at">,
  now: Date,
  hours: WorkHours
): boolean {
  if (request.kind !== "ad" || isWorkingTime(now, hours)) return false;
  if (!request.auto_replied_at) return true;
  return workingMinutesBetween(new Date(request.auto_replied_at), now, hours) > 0;
}

/**
 * Кому фактично йде сповіщення. Тестові заявки реально проходять коло, але
 * сповіщають лише того, хто їх створив, а не менеджерів, які нічого не очікують.
 */
export function notificationTargets(
  request: Pick<InstagramRequestRow, "is_test" | "created_by">,
  userIds: Array<string | null | undefined>
): string[] {
  const unique = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (!request.is_test) return unique;
  return unique.length > 0 && request.created_by ? [request.created_by] : [];
}

export type TimerStep = "notify_morning" | "remind" | "handover" | "assign";

/** Що зробити з заявкою на цьому тіку. Передача сильніша за нагадування. */
export function timerStep(request: InstagramRequestRow, now: Date): TimerStep | null {
  if (request.kind !== "ad") return null;
  // Заявка вже в роботі: таймера немає, але нічне повідомлення треба донести вранці.
  if (request.status === "in_progress" || request.status === "lead") {
    return !request.assignee_notified_at && request.awaiting_reply && request.assigned_user_id ? "notify_morning" : null;
  }
  if (request.status !== "new" || request.first_response_at) return null;
  if (!request.assigned_user_id) return "assign";
  if (request.handover_due_at && new Date(request.handover_due_at) <= now) return "handover";
  if (!request.assignee_notified_at) return "notify_morning";
  if (request.reminder_due_at && !request.reminded_at && new Date(request.reminder_due_at) <= now) return "remind";
  return null;
}

export const clientLabel = (request: Pick<InstagramRequestRow, "handle" | "display_name">): string =>
  request.handle || request.display_name || "Клієнт";

export const preview = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
};

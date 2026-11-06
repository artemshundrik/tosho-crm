/**
 * Заявки з Instagram: уся робота з базою.
 *
 * Вхід для Instagram один: `ingestEvent`. Вебхук Meta розбирає подію у
 * `NormalizedEvent` і викликає цю функцію, тестові заявки роблять те саме.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isRequestManagerRole, isWorkingTime, pickNextManager } from "../../../src/features/instagramRequests/rules";
import { deliverNotifications } from "../_notificationDelivery";
import { loadMembers, type MemberRow } from "./digestDelivery";
import {
  assignmentPatch,
  clientLabel,
  firstResponsePatch,
  notificationTargets,
  preview,
  shouldAutoReply,
  timerStep,
  workHoursOf,
  type InstagramRequestRow,
  type InstagramSettings,
} from "./instagramPlans";
import { sendInstagramMessage } from "./instagramTransport";

export type AdminClient = SupabaseClient;

export type NormalizedEvent = {
  teamId: string;
  externalUserId: string;
  handle?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Звідки людина прийшла. Для наявної розмови не міняє нічого, крім історії. */
  kind: "ad" | "other";
  externalMessageId: string;
  text: string;
  attachments?: unknown[];
  /** `out` це копія вихідного: відповідь із застосунку Instagram. */
  direction: "in" | "out";
  ad?: { id?: string | null; title?: string | null } | null;
  at: Date;
  isTest?: boolean;
  createdBy?: string | null;
};

const tosho = (admin: AdminClient) => admin.schema("tosho");
const UNIQUE_VIOLATION = "23505";

export const requestHref = (id: string) => `/requests/${id}`;

export async function loadSettings(admin: AdminClient, teamId: string): Promise<InstagramSettings> {
  const { error: upsertError } = await tosho(admin)
    .from("instagram_settings")
    .upsert({ team_id: teamId }, { onConflict: "team_id", ignoreDuplicates: true });
  if (upsertError) throw new Error(`instagram_settings: ${upsertError.message}`);
  const { data, error } = await tosho(admin).from("instagram_settings").select("*").eq("team_id", teamId).single();
  if (error) throw new Error(`instagram_settings: ${error.message}`);
  return data as InstagramSettings;
}

export async function loadRequest(admin: AdminClient, id: string): Promise<InstagramRequestRow | null> {
  const { data, error } = await tosho(admin).from("instagram_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`instagram_requests: ${error.message}`);
  return (data as InstagramRequestRow | null) ?? null;
}

export async function updateRequest(admin: AdminClient, id: string, patch: Record<string, unknown>) {
  const { error } = await tosho(admin).from("instagram_requests").update(patch).eq("id", id);
  if (error) throw new Error(`instagram_requests: ${error.message}`);
}

export async function writeEvent(
  admin: AdminClient,
  request: Pick<InstagramRequestRow, "id" | "team_id">,
  kind: string,
  extra: { from?: string | null; to?: string | null; actor?: string | null; note?: string | null } = {}
) {
  const { error } = await tosho(admin).from("instagram_request_events").insert({
    team_id: request.team_id,
    request_id: request.id,
    kind,
    from_user_id: extra.from ?? null,
    to_user_id: extra.to ?? null,
    actor_user_id: extra.actor ?? null,
    note: extra.note ?? null,
  });
  if (error) throw new Error(`instagram_request_events: ${error.message}`);
}

export const memberName = (member: MemberRow | undefined): string | null =>
  member?.fullName || member?.email?.split("@")[0] || null;

async function teamMembers(admin: AdminClient, teamId: string): Promise<MemberRow[]> {
  return (await loadMembers(admin)).filter((member) => member.teamId === teamId);
}

export async function loadMemberMap(admin: AdminClient, teamId: string): Promise<Map<string, MemberRow>> {
  return new Map((await teamMembers(admin, teamId)).map((member) => [member.userId, member]));
}

/** Хто реально може взяти заявку сьогодні. «З дому» відсутністю не вважається. */
export async function loadAvailableManagers(
  admin: AdminClient,
  members: MemberRow[],
  settings: Pick<InstagramSettings, "round_excluded_user_ids">,
  now: Date
): Promise<string[]> {
  const managers = members.filter(
    (member) => isRequestManagerRole(member.jobRole) && !settings.round_excluded_user_ids.includes(member.userId)
  );
  if (managers.length === 0) return [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kiev" }).format(now);
  const { data, error } = await tosho(admin)
    .from("team_absences")
    .select("user_id")
    .in("user_id", managers.map((member) => member.userId))
    .eq("status", "approved")
    .in("kind", ["vacation", "sick_leave", "day_off"])
    .lte("start_date", today)
    .gte("end_date", today);
  if (error) throw new Error(`team_absences: ${error.message}`);
  const absent = new Set((data ?? []).map((row) => (row as { user_id: string }).user_id));
  return managers.map((member) => member.userId).filter((id) => !absent.has(id)).sort();
}

type Notice = { to: Array<string | null | undefined>; title: string; body: string };

async function notify(admin: AdminClient, request: InstagramRequestRow, notice: Notice, now: Date, hoursOpen?: boolean) {
  const targets = notificationTargets(request, notice.to);
  if (targets.length === 0) return;
  const title = request.is_test ? `Тест. ${notice.title}` : notice.title;
  // Вночі лише в дзвіночок. Нову заявку повторно донесе перший тік робочого дня.
  const silent = hoursOpen === undefined ? false : !hoursOpen;
  try {
    await deliverNotifications(
      admin,
      targets.map((userId) => ({ user_id: userId, title, body: notice.body, href: requestHref(request.id), type: "info" as const })),
      { category: "instagram_requests", silent }
    );
  } catch (error) {
    // Сповіщення не має ламати саму заявку: вона вже призначена й видима в CRM.
    console.warn("instagram notify failed", { requestId: request.id, at: now.toISOString(), error });
  }
}

async function managersWhoLead(members: MemberRow[], settings: InstagramSettings): Promise<string[]> {
  if (settings.other_reviewer_user_id) return [settings.other_reviewer_user_id];
  return members.filter((member) => (member.jobRole ?? "").toLowerCase() === "seo").map((member) => member.userId);
}

export type AssignOutcome = { assignedTo: string | null; newRound: boolean };

/** Наступний за колом. Заявка не лишиться загубленою, навіть якщо нікого немає: її повторить таймер. */
export async function assignNext(
  admin: AdminClient,
  request: InstagramRequestRow,
  settings: InstagramSettings,
  members: MemberRow[],
  now: Date,
  reason: "new" | "timeout"
): Promise<AssignOutcome> {
  const candidates = await loadAvailableManagers(admin, members, settings, now);
  const pick = pickNextManager({
    candidates,
    cursor: settings.round_cursor_user_id,
    alreadyHad: request.round_user_ids,
    current: request.assigned_user_id,
  });
  const hours = workHoursOf(settings);
  const open = isWorkingTime(now, hours);
  const client = clientLabel(request);

  if (!pick) {
    if (!request.unassigned_alerted_at) {
      await updateRequest(admin, request.id, { unassigned_alerted_at: now.toISOString() });
      await writeEvent(admin, request, "no_manager");
      await notify(
        admin,
        request,
        { to: await managersWhoLead(members, settings), title: "Заявка без менеджера", body: `${client}: зараз немає жодного доступного менеджера. Передайте заявку вручну.` },
        now
      );
    }
    return { assignedTo: null, newRound: false };
  }

  const previous = request.assigned_user_id;
  const patch = assignmentPatch(now, pick.userId, settings, {
    round: pick.newRound ? request.round + 1 : request.round,
    roundUserIds: pick.newRound ? [] : request.round_user_ids,
    isOverdue: pick.newRound || request.is_overdue,
  });
  let query = tosho(admin).from("instagram_requests").update(patch).eq("id", request.id).is("first_response_at", null);
  // Два тіки одночасно: перший змінить відповідального, другий нічого не знайде.
  query = previous ? query.eq("assigned_user_id", previous) : query.is("assigned_user_id", null);
  const { data: updated, error } = await query.select("id");
  if (error) throw new Error(`instagram_requests: ${error.message}`);
  if (!updated || updated.length === 0) return { assignedTo: previous, newRound: false };

  const { error: cursorError } = await tosho(admin)
    .from("instagram_settings")
    .update({ round_cursor_user_id: pick.userId })
    .eq("team_id", request.team_id);
  if (cursorError) throw new Error(`instagram_settings: ${cursorError.message}`);

  await writeEvent(admin, request, pick.newRound ? "new_round" : reason === "new" ? "assigned" : "handed_over", {
    from: previous,
    to: pick.userId,
  });

  const nextName = memberName(members.find((member) => member.userId === pick.userId));
  if (reason === "new") {
    await notify(
      admin,
      request,
      { to: [pick.userId], title: "Нова заявка з Instagram", body: `${client}: ${request.last_message_preview ?? ""}` },
      now,
      open
    );
  } else {
    await notify(
      admin,
      request,
      {
        to: [pick.userId],
        title: pick.newRound ? "Заявка пішла на нове коло" : "Заявку передано вам",
        body: `${client}: ніхто не відповів за ${settings.handover_minutes} хв. У вас є ${settings.handover_minutes} хв.`,
      },
      now
    );
    await notify(
      admin,
      request,
      { to: previous === pick.userId ? [] : [previous], title: "Заявку передано далі", body: `${client}: не було відповіді за ${settings.handover_minutes} хв. Тепер нею займається ${nextName ?? "інший менеджер"}.` },
      now
    );
  }
  return { assignedTo: pick.userId, newRound: pick.newRound };
}

export type InsertMessageInput = {
  request: Pick<InstagramRequestRow, "id" | "team_id">;
  direction: "in" | "out";
  source: "client" | "crm" | "ig_app" | "auto_reply";
  body: string;
  attachments?: unknown[];
  externalId?: string | null;
  clientMessageId?: string | null;
  senderUserId?: string | null;
  sendStatus?: "pending" | "sent" | "failed";
  sendError?: string | null;
  at: Date;
};

/** null означає дубль: це повідомлення вже записане раніше. */
export async function insertMessage(admin: AdminClient, input: InsertMessageInput): Promise<string | null> {
  const { data, error } = await tosho(admin)
    .from("instagram_messages")
    .insert({
      team_id: input.request.team_id,
      request_id: input.request.id,
      direction: input.direction,
      source: input.source,
      body: input.body,
      attachments: input.attachments ?? [],
      external_id: input.externalId ?? null,
      client_message_id: input.clientMessageId ?? null,
      sender_user_id: input.senderUserId ?? null,
      send_status: input.sendStatus ?? "sent",
      send_error: input.sendError ?? null,
      created_at: input.at.toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return null;
    throw new Error(`instagram_messages: ${error.message}`);
  }
  return (data as { id: string }).id;
}

async function sendAutoReply(admin: AdminClient, request: InstagramRequestRow, settings: InstagramSettings, now: Date) {
  const result = await sendInstagramMessage({ recipientId: request.external_user_id, text: settings.auto_reply_text, isTest: request.is_test });
  await insertMessage(admin, {
    request,
    direction: "out",
    source: "auto_reply",
    body: settings.auto_reply_text,
    externalId: result.ok ? result.externalId : null,
    sendStatus: result.ok ? "sent" : "failed",
    sendError: result.ok ? null : result.error,
    at: new Date(now.getTime() + 1),
  });
  await updateRequest(admin, request.id, { auto_replied_at: now.toISOString() });
}

export type IngestResult = { requestId: string; created: boolean; duplicate: boolean };

/** Вхід з Instagram. Повторна доставка тієї самої події нічого не змінює. */
export async function ingestEvent(admin: AdminClient, event: NormalizedEvent): Promise<IngestResult> {
  const { data: known, error: knownError } = await tosho(admin)
    .from("instagram_messages")
    .select("request_id")
    .eq("team_id", event.teamId)
    .eq("external_id", event.externalMessageId)
    .maybeSingle();
  if (knownError) throw new Error(`instagram_messages: ${knownError.message}`);
  if (known) return { requestId: (known as { request_id: string }).request_id, created: false, duplicate: true };

  const text = preview(event.text);
  const { data: inserted, error: insertError } = await tosho(admin)
    .from("instagram_requests")
    .upsert(
      {
        team_id: event.teamId,
        external_user_id: event.externalUserId,
        handle: event.handle ?? null,
        display_name: event.displayName ?? null,
        avatar_url: event.avatarUrl ?? null,
        kind: event.kind,
        ad_id: event.ad?.id ?? null,
        ad_title: event.ad?.title ?? null,
        is_test: event.isTest ?? false,
        created_by: event.createdBy ?? null,
        created_at: event.at.toISOString(),
        last_message_at: event.at.toISOString(),
        last_message_preview: text,
      },
      { onConflict: "team_id,external_user_id", ignoreDuplicates: true }
    )
    .select("id");
  if (insertError) throw new Error(`instagram_requests: ${insertError.message}`);
  const created = Boolean(inserted && inserted.length > 0);

  const { data: row, error: rowError } = await tosho(admin)
    .from("instagram_requests")
    .select("*")
    .eq("team_id", event.teamId)
    .eq("external_user_id", event.externalUserId)
    .single();
  if (rowError) throw new Error(`instagram_requests: ${rowError.message}`);
  const request = row as InstagramRequestRow;

  const messageId = await insertMessage(admin, {
    request,
    direction: event.direction,
    source: event.direction === "in" ? "client" : "ig_app",
    body: event.text,
    attachments: event.attachments,
    externalId: event.externalMessageId,
    at: event.at,
  });
  if (!messageId) return { requestId: request.id, created: false, duplicate: true };

  const settings = await loadSettings(admin, event.teamId);
  const hours = workHoursOf(settings);
  const members = await teamMembers(admin, event.teamId);

  if (event.direction === "out") {
    await updateRequest(admin, request.id, {
      ...firstResponsePatch(request, event.at, null, hours),
      last_message_at: event.at.toISOString(),
      last_message_preview: text,
      last_message_direction: "out",
      last_message_sender_id: null,
      awaiting_reply: false,
    });
    await writeEvent(admin, request, "app_reply");
    await notify(admin, request, { to: [request.assigned_user_id], title: "Відповідь із застосунку Instagram", body: `${clientLabel(request)}: ${text}` }, event.at);
    return { requestId: request.id, created, duplicate: false };
  }

  const reopening = !created && request.status === "closed";
  await updateRequest(admin, request.id, {
    last_client_message_at: event.at.toISOString(),
    last_message_at: event.at.toISOString(),
    last_message_preview: text,
    last_message_direction: "in",
    last_message_sender_id: null,
    awaiting_reply: true,
    // Вночі сповіщення лише в дзвіночку: перший тік робочого дня донесе його вдруге.
    ...(!created && !isWorkingTime(event.at, hours) ? { assignee_notified_at: null } : {}),
    ...(reopening
      ? { status: request.kind === "other" ? "new" : "in_progress", closed_at: null, closed_by: null, close_reason: null }
      : {}),
  });
  const current: InstagramRequestRow = { ...request, last_client_message_at: event.at.toISOString(), last_message_preview: text };

  if (!created && event.ad?.id && event.ad.id !== request.ad_id) {
    await writeEvent(admin, request, "ad_seen", { note: event.ad.title ?? event.ad.id });
  }
  if (created && request.kind === "ad") {
    await writeEvent(admin, request, "received");
  }

  if (current.kind === "other") {
    // Лише про нову розмову і вдень: особисте листування не має будити людину о третій ночі.
    if (created || reopening) {
      await writeEvent(admin, request, created ? "other_received" : "reopened");
      await notify(admin, current, { to: await managersWhoLead(members, settings), title: "Нова розмова в Instagram не з реклами", body: `${clientLabel(current)}: ${text}` }, event.at, isWorkingTime(event.at, hours));
    }
    return { requestId: request.id, created, duplicate: false };
  }

  if (shouldAutoReply(current, event.at, hours)) {
    await sendAutoReply(admin, current, settings, event.at);
  }

  if (created) {
    await assignNext(admin, current, settings, members, event.at, "new");
    return { requestId: request.id, created, duplicate: false };
  }

  if (reopening) {
    await writeEvent(admin, request, "reopened", { note: "Клієнт написав знову" });
    const assignee = request.assigned_user_id;
    const stillHere = assignee ? (await loadAvailableManagers(admin, members, settings, event.at)).includes(assignee) || members.some((m) => m.userId === assignee && !isRequestManagerRole(m.jobRole)) : false;
    if (!stillHere) {
      const pick = pickNextManager({
        candidates: await loadAvailableManagers(admin, members, settings, event.at),
        cursor: settings.round_cursor_user_id,
        alreadyHad: [],
        current: assignee,
      });
      if (pick) {
        await updateRequest(admin, request.id, { assigned_user_id: pick.userId, assigned_at: event.at.toISOString() });
        await writeEvent(admin, request, "passed", { from: assignee, to: pick.userId, note: "Попередній менеджер зараз недоступний" });
        await notify(admin, current, { to: [pick.userId], title: "Клієнт написав знову", body: `${clientLabel(current)}: ${text}` }, event.at, isWorkingTime(event.at, hours));
        return { requestId: request.id, created, duplicate: false };
      }
    }
  }

  await notify(admin, current, { to: [request.assigned_user_id], title: reopening ? "Клієнт написав знову" : "Нове повідомлення в заявці", body: `${clientLabel(current)}: ${text}` }, event.at, isWorkingTime(event.at, hours));
  return { requestId: request.id, created, duplicate: false };
}

export type SendReplyResult =
  | { ok: true; messageId: string; duplicate: boolean }
  | { ok: false; status: number; error: string; messageId?: string };

/** Спільне для першого надсилання й повтору: уже записане повідомлення йде клієнту. */
export async function deliverMessage(
  admin: AdminClient,
  request: InstagramRequestRow,
  settings: InstagramSettings,
  messageId: string,
  text: string,
  actorId: string,
  now: Date
): Promise<SendReplyResult> {
  const result = await sendInstagramMessage({ recipientId: request.external_user_id, text, isTest: request.is_test });
  if (!result.ok) {
    await tosho(admin).from("instagram_messages").update({ send_status: "failed", send_error: result.error }).eq("id", messageId);
    await writeEvent(admin, request, "send_failed", { actor: actorId, note: result.error });
    return { ok: false, status: 502, error: result.error, messageId };
  }
  await tosho(admin).from("instagram_messages").update({ send_status: "sent", send_error: null, external_id: result.externalId }).eq("id", messageId);
  // Таймер міг передати заявку, поки йшло надсилання: дивимось на свіжий стан.
  const fresh = (await loadRequest(admin, request.id)) ?? request;
  const first = firstResponsePatch(fresh, now, actorId, workHoursOf(settings));
  await updateRequest(admin, request.id, {
    ...first,
    last_message_at: now.toISOString(),
    last_message_preview: preview(text),
    last_message_direction: "out",
    last_message_sender_id: actorId,
    awaiting_reply: false,
    // Клієнт відповідь уже отримав, тож заявка лишається за тим, хто відповів.
    ...("first_response_at" in first ? { assigned_user_id: actorId } : {}),
  });
  if ("first_response_at" in first) {
    await writeEvent(admin, request, "first_response", { actor: actorId, note: String(first.first_response_minutes) });
    if (fresh.assigned_user_id && fresh.assigned_user_id !== actorId && fresh.kind === "ad") {
      await notify(admin, fresh, { to: [fresh.assigned_user_id], title: "Заявка вже має відповідь", body: `${clientLabel(request)}: колега відповів клієнту, заявка лишається за ним.` }, now);
    }
  }
  return { ok: true, messageId, duplicate: false };
}

export type TimerSummary = { checked: number; reminded: number; handedOver: number; assigned: number };

/** Викликається з reminders-dispatch кожні 5 хвилин. Без роботи це один запит у базу. */
export async function runTimerTick(admin: AdminClient, now: Date): Promise<TimerSummary> {
  const summary: TimerSummary = { checked: 0, reminded: 0, handedOver: 0, assigned: 0 };
  const { data, error } = await tosho(admin)
    .from("instagram_requests")
    .select("*")
    .eq("kind", "ad")
    .or("and(status.eq.new,first_response_at.is.null),and(status.in.(in_progress,lead),assignee_notified_at.is.null)")
    .limit(200);
  if (error) throw new Error(`instagram_requests: ${error.message}`);

  const due = ((data ?? []) as InstagramRequestRow[])
    .map((request) => ({ request, step: timerStep(request, now) }))
    .filter((item) => item.step !== null);
  summary.checked = due.length;
  if (due.length === 0) return summary;

  const context = new Map<string, { settings: InstagramSettings; members: MemberRow[] }>();
  for (const { request, step } of due) {
    let shared = context.get(request.team_id);
    if (!shared) {
      shared = { settings: await loadSettings(admin, request.team_id), members: await teamMembers(admin, request.team_id) };
      context.set(request.team_id, shared);
    }
    const { settings, members } = shared;
    const hours = workHoursOf(settings);
    if (!isWorkingTime(now, hours) && step !== "assign") continue;
    const client = clientLabel(request);

    if (step === "notify_morning") {
      await updateRequest(admin, request.id, { assignee_notified_at: now.toISOString() });
      await notify(admin, request, { to: [request.assigned_user_id], title: request.status === "new" ? "Нова заявка з Instagram" : "Клієнт написав, поки вас не було", body: `${client}: ${request.last_message_preview ?? ""}` }, now);
    } else if (step === "remind") {
      const left = settings.handover_minutes - settings.reminder_minutes;
      await updateRequest(admin, request.id, { reminded_at: now.toISOString() });
      await writeEvent(admin, request, "reminded", { to: request.assigned_user_id });
      await notify(admin, request, { to: [request.assigned_user_id], title: `Заявка чекає відповіді, лишилось ${left} хв`, body: `${client}: ${request.last_message_preview ?? ""}` }, now);
      summary.reminded += 1;
    } else if (step === "handover" || step === "assign") {
      const outcome = await assignNext(admin, request, settings, members, now, step === "assign" ? "new" : "timeout");
      if (outcome.assignedTo && outcome.assignedTo !== request.assigned_user_id) {
        if (step === "assign") summary.assigned += 1;
        else summary.handedOver += 1;
      } else if (step === "handover" && outcome.assignedTo === request.assigned_user_id && outcome.newRound) {
        summary.handedOver += 1;
      }
    }
    context.set(request.team_id, { settings: await loadSettings(admin, request.team_id), members });
  }
  return summary;
}

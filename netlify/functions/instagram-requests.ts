// Заявки з Instagram: усі дії людей. Читання йде напряму через RLS, а запис лише
// тут, бо передача, таймер і надсилання клієнту мають сходитись в одному місці.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  canClaim,
  canClose,
  canManage,
  canPass,
  canReopen,
  closeReasonLabel,
  isRequestManagerRole,
  type RequestActor,
} from "../../src/features/instagramRequests/rules";
import {
  assignmentPatch,
  assignmentWithoutTimer,
  checkReply,
  clientLabel,
  notificationTargets,
} from "./_lib/instagramPlans";
import {
  assignNext,
  deliverMessage,
  ingestEvent,
  insertMessage,
  loadMemberMap,
  loadRequest,
  loadSettings,
  memberName,
  requestHref,
  runTimerTick,
  updateRequest,
  writeEvent,
  type AdminClient,
} from "./_lib/instagramRequests";
import { parseBody } from "./_lib/parseBody";
import { deliverNotifications } from "./_notificationDelivery";

const STALE_PENDING_MS = 2 * 60_000;

const id = z.string().uuid();
const shortText = (max: number) => z.string().trim().min(1).max(max);

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), requestId: id, clientMessageId: id, text: shortText(1000) }).strict(),
  z.object({ action: z.literal("retry"), requestId: id, messageId: id }).strict(),
  z.object({ action: z.literal("pass"), requestId: id, toUserId: id, note: z.string().trim().max(500).optional() }).strict(),
  z.object({ action: z.literal("claim"), requestId: id }).strict(),
  z.object({ action: z.literal("close"), requestId: id, reason: z.enum(["not_client", "cannot_do", "changed_mind"]) }).strict(),
  z.object({ action: z.literal("reopen"), requestId: id }).strict(),
  z
    .object({
      action: z.literal("set_contact"),
      requestId: id,
      companyName: z.string().trim().max(200),
      contact: z.string().trim().max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal("link_party"),
      requestId: id,
      partyKind: z.enum(["lead", "customer"]),
      partyId: id,
    })
    .strict(),
  z.object({ action: z.literal("convert_other"), requestId: id }).strict(),
  z.object({ action: z.literal("archive_other"), requestId: id }).strict(),
  z.object({ action: z.literal("delete"), requestId: id }).strict(),
  z
    .object({
      action: z.literal("save_settings"),
      reminderMinutes: z.number().int().min(1).max(480),
      handoverMinutes: z.number().int().min(2).max(480),
      workStartHour: z.number().int().min(0).max(23),
      workEndHour: z.number().int().min(1).max(24),
      autoReplyText: shortText(1000),
      otherReviewerUserId: id.nullable(),
      roundExcludedUserIds: z.array(id).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("create_test"),
      kind: z.enum(["ad", "other"]),
      handle: shortText(60),
      text: shortText(1000),
      adTitle: z.string().trim().max(120).optional(),
    })
    .strict(),
  z.object({ action: z.literal("test_client_message"), requestId: id, text: shortText(1000) }).strict(),
  z.object({ action: z.literal("test_app_reply"), requestId: id, text: shortText(1000) }).strict(),
  z.object({ action: z.literal("test_expire"), requestId: id, what: z.enum(["reminder", "handover", "window"]) }).strict(),
]);

type HttpEvent = { httpMethod?: string; body?: string | null; headers?: Record<string, string | undefined> };

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

const forbidden = () => jsonResponse(403, { error: "Недостатньо прав для цієї дії" });

type Actor = RequestActor & { isOwner: boolean; isManager: boolean; teamId: string };

async function loadActor(admin: AdminClient, userId: string): Promise<Actor | null> {
  const [{ data: membership }, { data: team }, { data: blocked }] = await Promise.all([
    admin.schema("tosho").from("memberships_view").select("access_role,job_role").eq("user_id", userId).limit(1).maybeSingle(),
    admin.from("team_members").select("team_id").eq("user_id", userId).limit(1).maybeSingle(),
    admin.schema("tosho").rpc("is_user_blocked", { _user_id: userId }),
  ]);
  const row = membership as { access_role?: string | null; job_role?: string | null } | null;
  const teamId = (team as { team_id?: string | null } | null)?.team_id;
  if (!row || !teamId || blocked === true) return null;
  const isOwner = row.access_role === "owner";
  const isOwnerOrCeo = isOwner || row.job_role === "seo";
  const isManager = isRequestManagerRole(row.job_role);
  if (!isOwnerOrCeo && !isManager) return null;
  return { userId, isOwner, isOwnerOrCeo, isManager, teamId };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return jsonResponse(500, { error: "Missing Supabase env vars" });

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });

  const parsed = parseBody(event.body, schema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const input = parsed.data;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const tosho = admin.schema("tosho");

  try {
    const actor = await loadActor(admin, userData.user.id);
    if (!actor) return forbidden();
    const now = new Date();

    if (input.action === "save_settings") {
      if (!actor.isOwnerOrCeo) return forbidden();
      if (input.reminderMinutes >= input.handoverMinutes) {
        return jsonResponse(400, { error: "Нагадування має бути раніше за передачу" });
      }
      if (input.workStartHour >= input.workEndHour) {
        return jsonResponse(400, { error: "Початок робочого дня має бути раніше за кінець" });
      }
      const { error } = await tosho.from("instagram_settings").upsert(
        {
          team_id: actor.teamId,
          reminder_minutes: input.reminderMinutes,
          handover_minutes: input.handoverMinutes,
          work_start_hour: input.workStartHour,
          work_end_hour: input.workEndHour,
          auto_reply_text: input.autoReplyText,
          other_reviewer_user_id: input.otherReviewerUserId,
          round_excluded_user_ids: input.roundExcludedUserIds,
          updated_at: now.toISOString(),
          updated_by: actor.userId,
        },
        { onConflict: "team_id" }
      );
      if (error) throw new Error(error.message);
      return jsonResponse(200, { ok: true });
    }

    if (input.action === "create_test") {
      if (!actor.isOwnerOrCeo) return forbidden();
      const marker = crypto.randomUUID();
      const result = await ingestEvent(admin, {
        teamId: actor.teamId,
        externalUserId: `test-${marker}`,
        handle: input.handle,
        kind: input.kind,
        externalMessageId: `test-in-${marker}`,
        text: input.text,
        direction: "in",
        ad: input.kind === "ad" ? { id: `test-ad-${marker}`, title: input.adTitle || "Тестове оголошення" } : null,
        at: now,
        isTest: true,
        createdBy: actor.userId,
      });
      return jsonResponse(200, { ok: true, requestId: result.requestId });
    }

    const request = await loadRequest(admin, input.requestId);
    // Чужа команда й «Інше» для менеджера виглядають однаково: заявки просто немає.
    if (!request || request.team_id !== actor.teamId || (request.kind === "other" && !actor.isOwnerOrCeo)) {
      return jsonResponse(404, { error: "Заявку не знайдено" });
    }
    const settings = await loadSettings(admin, actor.teamId);
    const members = await loadMemberMap(admin, actor.teamId);
    const nameOf = (userId: string | null) => (userId ? memberName(members.get(userId)) : null);
    const client = clientLabel(request);

    const notify = async (to: Array<string | null>, title: string, body: string) => {
      const targets = notificationTargets(request, to.filter((userId) => userId !== actor.userId));
      if (targets.length === 0) return;
      const shownTitle = request.is_test ? `Тест. ${title}` : title;
      try {
        await deliverNotifications(
          admin,
          targets.map((userId) => ({ user_id: userId, title: shownTitle, body, href: requestHref(request.id), type: "info" as const })),
          { category: "instagram_requests" }
        );
      } catch (error) {
        console.warn("instagram notify failed", error);
      }
    };

    switch (input.action) {
      case "reply": {
        const check = checkReply(actor, request, now, nameOf(request.assigned_user_id));
        if (!check.ok) return jsonResponse(check.status, { error: check.error });
        const messageId = await insertMessage(admin, {
          request,
          direction: "out",
          source: "crm",
          body: input.text,
          clientMessageId: input.clientMessageId,
          senderUserId: actor.userId,
          sendStatus: "pending",
          at: now,
        });
        if (!messageId) return jsonResponse(200, { ok: true, duplicate: true });
        const result = await deliverMessage(admin, request, settings, messageId, input.text, actor.userId, now);
        return result.ok ? jsonResponse(200, { ok: true, messageId }) : jsonResponse(result.status, { error: result.error, messageId });
      }

      case "retry": {
        const check = checkReply(actor, request, now, nameOf(request.assigned_user_id));
        if (!check.ok) return jsonResponse(check.status, { error: check.error });
        const { data: message } = await tosho
          .from("instagram_messages")
          .update({ send_status: "pending", send_error: null })
          .eq("id", input.messageId)
          .eq("request_id", request.id)
          // Автовідповідь не повторюємо: шаблон зупинив би таймер як перша відповідь.
          .neq("source", "auto_reply")
          // Функцію могли вбити посеред надсилання: такий запис інакше висить назавжди.
          .or(`send_status.eq.failed,and(send_status.eq.pending,created_at.lt.${new Date(now.getTime() - STALE_PENDING_MS).toISOString()})`)
          .select("id,body,sender_user_id,source")
          .maybeSingle();
        const row = message as { id: string; body: string; sender_user_id: string | null; source: string } | null;
        if (!row) return jsonResponse(200, { ok: true, duplicate: true });
        const result = await deliverMessage(admin, request, settings, row.id, row.body, actor.userId, now);
        return result.ok ? jsonResponse(200, { ok: true, messageId: row.id }) : jsonResponse(result.status, { error: result.error, messageId: row.id });
      }

      case "pass": {
        if (!canPass(actor, request)) return forbidden();
        const target = members.get(input.toUserId);
        if (!target || !isRequestManagerRole(target.jobRole)) {
          return jsonResponse(400, { error: "Передати можна лише менеджеру" });
        }
        if (input.toUserId === request.assigned_user_id) return jsonResponse(200, { ok: true, unchanged: true });
        const patch = request.first_response_at
          ? assignmentWithoutTimer(now, input.toUserId, request.round_user_ids)
          : assignmentPatch(now, input.toUserId, settings, { round: request.round, roundUserIds: request.round_user_ids, isOverdue: request.is_overdue });
        await updateRequest(admin, request.id, patch);
        await writeEvent(admin, request, "passed", { from: request.assigned_user_id, to: input.toUserId, actor: actor.userId, note: input.note ?? null });
        const hasTimer = !request.first_response_at;
        await notify(
          [input.toUserId],
          "Заявку передано вам",
          `${client}: ${input.note || (hasTimer ? `у вас є ${settings.handover_minutes} хв на відповідь` : "розмова вже йде, перегляньте її")}`
        );
        await notify([request.assigned_user_id], "Заявку передано", `${client}: тепер нею займається ${memberName(target) ?? "колега"}.`);
        return jsonResponse(200, { ok: true });
      }

      case "claim": {
        if (!canClaim(actor, request)) return forbidden();
        const patch = request.first_response_at
          ? assignmentWithoutTimer(now, actor.userId, request.round_user_ids)
          : assignmentPatch(now, actor.userId, settings, { round: request.round, roundUserIds: request.round_user_ids, isOverdue: request.is_overdue });
        await updateRequest(admin, request.id, {
          ...patch,
          ...(request.status === "closed" ? { status: "in_progress", closed_at: null, closed_by: null, close_reason: null } : {}),
        });
        await writeEvent(admin, request, "claimed", { from: request.assigned_user_id, to: actor.userId, actor: actor.userId });
        await notify([request.assigned_user_id], "Заявку забрали", `${client}: нею тепер займається ${nameOf(actor.userId) ?? "колега"}.`);
        return jsonResponse(200, { ok: true });
      }

      case "close": {
        if (!canClose(actor, request)) return forbidden();
        await updateRequest(admin, request.id, {
          status: "closed",
          close_reason: input.reason,
          closed_at: now.toISOString(),
          closed_by: actor.userId,
          reminder_due_at: null,
          handover_due_at: null,
          reminded_at: null,
          is_overdue: false,
        });
        await writeEvent(admin, request, "closed", { actor: actor.userId, note: closeReasonLabel(input.reason) });
        return jsonResponse(200, { ok: true });
      }

      case "reopen": {
        if (!canReopen(actor, request)) return forbidden();
        await updateRequest(admin, request.id, { status: "in_progress", closed_at: null, closed_by: null, close_reason: null });
        await writeEvent(admin, request, "reopened", { actor: actor.userId });
        return jsonResponse(200, { ok: true });
      }

      case "set_contact": {
        if (!canManage(actor, request)) return forbidden();
        await updateRequest(admin, request.id, { company_name: input.companyName || null, contact: input.contact || null });
        return jsonResponse(200, { ok: true });
      }

      case "link_party": {
        if (!canManage(actor, request)) return forbidden();
        const table = input.partyKind === "lead" ? "leads" : "customers";
        const { data: party, error: partyError } = await tosho.from(table).select("*").eq("id", input.partyId).eq("team_id", actor.teamId).maybeSingle();
        if (partyError) throw new Error(partyError.message);
        if (!party) return jsonResponse(404, { error: "Картку не знайдено" });
        const row = party as { company_name?: string | null; legal_name?: string | null; name?: string | null };
        const partyName = row.company_name || row.name || row.legal_name || null;
        await updateRequest(admin, request.id, {
          status: "lead",
          lead_id: input.partyKind === "lead" ? input.partyId : null,
          customer_id: input.partyKind === "customer" ? input.partyId : null,
          party_name: partyName,
          reminder_due_at: null,
          handover_due_at: null,
          reminded_at: null,
          is_overdue: false,
        });
        await writeEvent(admin, request, "lead_linked", { actor: actor.userId, note: partyName });
        return jsonResponse(200, { ok: true });
      }

      case "convert_other": {
        if (!actor.isOwnerOrCeo || request.kind !== "other") return forbidden();
        // Людина могла вже відповісти в «Іншому»: для менеджера це все одно нова заявка,
        // інакше коло не знайде її й вона лишиться без нього.
        const cleared = {
          kind: "ad" as const,
          status: "new" as const,
          closed_at: null,
          closed_by: null,
          close_reason: null,
          assigned_user_id: null,
          first_response_at: null,
          first_response_minutes: null,
          first_response_by: null,
        };
        await updateRequest(admin, request.id, cleared);
        await writeEvent(admin, request, "converted", { actor: actor.userId });
        await assignNext(admin, { ...request, ...cleared }, settings, Array.from(members.values()), now, "new");
        return jsonResponse(200, { ok: true });
      }

      case "archive_other": {
        if (!actor.isOwnerOrCeo || request.kind !== "other") return forbidden();
        await updateRequest(admin, request.id, { status: "closed", close_reason: "not_client", closed_at: now.toISOString(), closed_by: actor.userId });
        await writeEvent(admin, request, "closed", { actor: actor.userId, note: closeReasonLabel("not_client") });
        return jsonResponse(200, { ok: true });
      }

      case "delete": {
        // Розмову видаляє лише власник, на запит людини. Тестову прибирає й СЕО.
        if (!actor.isOwner && !(request.is_test && actor.isOwnerOrCeo)) return forbidden();
        const { error } = await tosho.from("instagram_requests").delete().eq("id", request.id);
        if (error) throw new Error(error.message);
        return jsonResponse(200, { ok: true });
      }

      case "test_client_message":
      case "test_app_reply":
      case "test_expire": {
        // Лише на тестових: справжню розмову цим не підробити.
        if (!actor.isOwnerOrCeo || !request.is_test) return forbidden();
        if (input.action === "test_expire") {
          const past = new Date(now.getTime() - 60_000).toISOString();
          if (input.what === "window") {
            await updateRequest(admin, request.id, { last_client_message_at: new Date(now.getTime() - 8 * 24 * 3600_000).toISOString() });
            return jsonResponse(200, { ok: true });
          }
          await updateRequest(admin, request.id, input.what === "reminder" ? { reminder_due_at: past } : { handover_due_at: past });
          const summary = await runTimerTick(admin, now);
          return jsonResponse(200, { ok: true, summary });
        }
        const marker = crypto.randomUUID();
        await ingestEvent(admin, {
          teamId: actor.teamId,
          externalUserId: request.external_user_id,
          kind: request.kind,
          externalMessageId: `test-${input.action}-${marker}`,
          text: input.text,
          direction: input.action === "test_app_reply" ? "out" : "in",
          at: now,
          isTest: true,
          createdBy: request.created_by,
        });
        return jsonResponse(200, { ok: true });
      }
    }
  } catch (error) {
    console.error("instagram-requests failed", error);
    // Текст помилки бази називає таблиці й колонки: він лише в журналі, не людині.
    return jsonResponse(500, { error: "Помилка сервера" });
  }
};

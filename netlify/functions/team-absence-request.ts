import { z } from "zod";

import { parseBody } from "./_lib/parseBody";

import { createClient } from "@supabase/supabase-js";
import { decideAbsenceRequest } from "./_lib/absenceDecision";
import {
  ABSENCE_DATE_KEY,
  SELF_SERVICE_ABSENCE_KINDS,
  humanizeAbsenceInsertError,
  isOwnerMembership,
  notifyAbsenceRecordedForMember,
  notifySubmittedAbsence,
  type SubmittedAbsenceRow,
} from "./_lib/absenceSubmit";

/**
 * Заявки на відсутність: подання (action: "submit") і рішення (approve/decline).
 *
 * Чому це серверна функція, а не RLS-політика: і подання, і рішення мусять
 * бути атомарним пакетом «запис + аудит + сповіщення», і жодну з частин не
 * можна лишити на совість клієнта — вкладку закривають одразу після кліку.
 * RLS дозволяє співробітнику лише створити свою заявку й скасувати її (див.
 * scripts/team-absences-selfservice.sql) — статусом approved/declined керує
 * тільки цей ендпоїнт.
 *
 * Авторизація (рішення CEO 2026-08-01): вирішує SEO; owner теж може;
 * заявку самого SEO вирішує лише owner — щоб ніхто не погоджував себе.
 */

/** Форма запиту — і перевірка, і тип (REQ-137). */
export const requestSchema = z
  .object({
    /**
     * `submit` — подати власну заявку;
     * `record` / `revise` / `revoke` — керівництво веде запис ЗА людину;
     * без action — рішення по заявці (як було).
     */
    action: z.enum(["submit", "decide", "record", "revise", "revoke"]).optional(),
    absenceId: z.string().min(1).optional(),
    decision: z.enum(["approved", "declined"]).optional(),
    /**
     * `nullish`: усі чотири виклики з `src/lib/teamAbsences.ts` типізовані
     * як `string | null` і шлють `null`, коли коментар не заповнили.
     * Далі по коду `null` і `undefined` однакові (`comment?.trim() || null`).
     */
    comment: z.string().nullish(),
    kind: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    /** Кого стосується запис — лише для record/revise (owner/SEO). */
    userId: z.string().min(1).optional(),
    status: z.string().optional(),
  })
  .strict();

type RequestBody = z.infer<typeof requestSchema>;

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const payload: RequestBody = parsed.data;

  const action = payload.action ?? "decide";
  const comment = payload.comment?.trim().slice(0, 500) || null;

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });
  const actorId = userData.user.id;

  if (action === "submit") {
    return await handleSubmit({ payload, comment, actorId, userClient, adminClient });
  }
  if (action === "record" || action === "revise" || action === "revoke") {
    return await handleAdminRecord({ payload, comment, actorId, action, userClient, adminClient });
  }

  const absenceId = payload.absenceId?.trim();
  const decision = payload.decision;
  if (!absenceId || (decision !== "approved" && decision !== "declined")) {
    return jsonResponse(400, { error: "Missing absenceId or decision" });
  }

  // Правила «хто кого може погодити», сам запис, аудит і сповіщення заявнику
  // живуть у _lib/absenceDecision: те саме натискає кнопка в Telegram.
  // actorClient — user-scoped: заблокований співробітник не бачить свій рядок
  // у memberships_view і далі не пройде.
  const result = await decideAbsenceRequest({
    adminClient,
    actorClient: userClient,
    actorId,
    absenceId,
    decision,
    comment,
  });

  if (!result.ok) return jsonResponse(result.status, { error: result.error });
  return jsonResponse(200, { success: true, status: result.status, decidedAt: result.decidedAt });
};

/* ====================== Подання власної заявки ======================= */

type SupabaseLike = ReturnType<typeof createClient>;

/**
 * Подати власну заявку на відсутність.
 *
 * Чому це теж сервер, а не пряма вставка з браузера: раніше запис робив
 * клієнт, і сповіщення слав він же — якщо вкладку закрити відразу після
 * «Надіслати», заявка лишалась у базі, а SEO про неї не дізнавався ніколи.
 * Тепер запис і сповіщення — один виклик, який не залежить від вкладки.
 *
 * Вставляємо ЮЗЕРСЬКИМ клієнтом навмисно: усі RLS-політики й тригери
 * (річна квота лікарняних, межі дат, «лише за себе») мають лишитись у грі.
 * Сервісна роль обійшла б їх усі — і це був би не перенос, а дірка.
 */
async function handleSubmit(params: {
  payload: RequestBody;
  comment: string | null;
  actorId: string;
  userClient: SupabaseLike;
  adminClient: SupabaseLike;
}) {
  const { payload, comment, actorId, userClient, adminClient } = params;

  const kind = (payload.kind ?? "").trim();
  const startDate = (payload.startDate ?? "").trim();
  const endDate = (payload.endDate ?? "").trim();

  if (!SELF_SERVICE_ABSENCE_KINDS.has(kind)) {
    return jsonResponse(400, { error: "Невідомий тип відсутності" });
  }
  if (!ABSENCE_DATE_KEY.test(startDate) || !ABSENCE_DATE_KEY.test(endDate) || endDate < startDate) {
    return jsonResponse(400, { error: "Невірний діапазон дат" });
  }

  const { data: membership, error: membershipError } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id,access_role")
    .eq("user_id", actorId)
    .maybeSingle<{ workspace_id?: string | null; access_role?: string | null }>();

  if (membershipError) return jsonResponse(500, { error: membershipError.message });
  const workspaceId = membership?.workspace_id ?? null;
  if (!workspaceId) return jsonResponse(403, { error: "Немає доступу до воркспейсу" });

  // Лікарняний — факт, а не прохання: він одразу approved (і саме тому в БД
  // на нього стоїть квота й межі дат). Решта чекає на рішення.
  //
  // ВЛАСНИК — виняток для всіх типів: над ним керівника немає, і його
  // pending не міг би вирішити ніхто (сам собі — заборонено, SEO заявку
  // власника — теж). Тестове подання CEO 2026-08-07 застрягло саме так.
  // Заявка SEO лишається pending — її вирішує власник.
  const actorIsOwner = isOwnerMembership(membership);
  const status = kind === "sick_leave" || actorIsOwner ? "approved" : "pending";

  const { data: inserted, error: insertError } = await userClient
    .schema("tosho")
    .from("team_absences")
    .insert({
      workspace_id: workspaceId,
      // user_id з токена, а не з тіла запиту: заявку подають лише за себе.
      user_id: actorId,
      start_date: startDate,
      end_date: endDate,
      kind,
      status,
      comment,
      created_by: actorId,
      requested_by: actorId,
    })
    .select("id,workspace_id,user_id,start_date,end_date,kind,status")
    .maybeSingle<SubmittedAbsenceRow>();

  if (insertError || !inserted) {
    return jsonResponse(400, { error: humanizeAbsenceInsertError(insertError) });
  }

  await notifySubmittedAbsence(adminClient, { absence: inserted, comment, actorId });

  return jsonResponse(200, {
    success: true,
    absence: {
      id: inserted.id,
      userId: inserted.user_id,
      startDate: inserted.start_date,
      endDate: inserted.end_date,
      kind: inserted.kind,
      status: inserted.status,
      comment,
    },
  });
}

/* ============ Керівництво веде запис ЗА людину (owner/SEO) ============ */

/**
 * Внести / змінити / прибрати чужу відсутність.
 *
 * Чому через сервер, хоча RLS і так пускає лише owner/SEO: раніше ці три дії
 * йшли прямо з браузера і МОВЧАЛИ — SEO ставив людині відпустку, а людина
 * дізнавалась про це, лише якщо сама відкривала CRM. Запис при цьому міняє її
 * баланс і ріже норму (а отже бонус). Тепер запис і сповіщення — один виклик.
 *
 * Пишемо ЮЗЕРСЬКИМ клієнтом: політики team_absences_insert/update/delete
 * (owner/SEO) лишаються єдиним джерелом права на дію — окремої перевірки ролі
 * в коді свідомо немає, щоб правило не роздвоїлось.
 */
async function handleAdminRecord(params: {
  payload: RequestBody;
  comment: string | null;
  actorId: string;
  action: "record" | "revise" | "revoke";
  userClient: SupabaseLike;
  adminClient: SupabaseLike;
}) {
  const { payload, comment, actorId, action, userClient, adminClient } = params;

  const { data: membership, error: membershipError } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", actorId)
    .maybeSingle<{ workspace_id?: string | null }>();

  if (membershipError) return jsonResponse(500, { error: membershipError.message });
  const workspaceId = membership?.workspace_id ?? null;
  if (!workspaceId) return jsonResponse(403, { error: "Немає доступу до воркспейсу" });

  const columns = "id,workspace_id,user_id,start_date,end_date,kind,status";

  if (action === "revoke") {
    const absenceId = payload.absenceId?.trim();
    if (!absenceId) return jsonResponse(400, { error: "Missing absenceId" });

    // Читаємо ДО видалення: після нього нікому й нічого не скажеш.
    const { data: existing } = await adminClient
      .schema("tosho")
      .from("team_absences")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .eq("id", absenceId)
      .maybeSingle<SubmittedAbsenceRow>();

    const { data: deleted, error: deleteError } = await userClient
      .schema("tosho")
      .from("team_absences")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", absenceId)
      .select("id");

    if (deleteError) return jsonResponse(400, { error: humanizeAbsenceInsertError(deleteError) });
    // .select() навмисно: delete, що не зачепив рядків, повертає error === null,
    // і ми б сповістили людину про скасування, якого не сталось.
    if (!deleted || deleted.length === 0) {
      return jsonResponse(404, { error: "Запис не знайдено або немає прав" });
    }

    if (existing) {
      await notifyAbsenceRecordedForMember(adminClient, { absence: existing, actorId, action: "revoke" });
    }
    return jsonResponse(200, { success: true, deleted: absenceId });
  }

  const kind = (payload.kind ?? "").trim();
  const startDate = (payload.startDate ?? "").trim();
  const endDate = (payload.endDate ?? "").trim();
  if (!kind) return jsonResponse(400, { error: "Невідомий тип відсутності" });
  if (!ABSENCE_DATE_KEY.test(startDate) || !ABSENCE_DATE_KEY.test(endDate) || endDate < startDate) {
    return jsonResponse(400, { error: "Невірний діапазон дат" });
  }

  if (action === "revise") {
    const absenceId = payload.absenceId?.trim();
    const userId = payload.userId?.trim();
    if (!absenceId || !userId) return jsonResponse(400, { error: "Missing absenceId or userId" });

    const { data: before } = await adminClient
      .schema("tosho")
      .from("team_absences")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .eq("id", absenceId)
      .maybeSingle<SubmittedAbsenceRow>();

    const { data: updated, error: updateError } = await userClient
      .schema("tosho")
      .from("team_absences")
      .update({
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
        kind,
        comment,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", absenceId)
      .select(columns)
      .maybeSingle<SubmittedAbsenceRow>();

    if (updateError || !updated) {
      return jsonResponse(400, { error: humanizeAbsenceInsertError(updateError) });
    }

    // Мовчимо, коли нічого змістовного не змінилось: правка коментаря — не
    // привід смикати людину.
    const meaningful =
      !before ||
      before.start_date !== updated.start_date ||
      before.end_date !== updated.end_date ||
      before.kind !== updated.kind ||
      before.user_id !== updated.user_id;
    if (meaningful) {
      await notifyAbsenceRecordedForMember(adminClient, {
        absence: updated,
        actorId,
        action: "revise",
        previous: before ?? null,
      });
    }
    return jsonResponse(200, { success: true, absence: updated });
  }

  const userId = payload.userId?.trim();
  if (!userId) return jsonResponse(400, { error: "Missing userId" });

  const { data: inserted, error: insertError } = await userClient
    .schema("tosho")
    .from("team_absences")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
      kind,
      status: payload.status?.trim() || "approved",
      comment,
      created_by: actorId,
      requested_by: actorId,
    })
    .select(columns)
    .maybeSingle<SubmittedAbsenceRow>();

  if (insertError || !inserted) {
    return jsonResponse(400, { error: humanizeAbsenceInsertError(insertError) });
  }

  // Запис САМ СОБІ (owner теж людина, і RLS не забороняє це нікому) — не
  // «внесено керівництвом», а звичайне подання: інакше команді прилетить
  // текст, який приписує чужу дію тому, хто її не робив.
  if (inserted.user_id === actorId) {
    await notifySubmittedAbsence(adminClient, { absence: inserted, comment, actorId });
  } else {
    await notifyAbsenceRecordedForMember(adminClient, { absence: inserted, actorId, action: "record" });
  }

  return jsonResponse(200, { success: true, absence: inserted });
}

import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";
import {
  ABSENCE_DATE_KEY,
  ABSENCE_KIND_LABELS,
  SELF_SERVICE_ABSENCE_KINDS,
  formatAbsenceRange,
  humanizeAbsenceInsertError,
  isOwnerMembership,
  isSeoMembership,
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

type Decision = "approved" | "declined";

type RequestBody = {
  /** `submit` — подати власну заявку; без action — рішення (як було). */
  action?: "submit" | "decide";
  absenceId?: string;
  decision?: Decision;
  comment?: string;
  kind?: string;
  startDate?: string;
  endDate?: string;
};

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type MembershipRow = { user_id?: string | null; access_role?: string | null; job_role?: string | null };

type AbsenceRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  kind: string;
  status: string;
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

  let payload: RequestBody;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

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

  const absenceId = payload.absenceId?.trim();
  const decision = payload.decision;
  if (!absenceId || (decision !== "approved" && decision !== "declined")) {
    return jsonResponse(400, { error: "Missing absenceId or decision" });
  }

  // Воркспейс беремо з user-scoped клієнта: так заблокований співробітник
  // (memberships_view ховає його рядок) не пройде далі.
  const { data: actorMembership, error: actorError } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("user_id,access_role,job_role,workspace_id")
    .eq("user_id", actorId)
    .maybeSingle<MembershipRow & { workspace_id?: string | null }>();

  if (actorError) return jsonResponse(500, { error: actorError.message });
  const workspaceId = actorMembership?.workspace_id ?? null;
  if (!workspaceId) return jsonResponse(403, { error: "Немає доступу до воркспейсу" });
  if (!isOwnerMembership(actorMembership) && !isSeoMembership(actorMembership)) {
    return jsonResponse(403, { error: "Рішення по заявках приймає SEO або власник" });
  }

  const { data: absence, error: absenceError } = await adminClient
    .schema("tosho")
    .from("team_absences")
    .select("id,workspace_id,user_id,start_date,end_date,kind,status")
    .eq("workspace_id", workspaceId)
    .eq("id", absenceId)
    .maybeSingle<AbsenceRow>();

  if (absenceError) return jsonResponse(500, { error: absenceError.message });
  if (!absence) return jsonResponse(404, { error: "Заявку не знайдено" });
  if (absence.status !== "pending") {
    return jsonResponse(409, { error: "Заявка вже опрацьована" });
  }

  // Ніхто не вирішує сам за себе, і заявку SEO закриває лише власник —
  // інакше двоє SEO погоджували б відпустки одне одному в обхід власника.
  if (absence.user_id === actorId) {
    return jsonResponse(403, { error: "Свою заявку вирішує інша людина" });
  }
  if (!isOwnerMembership(actorMembership)) {
    const { data: targetMembership } = await adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("user_id,access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", absence.user_id)
      .maybeSingle<MembershipRow>();
    if (isSeoMembership(targetMembership) || isOwnerMembership(targetMembership)) {
      return jsonResponse(403, { error: "Заявку SEO або власника вирішує власник" });
    }
  }

  const nowIso = new Date().toISOString();

  // .select() навмисно: update без нього повертає error === null навіть коли
  // не зачепив жодного рядка — і ми б записали аудит та сповістили людину про
  // рішення, якого в базі немає. Той самий урок, що в team-member-probation.
  const { data: updatedRows, error: updateError } = await adminClient
    .schema("tosho")
    .from("team_absences")
    .update({
      status: decision,
      decided_by: actorId,
      decided_at: nowIso,
      decision_comment: comment,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", absenceId)
    .eq("status", "pending")
    .select("id");

  if (updateError) return jsonResponse(500, { error: updateError.message });
  if (!updatedRows || updatedRows.length === 0) {
    return jsonResponse(409, { error: "Заявка змінилась — оновіть сторінку" });
  }

  await adminClient.schema("tosho").from("team_absence_events").insert({
    workspace_id: workspaceId,
    absence_id: absenceId,
    action: decision,
    actor_user_id: actorId,
    payload: {
      kind: absence.kind,
      start_date: absence.start_date,
      end_date: absence.end_date,
      comment,
    },
  });

  const kindLabel = ABSENCE_KIND_LABELS[absence.kind] ?? "Відсутність";
  const range = formatAbsenceRange(absence);
  const approved = decision === "approved";

  await deliverNotifications(
    adminClient,
    [
      {
        user_id: absence.user_id,
        title: approved ? `${kindLabel} погоджена` : `${kindLabel} відхилена`,
        body: approved
          ? `Ваша заявка на ${range} погоджена.`
          : comment
            ? `Заявку на ${range} відхилено: ${comment}`
            : `Заявку на ${range} відхилено.`,
        href: "/team",
        type: approved ? "success" : "warning",
      },
    ],
    { category: "team_absences" }
  );

  return jsonResponse(200, { success: true, status: decision, decidedAt: nowIso });
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
    .select("workspace_id")
    .eq("user_id", actorId)
    .maybeSingle<{ workspace_id?: string | null }>();

  if (membershipError) return jsonResponse(500, { error: membershipError.message });
  const workspaceId = membership?.workspace_id ?? null;
  if (!workspaceId) return jsonResponse(403, { error: "Немає доступу до воркспейсу" });

  // Лікарняний — факт, а не прохання: він одразу approved (і саме тому в БД
  // на нього стоїть квота й межі дат). Решта чекає на рішення.
  const status = kind === "sick_leave" ? "approved" : "pending";

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

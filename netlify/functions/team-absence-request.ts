import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

/**
 * Рішення по заявці на відсутність: погодити / відхилити.
 *
 * Чому це серверна функція, а не RLS-політика: рішення мусить бути
 * атомарним пакетом «змінити статус + записати аудит + сповістити заявника»,
 * і жодну з частин не можна лишити на совість клієнта. RLS дозволяє
 * співробітнику лише створити свою заявку й скасувати її (див.
 * scripts/team-absences-selfservice.sql) — статусом approved/declined керує
 * тільки цей ендпоїнт.
 *
 * Авторизація (рішення CEO 2026-08-01): вирішує SEO; owner теж може;
 * заявку самого SEO вирішує лише owner — щоб ніхто не погоджував себе.
 */

type Decision = "approved" | "declined";

type RequestBody = {
  absenceId?: string;
  decision?: Decision;
  comment?: string;
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

const KIND_LABELS: Record<string, string> = {
  vacation: "Відпустка",
  day_off: "Day-off",
  sick_leave: "Лікарняний",
  other: "Відсутність",
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

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

const isOwner = (membership?: MembershipRow | null) => normalize(membership?.access_role) === "owner";
const isSeo = (membership?: MembershipRow | null) => normalize(membership?.job_role) === "seo";

function formatShort(dateKey: string) {
  return `${dateKey.slice(8, 10)}.${dateKey.slice(5, 7)}`;
}

function formatRange(row: AbsenceRow) {
  return row.start_date === row.end_date
    ? formatShort(row.start_date)
    : `${formatShort(row.start_date)} – ${formatShort(row.end_date)}`;
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

  const absenceId = payload.absenceId?.trim();
  const decision = payload.decision;
  const comment = payload.comment?.trim().slice(0, 500) || null;
  if (!absenceId || (decision !== "approved" && decision !== "declined")) {
    return jsonResponse(400, { error: "Missing absenceId or decision" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });
  const actorId = userData.user.id;

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
  if (!isOwner(actorMembership) && !isSeo(actorMembership)) {
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
  if (!isOwner(actorMembership)) {
    const { data: targetMembership } = await adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("user_id,access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", absence.user_id)
      .maybeSingle<MembershipRow>();
    if (isSeo(targetMembership) || isOwner(targetMembership)) {
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

  const kindLabel = KIND_LABELS[absence.kind] ?? "Відсутність";
  const range = formatRange(absence);
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

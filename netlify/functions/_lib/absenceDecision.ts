import { type SupabaseClient } from "@supabase/supabase-js";

import { deliverNotifications } from "../_notificationDelivery";
import {
  ABSENCE_KIND_LABELS,
  formatAbsenceRange,
  isOwnerMembership,
  isSeoMembership,
} from "./absenceSubmit";

/**
 * Рішення по заявці на відсутність — ОДНА правда для всіх входів.
 *
 * Входів тепер два: кнопка в CRM (team-absence-request.ts, авторизація по JWT)
 * і кнопка «Підтвердити» просто в повідомленні Telegram (telegram-webhook.ts,
 * особу дає звʼязка chat_id → user_id). Правила, хто кого може погодити, надто
 * дорого коштують, щоб жити у двох копіях: розійдуться — і бот почне
 * погоджувати те, що CRM забороняє.
 *
 * Правила (рішення CEO 2026-08-01):
 *  · вирішує SEO або власник;
 *  · свою заявку не вирішує ніхто — навіть власник (його власні заявки
 *    лягають approved одразу при поданні, тож на погодженні їх не буває);
 *  · заявку SEO або власника закриває лише власник.
 *
 * `actorClient` навмисно окремий від `adminClient`: HTTP-шлях передає сюди
 * user-scoped клієнт, і членство читається під RLS — заблокований співробітник
 * не бачить свій рядок у memberships_view і далі не пройде. Бот передає
 * адмінський клієнт, але лише після власної перевірки активності.
 */

type MembershipRow = {
  user_id?: string | null;
  access_role?: string | null;
  job_role?: string | null;
  workspace_id?: string | null;
};

type AbsenceRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  kind: string;
  status: string;
};

export type AbsenceDecisionValue = "approved" | "declined";

export type AbsenceDecisionResult =
  | {
      ok: true;
      status: AbsenceDecisionValue;
      decidedAt: string;
      absence: AbsenceRow;
      /** Готовий підпис «Відпустка · 12.08 — 20.08» для тексту відповіді. */
      summary: string;
    }
  | { ok: false; status: number; error: string };

export async function decideAbsenceRequest(params: {
  adminClient: SupabaseClient;
  /** Клієнт, яким читаємо членство ТОГО, ХТО ВИРІШУЄ (див. коментар вгорі). */
  actorClient: SupabaseClient;
  actorId: string;
  absenceId: string;
  decision: AbsenceDecisionValue;
  comment?: string | null;
}): Promise<AbsenceDecisionResult> {
  const { adminClient, actorClient, actorId, absenceId, decision } = params;
  const comment = params.comment?.trim().slice(0, 500) || null;

  const { data: actorMembership, error: actorError } = await actorClient
    .schema("tosho")
    .from("memberships_view")
    .select("user_id,access_role,job_role,workspace_id")
    .eq("user_id", actorId)
    .maybeSingle<MembershipRow>();

  if (actorError) return { ok: false, status: 500, error: actorError.message };
  const workspaceId = actorMembership?.workspace_id ?? null;
  if (!workspaceId) return { ok: false, status: 403, error: "Немає доступу до воркспейсу" };
  if (!isOwnerMembership(actorMembership) && !isSeoMembership(actorMembership)) {
    return { ok: false, status: 403, error: "Рішення по заявках приймає SEO або власник" };
  }

  const { data: absence, error: absenceError } = await adminClient
    .schema("tosho")
    .from("team_absences")
    .select("id,workspace_id,user_id,start_date,end_date,kind,status")
    .eq("workspace_id", workspaceId)
    .eq("id", absenceId)
    .maybeSingle<AbsenceRow>();

  if (absenceError) return { ok: false, status: 500, error: absenceError.message };
  if (!absence) return { ok: false, status: 404, error: "Заявку не знайдено" };
  if (absence.status !== "pending") return { ok: false, status: 409, error: "Заявка вже опрацьована" };

  if (absence.user_id === actorId) {
    return { ok: false, status: 403, error: "Свою заявку вирішує інша людина" };
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
      return { ok: false, status: 403, error: "Заявку SEO або власника вирішує власник" };
    }
  }

  const nowIso = new Date().toISOString();

  // .select() навмисно: update без нього повертає error === null навіть коли
  // не зачепив жодного рядка — і ми б записали аудит та сповістили людину про
  // рішення, якого в базі немає. Той самий урок, що в team-member-probation.
  // Умова status='pending' тут ще й гасить гонку двох погоджень (кнопка в CRM
  // і кнопка в Telegram цілком можуть натиснутись одночасно).
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

  if (updateError) return { ok: false, status: 500, error: updateError.message };
  if (!updatedRows || updatedRows.length === 0) {
    return { ok: false, status: 409, error: "Заявку вже опрацювали" };
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
        // Одразу на вкладку, де людина бачить свої заявки, а не на «Люди».
        href: "/team?tab=requests",
        type: approved ? "success" : "warning",
      },
    ],
    { category: "team_absences" }
  );

  return { ok: true, status: decision, decidedAt: nowIso, absence, summary: `${kindLabel} · ${range}` };
}

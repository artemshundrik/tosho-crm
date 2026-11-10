import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPermissions } from "../../../src/lib/permissions";
import { deliverNotifications } from "../_notificationDelivery";
import type { InlineKeyboard } from "../_telegram";

import {
  attachDesignPhoto,
  DESIGN_ALERTS,
  DESIGN_STATUS_TEXT,
  designApprovalBlockers,
  designCaption,
  designKeyboard,
  loadDesignTask,
  parseDesignCallback,
  taskLabel,
  type DesignTaskRow,
} from "./designTaskTelegram";

/**
 * Кнопки під фото макета (REQ-356#p1): «✅ Передати замовнику» і
 * «✅ Замовник затвердив». Робимо те саме, що updateTaskStatus у
 * DesignTaskPage: перевірка прав, блокери затвердження, запис зі звіркою
 * статусу, подія в журналі задачі й сповіщення тим самим людям.
 *
 * Запис іде service-роллю, тому права перевіряємо тут явно: людина мусить
 * бути в команді задачі й мати canManageDesignStatuses. Кнопку могли
 * переслати, тож саме повідомлення нічого не доводить.
 */

export type DesignDecisionResult = {
  toast: string;
  alert?: boolean;
  /** Новий підпис і кнопки для натиснутого повідомлення; null — не чіпати. */
  edit: { caption: string; keyboard: InlineKeyboard } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

async function memberName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin
    .schema("tosho")
    .from("team_member_profiles")
    .select("full_name,first_name,last_name")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const row = data as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
  return (row?.full_name ?? "").trim() || `${row?.first_name ?? ""} ${row?.last_name ?? ""}`.trim();
}

async function canManageInTeam(admin: SupabaseClient, userId: string, teamId: string): Promise<boolean> {
  const [{ data: member }, { data: membership }] = await Promise.all([
    admin.from("team_members").select("user_id").eq("user_id", userId).eq("team_id", teamId).maybeSingle(),
    admin.schema("tosho").from("memberships").select("role,job_role").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  if (!member || !membership) return false;
  const row = membership as { role?: string | null; job_role?: string | null };
  return buildPermissions({ accessRole: row.role ?? null, jobRole: row.job_role ?? null }).canManageDesignStatuses;
}

/** Дзеркало notifyQuoteInitiatorOnDesignStatusChange (src/lib/workflowNotifications.ts). */
async function initiatorRecipients(
  admin: SupabaseClient,
  task: DesignTaskRow,
  toStatus: string
): Promise<{ userIds: Set<string>; quoteNumber: string | null }> {
  const meta = task.metadata ?? {};
  const quoteId = str(meta.quote_id);
  const recipients = new Set<string>();
  let quoteNumber: string | null = null;
  let quoteTeamId: string | null = null;
  if (UUID_RE.test(quoteId)) {
    const { data } = await admin
      .schema("tosho")
      .from("quotes")
      .select("team_id,created_by,assigned_to,number")
      .eq("id", quoteId)
      .maybeSingle();
    const quote = data as { team_id?: string | null; created_by?: string | null; assigned_to?: string | null; number?: string | null } | null;
    const initiator = quote?.created_by ?? quote?.assigned_to ?? null;
    if (initiator) recipients.add(initiator);
    quoteNumber = quote?.number ?? null;
    quoteTeamId = quote?.team_id ?? null;
  }
  const manager = str(meta.manager_user_id);
  if ((toStatus === "pm_review" || toStatus === "client_review") && manager) recipients.add(manager);
  if ((toStatus === "client_review" || toStatus === "approved") && quoteTeamId) {
    const { data: members } = await admin.from("team_members").select("user_id").eq("team_id", quoteTeamId);
    const ids = ((members ?? []) as Array<{ user_id: string | null }>).map((row) => row.user_id).filter((id): id is string => !!id);
    if (ids.length > 0) {
      const { data: owners } = await admin.schema("tosho").from("memberships").select("user_id").in("user_id", ids).eq("role", "owner");
      for (const row of (owners ?? []) as Array<{ user_id: string }>) recipients.add(row.user_id);
    }
  }
  return { userIds: recipients, quoteNumber };
}

function collaboratorIds(task: DesignTaskRow): string[] {
  const raw = task.metadata?.collaborator_user_ids;
  const assignee = str(task.metadata?.assignee_user_id);
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map(str).filter(Boolean))).filter((id) => id !== assignee);
}

async function notifyStatusChange(admin: SupabaseClient, task: DesignTaskRow, toStatus: string, actorId: string, actorName: string) {
  const alert = DESIGN_ALERTS[toStatus];
  if (!alert) return;
  const href = `/design/${task.id}`;
  const label = taskLabel(task);
  const { userIds, quoteNumber } = await initiatorRecipients(admin, task, toStatus);
  userIds.delete(actorId);
  const quoteRef = quoteNumber ? `прорахунку #${quoteNumber}` : "прорахунку";
  const rows = Array.from(userIds).map((user_id) => ({
    user_id,
    title: alert.title,
    body: `${label} · ${alert.body(quoteRef)}`,
    href,
    type: alert.type,
  }));
  const number = str(task.metadata?.design_task_number);
  for (const user_id of collaboratorIds(task)) {
    if (user_id === actorId || userIds.has(user_id)) continue;
    rows.push({
      user_id,
      title: alert.title,
      body: `${actorName || "System"} змінив(ла) статус спільної задачі ${number ? `#${number}` : label}.`,
      href,
      type: alert.type,
    });
  }
  if (rows.length === 0) return;
  const enriched = await attachDesignPhoto(admin, rows, task, { actorName }).catch(() => rows);
  await deliverNotifications(admin, enriched, { category: "design" });
}

export async function decideDesignStatusFromBot(params: {
  admin: SupabaseClient;
  userId: string;
  data: string;
  buildUrl: (path: string) => string;
}): Promise<DesignDecisionResult> {
  const { admin, userId } = params;
  const parsed = parseDesignCallback(params.data);
  if (!parsed) return { toast: "Невідома дія", edit: null };

  const task = await loadDesignTask(admin, parsed.taskId);
  if (!task) return { toast: "Задачу не знайдено", edit: null };
  if (!(await canManageInTeam(admin, userId, task.team_id))) {
    return { toast: "Міняти статус дизайну можуть лише менеджери", alert: true, edit: null };
  }

  const crmUrl = params.buildUrl(`/design/${task.id}`);
  const current = str(task.metadata?.status);
  const editFor = (row: DesignTaskRow, actorName?: string) => ({
    caption: designCaption(row, { actorName }),
    keyboard: designKeyboard(str(row.metadata?.status), row.id, true, crmUrl),
  });

  if (current !== parsed.from) {
    // Хтось уже посунув задачу з CRM або іншого повідомлення.
    const label = DESIGN_STATUS_TEXT[current] ?? current;
    return { toast: `Статус уже змінили: ${label}`, edit: editFor(task) };
  }

  if (parsed.to === "approved") {
    const blockers = designApprovalBlockers(task.metadata);
    if (blockers.length > 0) {
      return {
        toast: `${blockers.join(". ")}. Позначте в CRM, який варіант затвердив замовник, і натисніть ще раз.`,
        alert: true,
        edit: null,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const nextMetadata = { ...(task.metadata ?? {}), status: parsed.to, status_changed_at: nowIso };
  // Запис зі звіркою, як applyDesignStatusWrite: хто перший, той і змінив.
  const { data: written, error } = await admin
    .from("activity_log")
    .update({ metadata: nextMetadata })
    .eq("id", task.id)
    .eq("team_id", task.team_id)
    .eq("metadata->>status", parsed.from)
    .select("id");
  if (error) {
    console.warn("[design-bot] status write failed", error.message);
    return { toast: "Не вдалось змінити статус. Відкрийте задачу в CRM", edit: null };
  }
  if (!written || written.length === 0) {
    const fresh = await loadDesignTask(admin, task.id);
    const label = DESIGN_STATUS_TEXT[str(fresh?.metadata?.status)] ?? "";
    return { toast: label ? `Статус уже змінили: ${label}` : "Статус уже змінили", edit: fresh ? editFor(fresh) : null };
  }

  const updated: DesignTaskRow = { ...task, metadata: nextMetadata };
  const actorName = await memberName(admin, userId);
  const followUps = await Promise.allSettled([
    admin.from("activity_log").insert({
      team_id: task.team_id,
      user_id: userId,
      actor_name: actorName || "Telegram",
      action: "design_task_status",
      entity_type: "design_task",
      entity_id: task.id,
      title: `Статус: ${DESIGN_STATUS_TEXT[parsed.from]} → ${DESIGN_STATUS_TEXT[parsed.to]}`,
      href: `/design/${task.id}`,
      metadata: {
        source: "design_task_status",
        design_task_id: task.id,
        quote_id: str(task.metadata?.quote_id) || null,
        from_status: parsed.from,
        to_status: parsed.to,
        assignee_user_id: str(task.metadata?.assignee_user_id) || null,
        design_task_type: str(task.metadata?.design_task_type) || null,
        via: "telegram",
      },
    }),
    notifyStatusChange(admin, updated, parsed.to, userId, actorName),
  ]);
  for (const result of followUps) {
    if (result.status === "rejected") console.warn("[design-bot] follow-up failed", result.reason);
    else if (result.value && "error" in result.value && result.value.error) {
      console.warn("[design-bot] activity log failed", result.value.error.message);
    }
  }

  return {
    toast: parsed.to === "client_review" ? "Передано замовнику" : "Затверджено",
    edit: editFor(updated, actorName),
  };
}

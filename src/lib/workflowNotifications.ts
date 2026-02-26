import { supabase } from "@/lib/supabaseClient";
import { notifyUsers } from "@/lib/designTaskActivity";

const isUuid = (value?: string | null) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type QuoteRecipient = {
  teamId: string | null;
  userId: string | null;
  quoteNumber: string | null;
};

type TeamMemberRoleRow = {
  user_id?: string | null;
  access_role?: string | null;
  job_role?: string | null;
};

const normalizeRole = (value?: string | null) => (value ?? "").trim().toLowerCase();

const MANAGER_JOB_ROLES = new Set(["manager", "менеджер"]);

async function resolveTeamMembers(teamId?: string | null): Promise<TeamMemberRoleRow[]> {
  if (!isUuid(teamId ?? null)) return [];
  const { data, error } = await supabase
    .from("team_members_view")
    .select("user_id,access_role,job_role")
    .eq("team_id", teamId as string);
  if (error) {
    console.warn("Failed to resolve team members for workflow notifications", error);
    return [];
  }
  return (data as TeamMemberRoleRow[] | null) ?? [];
}

function pickCeoUserIds(rows: TeamMemberRoleRow[]) {
  return rows
    .filter((row) => normalizeRole(row.access_role) === "owner")
    .map((row) => row.user_id)
    .filter((value): value is string => !!value);
}

function pickManagerUserIds(rows: TeamMemberRoleRow[]) {
  return rows
    .filter((row) => {
      const access = normalizeRole(row.access_role);
      const job = normalizeRole(row.job_role);
      return access === "manager" || access === "admin" || access === "owner" || MANAGER_JOB_ROLES.has(job);
    })
    .map((row) => row.user_id)
    .filter((value): value is string => !!value);
}

async function resolveDesignTaskManagerUserId(designTaskId?: string | null): Promise<string | null> {
  if (!isUuid(designTaskId)) return null;
  const { data, error } = await supabase
    .from("activity_log")
    .select("metadata")
    .eq("id", designTaskId)
    .maybeSingle();
  if (error) {
    console.warn("Failed to resolve design task manager for workflow notifications", error);
    return null;
  }
  const metadata = ((data as { metadata?: unknown } | null)?.metadata ?? null) as Record<string, unknown> | null;
  const managerUserId = typeof metadata?.manager_user_id === "string" ? metadata.manager_user_id.trim() : "";
  return managerUserId || null;
}

async function resolveQuoteInitiator(quoteId: string): Promise<QuoteRecipient> {
  if (!isUuid(quoteId)) return { teamId: null, userId: null, quoteNumber: null };
  let teamId: string | null = null;
  let createdBy: string | null = null;
  let assignedTo: string | null = null;
  let quoteNumber: string | null = null;

  const withCreatedBy = await supabase
    .schema("tosho")
    .from("quotes")
    .select("team_id,created_by,assigned_to,number")
    .eq("id", quoteId)
    .maybeSingle();

  if (
    withCreatedBy.error &&
    /column/i.test(withCreatedBy.error.message ?? "") &&
    /created_by/i.test(withCreatedBy.error.message ?? "")
  ) {
    const fallback = await supabase
      .schema("tosho")
      .from("quotes")
      .select("team_id,assigned_to,number")
      .eq("id", quoteId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    const row = (fallback.data as { team_id?: string | null; assigned_to?: string | null; number?: string | null } | null) ?? null;
    teamId = row?.team_id ?? null;
    createdBy = null;
    assignedTo = row?.assigned_to ?? null;
    quoteNumber = row?.number ?? null;
  } else if (withCreatedBy.error) {
    throw withCreatedBy.error;
  } else {
    const row =
      (withCreatedBy.data as { team_id?: string | null; created_by?: string | null; assigned_to?: string | null; number?: string | null } | null) ??
      null;
    teamId = row?.team_id ?? null;
    createdBy = row?.created_by ?? null;
    assignedTo = row?.assigned_to ?? null;
    quoteNumber = row?.number ?? null;
  }

  return { teamId, userId: createdBy ?? assignedTo, quoteNumber };
}

const QUOTE_STATUS_ALERTS: Record<string, { title: string; body: (quoteRef: string) => string; type: "info" | "success" }> = {
  estimated: {
    title: "Прорахунок готовий",
    body: (quoteRef) => `${quoteRef} переведено у статус «Пораховано».`,
    type: "success",
  },
  awaiting_approval: {
    title: "Прорахунок передано на погодження",
    body: (quoteRef) => `${quoteRef} передано на погодження.`,
    type: "info",
  },
  approved: {
    title: "Прорахунок затверджено",
    body: (quoteRef) => `${quoteRef} затверджено.`,
    type: "success",
  },
};

export async function notifyQuoteInitiatorOnStatusChange(params: {
  quoteId: string;
  toStatus: string;
  actorUserId?: string | null;
}) {
  const alert = QUOTE_STATUS_ALERTS[params.toStatus];
  if (!alert) return;

  const { teamId, userId, quoteNumber } = await resolveQuoteInitiator(params.quoteId);
  const recipients = new Set<string>();
  if (userId) recipients.add(userId);
  if (params.toStatus === "approved") {
    const members = await resolveTeamMembers(teamId);
    for (const ceoUserId of pickCeoUserIds(members)) recipients.add(ceoUserId);
  }
  if (params.actorUserId) recipients.delete(params.actorUserId);
  if (recipients.size === 0) return;
  const quoteRef = quoteNumber ? `Прорахунок #${quoteNumber}` : "Прорахунок";

  await notifyUsers({
    userIds: Array.from(recipients),
    title: alert.title,
    body: alert.body(quoteRef),
    href: `/orders/estimates/${params.quoteId}`,
    type: alert.type,
  });
}

const DESIGN_STATUS_ALERTS: Record<string, { title: string; body: (quoteRef: string) => string; type: "info" | "success" | "warning" }> = {
  in_progress: {
    title: "Дизайн-задача в роботі",
    body: (quoteRef) => `Дизайн для ${quoteRef} переведено у статус «В роботі».`,
    type: "info",
  },
  pm_review: {
    title: "Макет передано на перевірку PM",
    body: (quoteRef) => `Дизайн для ${quoteRef} передано на перевірку PM.`,
    type: "info",
  },
  client_review: {
    title: "Макет передано на погодження",
    body: (quoteRef) => `Дизайн для ${quoteRef} передано на погодження.`,
    type: "info",
  },
  approved: {
    title: "Макет затверджено",
    body: (quoteRef) => `Дизайн для ${quoteRef} затверджено.`,
    type: "success",
  },
  changes: {
    title: "Макет повернуто на правки",
    body: (quoteRef) => `Дизайн для ${quoteRef} повернули на правки.`,
    type: "warning",
  },
};

export async function notifyQuoteInitiatorOnDesignStatusChange(params: {
  quoteId: string;
  designTaskId: string;
  toStatus: string;
  actorUserId?: string | null;
}) {
  const alert = DESIGN_STATUS_ALERTS[params.toStatus];
  if (!alert) return;

  const { teamId, userId, quoteNumber } = await resolveQuoteInitiator(params.quoteId);
  const members = await resolveTeamMembers(teamId);
  const recipients = new Set<string>();

  if (userId) recipients.add(userId);

  // Коли дизайнер/PM передає задачу менеджеру (на погодження), дублюємо всім менеджерам + обраному менеджеру задачі.
  if (params.toStatus === "pm_review" || params.toStatus === "client_review") {
    for (const managerUserId of pickManagerUserIds(members)) recipients.add(managerUserId);
    const taskManagerUserId = await resolveDesignTaskManagerUserId(params.designTaskId);
    if (taskManagerUserId) recipients.add(taskManagerUserId);
  }

  // CEO (owner) отримує ключові сигнали по дизайну.
  if (params.toStatus === "client_review" || params.toStatus === "approved") {
    for (const ceoUserId of pickCeoUserIds(members)) recipients.add(ceoUserId);
  }

  if (params.actorUserId) recipients.delete(params.actorUserId);
  if (recipients.size === 0) return;
  const quoteRef = quoteNumber ? `прорахунку #${quoteNumber}` : "прорахунку";

  await notifyUsers({
    userIds: Array.from(recipients),
    title: alert.title,
    body: alert.body(quoteRef),
    href: `/design/${params.designTaskId}`,
    type: alert.type,
  });
}

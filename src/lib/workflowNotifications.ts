import { supabase } from "@/lib/supabaseClient";
import { notifyUsers } from "@/lib/designTaskActivity";
import { pluralUk, pluralWordUk } from "@/lib/lastSeen";
import { formatRatePercent, minMarkupRateFor, type QuoteDealType } from "@/lib/quoteDealType";

const isUuid = (value?: string | null) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

type QuoteRecipient = {
  teamId: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  userId: string | null;
  quoteNumber: string | null;
};

type TeamMemberRoleRow = {
  user_id?: string | null;
  access_role?: string | null;
  job_role?: string | null;
};

const normalizeRole = (value?: string | null) => (value ?? "").trim().toLowerCase();

/**
 * Відсоток у тексті сповіщення — округлений до сотих.
 *
 * У сховищі накрутка лежить без округлення (перенесені з історії значення на
 * кшталт 30,840579710144926), і сирим числом сповіщення виглядало б як збій.
 */
const formatMarkupRate = (value: number) => String(Math.round((Number(value) || 0) * 100) / 100);

async function resolveTeamMembers(teamId?: string | null): Promise<TeamMemberRoleRow[]> {
  if (!isUuid(teamId ?? null)) return [];

  // team_members lives in public, but tosho.team_members is checked as a fallback for older deploys.
  // Roles (access_role / job_role) are stored separately in tosho.memberships_view keyed by user_id.
  const idResults = await Promise.all([
    supabase.from("team_members").select("user_id").eq("team_id", teamId as string),
    supabase.schema("tosho").from("team_members" as never).select("user_id").eq("team_id", teamId as string),
  ]);
  const userIds = new Set<string>();
  for (const result of idResults) {
    if (result.error) continue;
    for (const row of (result.data as Array<{ user_id?: string | null }> | null) ?? []) {
      if (row?.user_id) userIds.add(row.user_id);
    }
  }
  if (userIds.size === 0) return [];

  const { data, error } = await supabase
    .schema("tosho")
    .from("memberships_view")
    .select("user_id,access_role,job_role")
    .in("user_id", Array.from(userIds));
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

/**
 * Хто дізнається про новий прорахунок: власник, адміністратор, CEO і проєктний
 * менеджер. Ширше за «керівництво» нижче — PM веде виробництво й має бачити
 * появу прорахунку, хоч і не є керівником.
 */
function pickQuoteWatcherUserIds(rows: TeamMemberRoleRow[]) {
  return rows
    .filter((row) => {
      const access = normalizeRole(row.access_role);
      const job = normalizeRole(row.job_role);
      return access === "owner" || access === "admin" || job === "seo" || job === "pm";
    })
    .map((row) => row.user_id)
    .filter((value): value is string => !!value);
}

/** Керівництво: access_role='owner' АБО job_role='seo'. */
function pickOwnerAndSeoUserIds(rows: TeamMemberRoleRow[]) {
  return rows
    .filter((row) => normalizeRole(row.access_role) === "owner" || normalizeRole(row.job_role) === "seo")
    .map((row) => row.user_id)
    .filter((value): value is string => !!value);
}

// Approver pool for contract revisions: access_role='owner' OR job_role='seo'.
// CEO users act as alternate contract approvers per project rule.
const pickContractApproverUserIds = pickOwnerAndSeoUserIds;

/**
 * Хто отримує запит на погодження накрутки нижче дна 20 % (REQ-149).
 *
 * Рішення СЕО 30.08.2026: двоє СЕО і головний бухгалтер; підтвердити або
 * відхилити може будь-хто з них. Власник тут не як окрема роль погоджувача, а
 * як наскрізний доступ — він і так бачить усе.
 *
 * Дзеркала цього переліку: canApproveQuoteMarkup (src/lib/permissions.ts) і
 * tosho.is_quote_markup_approver у базі.
 */
function pickMarkupApproverUserIds(rows: TeamMemberRoleRow[]) {
  return rows
    .filter((row) => {
      const access = normalizeRole(row.access_role);
      const job = normalizeRole(row.job_role);
      return access === "owner" || job === "seo" || job === "chief_accountant";
    })
    .map((row) => row.user_id)
    .filter((value): value is string => !!value);
}

function pickDesignerUserIds(rows: TeamMemberRoleRow[]) {
  return rows
    .filter((row) => {
      const job = normalizeRole(row.job_role);
      return job === "designer" || job === "дизайнер";
    })
    .map((row) => row.user_id)
    .filter((value): value is string => !!value);
}

async function resolveDesignTaskManagerUserId(designTaskId?: string | null): Promise<string | null> {
  if (!isUuid(designTaskId)) return null;
  const { data, error } = await supabase
    .from("activity_log")
    .select("metadata")
    .eq("id", designTaskId as string)
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
  if (!isUuid(quoteId)) {
    return { teamId: null, createdBy: null, assignedTo: null, userId: null, quoteNumber: null };
  }
  let teamId: string | null;
  let createdBy: string | null;
  let assignedTo: string | null;
  let quoteNumber: string | null;

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

  return { teamId, createdBy, assignedTo, userId: createdBy ?? assignedTo, quoteNumber };
}

function getQuoteStatusAlert(fromStatus: string, toStatus: string) {
  if (fromStatus === "new" && toStatus === "estimating") {
    return {
      title: "Прорахунок взято в роботу",
      body: (quoteRef: string) => `${quoteRef} переведено у статус «На прорахунку».`,
      type: "info" as const,
    };
  }

  const alerts: Record<string, { title: string; body: (quoteRef: string) => string; type: "info" | "success" }> = {
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

  return alerts[toStatus] ?? null;
}

export async function notifyQuoteInitiatorOnStatusChange(params: {
  quoteId: string;
  fromStatus?: string | null;
  toStatus: string;
  actorUserId?: string | null;
}) {
  const fromStatus = (params.fromStatus ?? "").trim().toLowerCase();
  // Не перехід — не подія. Другий рубіж після перевірок на самих сторінках:
  // база однакові статуси одне за одним ігнорує (тригери історії й аудиту
  // мають `when (old.status is distinct from new.status)`), а Telegram — ні.
  if (fromStatus && fromStatus === params.toStatus.trim().toLowerCase()) return;
  const alert = getQuoteStatusAlert(fromStatus, params.toStatus);
  if (!alert) return;

  const { teamId, createdBy, assignedTo, userId, quoteNumber } = await resolveQuoteInitiator(params.quoteId);
  const recipients = new Set<string>();
  if (fromStatus === "new" && params.toStatus === "estimating") {
    if (createdBy) recipients.add(createdBy);
    if (assignedTo) recipients.add(assignedTo);
  } else if (userId) {
    recipients.add(userId);
  }
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

export async function notifyDesignTaskStakeholdersOnCreate(params: {
  quoteId: string;
  designTaskId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  assigneeUserId?: string | null;
  collaboratorUserIds?: string[];
}) {
  const { teamId, createdBy, assignedTo, quoteNumber } = await resolveQuoteInitiator(params.quoteId);
  const members = await resolveTeamMembers(teamId);
  const actorName = params.actorName ?? "System";
  const quoteRef = quoteNumber ? `#${quoteNumber}` : "цього прорахунку";

  const assigneeRecipients = new Set<string>();
  const collaboratorRecipients = new Set<string>();
  const designerPoolRecipients = new Set<string>();
  const stakeholderRecipients = new Set<string>();

  if (params.assigneeUserId) {
    assigneeRecipients.add(params.assigneeUserId);
  } else {
    for (const designerUserId of pickDesignerUserIds(members)) designerPoolRecipients.add(designerUserId);
  }
  for (const collaboratorUserId of params.collaboratorUserIds ?? []) {
    if (collaboratorUserId) collaboratorRecipients.add(collaboratorUserId);
  }

  if (assignedTo) stakeholderRecipients.add(assignedTo);
  if (createdBy) stakeholderRecipients.add(createdBy);

  if (params.actorUserId) {
    assigneeRecipients.delete(params.actorUserId);
    collaboratorRecipients.delete(params.actorUserId);
    designerPoolRecipients.delete(params.actorUserId);
    stakeholderRecipients.delete(params.actorUserId);
  }

  for (const userId of assigneeRecipients) collaboratorRecipients.delete(userId);
  for (const userId of assigneeRecipients) stakeholderRecipients.delete(userId);
  for (const userId of collaboratorRecipients) stakeholderRecipients.delete(userId);
  for (const userId of designerPoolRecipients) stakeholderRecipients.delete(userId);

  if (assigneeRecipients.size > 0) {
    await notifyUsers({
      userIds: Array.from(assigneeRecipients),
      title: "Вас призначено на дизайн-задачу",
      body: `${actorName} призначив(ла) вас на задачу по прорахунку ${quoteRef}.`,
      href: `/design/${params.designTaskId}`,
      type: "info",
    });
  }

  if (designerPoolRecipients.size > 0) {
    await notifyUsers({
      userIds: Array.from(designerPoolRecipients),
      title: "Нова дизайн-задача без виконавця",
      body: `${actorName} створив(ла) дизайн-задачу по прорахунку ${quoteRef}. Потрібно взяти її в роботу.`,
      href: `/design/${params.designTaskId}`,
      type: "info",
    });
  }

  if (collaboratorRecipients.size > 0) {
    await notifyUsers({
      userIds: Array.from(collaboratorRecipients),
      title: "Вас додано як співвиконавця",
      body: `${actorName} додав(ла) вас як співвиконавця до задачі по прорахунку ${quoteRef}.`,
      href: `/design/${params.designTaskId}`,
      type: "info",
    });
  }

  if (stakeholderRecipients.size > 0) {
    await notifyUsers({
      userIds: Array.from(stakeholderRecipients),
      title: "Створено дизайн-задачу",
      body: `${actorName} створив(ла) дизайн-задачу по прорахунку ${quoteRef}.`,
      href: `/design/${params.designTaskId}`,
      type: "info",
    });
  }
}

export async function notifyDesignTaskCollaboratorsChanged(params: {
  designTaskId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  taskLabel: string;
  addedUserIds?: string[];
  removedUserIds?: string[];
}) {
  const actorName = params.actorName ?? "System";
  const addedRecipients = new Set((params.addedUserIds ?? []).filter((value): value is string => !!value));
  const removedRecipients = new Set((params.removedUserIds ?? []).filter((value): value is string => !!value));

  if (params.actorUserId) {
    addedRecipients.delete(params.actorUserId);
    removedRecipients.delete(params.actorUserId);
  }

  if (addedRecipients.size > 0) {
    await notifyUsers({
      userIds: Array.from(addedRecipients),
      title: "Вас додано як співвиконавця",
      body: `${actorName} додав(ла) вас як співвиконавця до задачі ${params.taskLabel}.`,
      href: `/design/${params.designTaskId}`,
      type: "info",
    });
  }

  if (removedRecipients.size > 0) {
    await notifyUsers({
      userIds: Array.from(removedRecipients),
      title: "Вас знято зі співвиконавців",
      body: `${actorName} прибрав(ла) вас зі співвиконавців задачі ${params.taskLabel}.`,
      href: `/design/${params.designTaskId}`,
      type: "warning",
    });
  }
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

/**
 * Назва позиції для тіла сповіщення.
 *
 * НАВІЩО. Один прорахунок несе кілька дизайн-задач — по одній на позицію. Доки
 * тіло називало лише номер прорахунку, переведення трьох задач підряд давало
 * ТРИ повідомлення, однакові до літери: «Дизайн для прорахунку #TS-0826-0041
 * передано на погодження.» Прочитати їх як різні події було неможливо, і вони
 * читались як здубльоване одне (31.08.2026: три куртки одного прорахунку).
 *
 * Заголовок задачі приходить у вигляді «Дизайн: Куртка «NARVIK» чоловіча» —
 * слово «Дизайн» у сповіщенні про дизайн зайве, тож префікс знімаємо.
 */
function normalizeDesignTaskLabel(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/^Дизайн:\s*/i, "").trim() || null;
}

export async function notifyQuoteInitiatorOnDesignStatusChange(params: {
  quoteId: string;
  designTaskId: string;
  toStatus: string;
  actorUserId?: string | null;
  /** Назва позиції (`productName` або заголовок задачі) — щоб задачі одного прорахунку різнились. */
  taskLabel?: string | null;
}) {
  const alert = DESIGN_STATUS_ALERTS[params.toStatus];
  if (!alert) return;

  const { teamId, userId, quoteNumber } = await resolveQuoteInitiator(params.quoteId);
  const members = await resolveTeamMembers(teamId);
  const recipients = new Set<string>();

  if (userId) recipients.add(userId);

  // Коли дизайнер позначає "Дизайн готовий", сповіщення має отримати саме менеджер,
  // який призначений у задачі, а не весь пул менеджерів.
  if (params.toStatus === "pm_review") {
    const taskManagerUserId = await resolveDesignTaskManagerUserId(params.designTaskId);
    if (taskManagerUserId) {
      recipients.add(taskManagerUserId);
    } else if (userId) {
      recipients.add(userId);
    }
  }

  // Коли задача переходить далі на погодження, лишаємо менеджера задачі й ініціатора прорахунку.
  if (params.toStatus === "client_review") {
    const taskManagerUserId = await resolveDesignTaskManagerUserId(params.designTaskId);
    if (taskManagerUserId) recipients.add(taskManagerUserId);
    if (userId) recipients.add(userId);
  }

  // CEO (owner) отримує ключові сигнали по дизайну.
  if (params.toStatus === "client_review" || params.toStatus === "approved") {
    for (const ceoUserId of pickCeoUserIds(members)) recipients.add(ceoUserId);
  }

  if (params.actorUserId) recipients.delete(params.actorUserId);
  if (recipients.size === 0) return;
  const quoteRef = quoteNumber ? `прорахунку #${quoteNumber}` : "прорахунку";
  const taskLabel = normalizeDesignTaskLabel(params.taskLabel);
  const body = taskLabel ? `${taskLabel} · ${alert.body(quoteRef)}` : alert.body(quoteRef);

  await notifyUsers({
    userIds: Array.from(recipients),
    title: alert.title,
    body,
    href: `/design/${params.designTaskId}`,
    type: alert.type,
  });
}

export async function notifyDesignTaskCollaboratorsOnStatusChange(params: {
  designTaskId: string;
  taskLabel: string;
  toStatus: string;
  actorUserId?: string | null;
  actorName?: string | null;
  collaboratorUserIds?: string[];
}) {
  const alert = DESIGN_STATUS_ALERTS[params.toStatus];
  if (!alert) return;

  const recipients = new Set((params.collaboratorUserIds ?? []).filter((value): value is string => !!value));
  if (params.actorUserId) recipients.delete(params.actorUserId);
  if (recipients.size === 0) return;

  await notifyUsers({
    userIds: Array.from(recipients),
    title: alert.title,
    body: `${params.actorName ?? "System"} змінив(ла) статус спільної задачі ${params.taskLabel}.`,
    href: `/design/${params.designTaskId}`,
    type: alert.type,
  });
}

type ContractRevisionDecisionAlert = {
  title: string;
  body: string;
  type: "info" | "success" | "warning";
};

const CONTRACT_DECISION_ALERTS: Record<"approved" | "rejected", (revisionNumber: number, quoteRef: string, comment: string | null) => ContractRevisionDecisionAlert> = {
  approved: (revisionNumber, quoteRef, comment) => ({
    title: `CEO схвалив договір v${revisionNumber}`,
    body: `Договір ${quoteRef} (v${revisionNumber}) погоджено. Можна відправляти замовнику.${comment ? ` Коментар CEO: ${comment}` : ""}`,
    type: "success",
  }),
  rejected: (revisionNumber, quoteRef, comment) => ({
    title: `CEO повернув договір v${revisionNumber} на правки`,
    body: `Договір ${quoteRef} (v${revisionNumber}) повернено на правки.${comment ? ` Коментар CEO: ${comment}` : " Перевірте коментар у замовленні."}`,
    type: "warning",
  }),
};

export async function notifyContractRevisionSubmitted(params: {
  teamId: string;
  orderId: string;
  revisionNumber: number;
  quoteNumber?: string | null;
  actorUserId?: string | null;
}) {
  const members = await resolveTeamMembers(params.teamId);
  const recipients = new Set(pickContractApproverUserIds(members));
  if (params.actorUserId) recipients.delete(params.actorUserId);
  if (recipients.size === 0) return;
  const quoteRef = params.quoteNumber ? `#${params.quoteNumber}` : "цього замовлення";
  await notifyUsers({
    userIds: Array.from(recipients),
    title: `Договір v${params.revisionNumber} на схваленні`,
    body: `Менеджер передав на схвалення нову версію договору ${quoteRef}.`,
    href: `/orders/production/${params.orderId}`,
    type: "info",
  });
}

export async function notifyContractRevisionDecided(params: {
  orderId: string;
  revisionNumber: number;
  decision: "approved" | "rejected";
  ceoComment?: string | null;
  authorUserId: string;
  quoteNumber?: string | null;
  actorUserId?: string | null;
}) {
  if (!params.authorUserId || params.authorUserId === params.actorUserId) return;
  const quoteRef = params.quoteNumber ? `#${params.quoteNumber}` : "замовлення";
  const alert = CONTRACT_DECISION_ALERTS[params.decision](params.revisionNumber, quoteRef, params.ceoComment?.trim() || null);
  await notifyUsers({
    userIds: [params.authorUserId],
    title: alert.title,
    body: alert.body,
    href: `/orders/production/${params.orderId}`,
    type: alert.type,
  });
}

export async function notifyCustomerLeadManagerAssigned(params: {
  entityType: "customer" | "lead";
  entityId: string;
  entityName: string;
  newManagerUserId?: string | null;
  previousManagerLabel?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
}) {
  const recipient = params.newManagerUserId?.trim();
  if (!recipient || recipient === params.actorUserId) return;

  const isLead = params.entityType === "lead";
  const entityLabel = isLead ? "ліда" : "замовника";
  const title = isLead ? "Вам передали ліда" : "Вам передали замовника";
  const name = params.entityName.trim() || (isLead ? "Лід" : "Замовник");
  const actorName = params.actorName?.trim() || "Менеджер";
  const previousManager = params.previousManagerLabel?.trim();
  const previousManagerSentence = previousManager ? previousManager.replace(/[.!?]+$/, "") : "";
  const previousSuffix = previousManagerSentence ? ` Попередній менеджер: ${previousManagerSentence}.` : "";

  await notifyUsers({
    userIds: [recipient],
    title,
    body: `${actorName} передав(ла) вам ${entityLabel} «${name}».${previousSuffix}`,
    href: isLead ? `/orders/customers?tab=leads&leadId=${params.entityId}` : `/orders/customers?customerId=${params.entityId}`,
    type: "info",
  });
}

/* ------------------------------------------------------------------ */
/* Погодження накрутки нижче дна (REQ-149)                             */
/* ------------------------------------------------------------------ */

/**
 * ОДНЕ сповіщення на прорахунок, а не по одному на тираж.
 *
 * Поріг рахується в quote_item_runs, тобто запит живе на тиражі — але
 * прорахунок із п'ятьма тиражами нижче дна прислав би погоджувачу п'ять пінгів
 * про одну картку. Тому тиражі йдуть списком у тілі, а посилання одне.
 */
export async function notifyMarkupApprovalRequested(params: {
  quoteId: string;
  requesterName?: string | null;
  /** Тип угоди: дно в тілі листа має бути дном САМЕ цього прорахунку (REQ-182). */
  dealType: QuoteDealType | null | undefined;
  runs: Array<{ label: string; markupRate: number }>;
  actorUserId?: string | null;
}) {
  if (params.runs.length === 0) return;
  const { teamId, quoteNumber } = await resolveQuoteInitiator(params.quoteId);
  const members = await resolveTeamMembers(teamId);
  const recipients = new Set(pickMarkupApproverUserIds(members));
  if (params.actorUserId) recipients.delete(params.actorUserId);
  if (recipients.size === 0) return;

  const quoteRef = quoteNumber ? `#${quoteNumber}` : "прорахунку";
  const who = params.requesterName?.trim() || "Менеджер";
  const list = params.runs
    .map((run) => `${run.label} — ${formatMarkupRate(run.markupRate)} %`)
    .join(", ");
  const countLabel = pluralWordUk(params.runs.length, "тираж", "тиражі", "тиражів");

  await notifyUsers({
    userIds: Array.from(recipients),
    title: "Накрутка нижче дна — потрібне рішення",
    body:
      `${who} просить погодити ${params.runs.length} ${countLabel} у ${quoteRef}: ${list}. ` +
      `Дно — ${formatRatePercent(minMarkupRateFor(params.dealType))} %.`,
    href: `/orders/estimates/${params.quoteId}`,
    type: "warning",
    category: "quote_markup_request",
  });
}

export async function notifyMarkupApprovalDecided(params: {
  quoteId: string;
  decision: "approved" | "rejected";
  markupRate: number;
  runLabel: string;
  requesterUserId?: string | null;
  deciderName?: string | null;
  note?: string | null;
  actorUserId?: string | null;
}) {
  const recipient = params.requesterUserId?.trim();
  if (!recipient || recipient === params.actorUserId) return;
  const { quoteNumber } = await resolveQuoteInitiator(params.quoteId);
  const quoteRef = quoteNumber ? `#${quoteNumber}` : "прорахунку";
  const who = params.deciderName?.trim() || "Погоджувач";
  const rate = formatMarkupRate(params.markupRate);
  const note = params.note?.trim();
  const approved = params.decision === "approved";

  await notifyUsers({
    userIds: [recipient],
    title: approved ? `Накрутку ${rate} % погоджено` : `Накрутку ${rate} % відхилено`,
    body: approved
      ? `${who} підтвердив(ла) ${rate} % на тиражі ${params.runLabel} у ${quoteRef}.${note ? ` Коментар: ${note}` : ""}`
      : `${who} відхилив(ла) ${rate} % на тиражі ${params.runLabel} у ${quoteRef}. Число лишається як є — підніміть накрутку або надішліть запит із поясненням.${note ? ` Коментар: ${note}` : ""}`,
    href: `/orders/estimates/${params.quoteId}`,
    type: approved ? "success" : "warning",
    // Окрема категорія від запиту: вимкнути «чужі запити» не має заодно
    // глушити відповідь на власне прохання.
    category: "quote_markup_decision",
  });
}

/* ------------------------------------------------------------------ */
/* Заявки на відсутність                                               */
/* ------------------------------------------------------------------ */

/**
 * Хто вирішує заявки: owner + CEO. Резолвимо по workspace_id, а не по teamId,
 * бо відсутності ключуються воркспейсом (див. tosho.team_absences).
 */
async function resolveAbsenceApproverUserIds(workspaceId: string): Promise<string[]> {
  if (!isUuid(workspaceId)) return [];
  const { data, error } = await supabase
    .schema("tosho")
    .from("memberships_view")
    .select("user_id,access_role,job_role")
    .eq("workspace_id", workspaceId);
  if (error) {
    console.warn("Failed to resolve absence approvers", error);
    return [];
  }
  return ((data as TeamMemberRoleRow[] | null) ?? [])
    .filter((row) => normalizeRole(row.access_role) === "owner" || normalizeRole(row.job_role) === "seo")
    .map((row) => row.user_id)
    .filter((value): value is string => !!value);
}

/** Нова заявка чекає на рішення — летить owner і CEO, окрім самого заявника. */
export async function notifyAbsenceRequestSubmitted(params: {
  workspaceId: string;
  requesterUserId: string;
  requesterName: string;
  kindLabel: string;
  rangeLabel: string;
  businessDays: number;
  comment?: string | null;
}) {
  const recipients = new Set(await resolveAbsenceApproverUserIds(params.workspaceId));
  recipients.delete(params.requesterUserId);
  if (recipients.size === 0) return;

  await notifyUsers({
    userIds: Array.from(recipients),
    title: `Заявка: ${params.kindLabel.toLowerCase()} — ${params.requesterName}`,
    body: `${params.rangeLabel} · ${params.businessDays} роб. дн.${params.comment ? ` — «${params.comment}»` : ""}`,
    href: "/team",
    type: "info",
    category: "team_absences",
  });
}

/**
 * Лікарняний погодження не потребує, але команда має знати одразу —
 * інакше про відсутність людини дізнаються з порожнього стільця.
 */
export async function notifyAbsenceRecorded(params: {
  workspaceId: string;
  userId: string;
  userName: string;
  kindLabel: string;
  rangeLabel: string;
}) {
  const recipients = new Set(await resolveAbsenceApproverUserIds(params.workspaceId));
  recipients.delete(params.userId);
  if (recipients.size === 0) return;

  await notifyUsers({
    userIds: Array.from(recipients),
    title: `${params.kindLabel}: ${params.userName}`,
    body: `${params.rangeLabel} — зафіксовано без погодження.`,
    href: "/team",
    type: "warning",
    category: "team_absences",
  });
}

/** Заявку відкликано самим заявником — щоб approver не тримав її в голові. */
export async function notifyAbsenceRequestCancelled(params: {
  workspaceId: string;
  requesterUserId: string;
  requesterName: string;
  kindLabel: string;
  rangeLabel: string;
}) {
  const recipients = new Set(await resolveAbsenceApproverUserIds(params.workspaceId));
  recipients.delete(params.requesterUserId);
  if (recipients.size === 0) return;

  await notifyUsers({
    userIds: Array.from(recipients),
    title: `Заявку скасовано — ${params.requesterName}`,
    body: `${params.kindLabel} ${params.rangeLabel} більше не потребує рішення.`,
    href: "/team",
    type: "info",
    category: "team_absences",
  });
}

/* ------------------------------------------------------------------ */
/* Нові прорахунки                                                     */
/* ------------------------------------------------------------------ */

/**
 * Відсіює звільнених. `memberships_view` їх ніяк не позначає — HR-статус лежить
 * окремо, у `tosho.team_member_profiles`. Порожній статус означає «людина в
 * команді, просто без HR-рядка», тож такі лишаються в списку.
 */
async function filterActiveUserIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .schema("tosho")
    .from("team_member_profiles")
    .select("user_id,employment_status")
    .in("user_id", userIds);
  if (error) {
    // Краще сповістити зайвого, ніж мовчки не сповістити нікого.
    console.warn("Failed to resolve employment status for quote notifications", error);
    return userIds;
  }
  const departed = new Set(
    ((data as Array<{ user_id?: string | null; employment_status?: string | null }> | null) ?? [])
      .filter((row) => {
        const status = (row.employment_status ?? "").trim().toLowerCase();
        return status === "inactive" || status === "rejected";
      })
      .map((row) => row.user_id)
      .filter((value): value is string => !!value)
  );
  return userIds.filter((userId) => !departed.has(userId));
}

/**
 * Керівництво дізнається про новий прорахунок одразу — дзвіночок, браузер,
 * Telegram. Який саме канал увімкнено, кожен вирішує сам у матриці налаштувань
 * (категорія `quote_created`).
 *
 * Приймає СПИСОК, а не один id, свідомо: груповий конструктор створює по
 * прорахунку на кожну групу в одному сабміті, і чотири групи мають дати одне
 * сповіщення «створено 4 прорахунки», а не чотири push-и підряд.
 */
export async function notifyQuotesCreated(params: {
  quoteIds: string[];
  actorUserId?: string | null;
  actorName?: string | null;
  customerName?: string | null;
}) {
  const quoteIds = Array.from(new Set(params.quoteIds.filter((id) => isUuid(id))));
  if (quoteIds.length === 0) return;

  const { data, error } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("id,team_id,number,customer_name")
    .in("id", quoteIds);
  if (error) {
    console.warn("Failed to load created quotes for notification", error);
    return;
  }

  type CreatedQuoteRow = {
    id: string;
    team_id?: string | null;
    number?: string | null;
    customer_name?: string | null;
  };
  const rows = ((data as CreatedQuoteRow[] | null) ?? []).filter((row) => !!row?.id);
  if (rows.length === 0) return;

  const teamId = rows.find((row) => row.team_id)?.team_id ?? null;
  const members = await resolveTeamMembers(teamId);
  const actorUserId = params.actorUserId?.trim() || null;
  const recipients = (await filterActiveUserIds(pickQuoteWatcherUserIds(members))).filter(
    (userId) => userId !== actorUserId
  );
  if (recipients.length === 0) return;

  const actorName = params.actorName?.trim() || "Менеджер";
  const customerName =
    params.customerName?.trim() || rows.find((row) => row.customer_name)?.customer_name?.trim() || "";
  const customerSuffix = customerName ? ` · ${customerName}` : "";
  const numbers = rows
    .map((row) => row.number?.trim())
    .filter((value): value is string => !!value)
    .join(", ");

  const single = rows.length === 1 ? rows[0] : null;
  const countLabel = pluralUk(rows.length, "прорахунок", "прорахунки", "прорахунків");

  await notifyUsers({
    userIds: recipients,
    title: single ? "Новий прорахунок" : `Нові прорахунки: ${rows.length}`,
    body: single
      ? `${actorName} завів(ла) прорахунок ${single.number?.trim() || ""}${customerSuffix}`.trim()
      : `${actorName} завів(ла) ${rows.length} ${countLabel}${customerSuffix}${numbers ? `. Номери: ${numbers}` : ""}`,
    href: single ? `/orders/estimates/${single.id}` : "/quotes",
    type: "info",
    category: "quote_created",
  });
}

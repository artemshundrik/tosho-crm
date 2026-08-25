import { listCustomerLeadLogoDirectory, normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import { supabase } from "@/lib/supabaseClient";
import { listQuotes } from "@/lib/toshoApi";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";

import type { OverviewDesignInput, OverviewQuoteInput } from "./buildOverview";
import type { OverviewActivityRow } from "./OverviewAside";

/**
 * Читання даних «Огляду».
 *
 * ЧОМУ ОДИН ЗАПИТ ПО ПРОРАХУНКАХ, А НЕ СІМ. Раніше сторінка робила по
 * `head`-запиту на КОЖЕН статус (шість штук), ще один на загальну кількість і
 * ще один на «мої» — і лише потім тягла вісім останніх рядків. Дев'ять
 * звернень заради чисел, які всі до одного виводяться з одного списку
 * активних прорахунків. Тепер список береться один раз, а всі лічильники
 * рахуються з нього ж — заразом зникає розбіжність, коли лічильник каже одне,
 * а список під ним показує інше.
 *
 * ЧОМУ АКТИВНІ, А НЕ ВСІ. Погоджені й скасовані прорахунки не потребують дій,
 * а їх у базі більшість. Тягнути їх, щоб потім відфільтрувати в браузері,
 * означало б платити трафіком за рядки, які ніде не показуються.
 */

const ACTIVE_QUOTE_STATUSES = ["new", "estimating", "estimated", "awaiting_approval"];

/** Стеля вибірки активних прорахунків. Більше за це — вже не «огляд». */
const QUOTE_LIMIT = 300;

/** Скільки записів журналу дизайн-задач читаємо, щоб зібрати їхній поточний стан. */
const DESIGN_LOG_LIMIT = 60;

const ACTIVITY_LIMIT = 6;

export type OverviewData = {
  quotes: OverviewQuoteInput[];
  designTasks: OverviewDesignInput[];
  activity: OverviewActivityRow[];
};

export const createEmptyOverviewData = (): OverviewData => ({ quotes: [], designTasks: [], activity: [] });

type OverviewMember = {
  id: string;
  label: string;
  fullName: string | null;
  avatarUrl: string | null;
};

type PartyDirectoryEntry = {
  id: string;
  entityType: "customer" | "lead";
  label: string;
  legalName: string | null;
  logoUrl: string | null;
};

const DESIGN_STATUSES = [
  "new",
  "changes",
  "in_progress",
  "pm_review",
  "client_review",
  "approved",
  "cancelled",
] as const;

/* ── стійкість до відсутніх колонок ────────────────────────────────────────
   Схема в різних середовищах трохи різна (частина колонок додавалась пізніше),
   тож вибірка пробує варіанти від найповнішого до найвужчого. Помилка, не
   схожа на «немає колонки», кидається одразу — інакше справжня поломка
   маскувалася б під деградацію. */

const getErrorMessage = (error: unknown): string => {
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
};

const isMissingColumnLike = (error: unknown, columns?: string[]) => {
  const message = getErrorMessage(error).toLowerCase();
  const looksMissing =
    (message.includes("column") && message.includes("does not exist")) ||
    message.includes("schema cache") ||
    message.includes("could not find");

  if (!looksMissing) return false;
  if (!columns || columns.length === 0) return true;
  return columns.some((column) => message.includes(column.toLowerCase()));
};

async function selectOverviewRows<T>(
  builder: (columns: string) => PromiseLike<{ data: unknown; error: unknown }>,
  variants: Array<{ columns: string; optionalColumns?: string[] }>
): Promise<T[]> {
  let lastError: unknown = null;

  for (const variant of variants) {
    const result = await builder(variant.columns);
    if (!result.error) return ((result.data as T[] | null) ?? []) as T[];
    lastError = result.error;
    if (!isMissingColumnLike(result.error, variant.optionalColumns)) throw result.error;
  }

  if (lastError) throw lastError;
  return [];
}

const normalizeLookupKey = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

const firstNonEmptyString = (...values: Array<unknown>) => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const formatDateTime = (value?: string | null) => {
  if (!value) return "Не вказано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не вказано";
  return date.toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/* ── довідники ─────────────────────────────────────────────────────────── */

const buildMemberLookups = (members: OverviewMember[]) => {
  const byUserId = new Map<string, OverviewMember>();
  const byNormalizedName = new Map<string, OverviewMember>();

  for (const member of members) {
    byUserId.set(member.id, member);
    for (const candidate of [member.label, member.fullName]) {
      const normalized = normalizeLookupKey(candidate);
      if (!normalized || byNormalizedName.has(normalized)) continue;
      byNormalizedName.set(normalized, member);
    }
  }

  return { byUserId, byNormalizedName };
};

const buildPartyLookups = (entries: PartyDirectoryEntry[]) => {
  const byTypedId = new Map<string, PartyDirectoryEntry>();
  const byNormalizedName = new Map<string, PartyDirectoryEntry>();

  for (const entry of entries) {
    byTypedId.set(`${entry.entityType}:${entry.id}`, entry);
    for (const candidate of [entry.label, entry.legalName]) {
      const normalized = normalizeLookupKey(candidate);
      if (!normalized || byNormalizedName.has(normalized)) continue;
      byNormalizedName.set(normalized, entry);
    }
  }

  return { byTypedId, byNormalizedName };
};

/* ── дизайн-задачі ─────────────────────────────────────────────────────────
   Дизайн-задача — не рядок таблиці, а запис журналу `activity_log` з
   метаданими (див. AGENTS.md). Тому стан, виконавець і дедлайн читаються з
   metadata, а не з колонок. */

type DesignLogRow = {
  id: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  title?: string | null;
  created_at?: string | null;
};

type LinkedQuote = {
  id: string;
  number: string | null;
  customerName: string | null;
  customerLogoUrl: string | null;
  customerId: string | null;
  customerType: "customer" | "lead" | null;
};

function parseDesignTask(
  row: DesignLogRow,
  lookups: {
    memberByUserId: Map<string, OverviewMember>;
    partyByTypedId: Map<string, PartyDirectoryEntry>;
    partyByNormalizedName: Map<string, PartyDirectoryEntry>;
    quoteById: Map<string, LinkedQuote>;
  }
): OverviewDesignInput {
  const metadata = row.metadata ?? {};
  const quoteIdFromMeta = firstNonEmptyString(metadata.quote_id);
  const entityQuoteId = firstNonEmptyString(row.entity_id);
  const resolvedQuoteId = quoteIdFromMeta ?? entityQuoteId ?? "";
  const linkedQuote = resolvedQuoteId ? lookups.quoteById.get(resolvedQuoteId) ?? null : null;

  const statusRaw = typeof metadata.status === "string" ? metadata.status : "new";
  const status = (DESIGN_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : "new";

  const assigneeUserId = firstNonEmptyString(metadata.assignee_user_id);
  const assigneeMeta = assigneeUserId ? lookups.memberByUserId.get(assigneeUserId) : undefined;

  const customerTypeRaw = typeof metadata.customer_type === "string" ? metadata.customer_type.trim().toLowerCase() : "";
  const customerType =
    customerTypeRaw === "customer" || customerTypeRaw === "lead"
      ? (customerTypeRaw as "customer" | "lead")
      : linkedQuote?.customerType ?? null;
  const customerId = firstNonEmptyString(metadata.customer_id) ?? linkedQuote?.customerId ?? null;
  const party = customerType && customerId ? lookups.partyByTypedId.get(`${customerType}:${customerId}`) ?? null : null;

  const metadataCustomerName = firstNonEmptyString(metadata.customer_name);
  const matchedByName = lookups.partyByNormalizedName.get(normalizeLookupKey(metadataCustomerName));

  return {
    id: row.id,
    designTaskNumber: firstNonEmptyString(metadata.design_task_number),
    quoteNumber: firstNonEmptyString(metadata.quote_number) ?? linkedQuote?.number ?? null,
    title:
      firstNonEmptyString(metadata.product_name, metadata.quote_item_name, metadata.item_name, metadata.model, row.title) ??
      "Дизайн-задача",
    customerName: party?.label ?? linkedQuote?.customerName ?? metadataCustomerName ?? matchedByName?.label ?? null,
    customerLogoUrl:
      party?.logoUrl ??
      linkedQuote?.customerLogoUrl ??
      normalizeCustomerLogoUrl(firstNonEmptyString(metadata.customer_logo_url)) ??
      matchedByName?.logoUrl ??
      null,
    status,
    assigneeUserId,
    assigneeLabel: assigneeMeta?.label ?? firstNonEmptyString(metadata.assignee_label),
    createdAt: row.created_at ?? null,
    // Обидва ключі живі: старіші задачі писали `deadline`, новіші — `design_deadline`.
    deadlineAt: firstNonEmptyString(metadata.design_deadline, metadata.deadline),
  };
}

async function readDesignTaskLogs(teamId: string) {
  return await selectOverviewRows<DesignLogRow>(
    (columns) =>
      supabase
        .from("activity_log")
        .select(columns)
        .eq("team_id", teamId)
        .eq("action", "design_task")
        .order("created_at", { ascending: false })
        .limit(DESIGN_LOG_LIMIT),
    [
      { columns: "id,entity_id,metadata,title,created_at", optionalColumns: ["title"] },
      { columns: "id,entity_id,metadata,created_at", optionalColumns: [] },
    ]
  );
}

type ActivityLogRow = {
  id: string;
  title?: string | null;
  action?: string | null;
  actor_name?: string | null;
  user_id?: string | null;
  entity_type?: string | null;
  href?: string | null;
  created_at?: string | null;
};

async function readActivity(teamId: string) {
  return await selectOverviewRows<ActivityLogRow>(
    (columns) =>
      supabase
        .from("activity_log")
        .select(columns)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_LIMIT),
    [
      { columns: "id,title,action,actor_name,user_id,entity_type,href,created_at", optionalColumns: ["href"] },
      { columns: "id,title,action,actor_name,user_id,entity_type,created_at", optionalColumns: ["title"] },
      { columns: "id,action,actor_name,user_id,entity_type,created_at", optionalColumns: [] },
    ]
  );
}

type LinkedQuoteRow = {
  id: string;
  number?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_logo_url?: string | null;
  title?: string | null;
};

async function readLinkedQuotes(teamId: string, quoteIds: string[]) {
  if (quoteIds.length === 0) return [];

  return await selectOverviewRows<LinkedQuoteRow>(
    (columns) => supabase.schema("tosho").from("quotes").select(columns).eq("team_id", teamId).in("id", quoteIds),
    [
      {
        columns: "id,number,customer_id,customer_name,customer_logo_url,title",
        optionalColumns: ["customer_name", "customer_logo_url"],
      },
      { columns: "id,number,customer_id,customer_name,title", optionalColumns: ["customer_name"] },
      { columns: "id,number,customer_id,title", optionalColumns: [] },
    ]
  );
}

/* ── головне читання ───────────────────────────────────────────────────── */

export async function loadOverviewData(params: { teamId: string | null; userId: string | null }): Promise<OverviewData> {
  const { teamId, userId } = params;
  if (!teamId) return createEmptyOverviewData();

  // Довідники не блокують сторінку: без них будуть імена з метаданих і
  // літерні заглушки замість логотипів, але черга лишиться робочою.
  let members: OverviewMember[] = [];
  try {
    const workspaceId = userId ? await resolveWorkspaceId(userId) : null;
    if (workspaceId) {
      const directory = await listWorkspaceMembersForDisplay(workspaceId);
      members = directory.map((member) => ({
        id: member.userId,
        label: member.label,
        fullName: member.fullName ?? null,
        avatarUrl: member.avatarDisplayUrl ?? null,
      }));
    }
  } catch {
    // Огляд лишається корисним і без довідника учасників.
  }
  const { byUserId: memberByUserId, byNormalizedName: memberByNormalizedName } = buildMemberLookups(members);

  let partyDirectory: PartyDirectoryEntry[] = [];
  try {
    partyDirectory = await listCustomerLeadLogoDirectory(teamId);
  } catch {
    // Так само з логотипами замовників і лідів.
  }
  const { byTypedId: partyByTypedId, byNormalizedName: partyByNormalizedName } = buildPartyLookups(partyDirectory);

  const [quoteRows, designLogRows, activityRows] = await Promise.all([
    listQuotes({ teamId, statuses: ACTIVE_QUOTE_STATUSES, limit: QUOTE_LIMIT }),
    readDesignTaskLogs(teamId),
    readActivity(teamId),
  ]);

  const quotes: OverviewQuoteInput[] = (quoteRows ?? []).map((row) => ({
    id: row.id,
    number: firstNonEmptyString(row.number),
    status: (row.status ?? "new").trim(),
    customerName: firstNonEmptyString(row.customer_name, row.title),
    customerLogoUrl: normalizeCustomerLogoUrl(row.customer_logo_url ?? null),
    assignedTo: firstNonEmptyString(row.assigned_to),
    assignedToLabel: row.assigned_to ? memberByUserId.get(row.assigned_to)?.label ?? null : null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    deadlineAt: firstNonEmptyString(row.deadline_at, row.customer_deadline_at),
  }));

  // Назви замовників для дизайн-задач: у метаданих вони бувають порожні, а
  // прорахунок за посиланням знає і назву, і логотип.
  const linkedQuoteIds = Array.from(
    new Set(
      designLogRows
        .map((row) => firstNonEmptyString(row.metadata?.quote_id, row.entity_id) ?? "")
        .filter((value) => Boolean(value) && isUuid(value))
    )
  );

  const quoteById = new Map<string, LinkedQuote>();
  if (linkedQuoteIds.length > 0) {
    const linked = await readLinkedQuotes(teamId, linkedQuoteIds);
    for (const row of linked) {
      const customerId = firstNonEmptyString(row.customer_id);
      const party = customerId ? partyByTypedId.get(`customer:${customerId}`) ?? null : null;
      const customerName = party?.label ?? firstNonEmptyString(row.customer_name, row.title);
      quoteById.set(row.id, {
        id: row.id,
        number: firstNonEmptyString(row.number),
        customerName,
        customerLogoUrl: party?.logoUrl ?? normalizeCustomerLogoUrl(row.customer_logo_url ?? null),
        customerId,
        customerType: customerId
          ? "customer"
          : customerName
            ? partyByNormalizedName.get(normalizeLookupKey(customerName))?.entityType ?? null
            : null,
      });
    }
  }

  const designTasks = designLogRows.map((row) =>
    parseDesignTask(row, { memberByUserId, partyByTypedId, partyByNormalizedName, quoteById })
  );

  const activity: OverviewActivityRow[] = activityRows.map((row) => {
    const actorName = row.actor_name?.trim() || "Користувач";
    const member =
      (row.user_id ? memberByUserId.get(row.user_id) : null) ??
      memberByNormalizedName.get(normalizeLookupKey(actorName)) ??
      null;
    return {
      id: row.id,
      title: row.title?.trim() || row.action?.trim() || "Подія",
      actorName: member?.label ?? actorName,
      avatarUrl: member?.avatarUrl ?? null,
      href: row.href ?? "/activity",
      at: formatDateTime(row.created_at),
    };
  });

  return { quotes, designTasks, activity };
}

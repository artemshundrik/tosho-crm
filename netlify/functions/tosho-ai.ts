import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type JsonRecord = Record<string, unknown>;

type ToShoAiMode = "ask" | "fix" | "route" | "resolve";
type ToShoAiStatus = "open" | "in_progress" | "waiting_user" | "resolved";
type ToShoAiPriority = "low" | "medium" | "high" | "urgent";
type ToShoAiDomain =
  | "general"
  | "overview"
  | "orders"
  | "design"
  | "logistics"
  | "catalog"
  | "contractors"
  | "team"
  | "admin";

type RequestBody = {
  action?:
    | "bootstrap"
    | "send"
    | "feedback"
    | "update_request"
    | "upsert_knowledge"
    | "delete_knowledge"
    | "mention_suggestions";
  requestId?: string;
  messageId?: string;
  message?: string;
  mode?: ToShoAiMode;
  routeContext?: {
    pathname?: string;
    search?: string;
    href?: string;
    title?: string;
    routeLabel?: string;
    domainHint?: ToShoAiDomain;
    entityType?: string | null;
    entityId?: string | null;
  };
  includeHistory?: boolean;
  includeKnowledge?: boolean;
  mention?: {
    query?: string;
    kind?: "customer" | "lead" | "manager" | "designer" | "employee" | null;
  };
  feedback?: "helpful" | "not_helpful";
  status?: ToShoAiStatus;
  priority?: ToShoAiPriority;
  knowledge?: {
    id?: string;
    title?: string;
    slug?: string;
    summary?: string | null;
    body?: string;
    tags?: string[];
    keywords?: string[];
    status?: "active" | "draft" | "archived";
    sourceLabel?: string | null;
    sourceHref?: string | null;
  };
  attachments?: Array<{
    id?: string;
    fileName?: string;
    mimeType?: string | null;
    fileSize?: number | null;
    storageBucket?: string;
    storagePath?: string;
  }>;
};

type AuthContext = {
  userId: string;
  actorLabel: string;
  workspaceId: string;
  teamId: string;
  accessRole: string | null;
  jobRole: string | null;
  canManageQueue: boolean;
  canManageKnowledge: boolean;
};

type SupportRequestRow = {
  id: string;
  workspace_id: string;
  team_id: string;
  created_by: string;
  created_by_label?: string | null;
  assignee_user_id?: string | null;
  assignee_label?: string | null;
  mode: ToShoAiMode;
  status: ToShoAiStatus;
  priority: ToShoAiPriority;
  domain: ToShoAiDomain;
  title: string;
  summary?: string | null;
  route_label?: string | null;
  route_href?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  context?: JsonRecord | null;
  ai_confidence?: number | null;
  escalated_at?: string | null;
  resolved_at?: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type SupportMessageRow = {
  id: string;
  request_id: string;
  workspace_id: string;
  role: "user" | "assistant" | "human" | "system";
  user_id?: string | null;
  actor_label?: string | null;
  body: string;
  metadata?: JsonRecord | null;
  created_at: string;
};

type SupportFeedbackRow = {
  message_id?: string | null;
  value?: "helpful" | "not_helpful" | null;
};

type KnowledgeItemRow = {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  summary?: string | null;
  body: string;
  tags?: string[] | null;
  keywords?: string[] | null;
  status: "active" | "draft" | "archived";
  source_label?: string | null;
  source_href?: string | null;
  updated_at: string;
};

type RuntimeErrorRow = {
  title?: string | null;
  href?: string | null;
  created_at: string;
  metadata?: JsonRecord | null;
};

type SupportAttachmentInput = {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  storageBucket: string;
  storagePath: string;
};

type RoutingCandidate = {
  userId: string;
  label: string;
  avatarUrl: string | null;
  accessRole: string | null;
  jobRole: string | null;
  moduleAccess: Record<string, boolean>;
};

type AnalyticsPersonTarget = Pick<RoutingCandidate, "userId" | "label" | "avatarUrl" | "jobRole" | "accessRole" | "moduleAccess">;

type AnalyticsBadge = {
  label: string;
  value: number | string;
};

type AnalyticsRow = {
  id: string;
  label: string;
  avatarUrl?: string | null;
  primary: string;
  secondary?: string | null;
  badges?: AnalyticsBadge[];
};

type AnalyticsPayload = {
  kind: "people" | "entity";
  title: string;
  caption: string;
  avatarUrl?: string | null;
  metricLabel: string;
  rows: AnalyticsRow[];
  note?: string | null;
};

type AssistantDecision = {
  title: string;
  summary: string;
  answerMarkdown: string;
  playfulLine: string;
  status: ToShoAiStatus;
  priority: ToShoAiPriority;
  domain: ToShoAiDomain;
  confidence: number;
  shouldEscalate: boolean;
  shouldNotify: boolean;
  knowledgeIds: string[];
  internalSummary: string;
  analytics?: AnalyticsPayload | null;
};

type AnalyticsResult = {
  title: string;
  summary: string;
  markdown: string;
  domain: ToShoAiDomain;
  confidence: number;
  analytics: AnalyticsPayload;
};

const DEFAULT_ROUTE_CONTEXT = {
  pathname: "/overview",
  search: "",
  href: "/overview",
  title: "Огляд",
  routeLabel: "Огляд",
  domainHint: "general" as ToShoAiDomain,
  entityType: null,
  entityId: null,
};

const RUNTIME_ERROR_RECENCY_MS = 30 * 60 * 1000;

const OPENAI_STRUCTURED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "answer_markdown",
    "playful_line",
    "status",
    "priority",
    "domain",
    "confidence",
    "should_escalate",
    "should_notify",
    "knowledge_ids",
    "internal_summary",
  ],
  properties: {
    title: {
      type: "string",
      maxLength: 120,
    },
    summary: {
      type: "string",
      maxLength: 240,
    },
    answer_markdown: {
      type: "string",
      maxLength: 4000,
    },
    playful_line: {
      type: "string",
      maxLength: 180,
    },
    status: {
      type: "string",
      enum: ["open", "in_progress", "waiting_user", "resolved"],
    },
    priority: {
      type: "string",
      enum: ["low", "medium", "high", "urgent"],
    },
    domain: {
      type: "string",
      enum: ["general", "overview", "orders", "design", "logistics", "catalog", "contractors", "team", "admin"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    should_escalate: {
      type: "boolean",
    },
    should_notify: {
      type: "boolean",
    },
    knowledge_ids: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
    },
    internal_summary: {
      type: "string",
      maxLength: 300,
    },
  },
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

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

const SEARCH_STOP_TOKENS = new Set([
  "і",
  "й",
  "та",
  "або",
  "але",
  "в",
  "у",
  "на",
  "до",
  "по",
  "для",
  "це",
  "цей",
  "ця",
  "ці",
  "тут",
  "там",
  "мені",
  "треба",
]);

const SEARCH_WEAK_TOKENS = new Set([
  "як",
  "де",
  "що",
  "коли",
  "чому",
  "можна",
  "поясни",
  "покажи",
  "розкажи",
  "новий",
  "нова",
  "нове",
  "створити",
  "створення",
  "робити",
  "правильно",
  "саме",
  "відбувається",
]);

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeRole(value?: string | null) {
  return normalizeText(value).toLowerCase();
}

function normalizeMode(value?: string | null): ToShoAiMode {
  return value === "fix" || value === "route" || value === "resolve" ? value : "ask";
}

function normalizeStatus(value?: string | null): ToShoAiStatus {
  return value === "open" || value === "in_progress" || value === "waiting_user" || value === "resolved"
    ? value
    : "open";
}

function normalizePriority(value?: string | null): ToShoAiPriority {
  return value === "low" || value === "medium" || value === "high" || value === "urgent" ? value : "medium";
}

function normalizeDomain(value?: string | null): ToShoAiDomain {
  return value === "overview" ||
    value === "orders" ||
    value === "design" ||
    value === "logistics" ||
    value === "catalog" ||
    value === "contractors" ||
    value === "team" ||
    value === "admin"
    ? value
    : "general";
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Number(value)));
}

function buildActorLabel(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = normalizeText(typeof metadata.full_name === "string" ? metadata.full_name : null);
  const firstName = normalizeText(typeof metadata.first_name === "string" ? metadata.first_name : null);
  const lastName = normalizeText(typeof metadata.last_name === "string" ? metadata.last_name : null);
  const joinedName = normalizeText([firstName, lastName].filter(Boolean).join(" "));
  if (fullName) return fullName;
  if (joinedName) return joinedName;
  const email = normalizeText(user.email);
  if (email.includes("@")) return email.split("@")[0] || email;
  return email || "Користувач";
}

function sanitizeRouteContext(input: RequestBody["routeContext"]) {
  const pathname = normalizeText(input?.pathname || DEFAULT_ROUTE_CONTEXT.pathname) || DEFAULT_ROUTE_CONTEXT.pathname;
  const search = normalizeText(input?.search || "");
  const href = normalizeText(input?.href) || `${pathname}${search}`;
  return {
    pathname,
    search,
    href,
    title: normalizeText(input?.title || DEFAULT_ROUTE_CONTEXT.title) || DEFAULT_ROUTE_CONTEXT.title,
    routeLabel: normalizeText(input?.routeLabel || DEFAULT_ROUTE_CONTEXT.routeLabel) || DEFAULT_ROUTE_CONTEXT.routeLabel,
    domainHint: normalizeDomain(input?.domainHint || DEFAULT_ROUTE_CONTEXT.domainHint),
    entityType: normalizeText(input?.entityType) || null,
    entityId: normalizeText(input?.entityId) || null,
  };
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      normalizeText(value)
        .toLowerCase()
        .match(/[\p{L}\p{N}_-]{2,}/gu) ?? []
    )
  ).filter((token) => !SEARCH_STOP_TOKENS.has(token));
}

function trimTo(value: string, limit: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function toPlainList(value: unknown): string[] {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function toSupportAttachments(value: unknown): SupportAttachmentInput[] {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const typed = entry as {
        id?: unknown;
        fileName?: unknown;
        mimeType?: unknown;
        fileSize?: unknown;
        storageBucket?: unknown;
        storagePath?: unknown;
      };
      const storageBucket = normalizeText(typeof typed.storageBucket === "string" ? typed.storageBucket : "");
      const storagePath = normalizeText(typeof typed.storagePath === "string" ? typed.storagePath : "");
      const fileName = normalizeText(typeof typed.fileName === "string" ? typed.fileName : "");
      if (!storageBucket || !storagePath || !fileName) return null;

      return {
        id: normalizeText(typeof typed.id === "string" ? typed.id : "") || crypto.randomUUID(),
        fileName,
        mimeType: normalizeText(typeof typed.mimeType === "string" ? typed.mimeType : "") || null,
        fileSize:
          typeof typed.fileSize === "number" && Number.isFinite(typed.fileSize)
            ? typed.fileSize
            : typeof typed.fileSize === "string" && typed.fileSize.trim()
              ? Number(typed.fileSize)
              : null,
        storageBucket,
        storagePath,
      } satisfies SupportAttachmentInput;
    })
    .filter((value): value is SupportAttachmentInput => Boolean(value));
}

async function signSupportAttachment(
  adminClient: ReturnType<typeof createClient>,
  attachment: SupportAttachmentInput
) {
  const { data } = await adminClient.storage
    .from(attachment.storageBucket)
    .createSignedUrl(attachment.storagePath, 60 * 60);

  return {
    ...attachment,
    url: typeof data?.signedUrl === "string" ? data.signedUrl : null,
  };
}

function deriveDomainFromMessage(message: string, fallback: ToShoAiDomain) {
  const normalized = normalizeText(message).toLowerCase();
  if (/дизайн|макет|правк|preview|mockup|approval/u.test(normalized)) return "design";
  if (/логіст|відвантаж|доставк|ttn|посил/u.test(normalized)) return "logistics";
  if (/каталог|модель|товар|позиці/u.test(normalized)) return "catalog";
  if (/підряд|постачаль/u.test(normalized)) return "contractors";
  if (/команд|доступ|роль|профіл|співробіт/u.test(normalized)) return "team";
  if (/observability|runtime|error|адмін|лог/u.test(normalized)) return "admin";
  if (/замовл|коштор|прорах|кп|quote|order|customer|замовник/u.test(normalized)) return "orders";
  return fallback;
}

function isCapabilityQuestion(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return /^(чи можна|чи є|чи можна в|чи можна на|можна чи)/u.test(normalized) || /\b(в одному|разом|окремо|кілька|два|дві)\b/u.test(normalized);
}

function isInformationalQuestion(message: string, mode: ToShoAiMode) {
  if (mode !== "ask") return false;
  const normalized = normalizeText(message).toLowerCase();
  return /\?$/.test(message.trim()) || /^(як|де|що|коли|чому|поясни|покажи|розкажи|можна|чи)\b/u.test(normalized);
}

function hasIssueSignal(message: string, mode: ToShoAiMode) {
  if (mode === "fix") return true;
  const normalized = normalizeText(message).toLowerCase();
  return /не працю|злам|помилк|error|bug|не зберіга|не відкрива|збій/u.test(normalized);
}

function inferPriority(message: string, runtimeErrors: RuntimeErrorRow[], mode: ToShoAiMode) {
  const normalized = normalizeText(message).toLowerCase();
  if (/терміново|critical|urgent|горить|падає|зламал/u.test(normalized)) return "urgent" as ToShoAiPriority;
  if (runtimeErrors.length > 0 || /не працю|помилк|error|bug|не зберіга/u.test(normalized) || mode === "fix") {
    return "high" as ToShoAiPriority;
  }
  if (mode === "route" || mode === "resolve") return "medium" as ToShoAiPriority;
  return "low" as ToShoAiPriority;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value);
}

function formatShortPersonName(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return normalized;
  return `${parts[0]} ${parts[1][0]}.`;
}

function normalizePersonToken(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[ʼ’'`]/g, "")
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "");
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function personNameTokens(label: string) {
  const baseTokens = normalizeText(label)
    .split(/\s+/)
    .map(normalizePersonToken)
    .filter(Boolean);
  const aliases = new Set(baseTokens);
  if (baseTokens.includes("даря") || baseTokens.includes("дарья")) {
    aliases.add("даша");
    aliases.add("dasha");
  }
  if (baseTokens.includes("олена") || baseTokens.includes("лена")) {
    aliases.add("ліна");
    aliases.add("лина");
  }
  return Array.from(aliases);
}

function findAnalyticsPersonMatches(message: string, members: RoutingCandidate[]) {
  const queryTokens = stripAnalyticsQueryTerms(message)
    .split(/\s+/)
    .map(normalizePersonToken)
    .filter((token) => token.length >= 2);
  if (queryTokens.length === 0) return [] as RoutingCandidate[];

  return members
    .map((member) => {
      const tokens = personNameTokens(member.label);
      let score = 0;
      for (const queryToken of queryTokens) {
        for (const token of tokens) {
          if (queryToken === token) score += 12;
          else if (token.startsWith(queryToken) || queryToken.startsWith(token)) score += 8;
          else if (queryToken.length >= 4 && token.length >= 4 && levenshteinDistance(queryToken, token) <= 1) score += 5;
        }
      }
      return { member, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.member.label.localeCompare(b.member.label, "uk"))
    .slice(0, 5)
    .map((entry) => entry.member);
}

function analyticsPersonRoleLabel(member: AnalyticsPersonTarget) {
  const role = normalizeRole(member.jobRole);
  if (role === "designer" || role === "дизайнер") return "Дизайнер";
  if (role === "manager" || role === "менеджер" || role === "sales_manager" || role === "junior_sales_manager") return "Менеджер";
  if (role === "pm") return "PM";
  if (role === "logistics" || role === "head_of_logistics") return "Логіст";
  if (role === "seo") return "Адмін";
  if (member.moduleAccess.design) return "Дизайн";
  if (member.moduleAccess.orders) return "Збут";
  if (member.moduleAccess.logistics) return "Логістика";
  if (member.moduleAccess.catalog) return "Каталог";
  if (member.moduleAccess.contractors) return "Підрядники";
  if (member.moduleAccess.team) return "Команда";
  return "Команда";
}

function formatDesignTaskTypeLabel(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  const labels: Record<string, string> = {
    visualization: "Візуалізація",
    visualization_layout_adaptation: "Візуал + адаптація макету",
    layout_adaptation: "Адаптація макету",
    layout: "Макет",
    presentation: "Презентація",
    creative: "Креатив",
    "без типу": "Без типу",
    none: "Без типу",
  };
  return labels[normalized] ?? value.replace(/_/g, " ");
}

function formatQuoteStatusLabel(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  const labels: Record<string, string> = {
    new: "Новий",
    draft: "Чернетка",
    estimating: "Рахується",
    estimated: "Пораховано",
    awaiting_approval: "На погодженні",
    approved: "Затверджено",
    rejected: "Відхилено",
    cancelled: "Скасовано",
    canceled: "Скасовано",
    archived: "Архів",
    "без статусу": "Без статусу",
  };
  return labels[normalized] ?? value.replace(/_/g, " ");
}

function formatOrderStatusLabel(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  const labels: Record<string, string> = {
    new: "Нове",
    pending: "Очікує",
    in_progress: "В роботі",
    production: "У виробництві",
    ready: "Готове",
    ready_to_ship: "Готове до відправки",
    shipped: "Відправлено",
    completed: "Завершено",
    cancelled: "Скасовано",
    canceled: "Скасовано",
    "без статусу": "Без статусу",
  };
  return labels[normalized] ?? value.replace(/_/g, " ");
}

function formatDeliveryStatusLabel(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  const labels: Record<string, string> = {
    not_shipped: "Не відвантажено",
    preparing_shipment: "Готується до відвантаження",
    shipped: "Відвантажено",
    delivered: "Доставлено",
    partially_delivered: "Частково доставлено",
    unclaimed: "Не забрано",
    "без статусу": "Без статусу",
  };
  return labels[normalized] ?? value.replace(/_/g, " ");
}

function formatAnalyticsBadges(input: Record<string, number>, labelFn: (value: string) => string) {
  return Object.entries(input)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label: labelFn(label), value: formatInteger(value) }));
}

function formatAnalyticsBadgeLine(input: Record<string, number>, labelFn: (value: string) => string) {
  return formatAnalyticsBadges(input, labelFn)
    .map((badge) => `${badge.label}: ${badge.value}`)
    .join(" · ");
}

function parsePeriodFromMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  const now = new Date();
  let start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let label = "за останні 30 днів";
  const wordToNumber: Record<string, number> = {
    "один": 1,
    "одна": 1,
    "одно": 1,
    "два": 2,
    "дві": 2,
    "три": 3,
    "чотири": 4,
    "п'ять": 5,
    "пять": 5,
    "шість": 6,
    "сім": 7,
    "вісім": 8,
    "дев'ять": 9,
    "девять": 9,
    "десять": 10,
  };
  const parseCount = (digits?: string, word?: string, fallback = 1) => {
    const rawCount = digits ? Number(digits) : wordToNumber[word ?? ""] ?? fallback;
    return Math.max(1, Math.min(3650, Number.isFinite(rawCount) ? rawCount : fallback));
  };

  if (/весь\s+час|за\s+весь\s+час|за\s+всі\s+часи|all\s*time|увесь\s+час/u.test(normalized)) {
    return { sinceIso: null as string | null, label: "за весь час" };
  }

  const monthCountMatch = normalized.match(
    /(?:за\s+)?(?:(\d+)|(один|одна|два|дві|три|чотири|п'ять|пять|шість|сім|вісім|дев'ять|девять|десять))\s+місяц/iu
  );
  const dayCountMatch = normalized.match(
    /(?:за\s+)?(?:(\d+)|(один|одна|два|дві|три|чотири|п'ять|пять|шість|сім|вісім|дев'ять|девять|десять))\s+д(?:ень|ні|ня|нів)/iu
  );
  const weekCountMatch = normalized.match(
    /(?:за\s+)?(?:(\d+)|(один|одна|два|дві|три|чотири|п'ять|пять|шість|сім|вісім|дев'ять|девять|десять))\s+тиж/u
  );
  const yearCountMatch = normalized.match(
    /(?:за\s+)?(?:(\d+)|(один|одна|два|дві|три|чотири|п'ять|пять|шість|сім|вісім|дев'ять|девять|десять))?\s*(?:рік|роки|років)\b/iu
  );

  if (monthCountMatch) {
    const monthCount = Math.min(120, parseCount(monthCountMatch[1], monthCountMatch[2], 1));
    start = new Date(now.getTime() - monthCount * 30 * 24 * 60 * 60 * 1000);
    label = monthCount === 1 ? "за останній місяць" : `за останні ${monthCount} міс.`;
  } else if (dayCountMatch) {
    const dayCount = parseCount(dayCountMatch[1], dayCountMatch[2], 1);
    start = new Date(now.getTime() - dayCount * 24 * 60 * 60 * 1000);
    label = dayCount === 1 ? "за останній день" : `за останні ${dayCount} днів`;
  } else if (weekCountMatch) {
    const weekCount = parseCount(weekCountMatch[1], weekCountMatch[2], 1);
    start = new Date(now.getTime() - weekCount * 7 * 24 * 60 * 60 * 1000);
    label = weekCount === 1 ? "за останній тиждень" : `за останні ${weekCount} тиж.`;
  } else if (yearCountMatch) {
    const yearCount = parseCount(yearCountMatch[1], yearCountMatch[2], 1);
    start = new Date(now.getTime() - yearCount * 365 * 24 * 60 * 60 * 1000);
    label = yearCount === 1 ? "за останній рік" : `за останні ${yearCount} роки`;
  } else if (/сьогодні|today/u.test(normalized)) {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    label = "за сьогодні";
  } else if (/тижд|7\s*д/u.test(normalized)) {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    label = "за останні 7 днів";
  } else if (/поточн(ий|ому|ого)\s+місяц|цього\s+місяц/u.test(normalized)) {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    label = "за поточний календарний місяць";
  } else if (/квартал|90\s*д/u.test(normalized)) {
    start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    label = "за останні 90 днів";
  }

  return { sinceIso: start.toISOString() as string | null, label };
}

function normalizeAnalyticsName(value: string | null | undefined) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeLooseAnalyticsName(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[«»"“”'ʼ’.,()[\]{}:;|/_\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looseAnalyticsNameMatches(left: string | null | undefined, right: string | null | undefined) {
  const leftNormalized = normalizeLooseAnalyticsName(left);
  const rightNormalized = normalizeLooseAnalyticsName(right);
  return Boolean(
    leftNormalized &&
      rightNormalized &&
      (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized))
  );
}

function stripAnalyticsQueryTerms(message: string) {
  return normalizeText(message)
    .replace(/[?!.]+$/g, "")
    .replace(
      /\b(а|і|й|ще|скільки|порахуй|порахувати|рахуй|покажи|дай|зріз|статистика|статистику|стату|за|останній|останні|весь|всі|час|рік|роки|років|місяць|місяці|місяців|днів|день|дні|тиждень|тижні|поточний|цього|найбільше|більше|всього|якого|яким|яких|у|в|ліда|лід|замовника|замовник|замовників|замовниках|замовники|клієнта|клієнт|клієнтів|клієнтах|клієнти|прорахунків|прорахунки|прорахунок|замовлень|замовлення|менеджерам|менеджерах|менеджери|менеджера|иенеджерам|иенеджерах|иенеджери|дизайнерам|дизайнерах|дизайнери|дизайнів|дизайни|дизайн|тасок|задач|зробив|зробила|зробили|кожен|кожного|по)\b/giu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractPartySearchQuery(message: string) {
  const normalized = normalizeText(message)
    .replace(/[?!.]+$/g, "")
    .replace(/[ʼ’']/g, "'");
  const match = normalized.match(
    /(?:^|\s)(?:у|в|по|для)?\s*(?:замовника|замовнику|клієнта|клієнту|контрагента|контрагенту|ліда|ліду)\s+(.+?)\s*(?:\s+(?:прорахунків|прорахунки|прорахунок|замовлень|замовлення)(?:\s|$)|\s+за\s+(?:весь\s+час|всі\s+часи|(?:останн(?:ій|і|ю)\s+)?(?:день|дні|днів|тиждень|тижні|місяць|місяці|місяців|квартал|рік|роки|років|[0-9]+\s*(?:дн(?:ів|і)?|місяц(?:ь|і|ів)?|тиж(?:день|ні)?|рок(?:и|ів)?)))|\s+цього\s+місяц[яю]|\s+поточн(?:ий|ого|ому)\s+місяц[яю]|$)/iu
  );
  const query = normalizeText(match?.[1]);
  if (!query) return "";
  return query
    .replace(
      /\b(прорахунків|прорахунки|прорахунок|замовлень|замовлення|скільки|порахуй|рахуй|покажи|дай|і|й|та)\b/giu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateLatinToUkrainian(value: string) {
  const lower = normalizeText(value).toLowerCase();
  if (!/[a-z]/i.test(lower)) return "";
  const pairs: Array<[string, string]> = [
    ["shch", "щ"],
    ["sch", "щ"],
    ["zh", "ж"],
    ["kh", "х"],
    ["ts", "ц"],
    ["ch", "ч"],
    ["sh", "ш"],
    ["yu", "ю"],
    ["ya", "я"],
    ["ye", "є"],
    ["yi", "ї"],
    ["a", "а"],
    ["b", "б"],
    ["v", "в"],
    ["h", "г"],
    ["g", "г"],
    ["d", "д"],
    ["e", "е"],
    ["z", "з"],
    ["y", "и"],
    ["i", "і"],
    ["j", "й"],
    ["k", "к"],
    ["l", "л"],
    ["m", "м"],
    ["n", "н"],
    ["o", "о"],
    ["p", "п"],
    ["r", "р"],
    ["s", "с"],
    ["t", "т"],
    ["u", "у"],
    ["f", "ф"],
    ["c", "к"],
  ];
  let result = lower;
  for (const [from, to] of pairs) {
    result = result.replace(new RegExp(from, "g"), to);
  }
  return result;
}

function buildPartySearchVariants(query: string) {
  const variants = new Set<string>();
  const normalized = normalizeText(query)
    .replace(/[?!.,"`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized) variants.add(normalized);

  for (const token of normalized.split(/\s+/).filter((item) => item.length >= 3)) {
    variants.add(token);
  }

  const transliterated = transliterateLatinToUkrainian(normalized);
  if (transliterated) {
    variants.add(transliterated);
    variants.add(transliterated.replace(/і\b/giu, "и"));
    if (transliterated.length > 5) variants.add(transliterated.slice(0, -1));
    for (const token of transliterated.split(/\s+/).filter((item) => item.length >= 4)) {
      variants.add(token);
      if (token.endsWith("і") || token.endsWith("и")) variants.add(token.slice(0, -1));
    }
  }

  return Array.from(variants)
    .map((item) => normalizeText(item))
    .filter((item, index, list) => item.length >= 3 && list.indexOf(item) === index)
    .slice(0, 8);
}

function escapeIlikeValue(value: string) {
  return normalizeText(value)
    .replace(/[(),]/g, " ")
    .replace(/[%_]/g, "\\$&")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPartyOrFilter(fields: string[], variants: string[]) {
  return variants
    .map(escapeIlikeValue)
    .filter(Boolean)
    .flatMap((variant) => fields.map((field) => `${field}.ilike.%${variant}%`))
    .join(",");
}

function scorePartySearchCandidate(name: string, variants: string[]) {
  const normalizedName = normalizeAnalyticsName(name);
  const compactName = normalizedName.replace(/\s+/g, "");
  return variants.reduce((score, variant) => {
    const normalizedVariant = normalizeAnalyticsName(variant);
    const compactVariant = normalizedVariant.replace(/\s+/g, "");
    if (!normalizedVariant) return score;
    if (normalizedName === normalizedVariant) return score + 100;
    if (normalizedName.includes(normalizedVariant)) return score + 40 + normalizedVariant.length;
    if (compactName.includes(compactVariant)) return score + 30 + compactVariant.length;
    return score;
  }, 0);
}

function hasManagerAnalyticsTerm(normalized: string) {
  return /(менеджер|менеджер|менедж|иенедж|mene|manager)/u.test(normalized);
}

function hasCustomerAnalyticsTerm(normalized: string) {
  return /(замовник|клієнт|контрагент|customer)/u.test(normalized);
}

function hasLogisticsAnalyticsTerm(normalized: string) {
  return /(логіст|логістик|відвантаж|відправ|доставк|ттн|ttn|посил|шип|ship)/u.test(normalized);
}

function hasEmployeeAnalyticsTerm(normalized: string) {
  return /(співробітник|співробітниц|користувач|людин|команд|працівник|працівниц|employee|user)/u.test(normalized);
}

function hasAdminObservabilityTerm(normalized: string) {
  return /(адмін|admin|observability|обсерваб|перформанс|performance|runtime|error|errors|помилк|баг|bug|bugs|сховищ|storage|вкладенн|attachment|backup|бекап|чи\s+все\s+норм|стан\s+систем)/u.test(
    normalized
  );
}

function hasPersonalActionPlanTerm(normalized: string) {
  return (
    /(що\s+(мені|робити|далі)|план|задач[іи]|фокус|пріоритет|сьогодні|завтра|дотис|кому\s+(дзвонити|писати|нагадати)|кого\s+(дотиснути|повернути)|мої|моїх|моє)/u.test(
      normalized
    ) ||
    /(зависл|без\s+руху|ризик|просроч|простроч|горить|важлив)/u.test(normalized)
  );
}

function shouldRunAnalytics(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  const hasAnalyticsVerb =
    /(скільки|хто|порах|рахуй|статист|звіт|аналітик|топ|зріз|список|перелік|найбільш|більше\s+всього|по\s+дизайн)/u.test(
      normalized
    ) ||
    /по\s+(менедж|иенедж)/u.test(normalized) ||
    /у\s+якого\s+(замовник|клієнт)/u.test(normalized);
  if (hasAdminObservabilityTerm(normalized)) return true;
  if (hasPersonalActionPlanTerm(normalized)) return true;
  if (!hasAnalyticsVerb) return false;
  return (
    /(дизайн|дизайнер|таск|задач|прорах|quote|коштор|замовл|order|лід|замовник|клієнт|контрагент)/u.test(
      normalized
    ) ||
    hasManagerAnalyticsTerm(normalized) ||
    hasLogisticsAnalyticsTerm(normalized) ||
    hasEmployeeAnalyticsTerm(normalized) ||
    stripAnalyticsQueryTerms(message).length > 0
  );
}

function hasAnalyticsFollowUpSignal(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  if (!normalized || normalized.length > 120) return false;
  return /^(а|і|й|ще|а\s+ще|а\s+за|за|по|тепер|тоді)\b/u.test(normalized) ||
    /(тижд|місяц|квартал|сьогодні|вчора|днів|дні|замовл|прорах|дизайн|таск|задач|менеджер|замовник|клієнт|контрагент|лід)/u.test(normalized);
}

type AnalyticsMetricIntent = "quotes" | "orders" | "design" | "customers" | null;

function detectAnalyticsMetricIntent(message: string): AnalyticsMetricIntent {
  const normalized = normalizeText(message).toLowerCase();
  if (hasLogisticsAnalyticsTerm(normalized)) return "orders";
  if (/(дизайн|дизайнер|дизайнів|таск|тасок|задач)/u.test(normalized)) return "design";
  if (/(замовл|order)/u.test(normalized) && !/(замовник|замовників|клієнт|контрагент)/u.test(normalized)) {
    return "orders";
  }
  if (/(замовник|замовників|клієнт|контрагент)/u.test(normalized) && !/(прорах|quote|коштор|кп)/u.test(normalized)) {
    return "customers";
  }
  if (/(прорах|quote|коштор|кп)/u.test(normalized)) return "quotes";
  return null;
}

function metricIntentPhrase(metric: AnalyticsMetricIntent) {
  if (metric === "orders") return "замовлень";
  if (metric === "design") return "дизайнів";
  if (metric === "customers") return "замовників";
  return "прорахунків";
}

function extractFollowUpTarget(message: string) {
  const normalized = normalizeText(message)
    .replace(/[?!.]+$/g, "")
    .replace(/\b(а|і|й|ще|тепер|тоді)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/(?:^|\s)(?:у|в|по|для)\s+(.+?)(?:\s+(?:за|скільки|прорах|замовл|дизайн|таск|задач)\b|$)/iu);
  const target = normalizeText(match?.[1]);
  if (!target) return "";
  return target
    .replace(
      /\b(нього|неї|них|цього|цьому|цій|цей|замовника|замовнику|клієнта|клієнту|контрагента|контрагенту|ліда|ліду|менеджера|дизайнера)\b/giu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function hasPartyAnalyticsContext(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return /(замовник|клієнт|контрагент|лід)/u.test(normalized);
}

function hasPersonAnalyticsContext(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return /(менеджер|дизайнер|логіст|співробітник|користувач|команд|працівник)/u.test(normalized);
}

function extractFollowUpPeriodHint(message: string) {
  const normalized = normalizeText(message).replace(/[?!.]+$/g, "");
  if (/весь\s+час|за\s+весь\s+час|за\s+всі\s+часи|увесь\s+час/iu.test(normalized)) return "за весь час";
  const explicit = normalized.match(
    /\bза\s+(?:останн(?:ій|і|ю)\s+)?(?:(?:\d+|один|одна|два|дві|три|чотири|п'ять|пять|шість|сім|вісім|дев'ять|девять|десять)\s+)?(?:дн(?:і|ів|я)|день|тиждень|тижні|місяць|місяці|місяців|квартал|рік|роки|років)\b/iu
  );
  if (explicit?.[0]) return explicit[0];
  if (/сьогодні|today/iu.test(normalized)) return "за сьогодні";
  if (/вчора/iu.test(normalized)) return "за вчора";
  if (/тижд/iu.test(normalized)) return "за останній тиждень";
  if (/місяц/iu.test(normalized)) return "за місяць";
  if (/квартал/iu.test(normalized)) return "за квартал";
  return "";
}

function buildAnalyticsMessageWithContext(message: string, recentMessages: SupportMessageRow[]) {
  if (shouldRunAnalytics(message)) return message;
  if (!hasAnalyticsFollowUpSignal(message)) return message;
  const previousUserAnalyticsMessage = [...recentMessages]
    .reverse()
    .find((entry) => entry.role === "user" && shouldRunAnalytics(entry.body));
  if (!previousUserAnalyticsMessage) return message;

  const previousMessage = previousUserAnalyticsMessage.body;
  const currentMetric = detectAnalyticsMetricIntent(message);
  const previousMetric = detectAnalyticsMetricIntent(previousMessage);
  const metric = currentMetric ?? previousMetric;
  const target = extractFollowUpTarget(message);

  if (target) {
    const targetPrefix =
      hasPartyAnalyticsContext(previousMessage) && !hasPersonAnalyticsContext(previousMessage)
        ? "у замовника"
        : "у";
    const periodTail = extractFollowUpPeriodHint(message);
    return `скільки ${metricIntentPhrase(metric)} ${targetPrefix} ${target}${periodTail ? ` ${periodTail}` : ""}?`;
  }

  if (currentMetric) {
    const previousTarget = extractPartySearchQuery(previousMessage) || stripAnalyticsQueryTerms(previousMessage);
    if (previousTarget) {
      const targetPrefix =
        hasPartyAnalyticsContext(previousMessage) && !hasPersonAnalyticsContext(previousMessage)
          ? "у замовника"
          : "у";
      const periodTail = extractFollowUpPeriodHint(message) || extractFollowUpPeriodHint(previousMessage);
      return `скільки ${metricIntentPhrase(currentMetric)} ${targetPrefix} ${previousTarget}${periodTail ? ` ${periodTail}` : ""}?`;
    }
  }

  return `${previousMessage}\n${message}`;
}

function toAnalyticsDecision(result: AnalyticsResult): AssistantDecision {
  return {
    title: result.title,
    summary: result.summary,
    answerMarkdown: result.markdown,
    playfulLine: "Порахував по живих даних CRM.",
    status: "waiting_user",
    priority: "low",
    domain: result.domain,
    confidence: result.confidence,
    shouldEscalate: false,
    shouldNotify: false,
    knowledgeIds: [],
    internalSummary: result.summary,
    analytics: result.analytics,
  };
}

async function resolveAuthContext(
  userClient: ReturnType<typeof createClient>,
  adminClient: ReturnType<typeof createClient>
): Promise<AuthContext> {
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    throw new Error("Unauthorized");
  }

  const user = userData.user;
  const actorLabel = buildActorLabel(user);

  const { data: membershipRows, error: membershipError } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id,access_role,job_role")
    .eq("user_id", user.id)
    .limit(1);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const membership = ((membershipRows ?? []) as Array<{
    workspace_id?: string | null;
    access_role?: string | null;
    job_role?: string | null;
  }>)[0];

  const workspaceId = normalizeText(membership?.workspace_id);
  if (!workspaceId) {
    throw new Error("Workspace not found");
  }

  let teamId = workspaceId;
  const teamAttempts = [
    () =>
      userClient
        .schema("tosho")
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .limit(1),
    () => userClient.from("team_members").select("team_id").eq("user_id", user.id).limit(1),
  ];

  for (const run of teamAttempts) {
    try {
      const { data } = await run();
      const candidate = ((data ?? []) as Array<{ team_id?: string | null }>)[0];
      if (candidate?.team_id) {
        teamId = candidate.team_id;
        break;
      }
    } catch {
      // Ignore and keep workspace fallback.
    }
  }

  const accessRole = normalizeText(membership?.access_role) || null;
  const jobRole = normalizeText(membership?.job_role) || null;
  const normalizedAccessRole = normalizeRole(accessRole);
  const normalizedJobRole = normalizeRole(jobRole);
  const canManageQueue =
    normalizedAccessRole === "owner" ||
    normalizedAccessRole === "admin" ||
    normalizedJobRole === "seo" ||
    normalizedJobRole === "manager" ||
    normalizedJobRole === "pm";
  const canManageKnowledge =
    normalizedAccessRole === "owner" ||
    normalizedAccessRole === "admin" ||
    normalizedJobRole === "seo" ||
    normalizedJobRole === "manager";

  // Light existence check via admin client so follow-up queries fail fast.
  const { error: workspaceCheckError } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .limit(1);
  if (workspaceCheckError) {
    throw new Error(workspaceCheckError.message);
  }

  return {
    userId: user.id,
    actorLabel,
    workspaceId,
    teamId,
    accessRole,
    jobRole,
    canManageQueue,
    canManageKnowledge,
  };
}

async function listKnowledgeItems(
  adminClient: ReturnType<typeof createClient>,
  workspaceId: string,
  canManageKnowledge: boolean
) {
  let query = adminClient
    .schema("tosho")
    .from("support_knowledge_items")
    .select("id,workspace_id,title,slug,summary,body,tags,keywords,status,source_label,source_href,updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (!canManageKnowledge) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query.limit(canManageKnowledge ? 24 : 8);
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeItemRow[];
}

function scoreKnowledgeItem(item: KnowledgeItemRow, queryText: string, routeLabel: string) {
  const queryTokens = tokenize(queryText);
  const routeTokens = tokenize(routeLabel);
  const strongQueryTokens = queryTokens.filter((token) => !SEARCH_WEAK_TOKENS.has(token));
  const capabilityQuestion = isCapabilityQuestion(queryText);
  if (queryTokens.length === 0 && routeTokens.length === 0) return 0;

  const title = normalizeText(item.title).toLowerCase();
  const summary = normalizeText(item.summary).toLowerCase();
  const body = normalizeText(item.body).toLowerCase();
  const tags = (item.tags ?? []).join(" ").toLowerCase();
  const keywords = (item.keywords ?? []).join(" ").toLowerCase();
  const haystacks = [title, summary, tags, keywords, body];

  const scoreToken = (token: string) => {
    let score = 0;
    if (title.includes(token)) score += 7;
    if (summary.includes(token)) score += 5;
    if (tags.includes(token)) score += 4;
    if (keywords.includes(token)) score += 4;
    if (body.includes(token)) score += 2;
    return score;
  };

  let score = 0;
  let strongMatches = 0;

  for (const token of strongQueryTokens) {
    const tokenScore = scoreToken(token);
    if (tokenScore > 0) {
      strongMatches += 1;
      score += tokenScore * 1.2;
    }
  }

  if (strongQueryTokens.length > 0 && strongMatches === 0) {
    return 0;
  }

  if (capabilityQuestion && strongQueryTokens.length >= 2 && strongMatches < Math.min(2, strongQueryTokens.length)) {
    return 0;
  }

  for (const token of queryTokens) {
    if (strongQueryTokens.includes(token)) continue;
    score += scoreToken(token) * 0.35;
  }

  const routeMatches = routeTokens.filter((token) => haystacks.some((value) => value.includes(token))).length;
  score += routeMatches;

  if (strongQueryTokens.length === 0 && queryTokens.length > 0) {
    const anyQueryMatch = queryTokens.some((token) => haystacks.some((value) => value.includes(token)));
    if (!anyQueryMatch) return 0;
  }

  return score;
}

function selectKnowledgeCandidates(items: KnowledgeItemRow[], queryText: string, routeLabel: string) {
  return items
    .map((item) => ({
      item,
      score: scoreKnowledgeItem(item, queryText, routeLabel),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => entry.item);
}

async function listRuntimeErrors(
  adminClient: ReturnType<typeof createClient>,
  teamId: string,
  userId: string,
  routeHref: string,
  pathname: string
) {
  const { data, error } = await adminClient
    .schema("tosho")
    .from("runtime_errors")
    .select("title,href,created_at,metadata")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) return [] as RuntimeErrorRow[];
  const rows = ((data ?? []) as RuntimeErrorRow[]).filter((row) => {
    const createdAtMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdAtMs)) return false;
    return Date.now() - createdAtMs <= RUNTIME_ERROR_RECENCY_MS;
  });
  const exactMatches = rows.filter((row) => normalizeText(row.href) === normalizeText(routeHref));
  if (exactMatches.length > 0) return exactMatches;
  const routeMatches = rows.filter((row) => normalizeText(row.href).startsWith(pathname));
  if (routeMatches.length > 0) return routeMatches;
  return rows.slice(0, 3);
}

async function listRoutingCandidates(
  adminClient: ReturnType<typeof createClient>,
  workspaceId: string
) {
  const [{ data: membershipsData, error: membershipsError }, { data: profilesData, error: profilesError }] =
    await Promise.all([
      adminClient
        .schema("tosho")
        .from("memberships_view")
        .select("workspace_id,user_id,email,access_role,job_role")
        .eq("workspace_id", workspaceId),
      adminClient
        .schema("tosho")
        .from("team_member_profiles")
        .select("workspace_id,user_id,full_name,avatar_url,avatar_path,module_access")
        .eq("workspace_id", workspaceId),
    ]);

  if (membershipsError) throw new Error(membershipsError.message);
  if (profilesError) throw new Error(profilesError.message);

  const profiles = new Map(
    ((profilesData ?? []) as Array<{
      user_id?: string | null;
      full_name?: string | null;
      avatar_url?: string | null;
      avatar_path?: string | null;
      module_access?: unknown;
    }>).map((profile) => {
      const moduleAccessInput = (profile.module_access ?? {}) as Record<string, unknown>;
      return [
        profile.user_id ?? "",
        {
          fullName: normalizeText(profile.full_name),
          avatarUrl: normalizeText(profile.avatar_url || profile.avatar_path) || null,
          moduleAccess: {
            overview: Boolean(moduleAccessInput.overview),
            orders: Boolean(moduleAccessInput.orders),
            design: Boolean(moduleAccessInput.design),
            logistics: Boolean(moduleAccessInput.logistics),
            catalog: Boolean(moduleAccessInput.catalog),
            contractors: Boolean(moduleAccessInput.contractors),
            team: Boolean(moduleAccessInput.team),
          },
        },
      ];
    })
  );

  return ((membershipsData ?? []) as Array<{
    user_id?: string | null;
    email?: string | null;
    access_role?: string | null;
    job_role?: string | null;
  }>)
    .map((row) => {
      const userId = normalizeText(row.user_id);
      if (!userId) return null;
      const profile = profiles.get(userId);
      const email = normalizeText(row.email);
      const label =
        profile?.fullName ||
        (email.includes("@") ? email.split("@")[0] : email) ||
        userId.slice(0, 8);
      return {
        userId,
        label,
        avatarUrl: profile?.avatarUrl ?? null,
        accessRole: normalizeText(row.access_role) || null,
        jobRole: normalizeText(row.job_role) || null,
        moduleAccess: profile?.moduleAccess ?? {
          overview: true,
          orders: true,
          design: true,
          logistics: false,
          catalog: false,
          contractors: false,
          team: false,
        },
      } satisfies RoutingCandidate;
    })
    .filter((value): value is RoutingCandidate => Boolean(value));
}

function scoreRoutingCandidate(candidate: RoutingCandidate, domain: ToShoAiDomain) {
  const accessRole = normalizeRole(candidate.accessRole);
  const jobRole = normalizeRole(candidate.jobRole);
  let score = 0;

  if (accessRole === "owner") score += 100;
  if (accessRole === "admin") score += 85;
  if (jobRole === "seo") score += 60;
  if (jobRole === "manager") score += 50;
  if (jobRole === "pm") score += 45;

  if (domain === "orders" && candidate.moduleAccess.orders) score += 60;
  if (domain === "design" && (candidate.moduleAccess.design || jobRole === "designer" || jobRole === "дизайнер")) score += 60;
  if (domain === "logistics" && (candidate.moduleAccess.logistics || jobRole === "logistics" || jobRole === "pm")) score += 60;
  if (domain === "catalog" && candidate.moduleAccess.catalog) score += 60;
  if (domain === "contractors" && candidate.moduleAccess.contractors) score += 60;
  if (domain === "team" && (candidate.moduleAccess.team || accessRole === "owner" || accessRole === "admin")) score += 60;
  if (domain === "admin" && (accessRole === "owner" || accessRole === "admin" || jobRole === "seo")) score += 70;
  if (domain === "overview" && candidate.moduleAccess.overview) score += 40;
  if (domain === "general") score += 20;

  return score;
}

function rankRoutingRecipients(candidates: RoutingCandidate[], domain: ToShoAiDomain, requesterId: string) {
  return candidates
    .filter((candidate) => candidate.userId !== requesterId)
    .map((candidate) => ({
      candidate,
      score: scoreRoutingCandidate(candidate, domain),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.candidate);
}

type MentionKind = NonNullable<NonNullable<RequestBody["mention"]>["kind"]>;

function normalizeMentionKind(value: unknown): MentionKind | null {
  if (
    value === "customer" ||
    value === "lead" ||
    value === "manager" ||
    value === "designer" ||
    value === "employee"
  ) {
    return value;
  }
  return null;
}

function scoreMentionText(label: string, query: string) {
  const normalizedLabel = normalizeAnalyticsName(label);
  const normalizedQuery = normalizeAnalyticsName(query);
  if (!normalizedQuery) return 1;
  if (normalizedLabel === normalizedQuery) return 100;
  if (normalizedLabel.startsWith(normalizedQuery)) return 80;
  if (normalizedLabel.includes(normalizedQuery)) return 50;
  return 0;
}

function memberMatchesMentionKind(member: RoutingCandidate, kind: MentionKind | null) {
  if (!kind || kind === "employee") return true;
  const role = normalizeRole(member.jobRole);
  if (kind === "designer") return role === "designer" || role === "дизайнер";
  if (kind === "manager") return role === "manager" || role === "менеджер" || role === "sales_manager" || role === "junior_sales_manager" || role === "pm";
  return false;
}

async function handleMentionSuggestions(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  body: RequestBody;
}) {
  const query = normalizeText(params.body.mention?.query).slice(0, 80);
  const kind = normalizeMentionKind(params.body.mention?.kind);
  const suggestions: Array<{
    id: string;
    kind: MentionKind;
    label: string;
    subtitle: string | null;
    avatarUrl: string | null;
    insertText: string;
  }> = [];

  if (!kind || kind === "manager" || kind === "designer" || kind === "employee") {
    const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
    suggestions.push(
      ...members
        .filter((member) => memberMatchesMentionKind(member, kind))
        .map((member) => ({
          member,
          score: scoreMentionText(member.label, query),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.member.label.localeCompare(b.member.label, "uk"))
        .slice(0, 8)
        .map(({ member }) => {
          const roleLabel = analyticsPersonRoleLabel(member);
          const suggestionKind =
            kind === "manager" || kind === "designer"
              ? kind
              : roleLabel === "Дизайнер"
                ? "designer"
                : roleLabel === "Менеджер" || roleLabel === "PM"
                  ? "manager"
                  : "employee";
          return {
            id: member.userId,
            kind: suggestionKind,
            label: member.label,
            subtitle: roleLabel,
            avatarUrl: member.avatarUrl,
            insertText: member.label,
          };
        })
    );
  }

  if (!kind || kind === "customer") {
    const variants = buildPartySearchVariants(query);
    const customerFilter = variants.length > 0 ? buildPartyOrFilter(["name", "legal_name"], variants) : "";
    let customerQuery = params.adminClient
      .schema("tosho")
      .from("customers")
      .select("id,name,legal_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .limit(8);
    if (customerFilter) customerQuery = customerQuery.or(customerFilter);
    const { data } = await customerQuery;
    suggestions.push(
      ...((data ?? []) as Array<{ id: string; name?: string | null; legal_name?: string | null; logo_url?: string | null }>)
        .map((row) => ({
          row,
          score: scorePartySearchCandidate(`${row.name ?? ""} ${row.legal_name ?? ""}`, variants.length > 0 ? variants : [query]),
        }))
        .filter((entry) => !query || entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ row }) => {
          const label = normalizeText(row.name || row.legal_name) || row.id;
          return {
            id: row.id,
            kind: "customer" as const,
            label,
            subtitle: "Замовник",
            avatarUrl: normalizeText(row.logo_url) || null,
            insertText: label,
          };
        })
    );
  }

  if (!kind || kind === "lead") {
    const variants = buildPartySearchVariants(query);
    const leadFilter = variants.length > 0 ? buildPartyOrFilter(["company_name", "legal_name", "first_name", "last_name"], variants) : "";
    let leadQuery = params.adminClient
      .schema("tosho")
      .from("leads")
      .select("id,company_name,legal_name,first_name,last_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .limit(8);
    if (leadFilter) leadQuery = leadQuery.or(leadFilter);
    const { data } = await leadQuery;
    suggestions.push(
      ...((data ?? []) as Array<{
        id: string;
        company_name?: string | null;
        legal_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        logo_url?: string | null;
      }>)
        .map((row) => ({
          row,
          score: scorePartySearchCandidate(
            `${row.company_name ?? ""} ${row.legal_name ?? ""} ${row.first_name ?? ""} ${row.last_name ?? ""}`,
            variants.length > 0 ? variants : [query]
          ),
        }))
        .filter((entry) => !query || entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ row }) => {
          const person = [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(" ");
          const label = normalizeText(row.company_name || row.legal_name || person) || row.id;
          return {
            id: row.id,
            kind: "lead" as const,
            label,
            subtitle: "Лід",
            avatarUrl: normalizeText(row.logo_url) || null,
            insertText: label,
          };
        })
    );
  }

  const deduped = new Map<string, (typeof suggestions)[number]>();
  for (const suggestion of suggestions) {
    const key = `${suggestion.kind}:${suggestion.id}`;
    if (!deduped.has(key)) deduped.set(key, suggestion);
  }

  return { suggestions: Array.from(deduped.values()).slice(0, 10) };
}

async function buildDesignCompletionAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  targetMember?: AnalyticsPersonTarget | null;
}) {
  const period = parsePeriodFromMessage(params.message);
  const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const memberById = new Map(members.map((member) => [member.userId, member]));

  let query = params.adminClient
    .from("activity_log")
    .select("entity_id,metadata,created_at")
    .eq("team_id", params.auth.teamId)
    .eq("action", "design_task_status")
    .limit(10000);
  if (period.sinceIso) query = query.gte("created_at", period.sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const buckets = new Map<string, { userId: string; label: string; avatarUrl: string | null; total: number; byType: Record<string, number> }>();
  for (const row of (data ?? []) as Array<{ metadata?: JsonRecord | null }>) {
    const metadata = row.metadata ?? {};
    if (metadata.to_status !== "approved") continue;
    const userId = normalizeText(typeof metadata.assignee_user_id === "string" ? metadata.assignee_user_id : "");
    if (!userId) continue;
    if (params.targetMember && userId !== params.targetMember.userId) continue;
    const member = memberById.get(userId);
    const rawLabel = member?.label ?? normalizeText(typeof metadata.assignee_label === "string" ? metadata.assignee_label : "") ?? userId.slice(0, 8);
    const label = formatShortPersonName(rawLabel) || rawLabel;
    const taskType = normalizeText(typeof metadata.design_task_type === "string" ? metadata.design_task_type : "") || "без типу";
    const bucket = buckets.get(userId) ?? { userId, label, avatarUrl: member?.avatarUrl ?? null, total: 0, byType: {} };
    bucket.total += 1;
    bucket.byType[taskType] = (bucket.byType[taskType] ?? 0) + 1;
    buckets.set(userId, bucket);
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "uk"));
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const body =
    rows.length > 0
      ? params.targetMember
        ? `Готово. **${rows[0].label}** має ${formatInteger(rows[0].total)} завершених дизайн-задач ${period.label}.`
        : `Готово. Найбільше завершених дизайн-задач ${period.label}: **${rows[0].label}** — ${formatInteger(rows[0].total)}. Нижче розклав по людях і типах задач.`
      : params.targetMember
        ? `За цей період не знайшов завершених дизайн-задач у **${formatShortPersonName(params.targetMember.label) || params.targetMember.label}**.`
        : "За цей період не знайшов завершених дизайн-задач.";
  const analyticsRows: AnalyticsRow[] = rows.map((row) => ({
    id: row.userId,
    label: row.label,
    avatarUrl: row.avatarUrl,
    primary: `${formatInteger(row.total)} задач`,
    secondary: null,
    badges: formatAnalyticsBadges(row.byType, formatDesignTaskTypeLabel),
  }));

  return {
    title: "Дизайн-задачі по дизайнерах",
    summary: `Пораховано ${formatInteger(total)} завершених дизайн-задач ${period.label}.`,
    markdown: body,
    domain: "design",
    confidence: 0.94,
    analytics: {
      kind: "people",
      title: params.targetMember
        ? `Дизайн: ${formatShortPersonName(params.targetMember.label) || params.targetMember.label}`
        : "Дизайн-задачі",
      caption: `${formatInteger(total)} завершених задач ${period.label}`,
      metricLabel: "Завершено",
      rows: analyticsRows,
      note: "Рахую переходи дизайн-задач у статус approved.",
    },
  } satisfies AnalyticsResult;
}

async function buildPartyDesignCompletionAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
}) {
  const party = await resolvePartyForAnalytics(params);
  if (!party) return null;

  const period = parsePeriodFromMessage(params.message);
  const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const memberById = new Map(members.map((member) => [member.userId, member]));

  const { data: quoteData, error: quoteError } = await params.adminClient
    .schema("tosho")
    .from("quotes")
    .select("id,customer_id,customer_name,customer_logo_url")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (quoteError) throw new Error(quoteError.message);

  const quoteIds = new Set<string>();
  let logoUrl = party.logoUrl;
  for (const quote of (quoteData ?? []) as Array<{
    id?: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_logo_url?: string | null;
  }>) {
    const matchesParty =
      (party.kind === "customer" && quote.customer_id === party.id) ||
      looseAnalyticsNameMatches(quote.customer_name, party.name);
    if (!matchesParty || !quote.id) continue;
    quoteIds.add(quote.id);
    if (!logoUrl && quote.customer_logo_url) logoUrl = normalizeText(quote.customer_logo_url) || null;
  }

  let activityQuery = params.adminClient
    .from("activity_log")
    .select("entity_id,metadata,created_at")
    .eq("team_id", params.auth.teamId)
    .eq("action", "design_task_status")
    .limit(10000);
  if (period.sinceIso) activityQuery = activityQuery.gte("created_at", period.sinceIso);
  const { data, error } = await activityQuery;
  if (error) throw new Error(error.message);

  const buckets = new Map<string, { userId: string; label: string; avatarUrl: string | null; total: number; byType: Record<string, number> }>();
  for (const row of (data ?? []) as Array<{ metadata?: JsonRecord | null }>) {
    const metadata = row.metadata ?? {};
    if (metadata.to_status !== "approved") continue;

    const metadataQuoteId = normalizeText(typeof metadata.quote_id === "string" ? metadata.quote_id : "");
    const metadataCustomerId = normalizeText(typeof metadata.customer_id === "string" ? metadata.customer_id : "");
    const metadataCustomerName = normalizeText(typeof metadata.customer_name === "string" ? metadata.customer_name : "");
    const matchesParty =
      Boolean(metadataQuoteId && quoteIds.has(metadataQuoteId)) ||
      (party.kind === "customer" && metadataCustomerId === party.id) ||
      looseAnalyticsNameMatches(metadataCustomerName, party.name);
    if (!matchesParty) continue;

    const userId = normalizeText(typeof metadata.assignee_user_id === "string" ? metadata.assignee_user_id : "") || "unassigned";
    const member = memberById.get(userId);
    const rawLabel =
      member?.label ??
      normalizeText(typeof metadata.assignee_label === "string" ? metadata.assignee_label : "") ??
      "Без дизайнера";
    const label = userId === "unassigned" ? "Без дизайнера" : formatShortPersonName(rawLabel) || rawLabel;
    const taskType = normalizeText(typeof metadata.design_task_type === "string" ? metadata.design_task_type : "") || "без типу";
    const bucket = buckets.get(userId) ?? { userId, label, avatarUrl: member?.avatarUrl ?? null, total: 0, byType: {} };
    bucket.total += 1;
    bucket.byType[taskType] = (bucket.byType[taskType] ?? 0) + 1;
    buckets.set(userId, bucket);
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "uk"));
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const body =
    total > 0
      ? `Порахував дизайн-задачі по **${party.name}** ${period.label}: **${formatInteger(total)}** завершених.`
      : `По **${party.name}** ${period.label} не знайшов завершених дизайн-задач.`;

  return {
    title: `${party.kind === "customer" ? "Замовник" : "Лід"}: дизайн-задачі`,
    summary: `${party.name}: ${formatInteger(total)} завершених дизайн-задач ${period.label}.`,
    markdown: body,
    domain: "design",
    confidence: 0.9,
    analytics: {
      kind: "people",
      title: party.name,
      caption: `${formatInteger(total)} завершених задач ${period.label}`,
      avatarUrl: logoUrl,
      metricLabel: "Завершено",
      rows: rows.map((row) => ({
        id: row.userId,
        label: row.label,
        avatarUrl: row.avatarUrl,
        primary: `${formatInteger(row.total)} задач`,
        secondary: null,
        badges: formatAnalyticsBadges(row.byType, formatDesignTaskTypeLabel),
      })),
      note: `Рахую approved дизайн-задачі по customer_name${quoteIds.size > 0 ? " і пов'язаних quote_id" : ""}.`,
    },
  } satisfies AnalyticsResult;
}

async function buildManagerQuoteAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  targetMember?: AnalyticsPersonTarget | null;
}) {
  const period = parsePeriodFromMessage(params.message);
  const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const memberById = new Map(members.map((member) => [member.userId, member]));

  let query = params.adminClient
    .schema("tosho")
    .from("quotes")
    .select("id,status,total,assigned_to,created_by,created_at")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (period.sinceIso) query = query.gte("created_at", period.sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const buckets = new Map<string, { id: string; label: string; avatarUrl: string | null; total: number; approved: number; sum: number; byStatus: Record<string, number> }>();
  for (const row of (data ?? []) as Array<{ assigned_to?: string | null; created_by?: string | null; status?: string | null; total?: number | string | null }>) {
    const ownerId = normalizeText(row.assigned_to || row.created_by || "");
    if (!ownerId) continue;
    if (params.targetMember && ownerId !== params.targetMember.userId) continue;
    const member = memberById.get(ownerId);
    const rawLabel = member?.label ?? ownerId.slice(0, 8);
    const label = formatShortPersonName(rawLabel) || rawLabel;
    const status = normalizeText(row.status) || "без статусу";
    const amount = typeof row.total === "number" ? row.total : row.total ? Number(row.total) : 0;
    const bucket = buckets.get(ownerId) ?? { id: ownerId, label, avatarUrl: member?.avatarUrl ?? null, total: 0, approved: 0, sum: 0, byStatus: {} };
    bucket.total += 1;
    if (status === "approved") bucket.approved += 1;
    if (Number.isFinite(amount)) bucket.sum += amount;
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    buckets.set(ownerId, bucket);
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "uk"));
  const totalQuotes = rows.reduce((sum, row) => sum + row.total, 0);
  const approvedQuotes = rows.reduce((sum, row) => sum + row.approved, 0);
  const totalSum = rows.reduce((sum, row) => sum + row.sum, 0);
  const body =
    rows.length > 0
      ? params.targetMember
        ? `Готово. **${rows[0].label}** має ${formatInteger(totalQuotes)} прорахунків ${period.label}: ${formatInteger(approvedQuotes)} затверджено, сума ${formatMoney(totalSum)}.`
        : `Готово. ${period.label} знайшов **${formatInteger(totalQuotes)}** прорахунків по менеджерах: **${formatInteger(approvedQuotes)}** затверджено, сума **${formatMoney(totalSum)}**.`
      : params.targetMember
        ? `За цей період не знайшов прорахунків у **${formatShortPersonName(params.targetMember.label) || params.targetMember.label}**.`
        : "За цей період не знайшов прорахунків.";
  const analyticsRows: AnalyticsRow[] = rows.map((row) => ({
    id: row.id,
    label: row.label,
    avatarUrl: row.avatarUrl,
    primary: `${formatInteger(row.total)} прорах.`,
    secondary: `Затверджено ${formatInteger(row.approved)} · сума ${formatMoney(row.sum)}`,
    badges: formatAnalyticsBadges(row.byStatus, formatQuoteStatusLabel),
  }));

  return {
    title: "Прорахунки по менеджерах",
    summary: `Пораховано прорахунки по менеджерах ${period.label}.`,
    markdown: body,
    domain: "orders",
    confidence: 0.9,
    analytics: {
      kind: "people",
      title: params.targetMember
        ? `Прорахунки: ${formatShortPersonName(params.targetMember.label) || params.targetMember.label}`
        : "Прорахунки по менеджерах",
      caption: `${formatInteger(totalQuotes)} прорахунків ${period.label}`,
      metricLabel: "Прорахунки",
      rows: analyticsRows,
      note: "Менеджер береться з assigned_to, якщо його немає - з created_by.",
    },
  } satisfies AnalyticsResult;
}

async function buildManagerOrderAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  targetMember?: AnalyticsPersonTarget | null;
}) {
  const period = parsePeriodFromMessage(params.message);
  const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const memberById = new Map(members.map((member) => [member.userId, member]));

  let query = params.adminClient
    .schema("tosho")
    .from("orders")
    .select("id,total,manager_user_id,manager_label,order_status,created_at")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (period.sinceIso) query = query.gte("created_at", period.sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const buckets = new Map<string, { id: string; label: string; avatarUrl: string | null; total: number; sum: number; byStatus: Record<string, number> }>();
  for (const row of (data ?? []) as Array<{ manager_user_id?: string | null; manager_label?: string | null; order_status?: string | null; total?: number | string | null }>) {
    const key = normalizeText(row.manager_user_id || row.manager_label || "Без менеджера");
    if (params.targetMember && key !== params.targetMember.userId) continue;
    const member = row.manager_user_id ? memberById.get(row.manager_user_id) : null;
    const rawLabel = member?.label ?? (normalizeText(row.manager_label) || key);
    const label = formatShortPersonName(rawLabel) || rawLabel;
    const status = normalizeText(row.order_status) || "без статусу";
    const amount = typeof row.total === "number" ? row.total : row.total ? Number(row.total) : 0;
    const bucket = buckets.get(key) ?? { id: key, label, avatarUrl: member?.avatarUrl ?? null, total: 0, sum: 0, byStatus: {} };
    bucket.total += 1;
    if (Number.isFinite(amount)) bucket.sum += amount;
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    buckets.set(key, bucket);
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "uk"));
  const totalOrders = rows.reduce((sum, row) => sum + row.total, 0);
  const totalSum = rows.reduce((sum, row) => sum + row.sum, 0);
  const body =
    rows.length > 0
      ? params.targetMember
        ? `Готово. **${rows[0].label}** має ${formatInteger(totalOrders)} замовлень ${period.label}, сума ${formatMoney(totalSum)}.`
        : `Готово. ${period.label} знайшов **${formatInteger(totalOrders)}** замовлень по менеджерах, сума **${formatMoney(totalSum)}**.`
      : params.targetMember
        ? `За цей період не знайшов замовлень у **${formatShortPersonName(params.targetMember.label) || params.targetMember.label}**.`
        : "За цей період не знайшов замовлень.";
  const analyticsRows: AnalyticsRow[] = rows.map((row) => ({
    id: row.id,
    label: row.label,
    avatarUrl: row.avatarUrl,
    primary: `${formatInteger(row.total)} замовл.`,
    secondary: `Сума ${formatMoney(row.sum)}`,
    badges: formatAnalyticsBadges(row.byStatus, formatOrderStatusLabel),
  }));

  return {
    title: "Замовлення по менеджерах",
    summary: `Пораховано замовлення по менеджерах ${period.label}.`,
    markdown: body,
    domain: "orders",
    confidence: 0.9,
    analytics: {
      kind: "people",
      title: params.targetMember
        ? `Замовлення: ${formatShortPersonName(params.targetMember.label) || params.targetMember.label}`
        : "Замовлення по менеджерах",
      caption: `${formatInteger(totalOrders)} замовлень ${period.label}`,
      metricLabel: "Замовлення",
      rows: analyticsRows,
      note: "Менеджер береться з manager_user_id або manager_label.",
    },
  } satisfies AnalyticsResult;
}

async function buildLogisticsDeliveryAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  targetMember?: AnalyticsPersonTarget | null;
}) {
  const period = parsePeriodFromMessage(params.message);
  let query = params.adminClient
    .schema("tosho")
    .from("orders")
    .select("id,total,delivery_status,order_status,created_at")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (period.sinceIso) query = query.gte("created_at", period.sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const byDeliveryStatus: Record<string, number> = {};
  let totalOrders = 0;
  let totalSum = 0;
  let shipped = 0;
  let delivered = 0;
  for (const row of (data ?? []) as Array<{ delivery_status?: string | null; order_status?: string | null; total?: number | string | null }>) {
    totalOrders += 1;
    const deliveryStatus = normalizeText(row.delivery_status) || "без статусу";
    const orderStatus = normalizeText(row.order_status) || "без статусу";
    byDeliveryStatus[deliveryStatus] = (byDeliveryStatus[deliveryStatus] ?? 0) + 1;
    if (deliveryStatus === "shipped" || orderStatus === "shipped") shipped += 1;
    if (deliveryStatus === "delivered" || orderStatus === "completed") delivered += 1;
    const amount = typeof row.total === "number" ? row.total : row.total ? Number(row.total) : 0;
    if (Number.isFinite(amount)) totalSum += amount;
  }

  const rows: AnalyticsRow[] = Object.entries(byDeliveryStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      id: status,
      label: formatDeliveryStatusLabel(status),
      primary: `${formatInteger(count)} замовл.`,
      secondary: null,
      badges: status === "без статусу" ? [] : [{ label: "Доставка", value: formatInteger(count) }],
    }));
  const targetName = params.targetMember ? formatShortPersonName(params.targetMember.label) || params.targetMember.label : null;
  const targetNotice = targetName
    ? ` По **${targetName}** персонально не ділю: у замовленнях немає поля logistics_user_id.`
    : "";

  return {
    title: "Логістика: доставка",
    summary: `Пораховано доставку по замовленнях ${period.label}.`,
    markdown: `Порахував логістику ${period.label}: **${formatInteger(totalOrders)}** замовлень, **${formatInteger(shipped)}** відвантажено, **${formatInteger(delivered)}** доставлено.${targetNotice}`,
    domain: "logistics",
    confidence: params.targetMember ? 0.72 : 0.88,
    analytics: {
      kind: "entity",
      title: params.targetMember ? `Логістика: ${targetName}` : "Логістика",
      caption: `${formatInteger(totalOrders)} замовлень ${period.label} · сума ${formatMoney(totalSum)}`,
      avatarUrl: params.targetMember?.avatarUrl ?? null,
      metricLabel: "Статус",
      rows,
      note: `Рахую delivery_status/order_status у замовленнях.${params.targetMember ? " Персонального логіста в orders зараз немає." : ""}`,
    },
  } satisfies AnalyticsResult;
}

function buildEmployeeProfileAnalytics(member: AnalyticsPersonTarget): AnalyticsResult {
  const roleLabel = analyticsPersonRoleLabel(member);
  const modules = Object.entries(member.moduleAccess)
    .filter(([, enabled]) => enabled)
    .map(([key]) => {
      const labels: Record<string, string> = {
        overview: "Огляд",
        orders: "Збут",
        design: "Дизайн",
        logistics: "Логістика",
        catalog: "Каталог",
        contractors: "Підрядники",
        team: "Команда",
      };
      return labels[key] ?? key;
    });

  return {
    title: `Співробітник: ${formatShortPersonName(member.label) || member.label}`,
    summary: `${member.label}: ${roleLabel}.`,
    markdown: `Знайшов **${formatShortPersonName(member.label) || member.label}**. Роль: **${roleLabel}**. Для цієї ролі можу рахувати ті метрики, які є в CRM-даних; якщо потрібен персональний зріз, напиши метрику: прорахунки, замовлення або дизайн-задачі.`,
    domain: roleLabel === "Логіст" ? "logistics" : roleLabel === "Дизайнер" ? "design" : "team",
    confidence: 0.82,
    analytics: {
      kind: "entity",
      title: formatShortPersonName(member.label) || member.label,
      caption: roleLabel,
      avatarUrl: member.avatarUrl,
      metricLabel: "Доступ",
      rows: [
        {
          id: "role",
          label: "Роль",
          primary: roleLabel,
          secondary: normalizeText(member.jobRole) || normalizeText(member.accessRole) || null,
        },
        {
          id: "modules",
          label: "Модулі",
          primary: modules.length > 0 ? `${formatInteger(modules.length)} активн.` : "0",
          secondary: modules.join(" · ") || "Немає активних модулів",
        },
      ],
      note: "Для співробітника без конкретної метрики показую профіль, а не підставляю менеджерські прорахунки.",
    },
  };
}

async function buildPersonalActionPlanAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
}) {
  const normalizedRole = normalizeRole(params.auth.jobRole);
  const isDesigner = normalizedRole === "designer" || normalizedRole === "дизайнер";
  const isLogistics = normalizedRole === "logistics" || normalizedRole === "head_of_logistics";
  const isManager = normalizedRole === "manager" || normalizedRole === "pm" || params.auth.canManageQueue;

  if (isDesigner) {
    const { data, error } = await params.adminClient
      .from("activity_log")
      .select("entity_id,title,metadata,created_at")
      .eq("team_id", params.auth.teamId)
      .eq("action", "design_task")
      .limit(10000);
    if (error) throw new Error(error.message);

    const tasks = ((data ?? []) as Array<{ entity_id?: string | null; title?: string | null; metadata?: JsonRecord | null; created_at?: string | null }>)
      .map((row) => {
        const metadata = row.metadata ?? {};
        const assigneeUserId = normalizeText(typeof metadata.assignee_user_id === "string" ? metadata.assignee_user_id : "");
        const status = normalizeText(typeof metadata.status === "string" ? metadata.status : "") || "new";
        return {
          id: normalizeText(row.entity_id) || normalizeText(typeof metadata.design_task_id === "string" ? metadata.design_task_id : "") || normalizeText(row.title) || "task",
          label:
            normalizeText(typeof metadata.customer_name === "string" ? metadata.customer_name : "") ||
            normalizeText(row.title) ||
            "Дизайн-задача",
          status,
          type: normalizeText(typeof metadata.design_task_type === "string" ? metadata.design_task_type : "") || "без типу",
          deadline: normalizeText(typeof metadata.design_deadline === "string" ? metadata.design_deadline : "") || normalizeText(typeof metadata.deadline === "string" ? metadata.deadline : ""),
          assigneeUserId,
        };
      })
      .filter((task) => task.assigneeUserId === params.auth.userId && task.status !== "approved" && task.status !== "cancelled")
      .sort((a, b) => {
        const aDeadline = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
        const bDeadline = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
        return aDeadline - bDeadline || a.label.localeCompare(b.label, "uk");
      })
      .slice(0, 8);

    return {
      title: "Мій план по дизайну",
      summary: `Знайдено ${formatInteger(tasks.length)} активних дизайн-задач.`,
      markdown:
        tasks.length > 0
          ? `На сьогодні я б сфокусувався на **${tasks[0].label}**. Загалом у твоїй черзі **${formatInteger(tasks.length)}** активних задач.`
          : "У твоїй дизайн-черзі не бачу активних задач.",
      domain: "design",
      confidence: 0.86,
      analytics: {
        kind: "entity",
        title: "Фокус дизайнера",
        caption: `${formatInteger(tasks.length)} активних задач`,
        metricLabel: "Фокус",
        rows: tasks.map((task) => ({
          id: task.id,
          label: task.label,
          primary: formatDesignTaskTypeLabel(task.type),
          secondary: task.deadline ? `Дедлайн ${task.deadline.slice(0, 10)} · ${task.status}` : task.status,
          badges: [{ label: formatDesignTaskTypeLabel(task.type), value: 1 }],
        })),
        note: `Беру активні design_task з assignee_user_id = поточний користувач.`,
      },
    } satisfies AnalyticsResult;
  }

  if (isLogistics) {
    const result = await buildLogisticsDeliveryAnalytics(params);
    return {
      ...result,
      title: "Мій план по логістиці",
      markdown: `${result.markdown}\n\nФокус: перевірити **готові до відвантаження**, **готується до відвантаження** і **не забрано**.`,
      analytics: {
        ...result.analytics,
        title: "Фокус логіста",
        note: `${result.analytics.note ?? ""} Персонального логіста в orders зараз немає, тому показую командний логістичний фокус.`,
      },
    } satisfies AnalyticsResult;
  }

  if (isManager) {
    const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [quoteResult, customerResult, leadResult, orderResult] = await Promise.all([
      params.adminClient
        .schema("tosho")
        .from("quotes")
        .select("id,status,total,customer_id,customer_name,created_at")
        .eq("team_id", params.auth.teamId)
        .or(`assigned_to.eq.${params.auth.userId},created_by.eq.${params.auth.userId}`)
        .order("created_at", { ascending: false })
        .limit(10000),
      params.adminClient
        .schema("tosho")
        .from("customers")
        .select("id,name,legal_name,manager_user_id,manager")
        .eq("team_id", params.auth.teamId)
        .or(`manager_user_id.eq.${params.auth.userId},manager.ilike.%${escapeIlikeValue(params.auth.actorLabel)}%`)
        .limit(1000),
      params.adminClient
        .schema("tosho")
        .from("leads")
        .select("id,company_name,legal_name,first_name,last_name,manager_user_id,manager")
        .eq("team_id", params.auth.teamId)
        .or(`manager_user_id.eq.${params.auth.userId},manager.ilike.%${escapeIlikeValue(params.auth.actorLabel)}%`)
        .limit(1000),
      params.adminClient
        .schema("tosho")
        .from("orders")
        .select("id,order_status,total,customer_name,manager_user_id,manager_label,created_at")
        .eq("team_id", params.auth.teamId)
        .or(`manager_user_id.eq.${params.auth.userId},manager_label.ilike.%${escapeIlikeValue(params.auth.actorLabel)}%`)
        .order("created_at", { ascending: false })
        .limit(10000),
    ]);
    if (quoteResult.error) throw new Error(quoteResult.error.message);
    if (customerResult.error) throw new Error(customerResult.error.message);
    if (leadResult.error) throw new Error(leadResult.error.message);
    if (orderResult.error) throw new Error(orderResult.error.message);

    const quotes = (quoteResult.data ?? []) as Array<{ id: string; status?: string | null; total?: number | string | null; customer_name?: string | null; created_at?: string | null }>;
    const staleQuotes = quotes.filter((quote) => {
      const status = normalizeText(quote.status);
      const createdAt = quote.created_at ? Date.parse(quote.created_at) : Date.now();
      return ["estimated", "awaiting_approval", "estimating"].includes(status) && createdAt < Date.parse(sinceIso);
    });
    const hotQuotes = quotes.filter((quote) => ["estimated", "awaiting_approval"].includes(normalizeText(quote.status))).slice(0, 6);
    const customersCount = (customerResult.data ?? []).length;
    const leadsCount = (leadResult.data ?? []).length;
    const orders = (orderResult.data ?? []) as Array<{ id: string; order_status?: string | null; total?: number | string | null; customer_name?: string | null }>;
    const activeOrders = orders.filter((order) => !["completed", "cancelled", "canceled"].includes(normalizeText(order.order_status)));

    const rows: AnalyticsRow[] = [
      {
        id: "customers",
        label: "Мої клієнти",
        primary: formatInteger(customersCount + leadsCount),
        secondary: `${formatInteger(customersCount)} замовників · ${formatInteger(leadsCount)} лідів`,
      },
      {
        id: "hot-quotes",
        label: "Дотиснути прорахунки",
        primary: formatInteger(hotQuotes.length),
        secondary: hotQuotes.slice(0, 3).map((quote) => normalizeText(quote.customer_name) || quote.id).join(" · ") || "Немає гарячих прорахунків",
        badges: formatAnalyticsBadges(
          hotQuotes.reduce<Record<string, number>>((acc, quote) => {
            const status = normalizeText(quote.status) || "без статусу";
            acc[status] = (acc[status] ?? 0) + 1;
            return acc;
          }, {}),
          formatQuoteStatusLabel
        ),
      },
      {
        id: "stale-quotes",
        label: "Зависли без руху",
        primary: formatInteger(staleQuotes.length),
        secondary: "Прорахунки старші 14 днів у робочих статусах",
      },
      {
        id: "active-orders",
        label: "Активні замовлення",
        primary: formatInteger(activeOrders.length),
        secondary: activeOrders.slice(0, 3).map((order) => normalizeText(order.customer_name) || order.id).join(" · ") || "Немає активних замовлень",
      },
    ];

    return {
      title: "Мій план менеджера",
      summary: `Клієнтів і лідів: ${formatInteger(customersCount + leadsCount)}, гарячих прорахунків: ${formatInteger(hotQuotes.length)}.`,
      markdown:
        hotQuotes.length > 0
          ? `Фокус на сьогодні: дотиснути **${normalizeText(hotQuotes[0].customer_name) || hotQuotes[0].id}** і пройтись по прорахунках у статусі погодження.`
          : "На сьогодні не бачу гарячих прорахунків. Варто пройтись по лідах і активних замовленнях.",
      domain: "orders",
      confidence: 0.88,
      analytics: {
        kind: "entity",
        title: "Фокус менеджера",
        caption: `${formatInteger(customersCount + leadsCount)} клієнтів/лідів · ${formatInteger(hotQuotes.length)} гарячих прорахунків`,
        metricLabel: "Що робити",
        rows,
        note: "Персоналізую по assigned_to/created_by у прорахунках і manager_user_id/manager у клієнтах та лідах.",
      },
    } satisfies AnalyticsResult;
  }

  const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const me = members.find((member) => member.userId === params.auth.userId);
  return me ? buildEmployeeProfileAnalytics(me) : null;
}

async function buildTeamRoleAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
}) {
  const normalized = normalizeText(params.message).toLowerCase();
  const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const wantsDesigners = /(дизайнер|дизайнери)/u.test(normalized);
  const wantsManagers = hasManagerAnalyticsTerm(normalized);
  const wantsLogistics = hasLogisticsAnalyticsTerm(normalized);
  const wantsTeam = hasEmployeeAnalyticsTerm(normalized) || /(команд|людей|користувач)/u.test(normalized);
  const filtered = members.filter((member) => {
    const role = analyticsPersonRoleLabel(member);
    if (wantsDesigners) return role === "Дизайнер";
    if (wantsManagers) return role === "Менеджер" || role === "PM";
    if (wantsLogistics) return role === "Логіст";
    if (wantsTeam) return true;
    return false;
  });
  if (filtered.length === 0) return null;

  const byRole: Record<string, number> = {};
  for (const member of filtered) {
    const role = analyticsPersonRoleLabel(member);
    byRole[role] = (byRole[role] ?? 0) + 1;
  }
  const title = wantsDesigners
    ? "Дизайнери"
    : wantsManagers
      ? "Менеджери"
      : wantsLogistics
        ? "Логісти"
        : "Співробітники";

  return {
    title,
    summary: `${title}: ${formatInteger(filtered.length)} людей.`,
    markdown: `Знайшов **${formatInteger(filtered.length)}** ${title.toLowerCase()}.`,
    domain: wantsLogistics ? "logistics" : wantsDesigners ? "design" : "team",
    confidence: 0.84,
    analytics: {
      kind: "people",
      title,
      caption: `${formatInteger(filtered.length)} людей`,
      metricLabel: "Роль",
      rows: filtered.map((member) => ({
        id: member.userId,
        label: formatShortPersonName(member.label) || member.label,
        avatarUrl: member.avatarUrl,
        primary: analyticsPersonRoleLabel(member),
        secondary: normalizeText(member.jobRole) || normalizeText(member.accessRole) || null,
        badges: Object.entries(member.moduleAccess)
          .filter(([, enabled]) => enabled)
          .slice(0, 4)
          .map(([module]) => ({ label: module, value: "так" })),
      })),
      note: `Це зріз по ролях і доступах команди, не операційна продуктивність.`,
    },
  };
}

async function buildCustomerQuoteAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
}) {
  const period = parsePeriodFromMessage(params.message);
  let query = params.adminClient
    .schema("tosho")
    .from("quotes")
    .select("id,status,total,customer_id,customer_name,customer_logo_url,created_at")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (period.sinceIso) query = query.gte("created_at", period.sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const buckets = new Map<
    string,
    { id: string; label: string; logoUrl: string | null; total: number; approved: number; sum: number; byStatus: Record<string, number> }
  >();
  for (const row of (data ?? []) as Array<{
    customer_id?: string | null;
    customer_name?: string | null;
    customer_logo_url?: string | null;
    status?: string | null;
    total?: number | string | null;
  }>) {
    const customerId = normalizeText(row.customer_id);
    const customerName = normalizeText(row.customer_name) || "Без замовника";
    const key = customerId || normalizeAnalyticsName(customerName) || "unknown";
    const status = normalizeText(row.status) || "без статусу";
    const amount = typeof row.total === "number" ? row.total : row.total ? Number(row.total) : 0;
    const bucket = buckets.get(key) ?? { id: key, label: customerName, logoUrl: normalizeText(row.customer_logo_url) || null, total: 0, approved: 0, sum: 0, byStatus: {} };
    if (!bucket.logoUrl && row.customer_logo_url) bucket.logoUrl = normalizeText(row.customer_logo_url) || null;
    bucket.total += 1;
    if (status === "approved") bucket.approved += 1;
    if (Number.isFinite(amount)) bucket.sum += amount;
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    buckets.set(key, bucket);
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "uk"));
  const totalQuotes = rows.reduce((sum, row) => sum + row.total, 0);
  const approvedQuotes = rows.reduce((sum, row) => sum + row.approved, 0);
  const totalSum = rows.reduce((sum, row) => sum + row.sum, 0);
  const top = rows[0] ?? null;
  const body = top
    ? `Готово. Найбільше прорахунків ${period.label} у **${top.label}** — ${formatInteger(top.total)}. Загалом знайшов **${formatInteger(totalQuotes)}** прорахунків по замовниках.`
    : "За цей період не знайшов прорахунків по замовниках.";

  return {
    title: "Прорахунки по замовниках",
    summary: `Пораховано ${formatInteger(totalQuotes)} прорахунків по замовниках ${period.label}.`,
    markdown: body,
    domain: "orders",
    confidence: 0.9,
    analytics: {
      kind: "entity",
      title: "Прорахунки по замовниках",
      caption: `${formatInteger(totalQuotes)} прорахунків ${period.label} · затверджено ${formatInteger(approvedQuotes)} · сума ${formatMoney(totalSum)}`,
      metricLabel: "Прорахунки",
      rows: rows.map((row) => ({
        id: row.id,
        label: row.label,
        avatarUrl: row.logoUrl,
        primary: `${formatInteger(row.total)} прорах.`,
        secondary: `Затверджено ${formatInteger(row.approved)} · сума ${formatMoney(row.sum)}`,
        badges: formatAnalyticsBadges(row.byStatus, formatQuoteStatusLabel),
      })),
      note: "Групую прорахунки за customer_id, а якщо його немає - за назвою customer_name.",
    },
  } satisfies AnalyticsResult;
}

async function buildCustomerOrderAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
}) {
  const period = parsePeriodFromMessage(params.message);
  let query = params.adminClient
    .schema("tosho")
    .from("orders")
    .select("id,order_status,total,customer_id,customer_name,created_at")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (period.sinceIso) query = query.gte("created_at", period.sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const buckets = new Map<string, { id: string; label: string; total: number; sum: number; byStatus: Record<string, number> }>();
  for (const row of (data ?? []) as Array<{
    customer_id?: string | null;
    customer_name?: string | null;
    order_status?: string | null;
    total?: number | string | null;
  }>) {
    const customerName = normalizeText(row.customer_name) || "Без замовника";
    const key = normalizeText(row.customer_id) || normalizeAnalyticsName(customerName) || "unknown";
    const status = normalizeText(row.order_status) || "без статусу";
    const amount = typeof row.total === "number" ? row.total : row.total ? Number(row.total) : 0;
    const bucket = buckets.get(key) ?? { id: key, label: customerName, total: 0, sum: 0, byStatus: {} };
    bucket.total += 1;
    if (Number.isFinite(amount)) bucket.sum += amount;
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    buckets.set(key, bucket);
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "uk"));
  const totalOrders = rows.reduce((sum, row) => sum + row.total, 0);
  const totalSum = rows.reduce((sum, row) => sum + row.sum, 0);
  const top = rows[0] ?? null;
  const body = top
    ? `Готово. Найбільше замовлень ${period.label} у **${top.label}** — ${formatInteger(top.total)}. Загалом знайшов **${formatInteger(totalOrders)}** замовлень по замовниках.`
    : "За цей період не знайшов замовлень по замовниках.";

  return {
    title: "Замовлення по замовниках",
    summary: `Пораховано ${formatInteger(totalOrders)} замовлень по замовниках ${period.label}.`,
    markdown: body,
    domain: "orders",
    confidence: 0.88,
    analytics: {
      kind: "entity",
      title: "Замовлення по замовниках",
      caption: `${formatInteger(totalOrders)} замовлень ${period.label} · сума ${formatMoney(totalSum)}`,
      metricLabel: "Замовлення",
      rows: rows.map((row) => ({
        id: row.id,
        label: row.label,
        primary: `${formatInteger(row.total)} замовл.`,
        secondary: `Сума ${formatMoney(row.sum)}`,
        badges: formatAnalyticsBadges(row.byStatus, formatOrderStatusLabel),
      })),
      note: "Групую замовлення за customer_id, а якщо його немає - за назвою customer_name.",
    },
  } satisfies AnalyticsResult;
}

async function buildManagerCustomerAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  targetMember: AnalyticsPersonTarget;
}) {
  const period = parsePeriodFromMessage(params.message);
  let query = params.adminClient
    .schema("tosho")
    .from("quotes")
    .select("id,status,total,customer_id,customer_name,customer_logo_url,assigned_to,created_by,created_at")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (period.sinceIso) query = query.gte("created_at", period.sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const customers = new Map<string, { id: string; label: string; logoUrl: string | null; quoteCount: number; sum: number; byStatus: Record<string, number> }>();
  for (const row of (data ?? []) as Array<{
    assigned_to?: string | null;
    created_by?: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_logo_url?: string | null;
    status?: string | null;
    total?: number | string | null;
  }>) {
    const ownerId = normalizeText(row.assigned_to || row.created_by || "");
    if (ownerId !== params.targetMember.userId) continue;
    const customerName = normalizeText(row.customer_name) || "Без замовника";
    const customerId = normalizeText(row.customer_id) || normalizeAnalyticsName(customerName) || "unknown";
    const status = normalizeText(row.status) || "без статусу";
    const amount = typeof row.total === "number" ? row.total : row.total ? Number(row.total) : 0;
    const bucket = customers.get(customerId) ?? { id: customerId, label: customerName, logoUrl: normalizeText(row.customer_logo_url) || null, quoteCount: 0, sum: 0, byStatus: {} };
    if (!bucket.logoUrl && row.customer_logo_url) bucket.logoUrl = normalizeText(row.customer_logo_url) || null;
    bucket.quoteCount += 1;
    if (Number.isFinite(amount)) bucket.sum += amount;
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    customers.set(customerId, bucket);
  }

  const rows = Array.from(customers.values()).sort(
    (a, b) => b.quoteCount - a.quoteCount || a.label.localeCompare(b.label, "uk")
  );
  const totalQuotes = rows.reduce((sum, row) => sum + row.quoteCount, 0);
  const totalSum = rows.reduce((sum, row) => sum + row.sum, 0);
  const targetLabel = formatShortPersonName(params.targetMember.label) || params.targetMember.label;

  return {
    title: `Замовники: ${targetLabel}`,
    summary: `${targetLabel}: ${formatInteger(rows.length)} замовників, ${formatInteger(totalQuotes)} прорахунків ${period.label}.`,
    markdown:
      rows.length > 0
        ? `Готово. У **${targetLabel}** ${formatInteger(rows.length)} замовників і ${formatInteger(totalQuotes)} прорахунків ${period.label}.`
        : `За цей період не знайшов замовників із прорахунками у **${targetLabel}**.`,
    domain: "orders",
    confidence: 0.9,
    analytics: {
      kind: "entity",
      title: `Замовники: ${targetLabel}`,
      caption: `${formatInteger(rows.length)} замовників · ${formatInteger(totalQuotes)} прорахунків · сума ${formatMoney(totalSum)}`,
      metricLabel: "Прорахунки",
      rows: rows.map((row) => ({
        id: row.id,
        label: row.label,
        avatarUrl: row.logoUrl,
        primary: `${formatInteger(row.quoteCount)} прорах.`,
        secondary: `Сума ${formatMoney(row.sum)}`,
        badges: formatAnalyticsBadges(row.byStatus, formatQuoteStatusLabel),
      })),
      note: "Замовників менеджера рахую по прорахунках: assigned_to, fallback created_by.",
    },
  } satisfies AnalyticsResult;
}

async function resolvePartyForAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
}) {
  const searchParams = new URLSearchParams(params.routeContext.search.startsWith("?") ? params.routeContext.search.slice(1) : params.routeContext.search);
  const explicitCustomerId = normalizeText(searchParams.get("customerId"));
  const explicitLeadId = normalizeText(searchParams.get("leadId"));

  if (explicitCustomerId) {
    const { data } = await params.adminClient
      .schema("tosho")
      .from("customers")
      .select("id,name,legal_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .eq("id", explicitCustomerId)
      .maybeSingle();
    const row = data as { id?: string; name?: string | null; legal_name?: string | null; logo_url?: string | null } | null;
    if (row?.id) return { kind: "customer" as const, id: row.id, name: normalizeText(row.name || row.legal_name) || row.id, logoUrl: normalizeText(row.logo_url) || null };
  }

  if (explicitLeadId) {
    const { data } = await params.adminClient
      .schema("tosho")
      .from("leads")
      .select("id,company_name,legal_name,first_name,last_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .eq("id", explicitLeadId)
      .maybeSingle();
    const row = data as { id?: string; company_name?: string | null; legal_name?: string | null; first_name?: string | null; last_name?: string | null; logo_url?: string | null } | null;
    if (row?.id) {
      const person = [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(" ");
      return { kind: "lead" as const, id: row.id, name: normalizeText(row.company_name || row.legal_name || person) || row.id, logoUrl: normalizeText(row.logo_url) || null };
    }
  }

  const query = extractPartySearchQuery(params.message) || stripAnalyticsQueryTerms(params.message);
  if (!query) return null;
  const searchVariants = buildPartySearchVariants(query);
  if (searchVariants.length === 0) return null;
  const customerFilter = buildPartyOrFilter(["name", "legal_name"], searchVariants);
  const leadFilter = buildPartyOrFilter(["company_name", "legal_name", "first_name", "last_name"], searchVariants);

  const [customerResult, leadResult] = await Promise.all([
    params.adminClient
      .schema("tosho")
      .from("customers")
      .select("id,name,legal_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .or(customerFilter)
      .limit(8),
    params.adminClient
      .schema("tosho")
      .from("leads")
      .select("id,company_name,legal_name,first_name,last_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .or(leadFilter)
      .limit(8),
  ]);

  const customer = ((customerResult.data ?? []) as Array<{ id: string; name?: string | null; legal_name?: string | null; logo_url?: string | null }>)
    .map((row) => ({
      row,
      score: scorePartySearchCandidate(`${row.name ?? ""} ${row.legal_name ?? ""}`, searchVariants),
    }))
    .sort((a, b) => b.score - a.score)[0]?.row;
  if (customer) {
    return { kind: "customer" as const, id: customer.id, name: normalizeText(customer.name || customer.legal_name) || customer.id, logoUrl: normalizeText(customer.logo_url) || null };
  }

  const lead = ((leadResult.data ?? []) as Array<{ id: string; company_name?: string | null; legal_name?: string | null; first_name?: string | null; last_name?: string | null; logo_url?: string | null }>)
    .map((row) => ({
      row,
      score: scorePartySearchCandidate(
        `${row.company_name ?? ""} ${row.legal_name ?? ""} ${row.first_name ?? ""} ${row.last_name ?? ""}`,
        searchVariants
      ),
    }))
    .sort((a, b) => b.score - a.score)[0]?.row;
  if (lead) {
    const person = [lead.first_name, lead.last_name].map(normalizeText).filter(Boolean).join(" ");
    return { kind: "lead" as const, id: lead.id, name: normalizeText(lead.company_name || lead.legal_name || person) || lead.id, logoUrl: normalizeText(lead.logo_url) || null };
  }

  return null;
}

async function buildPartyQuoteOrderAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
}) {
  const period = parsePeriodFromMessage(params.message);
  const normalizedMessage = normalizeText(params.message).toLowerCase();
  const wantsQuotes = /(прорах|quote|коштор|кп)/u.test(normalizedMessage);
  const wantsOrders = /(замовл|order)/u.test(normalizedMessage);
  const includeQuotes = wantsQuotes || !wantsOrders;
  const includeOrders = wantsOrders || !wantsQuotes;
  const party = await resolvePartyForAnalytics(params);
  if (!party) {
    return {
      title: "Прорахунки і замовлення по клієнту",
      summary: "Потрібна назва або відкритий клієнт/лід.",
      markdown: "Можу порахувати прорахунки й замовлення по конкретному ліду або замовнику, але треба назва/ID або відкритий профіль клієнта.\n\nПриклад: `скільки у замовника Nike прорахунків і замовлень?`",
      domain: "orders",
      confidence: 0.72,
      analytics: {
        kind: "entity",
        title: "Прорахунки і замовлення",
        caption: "Потрібен конкретний лід або замовник",
        metricLabel: "Кількість",
        rows: [],
        note: "Відкрий профіль клієнта або напиши його назву в питанні.",
      },
    } satisfies AnalyticsResult;
  }

  let quoteQuery = params.adminClient
    .schema("tosho")
    .from("quotes")
    .select("id,status,total,customer_id,customer_name,created_at")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (period.sinceIso) quoteQuery = quoteQuery.gte("created_at", period.sinceIso);

  let orderQuery = params.adminClient
    .schema("tosho")
    .from("orders")
    .select("id,quote_id,order_status,total,customer_id,customer_name,party_type,created_at")
    .eq("team_id", params.auth.teamId)
    .limit(10000);
  if (period.sinceIso) orderQuery = orderQuery.gte("created_at", period.sinceIso);

  const [quoteResult, orderResult] = await Promise.all([quoteQuery, orderQuery]);
  if (quoteResult.error) throw new Error(quoteResult.error.message);
  if (orderResult.error) throw new Error(orderResult.error.message);

  const quotes = ((quoteResult.data ?? []) as Array<{ id: string; status?: string | null; total?: number | string | null; customer_id?: string | null; customer_name?: string | null }>).filter((row) => {
    const matchesName = looseAnalyticsNameMatches(row.customer_name, party.name);
    if (party.kind === "customer") return row.customer_id === party.id || matchesName;
    return matchesName;
  });
  const quoteIds = new Set(quotes.map((quote) => quote.id));
  const orders = ((orderResult.data ?? []) as Array<{ id: string; quote_id?: string | null; order_status?: string | null; total?: number | string | null; customer_id?: string | null; customer_name?: string | null; party_type?: string | null }>).filter((row) => {
    const matchesName = looseAnalyticsNameMatches(row.customer_name, party.name);
    if (row.quote_id && quoteIds.has(row.quote_id)) return true;
    if (party.kind === "customer") return row.customer_id === party.id || matchesName;
    return matchesName && (row.party_type === "lead" || !row.customer_id);
  });

  const quoteByStatus: Record<string, number> = {};
  let quoteSum = 0;
  for (const quote of quotes) {
    const status = normalizeText(quote.status) || "без статусу";
    quoteByStatus[status] = (quoteByStatus[status] ?? 0) + 1;
    const amount = typeof quote.total === "number" ? quote.total : quote.total ? Number(quote.total) : 0;
    if (Number.isFinite(amount)) quoteSum += amount;
  }

  const orderByStatus: Record<string, number> = {};
  let orderSum = 0;
  for (const order of orders) {
    const status = normalizeText(order.order_status) || "без статусу";
    orderByStatus[status] = (orderByStatus[status] ?? 0) + 1;
    const amount = typeof order.total === "number" ? order.total : order.total ? Number(order.total) : 0;
    if (Number.isFinite(amount)) orderSum += amount;
  }

  const quoteStatusLine = formatAnalyticsBadgeLine(quoteByStatus, formatQuoteStatusLabel) || "немає статусів";
  const orderStatusLine = formatAnalyticsBadgeLine(orderByStatus, formatOrderStatusLabel) || "немає статусів";
  const quoteCount = quotes.length;
  const orderCount = orders.length;
  const summaryParts = [
    includeQuotes ? `${formatInteger(quoteCount)} прорахунків` : "",
    includeOrders ? `${formatInteger(orderCount)} замовлень` : "",
  ].filter(Boolean);
  const rows: AnalyticsRow[] = [
    includeQuotes
      ? {
          id: "quotes",
          label: "Прорахунки",
          primary: formatInteger(quoteCount),
          secondary: `Сума ${formatMoney(quoteSum)} · ${quoteStatusLine}`,
          badges: formatAnalyticsBadges(quoteByStatus, formatQuoteStatusLabel),
        }
      : null,
    includeOrders
      ? {
          id: "orders",
          label: "Замовлення",
          primary: formatInteger(orderCount),
          secondary: `Сума ${formatMoney(orderSum)} · ${orderStatusLine}`,
          badges: formatAnalyticsBadges(orderByStatus, formatOrderStatusLabel),
        }
      : null,
  ].filter((row): row is AnalyticsRow => Boolean(row));

  return {
    title: `${party.kind === "customer" ? "Замовник" : "Лід"}: прорахунки і замовлення`,
    summary: `${party.name}: ${summaryParts.join(" і ")} ${period.label}.`,
    markdown: `Порахував по ${party.kind === "customer" ? "замовнику" : "ліду"} **${party.name}** ${period.label}: **${summaryParts.join(" і ")}**.`,
    domain: "orders",
    confidence: party.kind === "customer" ? 0.92 : 0.82,
    analytics: {
      kind: "entity",
      title: party.name,
      caption: party.kind === "customer" ? "Замовник" : "Лід",
      avatarUrl: party.logoUrl,
      metricLabel: "Кількість",
      rows,
      note:
        party.kind === "customer"
          ? "Замовника рахую по customer_id, а записи, що зайшли як лід, підхоплюю по customer_name."
          : "Ліда рахую по назві в customer_name і пов'язаних quote_id.",
    },
  } satisfies AnalyticsResult;
}

function buildPersonAmbiguityDecision(candidates: RoutingCandidate[]): AssistantDecision {
  const rows = candidates.map((member) => ({
    id: member.userId,
    label: formatShortPersonName(member.label) || member.label,
    avatarUrl: member.avatarUrl,
    primary: analyticsPersonRoleLabel(member),
    secondary: member.jobRole || member.accessRole || null,
    badges: [
      { label: member.moduleAccess.design ? "Дизайн" : "Не дизайн", value: member.moduleAccess.design ? "так" : "ні" },
      { label: member.moduleAccess.orders ? "Збут" : "Не збут", value: member.moduleAccess.orders ? "так" : "ні" },
    ],
  }));

  return {
    title: "Уточни людину",
    summary: "Знайшов кілька схожих людей.",
    answerMarkdown: "Знайшов кілька схожих людей. Напиши, кого саме рахувати: менеджера чи дизайнера, або додай прізвище.",
    playfulLine: "Потрібне уточнення перед підрахунком.",
    status: "waiting_user",
    priority: "low",
    domain: "team",
    confidence: 0.84,
    shouldEscalate: false,
    shouldNotify: false,
    knowledgeIds: [],
    internalSummary: "Analytics person query is ambiguous.",
    analytics: {
      kind: "people",
      title: "Кого рахувати?",
      caption: "Є кілька збігів по імені",
      metricLabel: "Роль",
      rows,
      note: "Уточни роль або прізвище, і я порахую потрібний зріз.",
    },
  };
}

async function buildPersonAnalyticsDecision(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
}) {
  const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const matches = findAnalyticsPersonMatches(params.message, members);
  if (matches.length === 0) return null;

  const normalized = normalizeText(params.message).toLowerCase();
  const explicitlyDesign = /(дизайн|дизайнер|дизайнів|таск|тасок|задач)/u.test(normalized);
  const explicitlyLogistics = hasLogisticsAnalyticsTerm(normalized);
  const explicitlyCustomers = /(замовник|клієнт|контрагент)/u.test(normalized);
  const explicitlyOrders = /(замовл|order)/u.test(normalized) && !/(замовник|клієнт|контрагент)/u.test(normalized);
  const explicitlyQuotes = /(прорах|quote|коштор|кп)/u.test(normalized);

  const relevantMatches = matches.filter((member) => {
    const role = normalizeRole(member.jobRole);
    if (explicitlyDesign) return role === "designer" || role === "дизайнер";
    if (explicitlyLogistics) return role === "logistics" || role === "head_of_logistics";
    if (explicitlyCustomers || explicitlyOrders || explicitlyQuotes || hasManagerAnalyticsTerm(normalized)) {
      return role === "manager" || role === "менеджер" || role === "sales_manager" || role === "junior_sales_manager" || role === "pm";
    }
    return true;
  });
  const candidates = relevantMatches.length > 0 ? relevantMatches : matches;
  if (candidates.length > 1) return buildPersonAmbiguityDecision(candidates);

  const target = candidates[0];
  const role = normalizeRole(target.jobRole);
  const looksDesigner = role === "designer" || role === "дизайнер";
  const looksLogistics = role === "logistics" || role === "head_of_logistics";
  const looksManager = role === "manager" || role === "менеджер" || role === "sales_manager" || role === "junior_sales_manager" || role === "pm";

  if (explicitlyDesign || (!explicitlyCustomers && !explicitlyOrders && !explicitlyQuotes && looksDesigner)) {
    return toAnalyticsDecision(await buildDesignCompletionAnalytics({ ...params, targetMember: target }));
  }
  if (explicitlyLogistics || (!explicitlyCustomers && !explicitlyOrders && !explicitlyQuotes && looksLogistics)) {
    return toAnalyticsDecision(await buildLogisticsDeliveryAnalytics({ ...params, targetMember: target }));
  }
  if (explicitlyCustomers) {
    return toAnalyticsDecision(await buildManagerCustomerAnalytics({ ...params, targetMember: target }));
  }
  if (explicitlyOrders) {
    return toAnalyticsDecision(await buildManagerOrderAnalytics({ ...params, targetMember: target }));
  }
  if (explicitlyQuotes || hasManagerAnalyticsTerm(normalized) || looksManager) {
    return toAnalyticsDecision(await buildManagerQuoteAnalytics({ ...params, targetMember: target }));
  }
  return toAnalyticsDecision(buildEmployeeProfileAnalytics(target));
}

function formatBytesCompact(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
}

async function buildAdminObservabilityAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
}) {
  const accessRole = normalizeRole(params.auth.accessRole);
  const jobRole = normalizeRole(params.auth.jobRole);
  const canViewAdminHealth = accessRole === "owner" || accessRole === "admin" || jobRole === "seo";
  if (!canViewAdminHealth) return null;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ data: snapshotRows }, { data: runtimeRows }] = await Promise.all([
    params.adminClient
      .schema("tosho")
      .from("admin_observability_snapshots")
      .select(
        "captured_at,captured_for_date,database_size_bytes,attachments_bucket_bytes,avatars_bucket_bytes,storage_today_bytes,storage_today_objects,quote_attachments_today,design_tasks_today,design_task_attachments_today,design_output_uploads_today,design_output_selection_today,attachment_possible_orphan_original_count,attachment_missing_variants_count,attachment_safe_reclaimable_count,attachment_safe_reclaimable_bytes,database_stats,dead_tuple_tables"
      )
      .eq("team_id", params.auth.teamId)
      .order("captured_for_date", { ascending: false })
      .limit(1),
    params.adminClient
      .schema("tosho")
      .from("runtime_errors")
      .select("title,href,created_at,metadata")
      .eq("team_id", params.auth.teamId)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const snapshot = (snapshotRows?.[0] ?? null) as
    | {
        captured_at?: string | null;
        captured_for_date?: string | null;
        database_size_bytes?: number | null;
        attachments_bucket_bytes?: number | null;
        avatars_bucket_bytes?: number | null;
        storage_today_bytes?: number | null;
        storage_today_objects?: number | null;
        quote_attachments_today?: number | null;
        design_tasks_today?: number | null;
        design_task_attachments_today?: number | null;
        design_output_uploads_today?: number | null;
        design_output_selection_today?: number | null;
        attachment_possible_orphan_original_count?: number | null;
        attachment_missing_variants_count?: number | null;
        attachment_safe_reclaimable_count?: number | null;
        attachment_safe_reclaimable_bytes?: number | null;
        database_stats?: JsonRecord | null;
        dead_tuple_tables?: unknown[] | null;
      }
    | null;

  const runtimeErrorCount = (runtimeRows ?? []).length;
  const latestRuntimeError = ((runtimeRows ?? []) as RuntimeErrorRow[])[0] ?? null;
  const dbSize = Number(snapshot?.database_size_bytes ?? 0);
  const attachmentsSize = Number(snapshot?.attachments_bucket_bytes ?? 0);
  const storageTodayBytes = Number(snapshot?.storage_today_bytes ?? 0);
  const storageTodayObjects = Number(snapshot?.storage_today_objects ?? 0);
  const orphanCount = Number(snapshot?.attachment_possible_orphan_original_count ?? 0);
  const missingVariants = Number(snapshot?.attachment_missing_variants_count ?? 0);
  const reclaimableCount = Number(snapshot?.attachment_safe_reclaimable_count ?? 0);
  const reclaimableBytes = Number(snapshot?.attachment_safe_reclaimable_bytes ?? 0);
  const deadTupleTables = Array.isArray(snapshot?.dead_tuple_tables) ? snapshot?.dead_tuple_tables.length ?? 0 : 0;
  const capturedLabel = snapshot?.captured_at ? new Date(snapshot.captured_at).toLocaleString("uk-UA") : null;
  const hasRisks = runtimeErrorCount > 0 || orphanCount > 0 || missingVariants > 0 || deadTupleTables > 0;

  const rows: AnalyticsRow[] = [
    {
      id: "runtime-errors",
      label: "Runtime errors",
      primary: formatInteger(runtimeErrorCount),
      secondary: latestRuntimeError ? trimTo(latestRuntimeError.title || "Остання помилка", 120) : "Сьогодні нових помилок не бачу",
      badges: latestRuntimeError?.href ? [{ label: "Останній route", value: trimTo(latestRuntimeError.href, 28) }] : [],
    },
    {
      id: "activity-today",
      label: "Активність сьогодні",
      primary: formatInteger(Number(snapshot?.design_tasks_today ?? 0)),
      secondary: `Дизайн-задачі · вкладень у прорахунках ${formatInteger(Number(snapshot?.quote_attachments_today ?? 0))}`,
      badges: [
        { label: "Design files", value: formatInteger(Number(snapshot?.design_task_attachments_today ?? 0)) },
        { label: "Outputs", value: formatInteger(Number(snapshot?.design_output_uploads_today ?? 0)) },
      ],
    },
    {
      id: "storage",
      label: "Сховище",
      primary: formatBytesCompact(storageTodayBytes),
      secondary: `Сьогодні ${formatInteger(storageTodayObjects)} об'єктів · attachments ${formatBytesCompact(attachmentsSize)}`,
      badges: [{ label: "DB", value: formatBytesCompact(dbSize) }],
    },
    {
      id: "hygiene",
      label: "Гігієна attachments",
      primary: hasRisks ? "є ризики" : "нормально",
      secondary: `orphan ${formatInteger(orphanCount)} · missing variants ${formatInteger(missingVariants)}`,
      badges: [
        { label: "Reclaimable", value: `${formatInteger(reclaimableCount)} / ${formatBytesCompact(reclaimableBytes)}` },
        { label: "Dead tuples", value: formatInteger(deadTupleTables) },
      ],
    },
  ];

  return {
    title: "Адмін-зріз",
    summary: hasRisks ? "Є що перевірити в observability." : "Критичних сигналів у сьогоднішньому зрізі не бачу.",
    markdown: hasRisks
      ? "Є кілька сигналів, які варто перевірити в observability: runtime errors, attachments або таблиці з dead tuples."
      : "По сьогоднішньому зрізу все виглядає спокійно: нових runtime errors не бачу, а основні storage/attachment метрики нижче.",
    domain: "admin",
    confidence: snapshot || runtimeErrorCount > 0 ? 0.9 : 0.74,
    analytics: {
      kind: "entity",
      title: "Observability",
      caption: capturedLabel ? `Останній snapshot: ${capturedLabel}` : "Snapshot ще не знайдено",
      metricLabel: "Стан",
      rows,
      note: snapshot
        ? "Зріз беру з admin_observability_snapshots і runtime_errors за сьогодні."
        : "Snapshot ще не створений. Runtime errors рахую напряму за сьогодні.",
    },
  } satisfies AnalyticsResult;
}

async function buildAnalyticsDecision(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
}) {
  if (!shouldRunAnalytics(params.message)) return null;
  const normalized = normalizeText(params.message).toLowerCase();
  const hasAdminTerm = hasAdminObservabilityTerm(normalized);
  const hasDesignTerm = /(дизайнер|дизайн|таск|тасок|задач)/u.test(normalized);
  const hasQuoteTerm = /(прорах|quote|коштор|кп)/u.test(normalized);
  const hasOrderTerm = /(замовл|order)/u.test(normalized);
  const hasPartyTerm = /(лід|замовник|клієнт|контрагент)/u.test(normalized);
  const hasManagerTerm = hasManagerAnalyticsTerm(normalized);
  const hasLogisticsTerm = hasLogisticsAnalyticsTerm(normalized);
  const hasEmployeeTerm = hasEmployeeAnalyticsTerm(normalized);
  const stripped = stripAnalyticsQueryTerms(params.message);
  const asksForCustomerBreakdown =
    /по\s+(яким\s+|яких\s+)?(замовник|клієнт|контрагент)|у\s+якого\s+(замовник|клієнт|контрагент)|найбільш|більше\s+всього|топ/u.test(
      normalized
    );
  const asksForPeopleList =
    /(хто|скільки|покажи|список|перелік).*(дизайнер|менеджер|логіст|співробіт|користувач|команд|працівник)/u.test(
      normalized
    ) && !/(прорах|quote|коштор|кп|замовл|order|таск|тасок|задач|зроб|закрит|approved|відвантаж|доставк)/u.test(normalized);

  if (hasAdminTerm && !hasDesignTerm && !hasQuoteTerm && !hasOrderTerm && !hasPartyTerm && !hasManagerTerm) {
    const adminDecision = await buildAdminObservabilityAnalytics(params);
    if (adminDecision) return toAnalyticsDecision(adminDecision);
  }

  if (hasPersonalActionPlanTerm(normalized) && !hasQuoteTerm && !hasOrderTerm && !hasDesignTerm && !hasManagerTerm) {
    const personalDecision = await buildPersonalActionPlanAnalytics(params);
    if (personalDecision) return toAnalyticsDecision(personalDecision);
  }

  const personDecision = await buildPersonAnalyticsDecision(params);
  if (personDecision) return personDecision;

  if (asksForPeopleList) {
    const teamDecision = await buildTeamRoleAnalytics(params);
    if (teamDecision) return toAnalyticsDecision(teamDecision);
  }

  if (hasLogisticsTerm && !hasQuoteTerm && !hasDesignTerm && !hasPartyTerm && !hasManagerTerm) {
    return toAnalyticsDecision(await buildLogisticsDeliveryAnalytics(params));
  }

  if ((hasEmployeeTerm || hasLogisticsTerm || /дизайнери|менеджери/u.test(normalized)) && !hasQuoteTerm && !hasOrderTerm && !hasDesignTerm) {
    const teamDecision = await buildTeamRoleAnalytics(params);
    if (teamDecision) return toAnalyticsDecision(teamDecision);
  }

  if (hasDesignTerm) {
    const partyQuery = extractPartySearchQuery(params.message) || stripped;
    if (partyQuery) {
      const partyDesignDecision = await buildPartyDesignCompletionAnalytics(params);
      if (partyDesignDecision) return toAnalyticsDecision(partyDesignDecision);
    }
    return toAnalyticsDecision(await buildDesignCompletionAnalytics(params));
  }

  if (hasCustomerAnalyticsTerm(normalized)) {
    if (asksForCustomerBreakdown && hasOrderTerm && !hasQuoteTerm) {
      return toAnalyticsDecision(await buildCustomerOrderAnalytics(params));
    }
    if (asksForCustomerBreakdown || (!stripped && !hasOrderTerm) || (!hasQuoteTerm && !hasOrderTerm)) {
      return toAnalyticsDecision(await buildCustomerQuoteAnalytics(params));
    }
  }

  if ((hasQuoteTerm || hasOrderTerm) && (hasPartyTerm || (stripped && !hasManagerTerm))) {
    return toAnalyticsDecision(await buildPartyQuoteOrderAnalytics(params));
  }

  if (hasManagerTerm && hasOrderTerm && !hasQuoteTerm) {
    return toAnalyticsDecision(await buildManagerOrderAnalytics(params));
  }

  if (hasManagerTerm) {
    return toAnalyticsDecision(await buildManagerQuoteAnalytics(params));
  }

  if (hasOrderTerm && !hasQuoteTerm) {
    return toAnalyticsDecision(await buildManagerOrderAnalytics(params));
  }

  if (hasQuoteTerm) {
    if (stripped) {
      return toAnalyticsDecision(await buildPartyQuoteOrderAnalytics(params));
    }
    return toAnalyticsDecision(await buildCustomerQuoteAnalytics(params));
  }

  return null;
}

function getDomainProductGuidance(domain: ToShoAiDomain) {
  switch (domain) {
    case "catalog":
      return {
        summary: "У каталозі товари створюються як нові моделі.",
        markdown:
          "Базовий флоу тут такий:\n1. Відкрий **Каталог**.\n2. Запусти дію **Створити нову модель**.\n3. У редакторі моделі заповни основні дані товару.\n4. Натисни **Створити модель**.",
      };
    case "design":
      return {
        summary: "На дизайні працюють через чергу і конкретні дизайн-задачі.",
        markdown:
          "Базовий флоу тут такий:\n1. Відкрий **Дизайн** або потрібну дизайн-задачу.\n2. Подивись чергу, статус і поточний етап.\n3. Якщо треба передати далі, краще робити це як окремий кейс з контекстом.",
      };
    case "orders":
      return {
        summary: "Для замовлень основний шлях іде через окремий прорахунок під конкретний товар або сценарій продажу.",
        markdown:
          "Базовий флоу тут такий:\n1. Під окремий товар або окремий комерційний сценарій створюй окремий прорахунок.\n2. Якщо треба тримати кілька прорахунків разом, краще збирати їх у набір прорахунків.\n3. Уже всередині прорахунку перевіряй статус, клієнта і подальший маршрут.",
      };
    default:
      return null;
  }
}

function buildFallbackDecision(params: {
  message: string;
  mode: ToShoAiMode;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
  runtimeErrors: RuntimeErrorRow[];
  knowledge: KnowledgeItemRow[];
  attachments: SupportAttachmentInput[];
  openAiEnabled: boolean;
}): AssistantDecision {
  const infoRequest = isInformationalQuestion(params.message, params.mode);
  const issueSignal = hasIssueSignal(params.message, params.mode);
  const domain = deriveDomainFromMessage(params.message, params.routeContext.domainHint);
  const productGuidance = getDomainProductGuidance(domain);
  const relevantRuntimeErrors = issueSignal ? params.runtimeErrors : [];
  const priority = inferPriority(params.message, relevantRuntimeErrors, params.mode);
  const confidence = params.knowledge.length > 0 ? 0.78 : productGuidance ? 0.6 : relevantRuntimeErrors.length > 0 ? 0.56 : 0.44;
  const shouldEscalate =
    params.mode === "route" ||
    params.mode === "resolve" ||
    (params.mode === "fix" && (relevantRuntimeErrors.length > 0 || params.attachments.length > 0 || params.knowledge.length === 0)) ||
    (!infoRequest && params.knowledge.length === 0);
  const shouldNotify = shouldEscalate && (params.mode !== "ask" || priority === "high" || priority === "urgent");
  const status: ToShoAiStatus = shouldEscalate
    ? params.mode === "resolve"
      ? "in_progress"
      : "open"
    : infoRequest || confidence >= 0.74
      ? "waiting_user"
      : "open";

  const knowledgeBlock =
    params.knowledge.length > 0
      ? params.knowledge
          .slice(0, 2)
          .map(
            (item) =>
              `- **${item.title}**: ${trimTo(item.summary || item.body, 160)}`
          )
          .join("\n")
      : "- Поки що curated knowledge base по цій темі ще порожня.";

  const runtimeBlock =
    relevantRuntimeErrors.length > 0
      ? `\n\nБачу технічний слід: **${trimTo(relevantRuntimeErrors[0]?.title || "runtime error", 140)}**.`
      : "";
  const attachmentsBlock =
    params.attachments.length > 0
      ? `\n\nПрикріплено файли: ${params.attachments.map((attachment) => attachment.fileName).join(", ")}.`
      : "";

  const primaryKnowledge = params.knowledge[0] ?? null;
  const secondaryKnowledge = params.knowledge[1] ?? null;
  const noKnowledgeMessage = params.openAiEnabled
    ? "Не знайшов підтвердженої інструкції саме про це в базі знань."
    : "Не знайшов підтвердженої інструкції саме про це. Зараз ToSho AI працює без OpenAI API, тому відповідає обережніше.";

  const answerMarkdown = shouldEscalate
    ? `Це краще передати далі вже з контекстом.${runtimeBlock}${attachmentsBlock}\n\nЩо підтягнулося:\n${knowledgeBlock}\n\nДалі: оформлю звернення з маршрутом **${domain}** і пріоритетом **${priority}**.`
    : primaryKnowledge
      ? `${trimTo(primaryKnowledge.summary || primaryKnowledge.body, 420)}${
          secondaryKnowledge ? `\n\nЩе по темі:\n- **${secondaryKnowledge.title}**: ${trimTo(secondaryKnowledge.summary || secondaryKnowledge.body, 140)}` : ""
        }${attachmentsBlock}`
      : productGuidance && infoRequest
        ? `${noKnowledgeMessage}${attachmentsBlock}\n\n${productGuidance.markdown}`
        : `${noKnowledgeMessage}${attachmentsBlock}\n\nЩо можна зробити далі:\n- додати коротку статтю в базу знань\n- або ввімкнути OpenAI API для живих відповідей`;

  return {
    title:
      trimTo(
        params.message
          .replace(/\s+/g, " ")
          .replace(/[.!?]+$/g, ""),
        96
      ) || "Нове звернення до ToSho AI",
    summary: shouldEscalate
      ? "Потрібна ескалація з контекстом сторінки та маршрутом."
      : primaryKnowledge
        ? "Є коротка відповідь по базі знань."
        : productGuidance && infoRequest
          ? "Є базова підказка по продукту, але без curated статті."
          : "Підтвердженої відповіді в базі знань поки немає.",
    answerMarkdown,
    playfulLine: shouldEscalate
      ? "Контекст уже зі мною."
      : primaryKnowledge
        ? "Коротко і по ділу."
        : productGuidance && infoRequest
          ? "Є базовий флоу, але без прямого підтвердження деталей."
          : params.openAiEnabled
            ? "Тут бракує точного knowledge source."
            : "Тут бракує або точного source, або OpenAI brain.",
    status,
    priority,
    domain,
    confidence,
    shouldEscalate,
    shouldNotify,
    knowledgeIds: params.knowledge.map((item) => item.id),
    internalSummary: shouldEscalate
      ? `Потрібно перевірити ${domain}. Route: ${params.routeContext.routeLabel}.`
      : `Відповідь сформована з knowledge base для ${params.routeContext.routeLabel}.`,
  };
}

function extractResponseOutputText(payload: JsonRecord) {
  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim()) return direct;

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content?: unknown[] }).content ?? [])
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }

  return "";
}

async function callOpenAiDecision(params: {
  message: string;
  mode: ToShoAiMode;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
  runtimeErrors: RuntimeErrorRow[];
  knowledge: KnowledgeItemRow[];
  recentMessages: SupportMessageRow[];
  attachments: SupportAttachmentInput[];
}): Promise<AssistantDecision | null> {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  const model = normalizeText(process.env.OPENAI_MODEL) || "gpt-5.4";
  const inferredDomain = deriveDomainFromMessage(params.message, params.routeContext.domainHint);
  const productGuidance = getDomainProductGuidance(inferredDomain);
  const recentMessages = params.recentMessages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${trimTo(message.body, 500)}`)
    .join("\n");

  const knowledgeBlock =
    params.knowledge.length > 0
      ? params.knowledge
          .map(
            (item) =>
              `ID: ${item.id}\nTITLE: ${item.title}\nSUMMARY: ${trimTo(item.summary || "", 220)}\nBODY: ${trimTo(item.body, 650)}\nTAGS: ${(item.tags ?? []).join(", ")}\nSOURCE: ${normalizeText(item.source_label) || "-"}`
          )
          .join("\n\n---\n\n")
      : "No curated knowledge matched this request.";

  const runtimeBlock =
    params.runtimeErrors.length > 0
      ? params.runtimeErrors
          .slice(0, 3)
          .map(
            (row) =>
              `${trimTo(row.title || "runtime error", 160)} @ ${normalizeText(row.href) || params.routeContext.href}`
          )
          .join("\n")
      : "No recent runtime errors for this route.";

  const attachmentBlock =
    params.attachments.length > 0
      ? params.attachments
          .map(
            (attachment) =>
              `${attachment.fileName} (${attachment.mimeType || "file"}${attachment.fileSize ? `, ${attachment.fileSize} bytes` : ""})`
          )
          .join("\n")
      : "No attachments.";
  const productGuidanceBlock = productGuidance
    ? `SUMMARY: ${productGuidance.summary}\nGUIDANCE:\n${productGuidance.markdown}`
    : "No built-in product guidance for this domain.";

  const developerPrompt = [
    "You are ToSho AI, an embedded CRM command layer for a creative agency.",
    "Reply in Ukrainian.",
    "Tone: calm, premium, operational, slightly playful, never clownish, never cheesy.",
    "Only rely on the provided CRM context, recent runtime signals, and curated knowledge snippets.",
    "For simple informational how-to questions, answer directly first.",
    "For capability questions like 'чи можна', 'чи є', 'чи можна в одному', do not answer yes/no unless the evidence explicitly supports that exact claim.",
    "If the current CRM flow suggests a stricter rule than a broad snippet, prefer the stricter operational rule.",
    "For estimate questions about multiple different products, prefer separate estimates unless the evidence explicitly confirms multi-product support inside one estimate.",
    "If evidence is weak, say so through a lower confidence and prefer escalation.",
    "Keep answer_markdown concise and practical. No model disclaimers.",
    "Prefer 2-5 short paragraphs or a short numbered list. No long intros.",
    "Do not start with filler like 'Так, базово' or 'Коротко по суті' unless it adds value.",
    "Do not end with 'якщо хочеш, можу ще...' unless the user explicitly asked for expansion.",
    "Avoid sounding like documentation; answer like a sharp operator inside the CRM.",
    "Do not talk about routing, owners, or escalation unless you actually decide to escalate.",
    "If mode is fix/route/resolve, bias toward escalation and a concrete route owner.",
    "Built-in product guidance is weaker than curated knowledge but stronger than guessing.",
    "If knowledge snippets are relevant, reference them through knowledge_ids.",
    "If the snippets are only adjacent context and not direct proof, say that you cannot confirm it exactly.",
  ].join(" ");

  const userPrompt = [
    `MODE: ${params.mode}`,
    `CURRENT_ROUTE: ${params.routeContext.routeLabel} (${params.routeContext.href})`,
    `CURRENT_TITLE: ${params.routeContext.title}`,
    `DOMAIN_HINT: ${params.routeContext.domainHint}`,
    `ENTITY: ${params.routeContext.entityType || "-"} / ${params.routeContext.entityId || "-"}`,
    `USER_MESSAGE:\n${params.message}`,
    `RECENT_THREAD:\n${recentMessages || "No prior messages."}`,
    `RUNTIME_ERRORS:\n${runtimeBlock}`,
    `ATTACHMENTS:\n${attachmentBlock}`,
    `PRODUCT_GUIDANCE:\n${productGuidanceBlock}`,
    `CURATED_KNOWLEDGE:\n${knowledgeBlock}`,
    "Return a structured decision for the CRM assistant.",
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      input: [
        { role: "developer", content: developerPrompt },
        { role: "user", content: userPrompt },
      ],
      max_output_tokens: 1600,
      text: {
        format: {
          type: "json_schema",
          name: "tosho_ai_decision",
          strict: true,
          schema: OPENAI_STRUCTURED_SCHEMA,
        },
      },
    }),
  });

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    const error =
      payload && typeof payload.error === "object" && payload.error && "message" in payload.error
        ? (payload.error as { message?: string }).message
        : "OpenAI request failed";
    throw new Error(error);
  }

  const rawText = extractResponseOutputText(payload);
  if (!rawText) return null;

  const parsed = JSON.parse(rawText) as {
    title: string;
    summary: string;
    answer_markdown: string;
    playful_line: string;
    status: ToShoAiStatus;
    priority: ToShoAiPriority;
    domain: ToShoAiDomain;
    confidence: number;
    should_escalate: boolean;
    should_notify: boolean;
    knowledge_ids: string[];
    internal_summary: string;
  };

  return {
    title: trimTo(parsed.title || "Нове звернення до ToSho AI", 120),
    summary: trimTo(parsed.summary || "Відповідь підготовлено.", 240),
    answerMarkdown: normalizeText(parsed.answer_markdown) || "Поки що не вистачає підтвердженого контексту для відповіді.",
    playfulLine: trimTo(parsed.playful_line || "", 180),
    status: normalizeStatus(parsed.status),
    priority: normalizePriority(parsed.priority),
    domain: normalizeDomain(parsed.domain),
    confidence: clampConfidence(parsed.confidence),
    shouldEscalate: Boolean(parsed.should_escalate),
    shouldNotify: Boolean(parsed.should_notify),
    knowledgeIds: toPlainList(parsed.knowledge_ids),
    internalSummary: trimTo(parsed.internal_summary || "", 300),
  };
}

async function selectAccessibleRequest(
  adminClient: ReturnType<typeof createClient>,
  auth: AuthContext,
  requestId: string
) {
  const { data, error } = await adminClient
    .schema("tosho")
    .from("support_requests")
    .select(
      "id,workspace_id,team_id,created_by,created_by_label,assignee_user_id,assignee_label,mode,status,priority,domain,title,summary,route_label,route_href,entity_type,entity_id,context,ai_confidence,escalated_at,resolved_at,last_message_at,created_at,updated_at"
    )
    .eq("id", requestId)
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const row = data as SupportRequestRow | null;
  if (!row) return null;
  if (
    row.created_by !== auth.userId &&
    row.assignee_user_id !== auth.userId &&
    !auth.canManageQueue
  ) {
    return null;
  }
  return row;
}

function mapRequestSummary(row: SupportRequestRow) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? null,
    mode: row.mode,
    status: row.status,
    priority: row.priority,
    domain: row.domain,
    routeLabel: row.route_label ?? null,
    routeHref: row.route_href ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    createdByLabel: row.created_by_label ?? null,
    assigneeLabel: row.assignee_label ?? null,
    aiConfidence:
      typeof row.ai_confidence === "number"
        ? row.ai_confidence
        : row.ai_confidence !== null && row.ai_confidence !== undefined
          ? Number(row.ai_confidence)
          : null,
  };
}

async function loadThread(
  adminClient: ReturnType<typeof createClient>,
  auth: AuthContext,
  requestId: string
) {
  const request = await selectAccessibleRequest(adminClient, auth, requestId);
  if (!request) return null;

  const [{ data: messagesData, error: messagesError }, { data: feedbackData, error: feedbackError }] =
    await Promise.all([
      adminClient
        .schema("tosho")
        .from("support_messages")
        .select("id,request_id,workspace_id,role,user_id,actor_label,body,metadata,created_at")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true }),
      adminClient
        .schema("tosho")
        .from("support_feedback")
        .select("message_id,value")
        .eq("request_id", requestId)
        .eq("user_id", auth.userId),
    ]);

  if (messagesError) throw new Error(messagesError.message);
  if (feedbackError) throw new Error(feedbackError.message);

  const feedbackByMessageId = new Map(
    ((feedbackData ?? []) as SupportFeedbackRow[])
      .filter((row) => normalizeText(row.message_id))
      .map((row) => [row.message_id as string, row.value ?? null])
  );

  const messages = ((messagesData ?? []) as SupportMessageRow[]).map((row) => {
    const metadata = (row.metadata ?? {}) as JsonRecord;
    const rawSources = Array.isArray(metadata.sources) ? metadata.sources : [];
    const rawAttachments = toSupportAttachments(metadata.attachments);
    const sources = rawSources
      .map((source) => {
        if (!source || typeof source !== "object") return null;
        const typed = source as {
          id?: unknown;
          title?: unknown;
          sourceLabel?: unknown;
          sourceHref?: unknown;
        };
        if (typeof typed.id !== "string" || typeof typed.title !== "string") return null;
        return {
          id: typed.id,
          title: typed.title,
          sourceLabel: typeof typed.sourceLabel === "string" ? typed.sourceLabel : null,
          sourceHref: typeof typed.sourceHref === "string" ? typed.sourceHref : null,
        };
      })
      .filter((value): value is { id: string; title: string; sourceLabel: string | null; sourceHref: string | null } => Boolean(value));

    return {
      id: row.id,
      role: row.role,
      body: row.body,
      actorLabel: row.actor_label ?? null,
      createdAt: row.created_at,
      feedback: feedbackByMessageId.get(row.id) ?? null,
      sources,
      attachments: rawAttachments,
      metadata: metadata,
    };
  });

  const signedMessages = await Promise.all(
    messages.map(async (message) => ({
      ...message,
      attachments: await Promise.all(
        message.attachments.map((attachment) => signSupportAttachment(adminClient, attachment))
      ),
    }))
  );

  return {
    ...mapRequestSummary(request),
    context: (request.context ?? {}) as JsonRecord,
    messages: signedMessages,
  };
}

async function buildSnapshot(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
  selectedRequestId?: string | null;
  includeHistory?: boolean;
  includeKnowledge?: boolean;
}) {
  const { adminClient, auth, routeContext } = params;
  const shouldIncludeHistory = params.includeHistory === true;
  const shouldIncludeKnowledge = params.includeKnowledge === true;
  const recentBaseQuery = adminClient
    .schema("tosho")
    .from("support_requests")
    .select(
      "id,workspace_id,team_id,created_by,created_by_label,assignee_user_id,assignee_label,mode,status,priority,domain,title,summary,route_label,route_href,entity_type,entity_id,context,ai_confidence,escalated_at,resolved_at,last_message_at,created_at,updated_at"
    )
    .eq("workspace_id", auth.workspaceId)
    .order("last_message_at", { ascending: false })
    .limit(16);

  const queueBaseQuery = adminClient
    .schema("tosho")
    .from("support_requests")
    .select(
      "id,workspace_id,team_id,created_by,created_by_label,assignee_user_id,assignee_label,mode,status,priority,domain,title,summary,route_label,route_href,entity_type,entity_id,context,ai_confidence,escalated_at,resolved_at,last_message_at,created_at,updated_at"
    )
    .eq("workspace_id", auth.workspaceId)
    .in("status", ["open", "in_progress", "waiting_user"])
    .order("updated_at", { ascending: false })
    .limit(18);

  const recentQuery = auth.canManageQueue
    ? recentBaseQuery
    : recentBaseQuery.or(`created_by.eq.${auth.userId},assignee_user_id.eq.${auth.userId}`);
  const queueQuery = auth.canManageQueue
    ? queueBaseQuery
    : adminClient
        .schema("tosho")
        .from("support_requests")
        .select(
          "id,workspace_id,team_id,created_by,created_by_label,assignee_user_id,assignee_label,mode,status,priority,domain,title,summary,route_label,route_href,entity_type,entity_id,context,ai_confidence,escalated_at,resolved_at,last_message_at,created_at,updated_at"
        )
        .eq("workspace_id", auth.workspaceId)
        .or(`created_by.eq.${auth.userId},assignee_user_id.eq.${auth.userId}`)
        .in("status", ["open", "in_progress", "waiting_user"])
        .order("updated_at", { ascending: false })
        .limit(10);

  const [recentResult, queueResult, knowledgeItems, runtimeErrors] = await Promise.all([
    shouldIncludeHistory ? recentQuery : Promise.resolve({ data: [], error: null }),
    shouldIncludeHistory ? queueQuery : Promise.resolve({ data: [], error: null }),
    shouldIncludeKnowledge
      ? listKnowledgeItems(adminClient, auth.workspaceId, auth.canManageKnowledge)
      : Promise.resolve([] as KnowledgeItemRow[]),
    listRuntimeErrors(adminClient, auth.teamId, auth.userId, routeContext.href, routeContext.pathname),
  ]);

  if (recentResult.error) throw new Error(recentResult.error.message);
  if (queueResult.error) throw new Error(queueResult.error.message);

  const recentRequests = ((recentResult.data ?? []) as SupportRequestRow[]).map(mapRequestSummary);
  const queue = ((queueResult.data ?? []) as SupportRequestRow[]).map(mapRequestSummary);

  const selectedRequestId = normalizeText(params.selectedRequestId) || "";
  const selectedThread = selectedRequestId ? await loadThread(adminClient, auth, selectedRequestId) : null;

  return {
    routeContext,
    permissions: {
      canManageQueue: auth.canManageQueue,
      canManageKnowledge: auth.canManageKnowledge,
    },
    diagnostics: {
      recentRuntimeErrorCount: runtimeErrors.length,
      latestRuntimeErrorTitle: runtimeErrors[0]?.title ?? null,
      latestRuntimeErrorAt: runtimeErrors[0]?.created_at ?? null,
    },
    stats: {
      myOpenCount: recentRequests.filter((row) => row.status !== "resolved").length,
      queueOpenCount: queue.length,
      knowledgeActiveCount: knowledgeItems.filter((item) => item.status === "active").length,
    },
    recentRequests,
    queue,
    selectedThread,
    knowledgeItems: knowledgeItems.map((item) => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      summary: item.summary ?? null,
      body: item.body,
      tags: item.tags ?? [],
      keywords: item.keywords ?? [],
      status: item.status,
      sourceLabel: item.source_label ?? null,
      sourceHref: item.source_href ?? null,
      updatedAt: item.updated_at,
    })),
  };
}

function buildAbsoluteHref(routeHref?: string | null) {
  const trimmed = normalizeText(routeHref);
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const baseUrl =
    normalizeText(process.env.TOSHO_APP_BASE_URL) ||
    normalizeText(process.env.URL) ||
    normalizeText(process.env.DEPLOY_PRIME_URL) ||
    normalizeText(process.env.DEPLOY_URL);
  if (!baseUrl) return trimmed;
  return `${baseUrl.replace(/\/+$/g, "")}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function buildSupportNotificationHref(routeHref: string | null | undefined, requestId: string) {
  const trimmed = normalizeText(routeHref) || "/overview";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const [pathnamePart, searchPart = ""] = trimmed.split("?");
  const params = new URLSearchParams(searchPart);
  params.set("tosho_ai", "open");
  params.set("tosho_ai_request", requestId);
  const nextSearch = params.toString();

  return `${pathnamePart}${nextSearch ? `?${nextSearch}` : ""}`;
}

async function sendTelegramEscalation(params: {
  requestId: string;
  title: string;
  summary: string;
  priority: ToShoAiPriority;
  domain: ToShoAiDomain;
  routeLabel?: string | null;
  routeHref?: string | null;
  actorLabel: string;
}) {
  const token = normalizeText(process.env.TELEGRAM_SUPPORT_BOT_TOKEN);
  const chatId = normalizeText(process.env.TELEGRAM_SUPPORT_CHAT_ID);
  if (!token || !chatId) return false;

  const routeLink = buildAbsoluteHref(buildSupportNotificationHref(params.routeHref, params.requestId));
  const lines = [
    "ToSho AI",
    `${params.title}`,
    `Пріоритет: ${params.priority}`,
    `Домен: ${params.domain}`,
    `Ініціатор: ${params.actorLabel}`,
    params.routeLabel ? `Контекст: ${params.routeLabel}` : "",
    params.summary ? `Суть: ${params.summary}` : "",
    routeLink ? `Відкрити: ${routeLink}` : "",
  ].filter(Boolean);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join("\n"),
      disable_web_page_preview: true,
    }),
  });

  return response.ok;
}

async function notifyRoutingRecipients(params: {
  adminClient: ReturnType<typeof createClient>;
  request: SupportRequestRow;
  recipients: RoutingCandidate[];
  actorLabel: string;
}) {
  if (params.recipients.length === 0) return false;

  const rows = params.recipients.map((recipient) => ({
    user_id: recipient.userId,
    title: `ToSho AI: ${params.request.title}`,
    body: trimTo(
      `${params.actorLabel} передав(ла) кейс · ${params.request.domain} · ${params.request.priority}`,
      180
    ),
    href: buildSupportNotificationHref(params.request.route_href, params.request.id),
    type: params.request.priority === "urgent" || params.request.priority === "high" ? "warning" : "info",
  }));

  await deliverNotifications(params.adminClient, rows);
  return true;
}

async function handleSend(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  body: RequestBody;
}) {
  const routeContext = sanitizeRouteContext(params.body.routeContext);
  const message = normalizeText(params.body.message);
  if (!message) {
    throw new Error("Напиши, що треба зробити або що саме не працює.");
  }

  const mode = normalizeMode(params.body.mode);
  const existingRequest = normalizeText(params.body.requestId)
    ? await selectAccessibleRequest(params.adminClient, params.auth, normalizeText(params.body.requestId))
    : null;
  const attachments = toSupportAttachments(params.body.attachments);

  const activeKnowledge = await listKnowledgeItems(params.adminClient, params.auth.workspaceId, false);
  const knowledgeCandidates = selectKnowledgeCandidates(activeKnowledge, message, routeContext.routeLabel);
  const runtimeErrors = await listRuntimeErrors(
    params.adminClient,
    params.auth.teamId,
    params.auth.userId,
    routeContext.href,
    routeContext.pathname
  );

  const recentMessages = existingRequest
    ? (((
        await params.adminClient
          .schema("tosho")
          .from("support_messages")
          .select("id,request_id,workspace_id,role,user_id,actor_label,body,metadata,created_at")
          .eq("request_id", existingRequest.id)
          .order("created_at", { ascending: false })
          .limit(12)
      ).data ?? []) as SupportMessageRow[])
        .reverse()
    : [];

  let assistantDecision: AssistantDecision | null = null;
  let usedFallback = false;
  const analyticsMessage = buildAnalyticsMessageWithContext(message, recentMessages);
  const analyticsRequested = shouldRunAnalytics(analyticsMessage);

  if (analyticsRequested) {
    assistantDecision = await buildAnalyticsDecision({
      adminClient: params.adminClient,
      auth: params.auth,
      message: analyticsMessage,
      routeContext,
    });
  }

  if (!assistantDecision) {
    try {
      assistantDecision = await callOpenAiDecision({
        message,
        mode,
        routeContext,
        runtimeErrors,
        knowledge: knowledgeCandidates,
        recentMessages,
        attachments,
      });
    } catch {
      assistantDecision = null;
    }
  }

  if (!assistantDecision) {
    usedFallback = true;
    assistantDecision = buildFallbackDecision({
      message,
      mode,
      routeContext,
      runtimeErrors,
      knowledge: knowledgeCandidates,
      attachments,
      openAiEnabled: Boolean(normalizeText(process.env.OPENAI_API_KEY)),
    });
  }

  const routingCandidates = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const rankedRecipients = rankRoutingRecipients(routingCandidates, assistantDecision.domain, params.auth.userId);
  const preservedAssignee = existingRequest?.assignee_user_id
    ? rankedRecipients.find((recipient) => recipient.userId === existingRequest.assignee_user_id) ??
      routingCandidates.find((candidate) => candidate.userId === existingRequest.assignee_user_id) ??
      null
    : null;
  const selectedRecipients = preservedAssignee ? [preservedAssignee, ...rankedRecipients.filter((candidate) => candidate.userId !== preservedAssignee.userId)] : rankedRecipients;
  const primaryRecipient = selectedRecipients[0] ?? null;

  const nowIso = new Date().toISOString();
  const nextStatus = assistantDecision.shouldEscalate
    ? primaryRecipient
      ? "in_progress"
      : "open"
    : assistantDecision.status;

  const requestPayload = {
    workspace_id: params.auth.workspaceId,
    team_id: params.auth.teamId,
    created_by: existingRequest?.created_by ?? params.auth.userId,
    created_by_label: existingRequest?.created_by_label ?? params.auth.actorLabel,
    assignee_user_id: primaryRecipient?.userId ?? existingRequest?.assignee_user_id ?? null,
    assignee_label: primaryRecipient?.label ?? existingRequest?.assignee_label ?? null,
    mode,
    status: existingRequest?.status === "resolved" && assistantDecision.shouldEscalate ? "open" : nextStatus,
    priority: assistantDecision.priority,
    domain: assistantDecision.domain,
    title: assistantDecision.title,
    summary: assistantDecision.summary,
    route_label: routeContext.routeLabel,
    route_href: routeContext.href,
    entity_type: routeContext.entityType,
    entity_id: routeContext.entityId,
    ai_confidence: assistantDecision.confidence,
    context: {
      route_context: routeContext,
      runtime_errors: runtimeErrors.map((row) => ({
        title: row.title ?? null,
        href: row.href ?? null,
        created_at: row.created_at,
      })),
      last_internal_summary: assistantDecision.internalSummary,
    },
    escalated_at: assistantDecision.shouldEscalate ? existingRequest?.escalated_at ?? nowIso : existingRequest?.escalated_at ?? null,
    resolved_at:
      (existingRequest?.status === "resolved" || nextStatus === "resolved") && !assistantDecision.shouldEscalate
        ? existingRequest?.resolved_at ?? nowIso
        : nextStatus === "resolved"
          ? nowIso
          : null,
    last_message_at: nowIso,
  };

  let requestRow: SupportRequestRow;
  if (existingRequest) {
    const { data, error } = await params.adminClient
      .schema("tosho")
      .from("support_requests")
      .update(requestPayload)
      .eq("id", existingRequest.id)
      .select(
        "id,workspace_id,team_id,created_by,created_by_label,assignee_user_id,assignee_label,mode,status,priority,domain,title,summary,route_label,route_href,entity_type,entity_id,context,ai_confidence,escalated_at,resolved_at,last_message_at,created_at,updated_at"
      )
      .maybeSingle();
    if (error || !data) throw new Error(error?.message || "Не вдалося оновити звернення.");
    requestRow = data as SupportRequestRow;
  } else {
    const { data, error } = await params.adminClient
      .schema("tosho")
      .from("support_requests")
      .insert(requestPayload)
      .select(
        "id,workspace_id,team_id,created_by,created_by_label,assignee_user_id,assignee_label,mode,status,priority,domain,title,summary,route_label,route_href,entity_type,entity_id,context,ai_confidence,escalated_at,resolved_at,last_message_at,created_at,updated_at"
      )
      .maybeSingle();
    if (error || !data) throw new Error(error?.message || "Не вдалося створити звернення.");
    requestRow = data as SupportRequestRow;
  }

  const sourceItems = knowledgeCandidates
    .filter((item) => assistantDecision?.knowledgeIds.includes(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title,
      sourceLabel: item.source_label ?? null,
      sourceHref: item.source_href ?? null,
    }));

  const { error: messageInsertError } = await params.adminClient.schema("tosho").from("support_messages").insert([
    {
      request_id: requestRow.id,
      workspace_id: params.auth.workspaceId,
      role: "user",
      user_id: params.auth.userId,
      actor_label: params.auth.actorLabel,
      body: message,
      metadata: {
        mode,
        routeContext,
        attachments,
      },
    },
    {
      request_id: requestRow.id,
      workspace_id: params.auth.workspaceId,
      role: "assistant",
      user_id: null,
      actor_label: "ToSho AI",
      body: assistantDecision.answerMarkdown,
      metadata: {
        confidence: assistantDecision.confidence,
        internalSummary: assistantDecision.internalSummary,
        playfulLine: assistantDecision.playfulLine,
        usedFallback,
        sources: sourceItems,
        analytics: assistantDecision.analytics ?? null,
      },
    },
  ]);

  if (messageInsertError) throw new Error(messageInsertError.message);

  const shouldNotifyNow =
    assistantDecision.shouldNotify &&
    (existingRequest == null ||
      existingRequest.status === "resolved" ||
      !existingRequest.assignee_user_id);

  let notified = false;
  if (shouldNotifyNow) {
    notified = await notifyRoutingRecipients({
      adminClient: params.adminClient,
      request: requestRow,
      recipients: primaryRecipient ? [primaryRecipient] : [],
      actorLabel: params.auth.actorLabel,
    });

    await sendTelegramEscalation({
      requestId: requestRow.id,
      title: requestRow.title,
      summary: assistantDecision.internalSummary,
      priority: requestRow.priority,
      domain: requestRow.domain,
      routeLabel: requestRow.route_label,
      routeHref: requestRow.route_href,
      actorLabel: params.auth.actorLabel,
    }).catch(() => false);
  }

  const snapshot = await buildSnapshot({
    adminClient: params.adminClient,
    auth: params.auth,
    routeContext,
    selectedRequestId: requestRow.id,
    includeHistory: params.body.includeHistory === true,
    includeKnowledge: params.body.includeKnowledge === true,
  });

  return {
    snapshot,
    meta: {
      requestCreated: !existingRequest,
      notified,
      usedFallback,
      info: assistantDecision.playfulLine || null,
    },
  };
}

async function handleFeedback(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  body: RequestBody;
}) {
  const requestId = normalizeText(params.body.requestId);
  const messageId = normalizeText(params.body.messageId);
  const feedback = params.body.feedback;
  if (!requestId || !messageId || (feedback !== "helpful" && feedback !== "not_helpful")) {
    throw new Error("Не вистачає даних для feedback.");
  }

  const request = await selectAccessibleRequest(params.adminClient, params.auth, requestId);
  if (!request) {
    throw new Error("Звернення не знайдено або доступ заборонено.");
  }

  const { error: deleteError } = await params.adminClient
    .schema("tosho")
    .from("support_feedback")
    .delete()
    .eq("request_id", requestId)
    .eq("message_id", messageId)
    .eq("user_id", params.auth.userId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await params.adminClient
    .schema("tosho")
    .from("support_feedback")
    .insert({
      request_id: requestId,
      message_id: messageId,
      workspace_id: params.auth.workspaceId,
      user_id: params.auth.userId,
      value: feedback,
    });
  if (insertError) throw new Error(insertError.message);

  if (feedback === "not_helpful") {
    await params.adminClient
      .schema("tosho")
      .from("support_requests")
      .update({
        status: "open",
        priority: request.priority === "low" ? "medium" : request.priority,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
  }

  return {
    snapshot: await buildSnapshot({
      adminClient: params.adminClient,
      auth: params.auth,
      routeContext: sanitizeRouteContext(params.body.routeContext),
      selectedRequestId: requestId,
      includeHistory: params.body.includeHistory === true,
      includeKnowledge: params.body.includeKnowledge === true,
    }),
  };
}

async function handleUpdateRequest(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  body: RequestBody;
}) {
  if (!params.auth.canManageQueue) {
    throw new Error("Недостатньо прав для зміни черги.");
  }

  const requestId = normalizeText(params.body.requestId);
  if (!requestId) throw new Error("Не передано requestId.");
  const request = await selectAccessibleRequest(params.adminClient, params.auth, requestId);
  if (!request) throw new Error("Звернення не знайдено.");

  const nextStatus = normalizeStatus(params.body.status || request.status);
  const nextPriority = normalizePriority(params.body.priority || request.priority);

  const { error } = await params.adminClient
    .schema("tosho")
    .from("support_requests")
    .update({
      status: nextStatus,
      priority: nextPriority,
      resolved_at: nextStatus === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", requestId);
  if (error) throw new Error(error.message);

  return {
    snapshot: await buildSnapshot({
      adminClient: params.adminClient,
      auth: params.auth,
      routeContext: sanitizeRouteContext(params.body.routeContext),
      selectedRequestId: requestId,
      includeHistory: params.body.includeHistory === true,
      includeKnowledge: params.body.includeKnowledge === true,
    }),
  };
}

async function handleUpsertKnowledge(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  body: RequestBody;
}) {
  if (!params.auth.canManageKnowledge) {
    throw new Error("Недостатньо прав для бази знань.");
  }

  const knowledge = params.body.knowledge;
  const title = normalizeText(knowledge?.title);
  const body = normalizeText(knowledge?.body);
  if (!title || !body) {
    throw new Error("Для картки знань потрібні назва і зміст.");
  }

  const slug = normalizeSlug(normalizeText(knowledge?.slug) || title);
  if (!slug) throw new Error("Не вдалося сформувати slug для картки.");

  const payload = {
    workspace_id: params.auth.workspaceId,
    title,
    slug,
    summary: normalizeText(knowledge?.summary) || null,
    body,
    tags: toPlainList(knowledge?.tags),
    keywords: toPlainList(knowledge?.keywords),
    status:
      knowledge?.status === "draft" || knowledge?.status === "archived" || knowledge?.status === "active"
        ? knowledge.status
        : "active",
    source_label: normalizeText(knowledge?.sourceLabel) || null,
    source_href: normalizeText(knowledge?.sourceHref) || null,
    updated_by: params.auth.userId,
  };

  if (normalizeText(knowledge?.id)) {
    const { error } = await params.adminClient
      .schema("tosho")
      .from("support_knowledge_items")
      .update(payload)
      .eq("id", normalizeText(knowledge?.id));
    if (error) throw new Error(error.message);
  } else {
    const { error } = await params.adminClient.schema("tosho").from("support_knowledge_items").insert({
      ...payload,
      created_by: params.auth.userId,
    });
    if (error) throw new Error(error.message);
  }

  return {
    snapshot: await buildSnapshot({
      adminClient: params.adminClient,
      auth: params.auth,
      routeContext: sanitizeRouteContext(params.body.routeContext),
      selectedRequestId: normalizeText(params.body.requestId) || null,
      includeHistory: params.body.includeHistory === true,
      includeKnowledge: true,
    }),
  };
}

async function handleDeleteKnowledge(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  body: RequestBody;
}) {
  if (!params.auth.canManageKnowledge) {
    throw new Error("Недостатньо прав для бази знань.");
  }

  const knowledgeId = normalizeText(params.body.knowledge?.id);
  if (!knowledgeId) throw new Error("Не передано knowledge id.");

  const { error } = await params.adminClient
    .schema("tosho")
    .from("support_knowledge_items")
    .delete()
    .eq("id", knowledgeId)
    .eq("workspace_id", params.auth.workspaceId);
  if (error) throw new Error(error.message);

  return {
    snapshot: await buildSnapshot({
      adminClient: params.adminClient,
      auth: params.auth,
      routeContext: sanitizeRouteContext(params.body.routeContext),
      selectedRequestId: normalizeText(params.body.requestId) || null,
      includeHistory: params.body.includeHistory === true,
      includeKnowledge: true,
    }),
  };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization token" });
  }

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const auth = await resolveAuthContext(userClient, adminClient);
    const routeContext = sanitizeRouteContext(body.routeContext);

    switch (body.action) {
      case "send":
        return jsonResponse(
          200,
          await handleSend({
            adminClient,
            auth,
            body,
          })
        );
      case "feedback":
        return jsonResponse(
          200,
          await handleFeedback({
            adminClient,
            auth,
            body,
          })
        );
      case "update_request":
        return jsonResponse(
          200,
          await handleUpdateRequest({
            adminClient,
            auth,
            body,
          })
        );
      case "upsert_knowledge":
        return jsonResponse(
          200,
          await handleUpsertKnowledge({
            adminClient,
            auth,
            body,
          })
        );
      case "delete_knowledge":
        return jsonResponse(
          200,
          await handleDeleteKnowledge({
            adminClient,
            auth,
            body,
          })
        );
      case "mention_suggestions":
        return jsonResponse(
          200,
          await handleMentionSuggestions({
            adminClient,
            auth,
            body,
          })
        );
      case "bootstrap":
      default:
        return jsonResponse(200, {
          snapshot: await buildSnapshot({
            adminClient,
            auth,
            routeContext,
            selectedRequestId: normalizeText(body.requestId) || null,
            includeHistory: body.includeHistory === true,
            includeKnowledge: body.includeKnowledge === true,
          }),
        });
    }
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "ToSho AI request failed",
    });
  }
};

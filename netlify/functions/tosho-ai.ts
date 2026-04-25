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
  embedding?: unknown;
  embedding_model?: string | null;
  embedding_updated_at?: string | null;
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

type SuggestedAction = {
  label: string;
  text: string;
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

type QuotePackDraftItem = {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  decoration: string | null;
  catalogModelId: string | null;
  catalogTypeId: string | null;
  catalogKindId: string | null;
  catalogModelName: string | null;
  unitPrice: number;
};

type QuotePackDraft = {
  kind: "quote_pack";
  sourceMessage: string;
  party: {
    kind: "customer" | "lead";
    id: string;
    name: string;
    logoUrl: string | null;
  } | null;
  items: QuotePackDraftItem[];
  createdAt: string;
};

type QuotePackCreationResult = {
  quoteIds: string[];
  quoteNumbers: string[];
  quoteSetId: string | null;
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
  suggestedActions?: SuggestedAction[];
  quotePackDraft?: QuotePackDraft | null;
  quotePackCreated?: QuotePackCreationResult | null;
  quotePackCleared?: boolean;
};

type OpenAiDiagnostics = {
  attempted: boolean;
  ok: boolean;
  model: string | null;
  responseId: string | null;
  previousResponseId: string | null;
  latencyMs: number | null;
  error: string | null;
  status: number | null;
  usedImageInputs: number;
  promptKnowledgeCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

type OpenAiDecisionResult = {
  decision: AssistantDecision;
  diagnostics: OpenAiDiagnostics;
  crmToolDiagnostics: CrmToolDiagnostics | null;
};

type KnowledgeRetrievalDiagnostics = {
  strategy: "embedding" | "keyword";
  attempted: boolean;
  ok: boolean;
  model: string | null;
  candidateCount: number;
  selectedCount: number;
  persistedCount: number;
  refreshedCount: number;
  latencyMs: number | null;
  totalTokens: number | null;
  error: string | null;
};

type CrmToolDiagnostics = {
  attempted: boolean;
  requested: string[];
  executed: string[];
  latencyMs: number | null;
  error: string | null;
};

type AnalyticsResult = {
  title: string;
  summary: string;
  markdown: string;
  domain: ToShoAiDomain;
  confidence: number;
  analytics: AnalyticsPayload;
  suggestedActions?: SuggestedAction[];
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
const KNOWLEDGE_RETRIEVAL_LIMIT = 64;

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function httpError(statusCode: number, message: string) {
  return new HttpError(statusCode, message);
}

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

const KNOWLEDGE_COLUMNS =
  "id,workspace_id,title,slug,summary,body,tags,keywords,status,source_label,source_href,updated_at";
const KNOWLEDGE_COLUMNS_WITH_EMBEDDING = `${KNOWLEDGE_COLUMNS},embedding,embedding_model,embedding_updated_at`;

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

function isOpenAiImageAttachment(attachment: SupportAttachmentInput) {
  const mimeType = normalizeText(attachment.mimeType).toLowerCase();
  if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp" || mimeType === "image/gif") {
    return true;
  }
  const path = normalizeText(attachment.storagePath).toLowerCase();
  return /\.(png|jpe?g|webp|gif)$/i.test(path);
}

async function buildOpenAiImageInputs(
  adminClient: ReturnType<typeof createClient>,
  attachments: SupportAttachmentInput[]
) {
  const imageAttachments = attachments.filter(isOpenAiImageAttachment).slice(0, 4);
  const signed = await Promise.all(
    imageAttachments.map((attachment) => signSupportAttachment(adminClient, attachment).catch(() => null))
  );

  return signed
    .filter((attachment): attachment is SupportAttachmentInput & { url: string } =>
      Boolean(attachment?.url)
    )
    .map((attachment) => ({
      type: "input_image",
      image_url: attachment.url,
      detail: "low",
    }));
}

function extractUsage(payload: JsonRecord) {
  const usage = payload.usage && typeof payload.usage === "object" ? (payload.usage as JsonRecord) : null;
  const toNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    inputTokens: toNumber(usage?.input_tokens),
    outputTokens: toNumber(usage?.output_tokens),
    totalTokens: toNumber(usage?.total_tokens),
  };
}

async function logToShoAiRuntimeSignal(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
  title: string;
  metadata: JsonRecord;
}) {
  await params.adminClient
    .schema("tosho")
    .from("runtime_errors")
    .insert({
      team_id: params.auth.teamId,
      user_id: params.auth.userId,
      actor_name: params.auth.actorLabel,
      source: "boundary",
      title: params.title,
      href: params.routeContext.href,
      metadata: {
        source: "tosho_ai",
        ...params.metadata,
      },
    })
    .throwOnError();
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

const DEFAULT_MANAGER_RATE = 10;
const DEFAULT_FIXED_COST_RATE = 30;
const DEFAULT_VAT_RATE = 20;

function getQuoteMonthCode(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${year}`;
}

function formatQuoteNumber(monthCode: string, sequence: number) {
  return `TS-${monthCode}-${String(sequence).padStart(4, "0")}`;
}

async function getNextQuoteSequence(adminClient: ReturnType<typeof createClient>, teamId: string, monthCode: string) {
  const { data, error } = await adminClient
    .schema("tosho")
    .from("quotes")
    .select("number")
    .eq("team_id", teamId)
    .like("number", `TS-${monthCode}-%`)
    .order("number", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const lastNumber = ((data ?? []) as Array<{ number?: string | null }>)[0]?.number ?? null;
  if (!lastNumber) return 1;
  const parsed = Number.parseInt(lastNumber.split("-")[2] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : 1;
}

function normalizeQuotePackProductName(value: string) {
  const normalized = normalizeText(value).toLowerCase();
  const labels: Record<string, string> = {
    кепки: "кепка",
    кепок: "кепка",
    кепку: "кепка",
    кепка: "кепка",
    футболки: "футболка",
    футболок: "футболка",
    футболку: "футболка",
    футболка: "футболка",
    худі: "худі",
    чашки: "чашка",
    чашок: "чашка",
    чашку: "чашка",
    чашка: "чашка",
    ручки: "ручка",
    ручок: "ручка",
    ручку: "ручка",
    ручка: "ручка",
  };
  return labels[normalized] ?? normalized.replace(/и$/u, "а");
}

function capitalizeWord(value: string) {
  const normalized = normalizeText(value);
  return normalized ? `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}` : "";
}

function isQuotePackDraft(value: unknown): value is QuotePackDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as QuotePackDraft;
  return draft.kind === "quote_pack" && Array.isArray(draft.items);
}

function isQuotePackRequest(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return (
    /(створи|створити|зроби|підготуй|потрібно|треба|потрібні).*(прорах|кп|коштор|quote)/u.test(normalized) ||
    (/(для\s+.+\s+(треба|потрібно|потрібні))/u.test(normalized) &&
      /(\d+\s*(шт\.?|штук|од\.?|pcs?)|^\s*\d+[.)])/u.test(normalized) &&
      /(нанес|вишив|друк|шеврон|лого|принт|dtf|шовк|термо|спереду|збоку|ззаду)/u.test(normalized))
  );
}

function isQuotePackConfirmation(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  if (/^(не|ні|скасуй|відміна|не\s+треба)|не\s+створ/u.test(normalized)) return false;
  return /(створи|створити|підтверджую|так|ок|окей|запускай|створюй).*(прорах|ці|усе|все)|^(так|ок|окей|створюй)$/u.test(
    normalized
  );
}

function isQuotePackCancellation(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return /^(не|ні|скасуй|відміна|не\s+треба)|не\s+створ/u.test(normalized);
}

function extractQuotePackPartyQuery(message: string) {
  const normalized = normalizeText(message).replace(/[?!.]+$/g, "");
  const match = normalized.match(
    /(?:^|\s)для\s+(.+?)\s+(?:треба|потрібно|потрібні|зроби|створи|підготуй|на|треба\s+зробити)\b/iu
  );
  return normalizeText(match?.[1]).replace(/\b(замовника|клієнта|компанії)\b/giu, " ").replace(/\s+/g, " ").trim();
}

function extractQuotePackBody(message: string) {
  const normalized = normalizeText(message);
  const colonIndex = normalized.indexOf(":");
  if (colonIndex >= 0 && colonIndex < normalized.length - 1) return normalized.slice(colonIndex + 1);
  return normalized.replace(/^.*?\b(?:треба|потрібно|потрібні)\b/iu, "");
}

function splitQuotePackSegments(body: string) {
  const normalized = normalizeText(body).replace(/\s+/g, " ");
  const numbered = Array.from(normalized.matchAll(/(?:^|\s)(\d+)[.)]\s*([^]+?)(?=(?:\s\d+[.)]\s)|$)/giu))
    .map((match) => normalizeText(match[2]))
    .filter(Boolean);
  if (numbered.length > 0) return numbered;
  return normalized
    .split(/\s*[;,]\s*/u)
    .map((item) => normalizeText(item))
    .filter((item) => /\d+\s*(шт\.?|штук|од\.?|pcs?)/iu.test(item));
}

function extractBaseProductName(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  const match = normalized.match(/(?:^|\s)(?:треба|потрібно|потрібні)\s+(?:\d+\s+)?([а-яіїєґa-z-]{3,})/iu);
  const raw = normalizeText(match?.[1]);
  if (!raw || /(різн|для|прорах|кп)/iu.test(raw)) return "позиція";
  return normalizeQuotePackProductName(raw);
}

function parseQuotePackItems(message: string): QuotePackDraftItem[] {
  const baseProductName = extractBaseProductName(message);
  const segments = splitQuotePackSegments(extractQuotePackBody(message));
  return segments
    .map((segment, index) => {
      const quantityMatch = segment.match(/(\d+)\s*(шт\.?|штук|од\.?|pcs?)/iu);
      const quantity = Number(quantityMatch?.[1] ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      const beforeQty = normalizeText(segment.slice(0, quantityMatch?.index ?? 0)).replace(/^[.)\d\s]+/g, "");
      const afterQty = normalizeText(segment.slice((quantityMatch?.index ?? 0) + (quantityMatch?.[0].length ?? 0)));
      const cleanBefore = beforeQty
        .replace(new RegExp(`\\b${baseProductName}\\b`, "giu"), " ")
        .replace(/\s+/g, " ")
        .trim();
      const productName = normalizeText(
        cleanBefore ? `${capitalizeWord(baseProductName)} ${cleanBefore}` : capitalizeWord(baseProductName)
      );
      const decoration = afterQty || null;
      return {
        id: `draft-${index + 1}`,
        productName: productName || `Позиція ${index + 1}`,
        quantity,
        unit: "шт.",
        decoration,
        catalogModelId: null,
        catalogTypeId: null,
        catalogKindId: null,
        catalogModelName: null,
        unitPrice: 0,
      } satisfies QuotePackDraftItem;
    })
    .filter((item): item is QuotePackDraftItem => Boolean(item));
}

async function resolveQuotePackParty(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  query: string;
}) {
  const query = normalizeText(params.query);
  if (!query) return null;
  const variants = buildPartySearchVariants(query);
  if (variants.length === 0) return null;
  const customerFilter = buildPartyOrFilter(["name", "legal_name"], variants);
  const leadFilter = buildPartyOrFilter(["company_name", "legal_name", "first_name", "last_name"], variants);
  const [customerResult, leadResult] = await Promise.all([
    params.adminClient.schema("tosho").from("customers").select("id,name,legal_name,logo_url").eq("team_id", params.auth.teamId).or(customerFilter).limit(8),
    params.adminClient
      .schema("tosho")
      .from("leads")
      .select("id,company_name,legal_name,first_name,last_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .or(leadFilter)
      .limit(8),
  ]);

  const customer = ((customerResult.data ?? []) as Array<{ id: string; name?: string | null; legal_name?: string | null; logo_url?: string | null }>)
    .map((row) => ({ row, score: scorePartySearchCandidate(`${row.name ?? ""} ${row.legal_name ?? ""}`, variants) }))
    .sort((a, b) => b.score - a.score)[0]?.row;
  if (customer) {
    return {
      kind: "customer" as const,
      id: customer.id,
      name: normalizeText(customer.name || customer.legal_name) || customer.id,
      logoUrl: normalizeText(customer.logo_url) || null,
    };
  }

  const lead = ((leadResult.data ?? []) as Array<{
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
        variants
      ),
    }))
    .sort((a, b) => b.score - a.score)[0]?.row;
  if (!lead) return null;
  const person = [lead.first_name, lead.last_name].map(normalizeText).filter(Boolean).join(" ");
  return {
    kind: "lead" as const,
    id: lead.id,
    name: normalizeText(lead.company_name || lead.legal_name || person) || lead.id,
    logoUrl: normalizeText(lead.logo_url) || null,
  };
}

async function enrichQuotePackItemsWithCatalog(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  items: QuotePackDraftItem[];
}) {
  const searchTerms = Array.from(
    new Set(
      params.items
        .flatMap((item) => [item.productName, item.productName.split(/\s+/u)[0] ?? ""])
        .map(normalizeText)
        .filter((item) => item.length >= 3)
    )
  ).slice(0, 8);
  if (searchTerms.length === 0) return params.items;

  const filter = searchTerms.map(escapeIlikeValue).filter(Boolean).map((term) => `name.ilike.%${term}%`).join(",");
  if (!filter) return params.items;

  const { data: modelRows } = await params.adminClient
    .schema("tosho")
    .from("catalog_models")
    .select("id,name,price,kind_id")
    .eq("team_id", params.auth.teamId)
    .or(filter)
    .limit(30);
  const models = ((modelRows ?? []) as Array<{ id: string; name?: string | null; price?: number | string | null; kind_id?: string | null }>).filter(
    (row) => row.id
  );
  const kindIds = Array.from(new Set(models.map((row) => normalizeText(row.kind_id)).filter(Boolean)));
  const { data: kindRows } =
    kindIds.length > 0
      ? await params.adminClient.schema("tosho").from("catalog_kinds").select("id,type_id").eq("team_id", params.auth.teamId).in("id", kindIds)
      : { data: [] as Array<{ id: string; type_id?: string | null }> };
  const kindById = new Map(((kindRows ?? []) as Array<{ id: string; type_id?: string | null }>).map((row) => [row.id, row]));

  return params.items.map((item) => {
    const variants = [item.productName, item.productName.split(/\s+/u)[0] ?? ""].map(normalizeText).filter(Boolean);
    const match = models
      .map((row) => ({ row, score: scorePartySearchCandidate(row.name ?? "", variants) }))
      .sort((a, b) => b.score - a.score)[0]?.row;
    if (!match) return item;
    const kind = match.kind_id ? kindById.get(match.kind_id) : null;
    return {
      ...item,
      catalogModelId: match.id,
      catalogKindId: match.kind_id ?? null,
      catalogTypeId: kind?.type_id ?? null,
      catalogModelName: normalizeText(match.name) || null,
      unitPrice: toFiniteAmount(match.price),
    };
  });
}

function buildQuotePackAnalytics(draft: QuotePackDraft): AnalyticsPayload {
  return {
    kind: "entity",
    title: "Draft прорахунків",
    caption: draft.party
      ? `${draft.party.name} · ${formatInteger(draft.items.length)} прорах.`
      : `${formatInteger(draft.items.length)} прорах. · замовника треба уточнити`,
    metricLabel: "Кількість",
    rows: draft.items.map((item) => ({
      id: item.id,
      label: item.productName,
      primary: `${formatInteger(item.quantity)} ${item.unit}`,
      secondary: item.decoration ?? "Нанесення не вказано",
      badges: [
        item.catalogModelId
          ? { label: "Каталог", value: item.catalogModelName ?? "знайдено" }
          : { label: "Каталог", value: "без товару" },
        item.unitPrice > 0 ? { label: "Ціна", value: formatMoney(item.unitPrice) } : { label: "Ціна", value: "0" },
      ],
    })),
    note: "Це preview. Записи в базі створюються тільки після підтвердження.",
  };
}

async function buildQuotePackDraftDecision(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
}): Promise<AssistantDecision | null> {
  if (!params.auth.canManageQueue) return null;
  const parsedItems = parseQuotePackItems(params.message);
  if (parsedItems.length < 2) return null;

  const partyQuery = extractQuotePackPartyQuery(params.message);
  const party = partyQuery ? await resolveQuotePackParty({ adminClient: params.adminClient, auth: params.auth, query: partyQuery }) : null;
  const items = await enrichQuotePackItemsWithCatalog({ adminClient: params.adminClient, auth: params.auth, items: parsedItems });
  const draft: QuotePackDraft = {
    kind: "quote_pack",
    sourceMessage: params.message,
    party,
    items,
    createdAt: new Date().toISOString(),
  };

  const missingCatalogCount = items.filter((item) => !item.catalogModelId).length;
  const zeroPriceCount = items.filter((item) => item.unitPrice <= 0).length;
  const intro = party
    ? `Зібрав draft для **${party.name}**: **${formatInteger(items.length)}** окремі прорахунки.`
    : `Зібрав draft на **${formatInteger(items.length)}** окремі прорахунки, але замовника не зміг підтвердити.`;
  const itemLines = items
    .map((item, index) => {
      const catalogLabel = item.catalogModelId ? `каталог: ${item.catalogModelName ?? "знайдено"}` : "без товару в каталозі";
      const priceLabel = item.unitPrice > 0 ? `ціна ${formatMoney(item.unitPrice)}` : "ціна 0";
      return `${index + 1}. **${item.productName}** — ${formatInteger(item.quantity)} ${item.unit}; ${item.decoration ?? "нанесення не вказано"}; ${catalogLabel}; ${priceLabel}.`;
    })
    .join("\n");
  const warningLines = [
    !party ? "- Спочатку уточни замовника: напиши назву точно або відкрий картку замовника." : "",
    missingCatalogCount > 0 ? `- ${formatInteger(missingCatalogCount)} позиції підуть без catalog_model_id, як ручні позиції прорахунку.` : "",
    zeroPriceCount > 0 ? `- ${formatInteger(zeroPriceCount)} позиції мають ціну 0, їх треба буде дозаповнити.` : "",
  ].filter(Boolean);

  return {
    title: "Draft кількох прорахунків",
    summary: party
      ? `Готовий створити ${formatInteger(items.length)} прорахунки для ${party.name}.`
      : "Зібрав draft, але замовника треба уточнити перед створенням.",
    answerMarkdown: `${intro}\n\n${itemLines}${warningLines.length > 0 ? `\n\nЩо перевірити перед створенням:\n${warningLines.join("\n")}` : ""}`,
    playfulLine: party ? "Draft готовий до підтвердження." : "Draft є, бракує точного замовника.",
    status: "waiting_user",
    priority: "low",
    domain: "orders",
    confidence: party ? 0.9 : 0.72,
    shouldEscalate: false,
    shouldNotify: false,
    knowledgeIds: [],
    internalSummary: `Quote pack draft: ${items.length} items; party=${party?.name ?? "missing"}.`,
    analytics: buildQuotePackAnalytics(draft),
    suggestedActions: party
      ? compactSuggestedActions([
          { label: `Створити ${items.length} прорах.`, text: "створити ці прорахунки" },
          { label: "Не створювати", text: "не створюй ці прорахунки" },
        ])
      : compactSuggestedActions([{ label: "Уточнити замовника", text: "для якого замовника створити ці прорахунки?" }]),
    quotePackDraft: draft,
  };
}

async function insertAiQuote(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  draft: QuotePackDraft;
  item: QuotePackDraftItem;
  sequence: number;
  monthCode: string;
}) {
  const quoteId = crypto.randomUUID();
  const number = formatQuoteNumber(params.monthCode, params.sequence);
  const comment = [
    params.item.decoration ? `Нанесення: ${params.item.decoration}` : "",
    !params.item.catalogModelId ? "AI draft: товар не знайдено в каталозі." : "",
    params.item.unitPrice <= 0 ? "AI draft: ціну треба дозаповнити." : "",
  ].filter(Boolean).join("\n");

  const quotePayload = {
    id: quoteId,
    team_id: params.auth.teamId,
    customer_id: params.draft.party?.kind === "customer" ? params.draft.party.id : null,
    customer_name: params.draft.party?.name ?? null,
    customer_logo_url: params.draft.party?.logoUrl ?? null,
    title: params.draft.party?.kind === "lead" ? params.draft.party.name : null,
    comment: comment || null,
    design_brief: comment || null,
    currency: "UAH",
    assigned_to: params.auth.userId,
    quote_type: "merch",
    number,
    created_by: params.auth.userId,
  };

  const { error: quoteError } = await params.adminClient.schema("tosho").from("quotes").insert(quotePayload);
  if (quoteError) throw new Error(quoteError.message);

  const itemId = crypto.randomUUID();
  const { error: itemError } = await params.adminClient.schema("tosho").from("quote_items").insert({
    id: itemId,
    team_id: params.auth.teamId,
    quote_id: quoteId,
    position: 1,
    name: params.item.catalogModelName || params.item.productName,
    description: params.item.decoration,
    qty: params.item.quantity,
    unit: params.item.unit,
    unit_price: params.item.unitPrice,
    line_total: params.item.quantity * params.item.unitPrice,
    catalog_type_id: params.item.catalogTypeId,
    catalog_kind_id: params.item.catalogKindId,
    catalog_model_id: params.item.catalogModelId,
    methods: null,
    metadata: {
      source: "tosho_ai_quote_pack",
      aiDraft: !params.item.catalogModelId || params.item.unitPrice <= 0,
      originalPrompt: params.draft.sourceMessage,
      decoration: params.item.decoration,
    },
  });
  if (itemError) throw new Error(itemError.message);

  const { error: runError } = await params.adminClient.schema("tosho").from("quote_item_runs").insert({
    id: crypto.randomUUID(),
    quote_id: quoteId,
    quote_item_id: itemId,
    quantity: params.item.quantity,
    unit_price_model: params.item.unitPrice,
    unit_price_print: 0,
    logistics_cost: 0,
    desired_manager_income: 0,
    manager_rate: DEFAULT_MANAGER_RATE,
    fixed_cost_rate: DEFAULT_FIXED_COST_RATE,
    vat_rate: DEFAULT_VAT_RATE,
    team_id: params.auth.teamId,
  });
  if (runError) throw new Error(runError.message);

  return { id: quoteId, number };
}

async function createQuoteSetForAiPack(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  draft: QuotePackDraft;
  quoteIds: string[];
}) {
  if (params.draft.party?.kind !== "customer" || params.quoteIds.length < 2) return null;
  const insertSet = async (payload: JsonRecord) =>
    await params.adminClient.schema("tosho").from("quote_sets").insert(payload).select("id").maybeSingle();
  let { data, error } = await insertSet({
    team_id: params.auth.teamId,
    customer_id: params.draft.party.id,
    name: `AI набір: ${params.draft.party.name}`,
    kind: "set",
    created_by: params.auth.userId,
  });
  if (error && /column/i.test(error.message ?? "") && /kind|created_by/i.test(error.message ?? "")) {
    ({ data, error } = await insertSet({
      team_id: params.auth.teamId,
      customer_id: params.draft.party.id,
      name: `AI набір: ${params.draft.party.name}`,
    }));
  }
  if (error || !data?.id) return null;
  const setId = String(data.id);
  const { error: itemError } = await params.adminClient.schema("tosho").from("quote_set_items").insert(
    params.quoteIds.map((quoteId, index) => ({
      team_id: params.auth.teamId,
      quote_set_id: setId,
      quote_id: quoteId,
      sort_order: index,
    }))
  );
  return itemError ? null : setId;
}

async function createQuotePackFromDraft(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  draft: QuotePackDraft;
}): Promise<AssistantDecision> {
  if (!params.auth.canManageQueue) {
    throw httpError(403, "Недостатньо прав для створення прорахунків.");
  }
  if (!params.draft.party) {
    throw httpError(400, "Перед створенням треба підтвердити замовника.");
  }
  if (params.draft.items.length < 2) {
    throw httpError(400, "Для batch-створення потрібно щонайменше 2 позиції.");
  }

  const monthCode = getQuoteMonthCode();
  let sequence = await getNextQuoteSequence(params.adminClient, params.auth.teamId, monthCode);
  const created: Array<{ id: string; number: string }> = [];
  for (const item of params.draft.items) {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const quote = await insertAiQuote({ ...params, item, monthCode, sequence });
        created.push(quote);
        sequence += 1;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (error instanceof Error && /duplicate|23505|number/i.test(error.message)) {
          sequence += 1;
          continue;
        }
        throw error;
      }
    }
    if (lastError) throw lastError;
  }

  const quoteIds = created.map((row) => row.id);
  const quoteSetId = await createQuoteSetForAiPack({ adminClient: params.adminClient, auth: params.auth, draft: params.draft, quoteIds });
  const links = created.map((row) => `- [${row.number}](/orders/estimates/${row.id})`).join("\n");
  const zeroPriceCount = params.draft.items.filter((item) => item.unitPrice <= 0).length;
  const missingCatalogCount = params.draft.items.filter((item) => !item.catalogModelId).length;

  return {
    title: "Прорахунки створено",
    summary: `Створено ${formatInteger(created.length)} прорахунки для ${params.draft.party.name}.`,
    answerMarkdown: `Готово. Створив **${formatInteger(created.length)}** окремі прорахунки для **${params.draft.party.name}**.${quoteSetId ? "\n\nТакож об'єднав їх у набір прорахунків." : ""}\n\n${links}${
      zeroPriceCount > 0 || missingCatalogCount > 0
        ? `\n\nЩо ще треба дозаповнити:\n${missingCatalogCount > 0 ? `- ${formatInteger(missingCatalogCount)} позиції без товару з каталогу\n` : ""}${zeroPriceCount > 0 ? `- ${formatInteger(zeroPriceCount)} позиції з ціною 0` : ""}`
        : ""
    }`,
    playfulLine: "Batch-прорахунки створено.",
    status: "waiting_user",
    priority: "low",
    domain: "orders",
    confidence: 0.96,
    shouldEscalate: false,
    shouldNotify: false,
    knowledgeIds: [],
    internalSummary: `Created AI quote pack: ${created.length} quotes.`,
    suggestedActions: compactSuggestedActions([
      { label: "Мої прорахунки", text: "мої прорахунки за тиждень" },
      { label: "Створити дизайн-задачі", text: "створи дизайн-задачі для цих прорахунків" },
    ]),
    quotePackCreated: {
      quoteIds,
      quoteNumbers: created.map((row) => row.number),
      quoteSetId,
    },
  };
}

function buildQuotePackCancelledDecision(): AssistantDecision {
  return {
    title: "Draft скасовано",
    summary: "Чернетку batch-прорахунків очищено.",
    answerMarkdown: "Добре, не створюю ці прорахунки. Draft очистив, у базу нічого не записував.",
    playfulLine: "Нічого не створено.",
    status: "waiting_user",
    priority: "low",
    domain: "orders",
    confidence: 0.96,
    shouldEscalate: false,
    shouldNotify: false,
    knowledgeIds: [],
    internalSummary: "AI quote pack draft cancelled by user.",
    suggestedActions: compactSuggestedActions([{ label: "Новий batch", text: "створи кілька прорахунків з тексту" }]),
    quotePackCleared: true,
  };
}

function toFiniteAmount(value: number | string | null | undefined) {
  const amount = typeof value === "number" ? value : value ? Number(value) : 0;
  return Number.isFinite(amount) ? amount : 0;
}

function resolveQuoteAmount(
  quote: { id: string; total?: number | string | null },
  itemTotalsByQuoteId: Map<string, number>,
  runTotalsByQuoteId: Map<string, number>
) {
  const explicitAmount = toFiniteAmount(quote.total);
  const fallbackAmount = itemTotalsByQuoteId.get(quote.id) ?? 0;
  const runFallbackAmount = runTotalsByQuoteId.get(quote.id) ?? 0;
  return explicitAmount || fallbackAmount || runFallbackAmount;
}

async function loadQuoteItemTotals(
  adminClient: ReturnType<typeof createClient>,
  teamId: string,
  quoteIds: string[]
) {
  const uniqueQuoteIds = Array.from(new Set(quoteIds.map((quoteId) => normalizeText(quoteId)).filter(Boolean)));
  const totals = new Map<string, number>();
  if (uniqueQuoteIds.length === 0) return totals;

  const chunkSize = 500;
  for (let start = 0; start < uniqueQuoteIds.length; start += chunkSize) {
    const chunk = uniqueQuoteIds.slice(start, start + chunkSize);

    const readRows = async (withTeamFilter: boolean) => {
      type QuoteItemsQuery = {
        eq: (column: string, value: string) => QuoteItemsQuery;
        in: (column: string, values: string[]) => QuoteItemsQuery;
        then: PromiseLike<{ data: unknown; error: { message?: string | null } | null }>["then"];
      };
      type QuoteItemsTable = {
        select: (columns: string) => QuoteItemsQuery;
      };

      const table = adminClient.schema("tosho").from("quote_items") as unknown as QuoteItemsTable;
      let query = table.select("quote_id,line_total").in("quote_id", chunk);
      if (withTeamFilter) {
        query = query.eq("team_id", teamId);
      }
      return await query;
    };

    let data: unknown[] | null = null;
    let error: { message?: string | null } | null = null;
    {
      const result = await readRows(true);
      data = (result.data as unknown[] | null) ?? null;
      error = result.error;
    }
    if (error && /column/i.test(error.message ?? "") && /team_id/i.test(error.message ?? "")) {
      const result = await readRows(false);
      data = (result.data as unknown[] | null) ?? null;
      error = result.error;
    }
    if (error) throw new Error(error.message ?? "Failed to load quote items");

    for (const row of (data ?? []) as Array<{ quote_id?: string | null; line_total?: number | string | null }>) {
      const quoteId = normalizeText(row.quote_id);
      if (!quoteId) continue;
      totals.set(quoteId, (totals.get(quoteId) ?? 0) + toFiniteAmount(row.line_total));
    }
  }

  return totals;
}

async function loadQuoteRunTotals(
  adminClient: ReturnType<typeof createClient>,
  teamId: string,
  quoteIds: string[]
) {
  const uniqueQuoteIds = Array.from(new Set(quoteIds.map((quoteId) => normalizeText(quoteId)).filter(Boolean)));
  const totals = new Map<string, number>();
  if (uniqueQuoteIds.length === 0) return totals;

  const chunkSize = 500;
  for (let start = 0; start < uniqueQuoteIds.length; start += chunkSize) {
    const chunk = uniqueQuoteIds.slice(start, start + chunkSize);

    const readRows = async (withTeamFilter: boolean) => {
      type QuoteRunsQuery = {
        eq: (column: string, value: string) => QuoteRunsQuery;
        in: (column: string, values: string[]) => QuoteRunsQuery;
        then: PromiseLike<{ data: unknown; error: { message?: string | null } | null }>["then"];
      };
      type QuoteRunsTable = {
        select: (columns: string) => QuoteRunsQuery;
      };

      const table = adminClient.schema("tosho").from("quote_item_runs") as unknown as QuoteRunsTable;
      let query = table
        .select("quote_id,quantity,unit_price_model,unit_price_print,logistics_cost")
        .in("quote_id", chunk);
      if (withTeamFilter) {
        query = query.eq("team_id", teamId);
      }
      return await query;
    };

    let data: unknown[] | null = null;
    let error: { message?: string | null } | null = null;
    {
      const result = await readRows(true);
      data = (result.data as unknown[] | null) ?? null;
      error = result.error;
    }
    if (error && /column/i.test(error.message ?? "") && /team_id/i.test(error.message ?? "")) {
      const result = await readRows(false);
      data = (result.data as unknown[] | null) ?? null;
      error = result.error;
    }
    if (error) throw new Error(error.message ?? "Failed to load quote runs");

    for (const row of (data ?? []) as Array<{
      quote_id?: string | null;
      quantity?: number | string | null;
      unit_price_model?: number | string | null;
      unit_price_print?: number | string | null;
      logistics_cost?: number | string | null;
    }>) {
      const quoteId = normalizeText(row.quote_id);
      if (!quoteId) continue;
      const quantity = Math.max(0, toFiniteAmount(row.quantity));
      const model = toFiniteAmount(row.unit_price_model);
      const print = toFiniteAmount(row.unit_price_print);
      const logistics = toFiniteAmount(row.logistics_cost);
      const runTotal = (model + print) * quantity + logistics;
      totals.set(quoteId, (totals.get(quoteId) ?? 0) + runTotal);
    }
  }

  return totals;
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
      const matchedQueryTokens = new Set<string>();
      for (const queryToken of queryTokens) {
        for (const token of tokens) {
          if (queryToken === token) {
            score += 12;
            matchedQueryTokens.add(queryToken);
          } else if (token.startsWith(queryToken) || queryToken.startsWith(token)) {
            score += 8;
            matchedQueryTokens.add(queryToken);
          } else if (queryToken.length >= 4 && token.length >= 4 && levenshteinDistance(queryToken, token) <= 1) {
            score += 5;
            matchedQueryTokens.add(queryToken);
          }
        }
      }
      return { member, score, matchedQueryCount: matchedQueryTokens.size };
    })
    .filter((entry) => {
      if (entry.score <= 0) return false;
      if (queryTokens.length >= 2) return entry.matchedQueryCount >= 2;
      return entry.score >= 8;
    })
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

function normalizeQuoteStatus(value?: string | null) {
  const normalized = normalizeText(value).toLowerCase();
  const aliases: Record<string, string> = {
    draft: "new",
    in_progress: "estimating",
    sent: "estimated",
    rejected: "cancelled",
    completed: "approved",
    canceled: "cancelled",
  };
  return aliases[normalized] ?? (normalized || "без статусу");
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
  if (/цей\s+рік|цього\s+року|поточн(ий|ого|ому)\s+р(ік|оці)/u.test(normalized)) {
    return { sinceIso: new Date(now.getFullYear(), 0, 1).toISOString(), label: "за поточний календарний рік" };
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
  return /(адмін|admin|observability|обсерваб|перформанс|performance|runtime|error|errors|помилк|баг|bug|bugs|сховищ|storage|вкладенн|attachment|backup|бекап|активн|що\s+було|чи\s+все\s+норм|стан\s+систем)/u.test(
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

type SupportedAnalyticsIntent =
  | "admin_health"
  | "personal_focus"
  | "logo_hygiene"
  | "designer_ranking"
  | "design_completion"
  | "team_role_list"
  | "logistics_limited"
  | "customer_quote_breakdown"
  | "customer_order_limited"
  | "party_quote_order"
  | "manager_quote"
  | "manager_order_limited"
  | "quote_summary";

const SUPPORTED_ANALYTICS_INTENTS: Array<{ intent: SupportedAnalyticsIntent; label: string }> = [
  { intent: "admin_health", label: "admin health: observability, runtime errors, backups, storage hygiene" },
  { intent: "personal_focus", label: "personal focus: what the current user should do next" },
  { intent: "logo_hygiene", label: "customer/lead logo hygiene: missing customer and lead logos" },
  { intent: "designer_ranking", label: "designer ranking by approved/closed design tasks" },
  { intent: "design_completion", label: "design task completion counts and design workload summaries" },
  { intent: "team_role_list", label: "team lists by role: designers, managers, logistics, employees" },
  { intent: "logistics_limited", label: "limited logistics/order status snapshot; orders and shipping are not final modules" },
  { intent: "customer_quote_breakdown", label: "customers/leads ranked by quote/estimate activity" },
  { intent: "customer_order_limited", label: "limited customer order snapshot; orders are not final modules" },
  { intent: "party_quote_order", label: "quote/order activity for a named customer, lead, or contractor" },
  { intent: "manager_quote", label: "quote/estimate activity by manager" },
  { intent: "manager_order_limited", label: "limited order activity by manager; orders are not final modules" },
  { intent: "quote_summary", label: "quote/estimate totals and quote/customer summaries" },
];

const CRM_CAPABILITY_BOUNDARIES = [
  "Reliable CRM modules today: design tasks, estimates/quotes, customers/leads, contractors/suppliers, catalog, admin health.",
  "Orders, production, logistics, and shipping are incomplete. Treat them as limited technical/status signals, not authoritative business performance.",
  "Do not invent production or shipment workflows. If the user asks about unfinished modules, say the module is limited and explain what CRM data is actually available.",
  "For direct counts, rankings, lists, and status tables, prefer deterministic CRM analytics over OpenAI synthesis.",
  "Use OpenAI synthesis only for explanation, priorities, risks, decisions, or next-step recommendations on top of CRM data.",
];

function analyticsIntentPromptList() {
  return SUPPORTED_ANALYTICS_INTENTS.map((item) => `- ${item.intent}: ${item.label}`).join("\n");
}

function isDesignerRankingAnalyticsQuery(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return (
    /(дизайнер|дизайнери|дизайнерів)/u.test(normalized) &&
    /(рейтинг|топ|найбільш|найменш|хто|порівн|кільк|скільки|закрит|закрив|заверш|виконан|approved)/u.test(normalized)
  );
}

function isLogoHygieneAnalyticsQuery(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return (
    /(лого|логотип|logo|бренд|аватар)/u.test(normalized) &&
    /(нема|немає|відсут|порожн|не\s+встановл|не\s+заповн|missing|без)/u.test(normalized) &&
    /(замовник|замовників|клієнт|клієнтів|лід|ліди|leads?|customers?)/u.test(normalized)
  );
}

function isGenericManagerAnalyticsQuery(normalized: string) {
  return (
    /(менеджерам|менеджерах|менеджери|менеджерів|усі\s+менеджери|всі\s+менеджери|по\s+менеджерам|по\s+менеджерах)/u.test(
      normalized
    ) || /аналітик.*менеджер/u.test(normalized)
  );
}

function isGenericDesignerAnalyticsQuery(normalized: string) {
  return (
    /(дизайнерам|дизайнерах|дизайнери|дизайнерів|усі\s+дизайнери|всі\s+дизайнери|по\s+дизайнерам|по\s+дизайнерах)/u.test(
      normalized
    ) || /аналітик.*дизайнер/u.test(normalized)
  );
}

function isSelfAnalyticsQuery(normalized: string) {
  const hasSelfReference =
    /(в\s+мене|у\s+мене|мої|моїх|моє|мій|мною)/u.test(normalized) ||
    /\bя\s+(зробив|зробила|закрив|закрила|маю|порахував|порахувала)/u.test(normalized);
  const hasMetricReference =
    /(скільки|покажи|дай|аналітик|статист|зробив|зробила|закрив|закрила|прорах|дизайн|задач|таск|замовл|клієнт|замовник)/u.test(
      normalized
    );
  return hasSelfReference && hasMetricReference;
}

function detectSupportedAnalyticsIntent(message: string): SupportedAnalyticsIntent | null {
  const normalized = normalizeText(message).toLowerCase();
  const hasAnalyticsVerb =
    /(покажи|показати|рейтинг|скільки|хто|яка|який|які|порах|рахуй|статист|звіт|аналітик|активн|топ|зріз|список|перелік|найбільш|більше\s+всього|по\s+дизайн)/u.test(
      normalized
    ) ||
    /по\s+(менедж|иенедж)/u.test(normalized) ||
    /у\s+якого\s+(замовник|клієнт)/u.test(normalized);
  const hasAdminTerm = hasAdminObservabilityTerm(normalized);
  if (isLogoHygieneAnalyticsQuery(message)) return "logo_hygiene";
  if (isSelfAnalyticsQuery(normalized)) return "personal_focus";
  const hasDesignTerm = /(дизайнер|дизайн|таск|тасок|задач)/u.test(normalized);
  const hasQuoteTerm = /(прорах|quote|коштор|кп)/u.test(normalized);
  const hasOrderTerm = /(замовл|order)/u.test(normalized);
  const hasPartyTerm = /(лід|замовник|клієнт|контрагент)/u.test(normalized);
  const hasManagerTerm = hasManagerAnalyticsTerm(normalized);
  const hasLogisticsTerm = hasLogisticsAnalyticsTerm(normalized);
  const hasEmployeeTerm = hasEmployeeAnalyticsTerm(normalized);
  const hasCustomerTerm = hasCustomerAnalyticsTerm(normalized);
  const stripped = stripAnalyticsQueryTerms(message);
  const asksForPeopleList =
    /(хто|скільки|покажи|список|перелік).*(дизайнер|менеджер|логіст|співробіт|користувач|команд|працівник)/u.test(
      normalized
    ) && !/(прорах|quote|коштор|кп|замовл|order|таск|тасок|задач|зроб|закрит|approved|відвантаж|доставк)/u.test(normalized);

  if (hasAdminTerm) return "admin_health";
  if (hasPersonalActionPlanTerm(normalized)) return "personal_focus";
  if (isDesignerRankingAnalyticsQuery(message)) return "designer_ranking";
  if (!hasAnalyticsVerb && !hasDesignTerm && !hasQuoteTerm && !hasOrderTerm && !hasManagerTerm && !hasLogisticsTerm) {
    return null;
  }
  if (asksForPeopleList || (hasEmployeeTerm && hasAnalyticsVerb)) return "team_role_list";
  if (hasLogisticsTerm && !hasQuoteTerm && !hasDesignTerm && !hasPartyTerm && !hasManagerTerm) return "logistics_limited";
  if (hasDesignTerm) return "design_completion";
  if (hasCustomerTerm) {
    if (hasOrderTerm && !hasQuoteTerm) return "customer_order_limited";
    return "customer_quote_breakdown";
  }
  if ((hasQuoteTerm || hasOrderTerm) && (hasPartyTerm || (stripped && !hasManagerTerm))) return "party_quote_order";
  if (hasManagerTerm && hasOrderTerm && !hasQuoteTerm) return "manager_order_limited";
  if (hasManagerTerm) return "manager_quote";
  if (hasOrderTerm && !hasQuoteTerm) return "manager_order_limited";
  if (hasQuoteTerm) return "quote_summary";
  return null;
}

function shouldRunAnalytics(message: string) {
  return detectSupportedAnalyticsIntent(message) !== null;
}

function isDirectAnalyticsRequest(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  const supportedIntent = detectSupportedAnalyticsIntent(message);
  if (!supportedIntent) return false;
  if (supportedIntent === "logo_hygiene" && !shouldSynthesizeAnalyticsWithOpenAi(message)) return true;
  return (
    /(покажи|показати|дай|рейтинг|скільки|хто|яка|який|які|порах|рахуй|статист|звіт|аналітик|активн|топ|зріз|список|перелік|найбільш|більше\s+всього)/u.test(
      normalized
    ) &&
    !shouldSynthesizeAnalyticsWithOpenAi(message)
  );
}

function shouldSynthesizeAnalyticsWithOpenAi(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  return /(поясни|проаналіз|аналіз|виснов|ризик|що\s+робити|що\s+зробити|крок|план|пріоритет|найважлив|ceo|директор|операційн)/u.test(
    normalized
  );
}

function hasAnalyticsFollowUpSignal(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  if (!normalized || normalized.length > 120) return false;
  return /^(а|і|й|ще|а\s+ще|а\s+за|за|по|тепер|тоді)\b/u.test(normalized) ||
    /(тижд|місяц|квартал|рік|року|років|час|сьогодні|вчора|днів|дні|замовл|прорах|дизайн|таск|задач|менеджер|замовник|клієнт|контрагент|лід)/u.test(normalized);
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
  if (/цей\s+рік|цього\s+року|поточн(ий|ого|ому)\s+р(ік|оці)/iu.test(normalized)) return "за цей рік";
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

const FOLLOW_UP_PERIOD_FRAGMENT =
  "(?:за\\s+(?:весь\\s+час|всі\\s+часи|усі\\s+часи|увесь\\s+час)|за\\s+(?:останн(?:ій|і|ю)\\s+)?(?:(?:\\d+|один|одна|два|дві|три|чотири|п'ять|пять|шість|сім|вісім|дев'ять|девять|десять)\\s+)?(?:дн(?:і|ів|я)|день|тиждень|тижні|тижнів|місяць|місяці|місяців|квартал|рік|роки|років)|цей\\s+рік|цього\\s+року|поточн(?:ий|ого|ому)\\s+р(?:ік|оці)|цього\\s+місяц[яю]|поточн(?:ий|ого|ому)\\s+місяц[яю]|сьогодні|вчора)";

const FOLLOW_UP_PERIOD_RE = new RegExp(`\\s*${FOLLOW_UP_PERIOD_FRAGMENT}(?=\\s|$)`, "giu");

function withQuestionMark(message: string) {
  const cleaned = normalizeText(message).replace(/[?!.]+$/g, "").replace(/\s+/g, " ").trim();
  return cleaned ? `${cleaned}?` : message;
}

function replaceAnalyticsPeriodInMessage(previousMessage: string, periodTail: string) {
  const withoutPreviousPeriod = normalizeText(previousMessage)
    .replace(/[?!.]+$/g, "")
    .replace(FOLLOW_UP_PERIOD_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withQuestionMark(`${withoutPreviousPeriod} ${periodTail}`);
}

function replaceAnalyticsMetricInMessage(previousMessage: string, metric: AnalyticsMetricIntent) {
  if (!metric) return previousMessage;
  let nextMessage = normalizeText(previousMessage).replace(/[?!.]+$/g, "");
  const replaceTerms = (input: string, terms: string, replacement: string) =>
    input.replace(
      new RegExp(`(^|[\\s.,!?;:()«»"'])(${terms})(?=$|[\\s.,!?;:()«»"'])`, "giu"),
      (_match, prefix) => `${prefix}${replacement}`
    );
  if (metric === "orders") {
    nextMessage = replaceTerms(
      replaceTerms(nextMessage, "прорахунків|прорахунки|прорахунок|quote|quotes|кошторисів|кошториси|кошторис|кп", "замовлень"),
      "дизайн-задач|дизайнів|дизайни|дизайн|тасок|таски|задач",
      "замовлень"
    );
  } else if (metric === "quotes") {
    nextMessage = replaceTerms(
      replaceTerms(nextMessage, "замовлень|замовлення|orders|order", "прорахунків"),
      "дизайн-задач|дизайнів|дизайни|дизайн|тасок|таски|задач",
      "прорахунків"
    );
  } else if (metric === "design") {
    nextMessage = replaceTerms(
      nextMessage,
      "прорахунків|прорахунки|прорахунок|quote|quotes|кошторисів|кошториси|кошторис|кп|замовлень|замовлення|orders|order",
      "дизайн-задач"
    );
  } else if (metric === "customers") {
    nextMessage = replaceTerms(
      nextMessage,
      "прорахунків|прорахунки|прорахунок|quote|quotes|кошторисів|кошториси|кошторис|кп|замовлень|замовлення|orders|order",
      "замовників"
    );
  }
  return withQuestionMark(nextMessage);
}

function getStoredAnalyticsMessage(message: SupportMessageRow) {
  const metadata = message.metadata;
  const analyticsMessage =
    metadata && typeof metadata === "object" && typeof metadata.analyticsMessage === "string"
      ? normalizeText(metadata.analyticsMessage)
      : "";
  if (analyticsMessage && shouldRunAnalytics(analyticsMessage)) return analyticsMessage;
  return shouldRunAnalytics(message.body) ? message.body : "";
}

function buildAnalyticsMessageWithContext(
  message: string,
  recentMessages: SupportMessageRow[],
  fallbackAnalyticsMessage = ""
) {
  if (shouldRunAnalytics(message)) return message;
  if (!hasAnalyticsFollowUpSignal(message)) return message;
  const previousUserAnalyticsMessage = [...recentMessages].reverse().find((entry) => entry.role === "user" && getStoredAnalyticsMessage(entry));
  const fallbackMessage = normalizeText(fallbackAnalyticsMessage);
  if (!previousUserAnalyticsMessage && !shouldRunAnalytics(fallbackMessage)) return message;

  const previousMessage = previousUserAnalyticsMessage
    ? getStoredAnalyticsMessage(previousUserAnalyticsMessage) || previousUserAnalyticsMessage.body
    : fallbackMessage;
  const currentMetric = detectAnalyticsMetricIntent(message);
  const previousMetric = detectAnalyticsMetricIntent(previousMessage);
  const metric = currentMetric ?? previousMetric;
  const target = extractFollowUpTarget(message);
  const periodTail = extractFollowUpPeriodHint(message);

  if (!target && periodTail) {
    const metricMessage = currentMetric ? replaceAnalyticsMetricInMessage(previousMessage, currentMetric) : previousMessage;
    return replaceAnalyticsPeriodInMessage(metricMessage, periodTail);
  }

  if (target) {
    const targetPrefix =
      hasPartyAnalyticsContext(previousMessage) && !hasPersonAnalyticsContext(previousMessage)
        ? "у замовника"
        : "у";
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
    return replaceAnalyticsMetricInMessage(previousMessage, currentMetric);
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
    suggestedActions: result.suggestedActions ?? [],
  };
}

function compactSuggestedActions(actions: SuggestedAction[]) {
  const seen = new Set<string>();
  return actions
    .map((action) => ({
      label: trimTo(action.label, 32),
      text: normalizeText(action.text),
    }))
    .filter((action) => action.label && action.text)
    .filter((action) => {
      const key = action.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function periodFollowUpActions(): SuggestedAction[] {
  return [
    { label: "За весь час", text: "а за весь час?" },
    { label: "За цей рік", text: "а за цей рік?" },
    { label: "За місяць", text: "а за місяць?" },
  ];
}

function managerQuoteActions(): SuggestedAction[] {
  return [
    ...periodFollowUpActions(),
    { label: "Усі менеджери", text: "скільки прорахунків по менеджерах за місяць?" },
  ];
}

function managerOrderActions(): SuggestedAction[] {
  return [
    ...periodFollowUpActions(),
    { label: "Усі менеджери", text: "скільки замовлень по менеджерах за місяць?" },
  ];
}

function designerActions(): SuggestedAction[] {
  return [
    ...periodFollowUpActions(),
    { label: "Усі дизайнери", text: "скільки дизайн-задач зробили дизайнери за місяць?" },
  ];
}

function customerActions(): SuggestedAction[] {
  return [
    ...periodFollowUpActions(),
    { label: "По замовниках", text: "скільки прорахунків по замовниках за місяць?" },
  ];
}

function unsupportedAnalyticsDecision(message: string): AssistantDecision {
  return {
    title: "Поки не рахую цей зріз",
    summary: "Для цього запиту немає готового точного підрахунку.",
    answerMarkdown:
      "Цей зріз поки не можу порахувати точно по CRM-даних. Не буду вигадувати відповідь. Можу порахувати найближчі доступні метрики: прорахунки, замовлення, дизайн-задачі, замовників або адмін-стан.",
    playfulLine: "Показав доступні точні зрізи.",
    status: "waiting_user",
    priority: "low",
    domain: deriveDomainFromMessage(message, "general"),
    confidence: 0.76,
    shouldEscalate: false,
    shouldNotify: false,
    knowledgeIds: [],
    internalSummary: "Analytics-like request had no deterministic supported handler.",
    suggestedActions: compactSuggestedActions([
      { label: "Прорахунки", text: "скільки прорахунків по менеджерах за місяць?" },
      { label: "Замовлення", text: "скільки замовлень по менеджерах за місяць?" },
      { label: "Дизайн", text: "скільки дизайн-задач зробили дизайнери за місяць?" },
      { label: "Замовники", text: "скільки прорахунків по замовниках за місяць?" },
    ]),
    analytics: {
      kind: "entity",
      title: "Немає точного сценарію",
      caption: "Не підставляю фолбек з бази знань",
      metricLabel: "Дія",
      rows: [],
      note: "Для аналітичних запитів без підтриманого сценарію повертаю уточнення, а не випадкову статтю з бази знань.",
    },
  };
}

async function resolveAuthContext(
  userClient: ReturnType<typeof createClient>,
  adminClient: ReturnType<typeof createClient>
): Promise<AuthContext> {
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    throw httpError(401, "Unauthorized");
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
    throw httpError(403, "Workspace not found");
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
    .select(KNOWLEDGE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (!canManageKnowledge) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query.limit(canManageKnowledge ? 24 : 8);
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeItemRow[];
}

async function listActiveKnowledgeItemsForRetrieval(
  adminClient: ReturnType<typeof createClient>,
  workspaceId: string
) {
  const run = (columns: string) =>
    adminClient
      .schema("tosho")
      .from("support_knowledge_items")
      .select(columns)
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(KNOWLEDGE_RETRIEVAL_LIMIT);

  const withEmbedding = await run(KNOWLEDGE_COLUMNS_WITH_EMBEDDING);
  if (!withEmbedding.error) return (withEmbedding.data ?? []) as KnowledgeItemRow[];
  if (!/embedding/i.test(withEmbedding.error.message ?? "")) {
    throw new Error(withEmbedding.error.message);
  }

  const fallback = await run(KNOWLEDGE_COLUMNS);
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as KnowledgeItemRow[];
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

function retrievalFallbackDiagnostics(params: {
  attempted: boolean;
  candidateCount: number;
  selectedCount: number;
  persistedCount?: number;
  refreshedCount?: number;
  error?: string | null;
}): KnowledgeRetrievalDiagnostics {
  return {
    strategy: "keyword",
    attempted: params.attempted,
    ok: params.error ? false : true,
    model: null,
    candidateCount: params.candidateCount,
    selectedCount: params.selectedCount,
    persistedCount: params.persistedCount ?? 0,
    refreshedCount: params.refreshedCount ?? 0,
    latencyMs: null,
    totalTokens: null,
    error: params.error ?? null,
  };
}

function knowledgeItemRetrievalText(item: KnowledgeItemRow) {
  return trimTo(
    [
      `Title: ${item.title}`,
      item.summary ? `Summary: ${item.summary}` : "",
      item.tags?.length ? `Tags: ${item.tags.join(", ")}` : "",
      item.keywords?.length ? `Keywords: ${item.keywords.join(", ")}` : "",
      `Body: ${item.body}`,
    ]
      .filter(Boolean)
      .join("\n"),
    1800
  );
}

function dotProduct(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

function parseEmbeddingVector(value: unknown) {
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number")) return value as number[];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const parsed = trimmed
    .slice(1, -1)
    .split(",")
    .map((entry) => Number(entry.trim()));
  return parsed.length > 0 && parsed.every((entry) => Number.isFinite(entry)) ? parsed : null;
}

function formatEmbeddingVector(value: number[]) {
  return `[${value.map((entry) => (Number.isFinite(entry) ? entry : 0)).join(",")}]`;
}

async function persistKnowledgeEmbeddings(params: {
  adminClient: ReturnType<typeof createClient>;
  model: string;
  items: Array<{ item: KnowledgeItemRow; vector: number[] }>;
}) {
  await Promise.all(
    params.items.map(({ item, vector }) =>
      params.adminClient
        .schema("tosho")
        .from("support_knowledge_items")
        .update({
          embedding: formatEmbeddingVector(vector),
          embedding_model: params.model,
          embedding_updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("workspace_id", item.workspace_id)
        .then(({ error }) => {
          if (error && !/embedding/i.test(error.message ?? "")) {
            throw new Error(error.message);
          }
        })
    )
  );
}

async function buildKnowledgeEmbedding(item: Pick<KnowledgeItemRow, "title" | "summary" | "body" | "tags" | "keywords">) {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;
  const model = normalizeText(process.env.OPENAI_EMBEDDING_MODEL) || "text-embedding-3-small";
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: knowledgeItemRetrievalText({
        id: "preview",
        workspace_id: "preview",
        slug: "preview",
        status: "active",
        source_label: null,
        source_href: null,
        updated_at: new Date().toISOString(),
        ...item,
      }),
      encoding_format: "float",
      dimensions: 512,
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as JsonRecord;
  const data = Array.isArray(payload.data) ? payload.data : [];
  const vector = parseEmbeddingVector((data[0] as { embedding?: unknown } | undefined)?.embedding);
  return vector ? { vector, model } : null;
}

async function selectKnowledgeCandidatesForMessage(params: {
  adminClient: ReturnType<typeof createClient>;
  items: KnowledgeItemRow[];
  queryText: string;
  routeLabel: string;
}): Promise<{ candidates: KnowledgeItemRow[]; diagnostics: KnowledgeRetrievalDiagnostics }> {
  const keywordCandidates = selectKnowledgeCandidates(params.items, params.queryText, params.routeLabel);
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey || params.items.length === 0) {
    return {
      candidates: keywordCandidates,
      diagnostics: retrievalFallbackDiagnostics({
        attempted: false,
        candidateCount: params.items.length,
        selectedCount: keywordCandidates.length,
        persistedCount: params.items.filter((item) => Boolean(parseEmbeddingVector(item.embedding))).length,
        error: apiKey ? null : "OPENAI_API_KEY is not configured.",
      }),
    };
  }

  const startedAt = Date.now();
  const model = normalizeText(process.env.OPENAI_EMBEDDING_MODEL) || "text-embedding-3-small";
  const persistedVectors = new Map<string, number[]>();
  const missingItems: KnowledgeItemRow[] = [];
  for (const item of params.items) {
    const vector = item.embedding_model === model ? parseEmbeddingVector(item.embedding) : null;
    if (vector) {
      persistedVectors.set(item.id, vector);
    } else {
      missingItems.push(item);
    }
  }

  const inputs = [
    trimTo(`${params.routeLabel}\n${params.queryText}`, 1200),
    ...missingItems.map(knowledgeItemRetrievalText),
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: inputs,
        encoding_format: "float",
        dimensions: 512,
      }),
    });

    const payload = (await response.json()) as JsonRecord;
    const latencyMs = Date.now() - startedAt;
    const usage = payload.usage && typeof payload.usage === "object" ? (payload.usage as JsonRecord) : null;
    const totalTokens =
      typeof usage?.total_tokens === "number" && Number.isFinite(usage.total_tokens) ? usage.total_tokens : null;

    if (!response.ok) {
      const error =
        payload && typeof payload.error === "object" && payload.error && "message" in payload.error
          ? (payload.error as { message?: string }).message
          : "OpenAI embeddings request failed";
      return {
        candidates: keywordCandidates,
        diagnostics: {
          strategy: "keyword",
          attempted: true,
          ok: false,
          model,
          candidateCount: params.items.length,
          selectedCount: keywordCandidates.length,
          persistedCount: persistedVectors.size,
          refreshedCount: 0,
          latencyMs,
          totalTokens,
          error,
        },
      };
    }

    const data = Array.isArray(payload.data) ? payload.data : [];
    const queryVector = parseEmbeddingVector((data[0] as { embedding?: unknown } | undefined)?.embedding);
    if (!queryVector) {
      return {
        candidates: keywordCandidates,
        diagnostics: {
          strategy: "keyword",
          attempted: true,
          ok: false,
          model,
          candidateCount: params.items.length,
          selectedCount: keywordCandidates.length,
          persistedCount: persistedVectors.size,
          refreshedCount: 0,
          latencyMs,
          totalTokens,
          error: "OpenAI embeddings response did not include a query vector.",
        },
      };
    }

    const refreshedItems: Array<{ item: KnowledgeItemRow; vector: number[] }> = [];
    for (const [index, item] of missingItems.entries()) {
      const vector = parseEmbeddingVector((data[index + 1] as { embedding?: unknown } | undefined)?.embedding);
      if (!vector) continue;
      persistedVectors.set(item.id, vector);
      refreshedItems.push({ item, vector });
    }
    if (refreshedItems.length > 0) {
      await persistKnowledgeEmbeddings({
        adminClient: params.adminClient,
        model,
        items: refreshedItems,
      }).catch(() => undefined);
    }

    const keywordIds = new Set(keywordCandidates.map((item) => item.id));
    const ranked = params.items
      .map((item) => {
        const vector = persistedVectors.get(item.id) ?? null;
        const semanticScore = vector ? dotProduct(queryVector, vector) : -1;
        const keywordBoost = keywordIds.has(item.id) ? 0.04 : 0;
        return {
          item,
          score: semanticScore + keywordBoost,
        };
      })
      .filter((entry) => entry.score >= 0.16)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.item);

    const candidates = ranked.length > 0 ? ranked : keywordCandidates;

    return {
      candidates,
      diagnostics: {
        strategy: ranked.length > 0 ? "embedding" : "keyword",
        attempted: true,
        ok: true,
        model,
        candidateCount: params.items.length,
        selectedCount: candidates.length,
        persistedCount: Math.max(0, persistedVectors.size - refreshedItems.length),
        refreshedCount: refreshedItems.length,
        latencyMs,
        totalTokens,
        error: ranked.length > 0 ? null : "Embedding scores were below threshold; used keyword fallback.",
      },
    };
  } catch (error) {
    return {
      candidates: keywordCandidates,
      diagnostics: {
        strategy: "keyword",
        attempted: true,
        ok: false,
        model,
        candidateCount: params.items.length,
        selectedCount: keywordCandidates.length,
        persistedCount: persistedVectors.size,
        refreshedCount: 0,
        latencyMs: Date.now() - startedAt,
        totalTokens: null,
        error: error instanceof Error ? error.message : "OpenAI embeddings request failed",
      },
    };
  }
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
    const metadata = (row.metadata ?? {}) as JsonRecord;
    if (metadata.source === "tosho_ai") return false;
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
    suggestedActions: rows.length === 0 ? compactSuggestedActions(designerActions()) : compactSuggestedActions(periodFollowUpActions()),
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
    suggestedActions: rows.length === 0 ? compactSuggestedActions(designerActions()) : compactSuggestedActions(periodFollowUpActions()),
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
  const quotes = (data ?? []) as Array<{
    id: string;
    assigned_to?: string | null;
    created_by?: string | null;
    status?: string | null;
    total?: number | string | null;
  }>;
  const quoteItemTotals = await loadQuoteItemTotals(
    params.adminClient,
    params.auth.teamId,
    quotes.map((row) => row.id)
  );
  const quoteRunTotals = await loadQuoteRunTotals(
    params.adminClient,
    params.auth.teamId,
    quotes.map((row) => row.id)
  );

  const buckets = new Map<
    string,
    {
      id: string;
      label: string;
      avatarUrl: string | null;
      total: number;
      approved: number;
      totalSum: number;
      approvedSum: number;
      byStatus: Record<string, number>;
    }
  >();
  for (const row of quotes) {
    const ownerId = normalizeText(row.assigned_to || row.created_by || "");
    if (!ownerId) continue;
    if (params.targetMember && ownerId !== params.targetMember.userId) continue;
    const member = memberById.get(ownerId);
    const rawLabel = member?.label ?? ownerId.slice(0, 8);
    const label = formatShortPersonName(rawLabel) || rawLabel;
    const status = normalizeQuoteStatus(row.status);
    const amount = resolveQuoteAmount(row, quoteItemTotals, quoteRunTotals);
    const bucket =
      buckets.get(ownerId) ??
      { id: ownerId, label, avatarUrl: member?.avatarUrl ?? null, total: 0, approved: 0, totalSum: 0, approvedSum: 0, byStatus: {} };
    bucket.total += 1;
    bucket.totalSum += amount;
    if (status === "approved") {
      bucket.approved += 1;
      bucket.approvedSum += amount;
    }
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    buckets.set(ownerId, bucket);
  }

  const rows = Array.from(buckets.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "uk"));
  const totalQuotes = rows.reduce((sum, row) => sum + row.total, 0);
  const approvedQuotes = rows.reduce((sum, row) => sum + row.approved, 0);
  const totalQuoteSum = rows.reduce((sum, row) => sum + row.totalSum, 0);
  const approvedQuoteSum = rows.reduce((sum, row) => sum + row.approvedSum, 0);
  const body =
    rows.length > 0
      ? params.targetMember
        ? `Готово. **${rows[0].label}** має ${formatInteger(totalQuotes)} прорахунків ${period.label}: сума всіх **${formatMoney(totalQuoteSum)}**, затверджено ${formatInteger(approvedQuotes)} на **${formatMoney(approvedQuoteSum)}**.`
        : `Готово. ${period.label} знайшов **${formatInteger(totalQuotes)}** прорахунків по менеджерах: сума всіх **${formatMoney(totalQuoteSum)}**, затверджено **${formatInteger(approvedQuotes)}** на **${formatMoney(approvedQuoteSum)}**.`
      : params.targetMember
        ? `За цей період не знайшов прорахунків у **${formatShortPersonName(params.targetMember.label) || params.targetMember.label}**.`
        : "За цей період не знайшов прорахунків.";
  const analyticsRows: AnalyticsRow[] = rows.map((row) => ({
    id: row.id,
    label: row.label,
    avatarUrl: row.avatarUrl,
    primary: `${formatInteger(row.total)} прорах.`,
    secondary: `Сума всіх ${formatMoney(row.totalSum)} · затв. ${formatInteger(row.approved)} на ${formatMoney(row.approvedSum)}`,
    badges: formatAnalyticsBadges(row.byStatus, formatQuoteStatusLabel),
  }));

  return {
    title: "Прорахунки по менеджерах",
    summary: `Пораховано прорахунки по менеджерах ${period.label}.`,
    markdown: body,
    domain: "orders",
    confidence: 0.9,
    suggestedActions: rows.length === 0 ? compactSuggestedActions(managerQuoteActions()) : compactSuggestedActions(periodFollowUpActions()),
    analytics: {
      kind: "people",
      title: params.targetMember
        ? `Прорахунки: ${formatShortPersonName(params.targetMember.label) || params.targetMember.label}`
        : "Прорахунки по менеджерах",
      caption: `${formatInteger(totalQuotes)} прорахунків ${period.label} · сума всіх ${formatMoney(totalQuoteSum)} · затв. ${formatInteger(approvedQuotes)} на ${formatMoney(approvedQuoteSum)}`,
      metricLabel: "Прорахунки",
      rows: analyticsRows,
      note: "Сума всіх рахується з quotes.total, а якщо там 0 - з quote_items або quote_item_runs. Затверджено рахується тільки для статусу approved.",
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
    suggestedActions: rows.length === 0 ? compactSuggestedActions(managerOrderActions()) : compactSuggestedActions(periodFollowUpActions()),
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

function hasUsableLogoValue(value: unknown) {
  const normalized = normalizeText(typeof value === "string" ? value : null);
  if (!normalized) return false;
  if (/^(null|undefined|none|n\/a|-|—)$/iu.test(normalized)) return false;
  return true;
}

async function buildLogoHygieneAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
}) {
  const [customerResult, leadResult] = await Promise.all([
    params.adminClient
      .schema("tosho")
      .from("customers")
      .select("id,name,legal_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .order("name", { ascending: true })
      .limit(10000),
    params.adminClient
      .schema("tosho")
      .from("leads")
      .select("id,company_name,legal_name,first_name,last_name,logo_url")
      .eq("team_id", params.auth.teamId)
      .order("company_name", { ascending: true })
      .limit(10000),
  ]);
  if (customerResult.error) throw new Error(customerResult.error.message);
  if (leadResult.error) throw new Error(leadResult.error.message);

  const missingCustomers = ((customerResult.data ?? []) as Array<{
    id: string;
    name?: string | null;
    legal_name?: string | null;
    logo_url?: string | null;
  }>)
    .filter((row) => !hasUsableLogoValue(row.logo_url))
    .map((row) => ({
      id: `customer:${row.id}`,
      label: normalizeText(row.name || row.legal_name) || row.id,
      primary: "немає лого",
      secondary: "Замовник · customers.logo_url порожній",
      badges: [{ label: "Замовник", value: 1 }],
    }));

  const missingLeads = ((leadResult.data ?? []) as Array<{
    id: string;
    company_name?: string | null;
    legal_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    logo_url?: string | null;
  }>)
    .filter((row) => !hasUsableLogoValue(row.logo_url))
    .map((row) => {
      const person = [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(" ");
      return {
        id: `lead:${row.id}`,
        label: normalizeText(row.company_name || row.legal_name || person) || row.id,
        primary: "немає лого",
        secondary: "Лід · leads.logo_url порожній",
        badges: [{ label: "Лід", value: 1 }],
      };
    });

  const rows = [...missingCustomers, ...missingLeads].sort((a, b) => a.label.localeCompare(b.label, "uk"));
  const customerCount = missingCustomers.length;
  const leadCount = missingLeads.length;

  return {
    title: "Замовники без логотипів",
    summary: `Знайдено ${formatInteger(customerCount)} замовників і ${formatInteger(leadCount)} лідів без логотипа.`,
    markdown:
      rows.length > 0
        ? `Знайшов **${formatInteger(customerCount)}** замовників і **${formatInteger(leadCount)}** лідів без логотипа. Це прямий CRM-зріз, без OpenAI.`
        : "У замовників і лідів не бачу порожніх logo_url. По CRM-зрізу все чисто.",
    domain: "orders",
    confidence: 0.96,
    suggestedActions: compactSuggestedActions([
      { label: "Поясни пріоритет", text: "Поясни, які логотипи замовників варто виправити першими і чому." },
      { label: "Прорахунки по замовниках", text: "Покажи прорахунки по замовниках за місяць." },
      { label: "Каталог", text: "Що в каталозі варто перевірити сьогодні?" },
    ]),
    analytics: {
      kind: "entity",
      title: "Гігієна логотипів",
      caption: `${formatInteger(rows.length)} записів без logo_url · замовники ${formatInteger(customerCount)} · ліди ${formatInteger(leadCount)}`,
      metricLabel: "Лого",
      rows: rows.slice(0, 80),
      note:
        rows.length > 80
          ? `Показую перші 80 записів із ${formatInteger(rows.length)}. Для повного списку краще додати CSV export.`
          : "Рахую customers.logo_url і leads.logo_url. Quote snapshots перевіряються окремим sync-аудитом.",
    },
  } satisfies AnalyticsResult;
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
      const status = normalizeQuoteStatus(quote.status);
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
            const status = normalizeQuoteStatus(quote.status);
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
  const quotes = (data ?? []) as Array<{
    id: string;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_logo_url?: string | null;
    status?: string | null;
    total?: number | string | null;
  }>;
  const quoteItemTotals = await loadQuoteItemTotals(
    params.adminClient,
    params.auth.teamId,
    quotes.map((row) => row.id)
  );
  const quoteRunTotals = await loadQuoteRunTotals(
    params.adminClient,
    params.auth.teamId,
    quotes.map((row) => row.id)
  );

  const buckets = new Map<
    string,
    { id: string; label: string; logoUrl: string | null; total: number; approved: number; sum: number; byStatus: Record<string, number> }
  >();
  for (const row of quotes) {
    const customerId = normalizeText(row.customer_id);
    const customerName = normalizeText(row.customer_name) || "Без замовника";
    const key = customerId || normalizeAnalyticsName(customerName) || "unknown";
    const status = normalizeQuoteStatus(row.status);
    const amount = resolveQuoteAmount(row, quoteItemTotals, quoteRunTotals);
    const bucket = buckets.get(key) ?? { id: key, label: customerName, logoUrl: normalizeText(row.customer_logo_url) || null, total: 0, approved: 0, sum: 0, byStatus: {} };
    if (!bucket.logoUrl && row.customer_logo_url) bucket.logoUrl = normalizeText(row.customer_logo_url) || null;
    bucket.total += 1;
    if (status === "approved") {
      bucket.approved += 1;
      bucket.sum += amount;
    }
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
    suggestedActions: rows.length === 0 ? compactSuggestedActions(customerActions()) : compactSuggestedActions(periodFollowUpActions()),
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
    suggestedActions: rows.length === 0 ? compactSuggestedActions(customerActions()) : compactSuggestedActions(periodFollowUpActions()),
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
  const quotes = (data ?? []) as Array<{
    id: string;
    assigned_to?: string | null;
    created_by?: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_logo_url?: string | null;
    status?: string | null;
    total?: number | string | null;
  }>;
  const quoteItemTotals = await loadQuoteItemTotals(
    params.adminClient,
    params.auth.teamId,
    quotes.map((row) => row.id)
  );
  const quoteRunTotals = await loadQuoteRunTotals(
    params.adminClient,
    params.auth.teamId,
    quotes.map((row) => row.id)
  );

  const customers = new Map<string, { id: string; label: string; logoUrl: string | null; quoteCount: number; approved: number; sum: number; byStatus: Record<string, number> }>();
  for (const row of quotes) {
    const ownerId = normalizeText(row.assigned_to || row.created_by || "");
    if (ownerId !== params.targetMember.userId) continue;
    const customerName = normalizeText(row.customer_name) || "Без замовника";
    const customerId = normalizeText(row.customer_id) || normalizeAnalyticsName(customerName) || "unknown";
    const status = normalizeQuoteStatus(row.status);
    const amount = resolveQuoteAmount(row, quoteItemTotals, quoteRunTotals);
    const bucket = customers.get(customerId) ?? { id: customerId, label: customerName, logoUrl: normalizeText(row.customer_logo_url) || null, quoteCount: 0, approved: 0, sum: 0, byStatus: {} };
    if (!bucket.logoUrl && row.customer_logo_url) bucket.logoUrl = normalizeText(row.customer_logo_url) || null;
    bucket.quoteCount += 1;
    if (status === "approved") {
      bucket.approved += 1;
      bucket.sum += amount;
    }
    bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    customers.set(customerId, bucket);
  }

  const rows = Array.from(customers.values()).sort(
    (a, b) => b.quoteCount - a.quoteCount || a.label.localeCompare(b.label, "uk")
  );
  const totalQuotes = rows.reduce((sum, row) => sum + row.quoteCount, 0);
  const totalApproved = rows.reduce((sum, row) => sum + row.approved, 0);
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
    suggestedActions: rows.length === 0 ? compactSuggestedActions([...periodFollowUpActions(), { label: "Усі замовники", text: "скільки прорахунків по замовниках за місяць?" }]) : compactSuggestedActions(periodFollowUpActions()),
    analytics: {
      kind: "entity",
      title: `Замовники: ${targetLabel}`,
      caption: `${formatInteger(rows.length)} замовників · ${formatInteger(totalQuotes)} прорахунків · затверджено ${formatInteger(totalApproved)} · сума ${formatMoney(totalSum)}`,
      metricLabel: "Прорахунки",
      rows: rows.map((row) => ({
        id: row.id,
        label: row.label,
        avatarUrl: row.logoUrl,
        primary: `${formatInteger(row.quoteCount)} прорах.`,
        secondary: `Затверджено ${formatInteger(row.approved)} · сума ${formatMoney(row.sum)}`,
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
      suggestedActions: compactSuggestedActions([
        { label: "Вибрати замовника", text: "скільки прорахунків у @замовник: за місяць?" },
        { label: "По замовниках", text: "скільки прорахунків по замовниках за місяць?" },
        { label: "Прорахунки менеджерів", text: "скільки прорахунків по менеджерах за місяць?" },
      ]),
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
  const quoteItemTotals = await loadQuoteItemTotals(
    params.adminClient,
    params.auth.teamId,
    quotes.map((quote) => quote.id)
  );
  const quoteRunTotals = await loadQuoteRunTotals(
    params.adminClient,
    params.auth.teamId,
    quotes.map((quote) => quote.id)
  );
  const quoteIds = new Set(quotes.map((quote) => quote.id));
  const orders = ((orderResult.data ?? []) as Array<{ id: string; quote_id?: string | null; order_status?: string | null; total?: number | string | null; customer_id?: string | null; customer_name?: string | null; party_type?: string | null }>).filter((row) => {
    const matchesName = looseAnalyticsNameMatches(row.customer_name, party.name);
    if (row.quote_id && quoteIds.has(row.quote_id)) return true;
    if (party.kind === "customer") return row.customer_id === party.id || matchesName;
    return matchesName && (row.party_type === "lead" || !row.customer_id);
  });

  const quoteByStatus: Record<string, number> = {};
  let quoteSum = 0;
  let approvedQuoteSum = 0;
  for (const quote of quotes) {
    const status = normalizeQuoteStatus(quote.status);
    quoteByStatus[status] = (quoteByStatus[status] ?? 0) + 1;
    const amount = resolveQuoteAmount(quote, quoteItemTotals, quoteRunTotals);
    quoteSum += amount;
    if (status === "approved") {
      approvedQuoteSum += amount;
    }
  }

  const orderByStatus: Record<string, number> = {};
  let orderSum = 0;
  for (const order of orders) {
    const status = normalizeText(order.order_status) || "без статусу";
    orderByStatus[status] = (orderByStatus[status] ?? 0) + 1;
    const amount = typeof order.total === "number" ? order.total : order.total ? Number(order.total) : 0;
    if (Number.isFinite(amount)) orderSum += amount;
  }

  const orderStatusLine = formatAnalyticsBadgeLine(orderByStatus, formatOrderStatusLabel) || "немає статусів";
  const quoteCount = quotes.length;
  const approvedQuoteCount = quoteByStatus.approved ?? 0;
  const orderCount = orders.length;
  const quoteSecondary =
    approvedQuoteCount > 0
      ? approvedQuoteSum === quoteSum
        ? `Затверджено ${formatInteger(approvedQuoteCount)} · сума ${formatMoney(approvedQuoteSum)}`
        : `Затверджено ${formatInteger(approvedQuoteCount)} · затв. сума ${formatMoney(approvedQuoteSum)} · всього ${formatMoney(quoteSum)}`
      : `Сума ${formatMoney(quoteSum)} · затверджено 0`;
  const summaryParts = [
    includeQuotes ? `${formatInteger(quoteCount)} прорахунків${quoteSum > 0 ? ` на ${formatMoney(quoteSum)}` : ""}` : "",
    includeOrders ? `${formatInteger(orderCount)} замовлень` : "",
  ].filter(Boolean);
  const rows: AnalyticsRow[] = [
    includeQuotes
      ? {
          id: "quotes",
          label: "Прорахунки",
          primary: formatInteger(quoteCount),
          secondary: quoteSecondary,
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
    suggestedActions: rows.every((row) => row.primary === "0") ? compactSuggestedActions(customerActions()) : compactSuggestedActions(periodFollowUpActions()),
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
    suggestedActions: compactSuggestedActions([
      { label: "Вибрати менеджера", text: "скільки прорахунків у @менеджер: за місяць?" },
      { label: "Вибрати дизайнера", text: "скільки дизайн-задач зробив @дизайнер: за місяць?" },
      { label: "Усі менеджери", text: "скільки прорахунків по менеджерах за місяць?" },
    ]),
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

function buildPersonMetricMismatchDecision(candidate: RoutingCandidate, requestedMetric: string): AssistantDecision {
  const label = formatShortPersonName(candidate.label) || candidate.label;
  const roleLabel = analyticsPersonRoleLabel(candidate);
  return {
    title: "Уточни роль",
    summary: `${candidate.label}: ${roleLabel}, запит був про ${requestedMetric}.`,
    answerMarkdown: `Знайшов **${label}**, але це **${roleLabel}**. ${requestedMetric} рахую по відповідній ролі, тому не підставляю цю людину автоматично. Уточни роль або напиши іншу метрику.`,
    playfulLine: "Потрібне уточнення перед підрахунком.",
    status: "waiting_user",
    priority: "low",
    domain: roleLabel === "Дизайнер" ? "design" : roleLabel === "Логіст" ? "logistics" : "team",
    confidence: 0.82,
    shouldEscalate: false,
    shouldNotify: false,
    knowledgeIds: [],
    internalSummary: "Analytics person metric did not match candidate role.",
    suggestedActions: compactSuggestedActions([
      { label: "Прорахунки менеджерів", text: "скільки прорахунків по менеджерах за місяць?" },
      { label: "Дизайн-задачі", text: `скільки дизайн-задач зробив ${candidate.label} за місяць?` },
      { label: "Замовлення менеджерів", text: "скільки замовлень по менеджерах за місяць?" },
    ]),
    analytics: {
      kind: "people",
      title: "Не підставляю автоматично",
      caption: "Метрика і роль не збігаються",
      metricLabel: "Роль",
      rows: [
        {
          id: candidate.userId,
          label,
          avatarUrl: candidate.avatarUrl,
          primary: roleLabel,
          secondary: normalizeText(candidate.jobRole) || normalizeText(candidate.accessRole) || null,
        },
      ],
      note: "Для прорахунків і замовлень беру менеджерів; для дизайну - дизайнерів.",
    },
  };
}

function buildPersonNotFoundDecision(message: string): AssistantDecision {
  const query = stripAnalyticsQueryTerms(message) || "цю людину";
  return {
    title: "Не знайшов людину",
    summary: `Не знайшов співробітника за запитом: ${query}.`,
    answerMarkdown: `Не знайшов **${query}** серед співробітників. Не буду підставляти схожий випадковий запис. Напиши ім'я точніше або вибери людину через @підказку.`,
    playfulLine: "Потрібне точніше ім'я.",
    status: "waiting_user",
    priority: "low",
    domain: "team",
    confidence: 0.78,
    shouldEscalate: false,
    shouldNotify: false,
    knowledgeIds: [],
    internalSummary: "Analytics person target was not found.",
    suggestedActions: compactSuggestedActions([
      { label: "Вибрати менеджера", text: "скільки прорахунків у @менеджер: за місяць?" },
      { label: "Вибрати дизайнера", text: "скільки дизайн-задач зробив @дизайнер: за місяць?" },
      { label: "Усі менеджери", text: "скільки прорахунків по менеджерах за місяць?" },
    ]),
    analytics: {
      kind: "people",
      title: "Кого рахувати?",
      caption: "Немає точного збігу",
      metricLabel: "Роль",
      rows: [],
      note: "Не підставляю схожі імена без достатнього збігу.",
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

  const normalized = normalizeText(params.message).toLowerCase();
  const explicitlyDesign = /(дизайн|дизайнер|дизайнів|таск|тасок|задач)/u.test(normalized);
  const explicitlyLogistics = hasLogisticsAnalyticsTerm(normalized);
  const explicitlyCustomers = /(замовник|клієнт|контрагент)/u.test(normalized);
  const explicitlyOrders = /(замовл|order)/u.test(normalized) && !/(замовник|клієнт|контрагент)/u.test(normalized);
  const explicitlyQuotes = /(прорах|quote|коштор|кп)/u.test(normalized);
  const hasExplicitPersonContext =
    hasManagerAnalyticsTerm(normalized) ||
    hasEmployeeAnalyticsTerm(normalized) ||
    /(дизайнер|логіст|співробітник|користувач|працівник)/u.test(normalized);
  if (matches.length === 0) {
    return hasExplicitPersonContext && stripAnalyticsQueryTerms(params.message)
      ? buildPersonNotFoundDecision(params.message)
      : null;
  }

  const relevantMatches = matches.filter((member) => {
    const role = normalizeRole(member.jobRole);
    if (explicitlyDesign) return role === "designer" || role === "дизайнер";
    if (explicitlyLogistics) return role === "logistics" || role === "head_of_logistics";
    if (explicitlyCustomers || explicitlyOrders || explicitlyQuotes || hasManagerAnalyticsTerm(normalized)) {
      return role === "manager" || role === "менеджер" || role === "sales_manager" || role === "junior_sales_manager" || role === "pm";
    }
    return true;
  });
  if (
    relevantMatches.length === 0 &&
    (explicitlyDesign || explicitlyLogistics || explicitlyCustomers || explicitlyOrders || explicitlyQuotes || hasManagerAnalyticsTerm(normalized))
  ) {
    const requestedMetric = explicitlyDesign
      ? "дизайн-задачі"
      : explicitlyLogistics
        ? "логістику"
        : explicitlyOrders
          ? "замовлення"
          : explicitlyCustomers
            ? "замовників"
            : "прорахунки";
    return buildPersonMetricMismatchDecision(matches[0], requestedMetric);
  }
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

async function buildCurrentUserAnalyticsDecision(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
}) {
  const members = await listRoutingCandidates(params.adminClient, params.auth.workspaceId);
  const target = members.find((member) => member.userId === params.auth.userId);
  if (!target) return null;

  const normalized = normalizeText(params.message).toLowerCase();
  const role = normalizeRole(target.jobRole);
  const looksDesigner = role === "designer" || role === "дизайнер";
  const looksLogistics = role === "logistics" || role === "head_of_logistics";
  const looksManager = role === "manager" || role === "менеджер" || role === "sales_manager" || role === "junior_sales_manager" || role === "pm";
  const explicitlyDesign = /(дизайн|дизайнер|дизайнів|таск|тасок|задач)/u.test(normalized);
  const explicitlyLogistics = hasLogisticsAnalyticsTerm(normalized);
  const explicitlyCustomers = /(замовник|клієнт|контрагент)/u.test(normalized);
  const explicitlyOrders = /(замовл|order)/u.test(normalized) && !/(замовник|клієнт|контрагент)/u.test(normalized);
  const explicitlyQuotes = /(прорах|quote|коштор|кп)/u.test(normalized);

  if (explicitlyDesign || (!explicitlyQuotes && !explicitlyOrders && !explicitlyCustomers && looksDesigner)) {
    return toAnalyticsDecision(await buildDesignCompletionAnalytics({ ...params, targetMember: target }));
  }
  if (explicitlyLogistics || (!explicitlyQuotes && !explicitlyOrders && !explicitlyCustomers && looksLogistics)) {
    return toAnalyticsDecision(await buildLogisticsDeliveryAnalytics({ ...params, targetMember: target }));
  }
  if (explicitlyCustomers) {
    return toAnalyticsDecision(await buildManagerCustomerAnalytics({ ...params, targetMember: target }));
  }
  if (explicitlyOrders) {
    return toAnalyticsDecision(await buildManagerOrderAnalytics({ ...params, targetMember: target }));
  }
  if (explicitlyQuotes || looksManager) {
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

function formatDateTimeShort(value?: string | null) {
  if (!value) return "немає дати";
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Kiev",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getKyivDayWindow(now = new Date()) {
  const kyivNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Kiev" }));
  const utcNow = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = kyivNow.getTime() - utcNow.getTime();
  const year = kyivNow.getFullYear();
  const month = kyivNow.getMonth();
  const day = kyivNow.getDate();
  const localMidnightAsUtc = Date.UTC(year, month, day, 0, 0, 0, 0);
  const start = new Date(localMidnightAsUtc - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { startIso: start.toISOString(), endIso: end.toISOString(), date };
}

function getKyivDayWindowForMessage(message: string) {
  const normalized = normalizeText(message).toLowerCase();
  const now = new Date();
  if (/вчора|yesterday/u.test(normalized)) {
    return { ...getKyivDayWindow(new Date(now.getTime() - 24 * 60 * 60 * 1000)), label: "вчора" };
  }
  return { ...getKyivDayWindow(now), label: "сьогодні" };
}

function storageObjectSize(row: { metadata?: JsonRecord | null }) {
  const raw = row.metadata?.size;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

function isOriginalStoragePath(value: string | null | undefined) {
  const normalized = normalizeText(value).toLowerCase();
  return Boolean(normalized && !normalized.includes("__thumb.") && !normalized.includes("__preview."));
}

type LiveAdminMetrics = {
  storageTodayBytes: number;
  storageTodayObjects: number;
  quoteAttachmentsToday: number;
  designTasksToday: number;
  designTaskAttachmentsToday: number;
  designOutputUploadsToday: number;
  designOutputSelectionToday: number;
};

async function loadLiveAdminMetrics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  startIso: string;
  endIso: string;
}): Promise<LiveAdminMetrics> {
  const empty: LiveAdminMetrics = {
    storageTodayBytes: 0,
    storageTodayObjects: 0,
    quoteAttachmentsToday: 0,
    designTasksToday: 0,
    designTaskAttachmentsToday: 0,
    designOutputUploadsToday: 0,
    designOutputSelectionToday: 0,
  };

  const [activityResult, storageResult] = await Promise.all([
    params.adminClient
      .from("activity_log")
      .select("action,metadata")
      .eq("team_id", params.auth.teamId)
      .gte("created_at", params.startIso)
      .lt("created_at", params.endIso)
      .in("action", ["design_task_created", "design_task", "design_output_selection"])
      .limit(10000),
    params.adminClient
      .schema("storage")
      .from("objects")
      .select("bucket_id,name,metadata")
      .gte("created_at", params.startIso)
      .lt("created_at", params.endIso)
      .limit(10000),
  ]);

  const activityRows = (activityResult.data ?? []) as Array<{ action?: string | null; metadata?: JsonRecord | null }>;
  for (const row of activityRows) {
    if (row.action === "design_output_selection") {
      empty.designOutputSelectionToday += 1;
      continue;
    }
    if (row.action === "design_task_created") {
      empty.designTasksToday += 1;
      continue;
    }
    if (row.action === "design_task") {
      const source = normalizeText(typeof row.metadata?.source === "string" ? row.metadata.source : "");
      if (source === "design_task_created_manual" || source === "design_task_created") {
        empty.designTasksToday += 1;
      }
    }
  }

  const storageRows = (storageResult.data ?? []) as Array<{
    bucket_id?: string | null;
    name?: string | null;
    metadata?: JsonRecord | null;
  }>;
  empty.storageTodayObjects = storageRows.length;
  empty.storageTodayBytes = storageRows.reduce((sum, row) => sum + storageObjectSize(row), 0);

  const teamPrefix = `teams/${params.auth.teamId}/`;
  for (const row of storageRows) {
    const bucket = normalizeText(row.bucket_id);
    const name = normalizeText(row.name);
    if (bucket !== "attachments" || !name.startsWith(teamPrefix) || !isOriginalStoragePath(name)) continue;
    if (name.startsWith(`${teamPrefix}quote-attachments/`)) empty.quoteAttachmentsToday += 1;
    if (name.startsWith(`${teamPrefix}design-brief-files/`)) empty.designTaskAttachmentsToday += 1;
    if (name.startsWith(`${teamPrefix}design-outputs/`)) empty.designOutputUploadsToday += 1;
  }

  return empty;
}

type BackupRunRow = {
  id?: string | null;
  section?: string | null;
  status?: "success" | "failed" | string | null;
  schedule?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  archive_name?: string | null;
  archive_size_bytes?: number | null;
  dropbox_path?: string | null;
  error_message?: string | null;
  machine_name?: string | null;
};

function buildBackupHealth(runs: BackupRunRow[], subjectLabel: string) {
  const latestRun = runs[0] ?? null;
  const latestSuccessfulRun = runs.find((row) => row.status === "success") ?? null;
  const finishedAtMs = latestSuccessfulRun?.finished_at ? new Date(latestSuccessfulRun.finished_at).getTime() : NaN;
  const ageHours = Number.isFinite(finishedAtMs) ? Math.max(0, (Date.now() - finishedAtMs) / (1000 * 60 * 60)) : null;
  const tone =
    latestRun?.status === "failed"
      ? "danger"
      : ageHours === null
        ? "warning"
        : ageHours <= 8 * 24
          ? "good"
          : ageHours <= 16 * 24
            ? "warning"
            : "danger";
  const primary = tone === "good" ? "актуальний" : tone === "danger" ? "увага" : "перевірити";
  const message = latestRun
    ? latestRun.status === "failed"
      ? `Останній backup ${subjectLabel} впав ${formatDateTimeShort(latestRun.finished_at)}.${latestRun.error_message ? ` ${latestRun.error_message}` : ""}`
      : `Останній успішний backup ${subjectLabel}: ${formatDateTimeShort(latestRun.finished_at)} · ${latestRun.archive_name ?? "архів"}${
          latestRun.archive_size_bytes ? ` · ${formatBytesCompact(latestRun.archive_size_bytes)}` : ""
        }.`
    : `Ще немає жодного записаного backup-run по ${subjectLabel}.`;

  return { latestRun, latestSuccessfulRun, ageHours, tone, primary, message };
}

async function buildAdminObservabilityAnalytics(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
}) {
  const accessRole = normalizeRole(params.auth.accessRole);
  const jobRole = normalizeRole(params.auth.jobRole);
  const canViewAdminHealth = accessRole === "owner" || accessRole === "admin" || jobRole === "seo";
  if (!canViewAdminHealth) return null;

  const dayWindow = getKyivDayWindowForMessage(params.message);
  const scopeIds = Array.from(new Set([params.auth.workspaceId, params.auth.teamId].map(normalizeText).filter(Boolean)));

  const [{ data: snapshotRows }, { data: runtimeRows }, liveMetrics, { data: backupRows }] = await Promise.all([
    params.adminClient
      .schema("tosho")
      .from("admin_observability_snapshots")
      .select(
        "captured_at,captured_for_date,database_size_bytes,attachments_bucket_bytes,avatars_bucket_bytes,storage_today_bytes,storage_today_objects,quote_attachments_today,design_tasks_today,design_task_attachments_today,design_output_uploads_today,design_output_selection_today,attachment_possible_orphan_original_count,attachment_missing_variants_count,attachment_safe_reclaimable_count,attachment_safe_reclaimable_bytes,database_stats,dead_tuple_tables"
      )
      .in("team_id", scopeIds)
      .eq("captured_for_date", dayWindow.date)
      .order("captured_for_date", { ascending: false })
      .limit(1),
    params.adminClient
      .schema("tosho")
      .from("runtime_errors")
      .select("title,href,created_at,metadata")
      .in("team_id", scopeIds)
      .gte("created_at", dayWindow.startIso)
      .lt("created_at", dayWindow.endIso)
      .order("created_at", { ascending: false })
      .limit(25),
    loadLiveAdminMetrics({
      adminClient: params.adminClient,
      auth: params.auth,
      startIso: dayWindow.startIso,
      endIso: dayWindow.endIso,
    }),
    params.adminClient
      .schema("tosho")
      .from("backup_runs")
      .select("id,section,status,schedule,started_at,finished_at,archive_name,archive_size_bytes,dropbox_path,error_message,machine_name")
      .eq("workspace_id", params.auth.workspaceId)
      .in("section", ["storage", "database"])
      .order("finished_at", { ascending: false })
      .limit(20),
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

  const snapshotIsToday = snapshot?.captured_for_date === dayWindow.date;
  const runtimeErrorCount = (runtimeRows ?? []).length;
  const latestRuntimeError = ((runtimeRows ?? []) as RuntimeErrorRow[])[0] ?? null;
  const dbSize = Number(snapshot?.database_size_bytes ?? 0);
  const attachmentsSize = Number(snapshot?.attachments_bucket_bytes ?? 0);
  const storageTodayBytes = Math.max(snapshotIsToday ? Number(snapshot?.storage_today_bytes ?? 0) : 0, liveMetrics.storageTodayBytes);
  const storageTodayObjects = Math.max(snapshotIsToday ? Number(snapshot?.storage_today_objects ?? 0) : 0, liveMetrics.storageTodayObjects);
  const quoteAttachmentsToday = Math.max(snapshotIsToday ? Number(snapshot?.quote_attachments_today ?? 0) : 0, liveMetrics.quoteAttachmentsToday);
  const designTasksToday = Math.max(snapshotIsToday ? Number(snapshot?.design_tasks_today ?? 0) : 0, liveMetrics.designTasksToday);
  const designTaskAttachmentsToday = Math.max(
    snapshotIsToday ? Number(snapshot?.design_task_attachments_today ?? 0) : 0,
    liveMetrics.designTaskAttachmentsToday
  );
  const designOutputUploadsToday = Math.max(
    snapshotIsToday ? Number(snapshot?.design_output_uploads_today ?? 0) : 0,
    liveMetrics.designOutputUploadsToday
  );
  const designOutputSelectionToday = Math.max(
    snapshotIsToday ? Number(snapshot?.design_output_selection_today ?? 0) : 0,
    liveMetrics.designOutputSelectionToday
  );
  const activityTodayTotal =
    designTasksToday +
    quoteAttachmentsToday +
    designTaskAttachmentsToday +
    designOutputUploadsToday +
    designOutputSelectionToday;
  const orphanCount = Number(snapshot?.attachment_possible_orphan_original_count ?? 0);
  const missingVariants = Number(snapshot?.attachment_missing_variants_count ?? 0);
  const reclaimableCount = Number(snapshot?.attachment_safe_reclaimable_count ?? 0);
  const reclaimableBytes = Number(snapshot?.attachment_safe_reclaimable_bytes ?? 0);
  const deadTupleTables = Array.isArray(snapshot?.dead_tuple_tables) ? snapshot?.dead_tuple_tables.length ?? 0 : 0;
  const capturedLabel = snapshot?.captured_at ? new Date(snapshot.captured_at).toLocaleString("uk-UA") : null;
  const backupRuns = ((backupRows ?? []) as BackupRunRow[]).filter((row) => row.section === "storage" || row.section === "database");
  const storageBackupHealth = buildBackupHealth(
    backupRuns.filter((row) => row.section === "storage"),
    "файлів"
  );
  const databaseBackupHealth = buildBackupHealth(
    backupRuns.filter((row) => row.section === "database"),
    "бази"
  );
  const hasBackupRisk = storageBackupHealth.tone !== "good" || databaseBackupHealth.tone !== "good";
  const hasRisks = runtimeErrorCount > 0 || orphanCount > 0 || missingVariants > 0 || deadTupleTables > 0 || hasBackupRisk;
  const normalizedMessage = normalizeText(params.message).toLowerCase();
  const backupFocused = /(backup|бекап|резерв|database backup|storage backup|бд backup|db backup)/u.test(normalizedMessage);
  const activityFocused = /(активн|що\s+було)/u.test(normalizedMessage) && !backupFocused;
  const periodLabel = dayWindow.label;
  const periodTitle = periodLabel === "вчора" ? "вчора" : "сьогодні";
  const periodTitleCapitalized = periodLabel === "вчора" ? "Вчора" : "Сьогодні";

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
      label: `Активність ${periodTitle}`,
      primary: formatInteger(activityTodayTotal),
      secondary: `Дизайн-задачі ${formatInteger(designTasksToday)} · вкладень у прорахунках ${formatInteger(quoteAttachmentsToday)}`,
      badges: [
        { label: "Design files", value: formatInteger(designTaskAttachmentsToday) },
        { label: "Outputs", value: formatInteger(designOutputUploadsToday) },
        { label: "Selections", value: formatInteger(designOutputSelectionToday) },
      ],
    },
    {
      id: "storage",
      label: "Сховище",
      primary: formatBytesCompact(storageTodayBytes),
      secondary: `${periodTitleCapitalized} ${formatInteger(storageTodayObjects)} об'єктів · attachments ${formatBytesCompact(attachmentsSize)}`,
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
    {
      id: "backup-storage",
      label: "Backup файлів",
      primary: storageBackupHealth.primary,
      secondary: storageBackupHealth.message,
      badges: [
        storageBackupHealth.latestSuccessfulRun?.archive_size_bytes
          ? { label: "Archive", value: formatBytesCompact(storageBackupHealth.latestSuccessfulRun.archive_size_bytes) }
          : null,
        storageBackupHealth.latestSuccessfulRun?.dropbox_path
          ? { label: "Dropbox", value: trimTo(storageBackupHealth.latestSuccessfulRun.dropbox_path, 28) }
          : null,
      ].filter((item): item is AnalyticsBadge => Boolean(item)),
    },
    {
      id: "backup-database",
      label: "Backup бази",
      primary: databaseBackupHealth.primary,
      secondary: databaseBackupHealth.message,
      badges: [
        databaseBackupHealth.latestSuccessfulRun?.archive_size_bytes
          ? { label: "Archive", value: formatBytesCompact(databaseBackupHealth.latestSuccessfulRun.archive_size_bytes) }
          : null,
        databaseBackupHealth.latestSuccessfulRun?.dropbox_path
          ? { label: "Dropbox", value: trimTo(databaseBackupHealth.latestSuccessfulRun.dropbox_path, 28) }
          : null,
      ].filter((item): item is AnalyticsBadge => Boolean(item)),
    },
  ];

  return {
    title: backupFocused ? "Backup-зріз" : activityFocused ? `Активність ${periodTitle}` : "Адмін-зріз",
    summary: hasRisks ? "Є що перевірити в observability." : `Критичних сигналів у зрізі ${periodTitle} не бачу.`,
    markdown: backupFocused
      ? `Подивився backup-и: storage backup ${storageBackupHealth.primary}, database backup ${databaseBackupHealth.primary}.`
      : activityFocused
        ? `За ${periodTitle} бачу **${formatInteger(activityTodayTotal)}** активностей у контрольованому CRM-зрізі: дизайн-задачі **${formatInteger(designTasksToday)}**, вкладення у прорахунках **${formatInteger(quoteAttachmentsToday)}**, design files **${formatInteger(designTaskAttachmentsToday)}**, outputs **${formatInteger(designOutputUploadsToday)}**, selections **${formatInteger(designOutputSelectionToday)}**.`
      : hasRisks
        ? "Є кілька сигналів, які варто перевірити в observability: runtime errors, attachments, backup або таблиці з dead tuples."
        : `По зрізу ${periodTitle} все виглядає спокійно: нових runtime errors не бачу, а основні storage/attachment і backup-метрики нижче.`,
    domain: "admin",
    confidence: snapshot || runtimeErrorCount > 0 || backupRuns.length > 0 || storageTodayObjects > 0 ? 0.9 : 0.74,
    analytics: {
      kind: "entity",
      title: "Observability",
      caption: capturedLabel
        ? `Snapshot за ${dayWindow.date}: ${capturedLabel}${snapshotIsToday ? "" : " · метрики періоду рахую live"}`
        : `Snapshot за ${dayWindow.date} ще не знайдено · метрики періоду рахую live`,
      metricLabel: "Стан",
      rows,
      note: snapshot
        ? "Snapshot беру з admin_observability_snapshots по workspace_id; активність періоду і backup доповнюю live-даними."
        : "Snapshot за цей день ще не створений. Активність періоду, runtime errors і backup_runs рахую напряму.",
    },
  } satisfies AnalyticsResult;
}

async function buildAnalyticsDecision(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
}) {
  const supportedIntent = detectSupportedAnalyticsIntent(params.message);
  if (!supportedIntent) return null;
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
  const asksForDesignerRanking = isDesignerRankingAnalyticsQuery(params.message);
  const asksForGenericDesignerAnalytics = isGenericDesignerAnalyticsQuery(normalized);
  const asksForGenericManagerAnalytics = isGenericManagerAnalyticsQuery(normalized);
  const asksForSelfAnalytics = isSelfAnalyticsQuery(normalized);
  const asksForCustomerBreakdown =
    /по\s+(яким\s+|яких\s+)?(замовник|клієнт|контрагент)|у\s+якого\s+(замовник|клієнт|контрагент)|найбільш|більше\s+всього|топ/u.test(
      normalized
    );
  const asksForPeopleList =
    /(хто|скільки|покажи|список|перелік).*(дизайнер|менеджер|логіст|співробіт|користувач|команд|працівник)/u.test(
      normalized
    ) && !/(прорах|quote|коштор|кп|замовл|order|таск|тасок|задач|зроб|закрит|approved|відвантаж|доставк)/u.test(normalized);

  if (supportedIntent === "admin_health" && hasAdminTerm && !hasDesignTerm && !hasQuoteTerm && !hasOrderTerm && !hasPartyTerm && !hasManagerTerm) {
    const adminDecision = await buildAdminObservabilityAnalytics(params);
    if (adminDecision) return toAnalyticsDecision(adminDecision);
  }

  if (asksForSelfAnalytics) {
    const selfDecision = await buildCurrentUserAnalyticsDecision(params);
    if (selfDecision) return selfDecision;
  }

  if (supportedIntent === "personal_focus" && !hasQuoteTerm && !hasOrderTerm && !hasDesignTerm && !hasManagerTerm) {
    const personalDecision = await buildPersonalActionPlanAnalytics(params);
    if (personalDecision) return toAnalyticsDecision(personalDecision);
  }

  if (supportedIntent === "logo_hygiene") {
    return toAnalyticsDecision(await buildLogoHygieneAnalytics(params));
  }

  if (supportedIntent === "designer_ranking" || asksForDesignerRanking) {
    return toAnalyticsDecision(await buildDesignCompletionAnalytics(params));
  }

  if (asksForGenericDesignerAnalytics && !hasQuoteTerm && !hasOrderTerm) {
    return toAnalyticsDecision(await buildDesignCompletionAnalytics(params));
  }

  if (asksForGenericManagerAnalytics) {
    if (hasOrderTerm && !hasQuoteTerm) return toAnalyticsDecision(await buildManagerOrderAnalytics(params));
    return toAnalyticsDecision(await buildManagerQuoteAnalytics(params));
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
    if (asksForDesignerRanking) {
      return toAnalyticsDecision(await buildDesignCompletionAnalytics(params));
    }
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

const CRM_TOOL_DEFINITIONS = [
  {
    type: "function",
    name: "get_crm_analytics",
    description:
      "Get a controlled live CRM analytics snapshot only for supported intents: admin health, personal focus, designer/design metrics, team role lists, quote/estimate metrics, customer/lead quote metrics, and limited order/logistics signals.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "A concise Ukrainian analytics query preserving the user's metric, target person/customer, and period.",
        },
      },
    },
  },
];

function extractFunctionCalls(payload: JsonRecord) {
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const typed = item as { type?: unknown; name?: unknown; call_id?: unknown; arguments?: unknown };
      if (typed.type !== "function_call" || typeof typed.name !== "string" || typeof typed.call_id !== "string") {
        return null;
      }
      return {
        name: typed.name,
        callId: typed.call_id,
        argumentsText: typeof typed.arguments === "string" ? typed.arguments : "{}",
      };
    })
    .filter((item): item is { name: string; callId: string; argumentsText: string } => Boolean(item));
}

function compactDecisionForToolOutput(decision: AssistantDecision | null) {
  if (!decision) {
    return {
      ok: false,
      message: "No supported CRM analytics snapshot matched this query.",
    };
  }
  return {
    ok: true,
    title: decision.title,
    summary: decision.summary,
    answerMarkdown: decision.answerMarkdown,
    status: decision.status,
    priority: decision.priority,
    domain: decision.domain,
    confidence: decision.confidence,
    analytics: decision.analytics ?? null,
    suggestedActions: compactSuggestedActions(decision.suggestedActions ?? []),
  };
}

async function runCrmToolCalling(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  model: string;
  apiKey: string;
  message: string;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
}) {
  const supportedIntent = detectSupportedAnalyticsIntent(params.message);
  if (!supportedIntent) {
    return {
      block: `No CRM tools were used. Supported analytics intents:\n${analyticsIntentPromptList()}`,
      diagnostics: {
        attempted: false,
        requested: [],
        executed: [],
        latencyMs: null,
        error: "No supported CRM analytics intent matched this request.",
      } satisfies CrmToolDiagnostics,
    };
  }

  const startedAt = Date.now();
  const diagnostics: CrmToolDiagnostics = {
    attempted: true,
    requested: [],
    executed: [],
    latencyMs: null,
    error: null,
  };

  try {
    const toolPrompt = [
      "You are deciding whether ToSho AI needs live CRM data before answering.",
      "Call get_crm_analytics only for live counts, statistics, workload, operational health, personal focus, or status summaries.",
      `The detected supported analytics intent is: ${supportedIntent}.`,
      `Supported analytics intents:\n${analyticsIntentPromptList()}`,
      `CRM capability boundaries:\n${CRM_CAPABILITY_BOUNDARIES.map((item) => `- ${item}`).join("\n")}`,
      "Do not call tools for general how-to questions, writing help, or support escalation without a data question.",
      "Do not call tools for analytics outside the supported intents. Ask for a narrower supported metric instead.",
      "Preserve names, @mentions, and time periods in the query argument.",
    ].join(" ");
    const input = [
      { role: "developer", content: toolPrompt },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `ROUTE: ${params.routeContext.routeLabel} (${params.routeContext.href})`,
              `DOMAIN_HINT: ${params.routeContext.domainHint}`,
              `MESSAGE:\n${params.message}`,
            ].join("\n\n"),
          },
        ],
      },
    ];
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        input,
        tools: CRM_TOOL_DEFINITIONS,
        tool_choice: "auto",
        max_output_tokens: 500,
      }),
    });
    const payload = (await response.json()) as JsonRecord;
    diagnostics.latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      diagnostics.error =
        payload && typeof payload.error === "object" && payload.error && "message" in payload.error
          ? (payload.error as { message?: string }).message ?? "CRM tool selection failed"
          : "CRM tool selection failed";
      return { block: "No CRM tools were used.", diagnostics };
    }

    const functionCalls = extractFunctionCalls(payload).slice(0, 2);
    diagnostics.requested = functionCalls.map((call) => call.name);
    if (functionCalls.length === 0) {
      return { block: "No CRM tools were used.", diagnostics };
    }

    const toolResults = [];
    for (const call of functionCalls) {
      if (call.name !== "get_crm_analytics") {
        toolResults.push({ tool: call.name, ok: false, error: "Unsupported tool." });
        continue;
      }
      let query = params.message;
      try {
        const args = JSON.parse(call.argumentsText) as { query?: unknown };
        query = normalizeText(typeof args.query === "string" ? args.query : "") || params.message;
      } catch {
        query = params.message;
      }
      const decision = await buildAnalyticsDecision({
        adminClient: params.adminClient,
        auth: params.auth,
        message: query,
        routeContext: params.routeContext,
      });
      diagnostics.executed.push(call.name);
      toolResults.push({
        tool: call.name,
        query,
        result: compactDecisionForToolOutput(decision),
      });
    }

    return {
      block: JSON.stringify(toolResults, null, 2),
      diagnostics,
    };
  } catch (error) {
    diagnostics.latencyMs = Date.now() - startedAt;
    diagnostics.error = error instanceof Error ? error.message : "CRM tool calling failed";
    return { block: "CRM tool calling failed.", diagnostics };
  }
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

function extractPreviousOpenAiResponseId(messages: SupportMessageRow[]) {
  for (const message of [...messages].reverse()) {
    const metadata = (message.metadata ?? {}) as JsonRecord;
    const responseId = normalizeText(
      typeof metadata.openAiResponseId === "string" ? metadata.openAiResponseId : null
    );
    if (message.role === "assistant" && responseId) return responseId;
  }
  return null;
}

async function callOpenAiDecision(params: {
  adminClient: ReturnType<typeof createClient>;
  auth: AuthContext;
  message: string;
  mode: ToShoAiMode;
  routeContext: ReturnType<typeof sanitizeRouteContext>;
  runtimeErrors: RuntimeErrorRow[];
  knowledge: KnowledgeItemRow[];
  recentMessages: SupportMessageRow[];
  attachments: SupportAttachmentInput[];
  analyticsContext?: AssistantDecision | null;
}): Promise<OpenAiDecisionResult | null> {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  const model = normalizeText(process.env.OPENAI_MODEL) || "gpt-5.4";
  const startedAt = Date.now();
  const previousResponseId = extractPreviousOpenAiResponseId(params.recentMessages);
  const crmToolContext = params.analyticsContext
    ? {
        block: JSON.stringify(
          [
            {
              tool: "get_crm_analytics",
              query: params.message,
              result: compactDecisionForToolOutput(params.analyticsContext),
            },
          ],
          null,
          2
        ),
        diagnostics: {
          attempted: true,
          requested: ["get_crm_analytics"],
          executed: ["get_crm_analytics"],
          latencyMs: 0,
          error: null,
        } satisfies CrmToolDiagnostics,
      }
    : await runCrmToolCalling({
        adminClient: params.adminClient,
        auth: params.auth,
        model,
        apiKey,
        message: params.message,
        routeContext: params.routeContext,
      });
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
  const imageInputs = await buildOpenAiImageInputs(params.adminClient, params.attachments);

  const developerPrompt = [
    "You are ToSho AI, an embedded CRM command layer for a creative agency.",
    "Reply in Ukrainian.",
    "Tone: calm, premium, operational, slightly playful, never clownish, never cheesy.",
    "Only rely on the provided CRM context, recent runtime signals, and curated knowledge snippets.",
    `CRM capability boundaries:\n${CRM_CAPABILITY_BOUNDARIES.map((item) => `- ${item}`).join("\n")}`,
    `Supported CRM analytics intents:\n${analyticsIntentPromptList()}`,
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
    "When CRM_TOOL_RESULTS includes analytics, do not merely repeat the card. Explain what is okay, what is risky, and the first concrete action.",
    "If the user asks for a snapshot or analysis, synthesize a management-level takeaway from CRM_TOOL_RESULTS.",
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
    `CRM_TOOL_RESULTS:\n${crmToolContext.block}`,
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
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      reasoning: { effort: "medium" },
      input: [
        { role: "developer", content: developerPrompt },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            ...imageInputs,
          ],
        },
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
  const latencyMs = Date.now() - startedAt;
  const usage = extractUsage(payload);
  if (!response.ok) {
    const error =
      payload && typeof payload.error === "object" && payload.error && "message" in payload.error
        ? (payload.error as { message?: string }).message
        : "OpenAI request failed";
    const err = new Error(error) as Error & { diagnostics?: OpenAiDiagnostics };
    err.diagnostics = {
      attempted: true,
      ok: false,
      model,
      responseId: typeof payload.id === "string" ? payload.id : null,
      previousResponseId,
      latencyMs,
      error,
      status: response.status,
      usedImageInputs: imageInputs.length,
      promptKnowledgeCount: params.knowledge.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    };
    throw err;
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
    decision: {
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
      analytics: params.analyticsContext?.analytics ?? null,
      suggestedActions: compactSuggestedActions(params.analyticsContext?.suggestedActions ?? []),
    },
    diagnostics: {
      attempted: true,
      ok: true,
      model,
      responseId: typeof payload.id === "string" ? payload.id : null,
      previousResponseId,
      latencyMs,
      error: null,
      status: response.status,
      usedImageInputs: imageInputs.length,
      promptKnowledgeCount: params.knowledge.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    },
    crmToolDiagnostics: crmToolContext.diagnostics,
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
  const recentQuery = adminClient
    .schema("tosho")
    .from("support_requests")
    .select(
      "id,workspace_id,team_id,created_by,created_by_label,assignee_user_id,assignee_label,mode,status,priority,domain,title,summary,route_label,route_href,entity_type,entity_id,context,ai_confidence,escalated_at,resolved_at,last_message_at,created_at,updated_at"
    )
    .eq("workspace_id", auth.workspaceId)
    .eq("created_by", auth.userId)
    .order("last_message_at", { ascending: false })
    .limit(16);

  const [recentResult, knowledgeItems, runtimeErrors] = await Promise.all([
    shouldIncludeHistory ? recentQuery : Promise.resolve({ data: [], error: null }),
    shouldIncludeKnowledge
      ? listKnowledgeItems(adminClient, auth.workspaceId, auth.canManageKnowledge)
      : Promise.resolve([] as KnowledgeItemRow[]),
    listRuntimeErrors(adminClient, auth.teamId, auth.userId, routeContext.href, routeContext.pathname),
  ]);

  if (recentResult.error) throw new Error(recentResult.error.message);

  const recentRequests = ((recentResult.data ?? []) as SupportRequestRow[]).map(mapRequestSummary);

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
      queueOpenCount: 0,
      knowledgeActiveCount: knowledgeItems.filter((item) => item.status === "active").length,
    },
    recentRequests,
    queue: [],
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
    throw httpError(400, "Напиши, що треба зробити або що саме не працює.");
  }

  const mode = normalizeMode(params.body.mode);
  const existingRequest = normalizeText(params.body.requestId)
    ? await selectAccessibleRequest(params.adminClient, params.auth, normalizeText(params.body.requestId))
    : null;
  const attachments = toSupportAttachments(params.body.attachments);

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
  let openAiDiagnostics: OpenAiDiagnostics | null = null;
  let crmToolDiagnostics: CrmToolDiagnostics | null = null;
  let knowledgeCandidates: KnowledgeItemRow[] = [];
  let knowledgeRetrieval: KnowledgeRetrievalDiagnostics | null = null;
  const existingContext = (existingRequest?.context ?? {}) as JsonRecord;
  const existingQuotePackDraft = isQuotePackDraft(existingContext.quote_pack_draft) ? existingContext.quote_pack_draft : null;
  const previousThreadAnalyticsMessage =
    typeof existingContext.last_analytics_message === "string"
      ? normalizeText(existingContext.last_analytics_message)
      : "";
  const analyticsMessage = buildAnalyticsMessageWithContext(message, recentMessages, previousThreadAnalyticsMessage);
  const analyticsRequested = shouldRunAnalytics(analyticsMessage);
  let analyticsDecision: AssistantDecision | null = null;

  if (existingQuotePackDraft && isQuotePackCancellation(message)) {
    assistantDecision = buildQuotePackCancelledDecision();
  } else if (existingQuotePackDraft && isQuotePackConfirmation(message)) {
    assistantDecision = await createQuotePackFromDraft({
      adminClient: params.adminClient,
      auth: params.auth,
      draft: existingQuotePackDraft,
    });
  } else if (isQuotePackRequest(message)) {
    assistantDecision = await buildQuotePackDraftDecision({
      adminClient: params.adminClient,
      auth: params.auth,
      message,
    });
  }

  if (!assistantDecision && analyticsRequested) {
    analyticsDecision = await buildAnalyticsDecision({
      adminClient: params.adminClient,
      auth: params.auth,
      message: analyticsMessage,
      routeContext,
    });
    if (analyticsDecision && isDirectAnalyticsRequest(message)) {
      assistantDecision = analyticsDecision;
      crmToolDiagnostics = {
        attempted: true,
        requested: ["direct_crm_analytics"],
        executed: ["direct_crm_analytics"],
        latencyMs: null,
        error: null,
      };
    }
  }

  if (!assistantDecision) {
    try {
      if (!analyticsDecision) {
        const activeKnowledge = await listActiveKnowledgeItemsForRetrieval(params.adminClient, params.auth.workspaceId);
        const retrievalResult = await selectKnowledgeCandidatesForMessage({
          adminClient: params.adminClient,
          items: activeKnowledge,
          queryText: message,
          routeLabel: routeContext.routeLabel,
        });
        knowledgeCandidates = retrievalResult.candidates;
        knowledgeRetrieval = retrievalResult.diagnostics;
      }
      const openAiResult = await callOpenAiDecision({
        adminClient: params.adminClient,
        auth: params.auth,
        message,
        mode,
        routeContext,
        runtimeErrors,
        knowledge: knowledgeCandidates,
        recentMessages,
        attachments,
        analyticsContext: analyticsDecision,
      });
      assistantDecision = openAiResult?.decision ?? null;
      openAiDiagnostics = openAiResult?.diagnostics ?? null;
      crmToolDiagnostics = openAiResult?.crmToolDiagnostics ?? null;
    } catch (error) {
      openAiDiagnostics = (error as Error & { diagnostics?: OpenAiDiagnostics })?.diagnostics ?? {
        attempted: true,
        ok: false,
        model: normalizeText(process.env.OPENAI_MODEL) || "gpt-5.4",
        responseId: null,
        previousResponseId: null,
        latencyMs: null,
        error: error instanceof Error ? error.message : "OpenAI request failed",
        status: null,
        usedImageInputs: 0,
        promptKnowledgeCount: knowledgeCandidates.length,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      };
      assistantDecision = null;
    }
  }

  if (!assistantDecision) {
    if (analyticsDecision || analyticsRequested) {
      usedFallback = true;
      assistantDecision = analyticsDecision ?? unsupportedAnalyticsDecision(analyticsMessage);
    }
  }

  if (!assistantDecision) {
    usedFallback = true;
    if (!openAiDiagnostics) {
      const apiKeyConfigured = Boolean(normalizeText(process.env.OPENAI_API_KEY));
      openAiDiagnostics = {
        attempted: apiKeyConfigured,
        ok: false,
        model: normalizeText(process.env.OPENAI_MODEL) || (apiKeyConfigured ? "gpt-5.4" : null),
        responseId: null,
        previousResponseId: null,
        latencyMs: null,
        error: apiKeyConfigured ? "OpenAI returned no usable structured decision." : "OPENAI_API_KEY is not configured.",
        status: null,
        usedImageInputs: 0,
        promptKnowledgeCount: knowledgeCandidates.length,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      };
    }
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

  if (openAiDiagnostics?.attempted && !openAiDiagnostics.ok) {
    await logToShoAiRuntimeSignal({
      adminClient: params.adminClient,
      auth: params.auth,
      routeContext,
      title: `ToSho AI OpenAI fallback: ${trimTo(openAiDiagnostics.error || "unknown error", 140)}`,
      metadata: {
        kind: "openai_fallback",
        openai: openAiDiagnostics,
      },
    }).catch(() => undefined);
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
      ...existingContext,
      route_context: routeContext,
      runtime_errors: runtimeErrors.map((row) => ({
        title: row.title ?? null,
        href: row.href ?? null,
        created_at: row.created_at,
      })),
      knowledge_retrieval: knowledgeRetrieval,
      openai: openAiDiagnostics,
      crm_tools: crmToolDiagnostics,
      quote_pack_draft: assistantDecision.quotePackCreated || assistantDecision.quotePackCleared
        ? null
        : assistantDecision.quotePackDraft ?? existingQuotePackDraft ?? null,
      quote_pack_created: assistantDecision.quotePackCreated ?? null,
      last_internal_summary: assistantDecision.internalSummary,
      last_analytics_message: analyticsRequested ? analyticsMessage : previousThreadAnalyticsMessage || null,
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
        analyticsMessage: analyticsRequested ? analyticsMessage : null,
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
        openAiResponseId: openAiDiagnostics?.responseId ?? null,
        openAi: openAiDiagnostics,
        crmTools: crmToolDiagnostics,
        knowledgeRetrieval,
        sources: sourceItems,
        analytics: assistantDecision.analytics ?? null,
        suggestedActions: compactSuggestedActions(assistantDecision.suggestedActions ?? []),
        quotePackDraft: assistantDecision.quotePackDraft ?? null,
        quotePackCreated: assistantDecision.quotePackCreated ?? null,
        quotePackCleared: assistantDecision.quotePackCleared ?? false,
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
    throw httpError(400, "Не вистачає даних для feedback.");
  }

  const request = await selectAccessibleRequest(params.adminClient, params.auth, requestId);
  if (!request) {
    throw httpError(404, "Звернення не знайдено або доступ заборонено.");
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
    throw httpError(403, "Недостатньо прав для зміни черги.");
  }

  const requestId = normalizeText(params.body.requestId);
  if (!requestId) throw httpError(400, "Не передано requestId.");
  const request = await selectAccessibleRequest(params.adminClient, params.auth, requestId);
  if (!request) throw httpError(404, "Звернення не знайдено.");

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
    throw httpError(403, "Недостатньо прав для бази знань.");
  }

  const knowledge = params.body.knowledge;
  const title = normalizeText(knowledge?.title);
  const body = normalizeText(knowledge?.body);
  if (!title || !body) {
    throw httpError(400, "Для картки знань потрібні назва і зміст.");
  }

  const slug = normalizeSlug(normalizeText(knowledge?.slug) || title);
  if (!slug) throw httpError(400, "Не вдалося сформувати slug для картки.");

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
  const embedding = await buildKnowledgeEmbedding({
    title: payload.title,
    summary: payload.summary,
    body: payload.body,
    tags: payload.tags,
    keywords: payload.keywords,
  }).catch(() => null);
  const payloadWithEmbedding = embedding
    ? {
        ...payload,
        embedding: formatEmbeddingVector(embedding.vector),
        embedding_model: embedding.model,
        embedding_updated_at: new Date().toISOString(),
      }
    : payload;

  if (normalizeText(knowledge?.id)) {
    const runUpdate = (nextPayload: typeof payload | typeof payloadWithEmbedding) =>
      params.adminClient
        .schema("tosho")
        .from("support_knowledge_items")
        .update(nextPayload)
        .eq("id", normalizeText(knowledge?.id));
    let { error } = await runUpdate(payloadWithEmbedding);
    if (error && embedding && /embedding/i.test(error.message ?? "")) {
      ({ error } = await runUpdate(payload));
    }
    if (error) throw new Error(error.message);
  } else {
    const runInsert = (nextPayload: typeof payload | typeof payloadWithEmbedding) =>
      params.adminClient.schema("tosho").from("support_knowledge_items").insert({
        ...nextPayload,
        created_by: params.auth.userId,
      });
    let { error } = await runInsert(payloadWithEmbedding);
    if (error && embedding && /embedding/i.test(error.message ?? "")) {
      ({ error } = await runInsert(payload));
    }
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
    throw httpError(403, "Недостатньо прав для бази знань.");
  }

  const knowledgeId = normalizeText(params.body.knowledge?.id);
  if (!knowledgeId) throw httpError(400, "Не передано knowledge id.");

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
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    return jsonResponse(statusCode, {
      error: error instanceof Error ? error.message : "ToSho AI request failed",
    });
  }
};

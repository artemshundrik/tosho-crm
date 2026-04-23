import { supabase } from "@/lib/supabaseClient";

const TOSHO_AI_LAST_CONTEXT_KEY = "tosho_ai:last-context";

export type ToShoAiMode = "ask" | "fix" | "route" | "resolve";
export type ToShoAiPriority = "low" | "medium" | "high" | "urgent";
export type ToShoAiStatus = "open" | "in_progress" | "waiting_user" | "resolved";
export type ToShoAiDomain =
  | "general"
  | "overview"
  | "orders"
  | "design"
  | "logistics"
  | "catalog"
  | "contractors"
  | "team"
  | "admin";

export type ToShoAiRouteContext = {
  pathname: string;
  search: string;
  href: string;
  title: string;
  routeLabel: string;
  domainHint: ToShoAiDomain;
  entityType: string | null;
  entityId: string | null;
};

export type ToShoAiSource = {
  id: string;
  title: string;
  sourceLabel: string | null;
  sourceHref: string | null;
};

export type ToShoAiAttachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  storageBucket: string;
  storagePath: string;
  url: string | null;
};

export type ToShoAiMessage = {
  id: string;
  role: "user" | "assistant" | "human" | "system";
  body: string;
  actorLabel: string | null;
  createdAt: string;
  feedback: "helpful" | "not_helpful" | null;
  sources: ToShoAiSource[];
  attachments: ToShoAiAttachment[];
  metadata: Record<string, unknown> | null;
};

export type ToShoAiRequestSummary = {
  id: string;
  title: string;
  summary: string | null;
  mode: ToShoAiMode;
  status: ToShoAiStatus;
  priority: ToShoAiPriority;
  domain: ToShoAiDomain;
  routeLabel: string | null;
  routeHref: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  createdByLabel: string | null;
  assigneeLabel: string | null;
  aiConfidence: number | null;
};

export type ToShoAiThread = ToShoAiRequestSummary & {
  context: Record<string, unknown> | null;
  messages: ToShoAiMessage[];
};

export type ToShoAiKnowledgeItem = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  body: string;
  tags: string[];
  keywords: string[];
  status: "active" | "draft" | "archived";
  sourceLabel: string | null;
  sourceHref: string | null;
  updatedAt: string;
};

export type ToShoAiPermissions = {
  canManageQueue: boolean;
  canManageKnowledge: boolean;
};

export type ToShoAiDiagnostics = {
  recentRuntimeErrorCount: number;
  latestRuntimeErrorTitle: string | null;
  latestRuntimeErrorAt: string | null;
};

export type ToShoAiStats = {
  myOpenCount: number;
  queueOpenCount: number;
  knowledgeActiveCount: number;
};

export type ToShoAiSnapshot = {
  routeContext: ToShoAiRouteContext;
  permissions: ToShoAiPermissions;
  diagnostics: ToShoAiDiagnostics;
  stats: ToShoAiStats;
  recentRequests: ToShoAiRequestSummary[];
  queue: ToShoAiRequestSummary[];
  selectedThread: ToShoAiThread | null;
  knowledgeItems: ToShoAiKnowledgeItem[];
};

export type ToShoAiApiResponse = {
  snapshot: ToShoAiSnapshot;
  meta?: {
    requestCreated?: boolean;
    notified?: boolean;
    usedFallback?: boolean;
    info?: string | null;
  };
};

type ToShoAiRouteRule = {
  test: (pathname: string) => boolean;
  title: string;
  routeLabel: string;
  domainHint: ToShoAiDomain;
  entityType?: string;
  entityId?: (pathname: string) => string | null;
};

const ROUTE_RULES: ToShoAiRouteRule[] = [
  {
    test: (pathname) => pathname === "/overview",
    title: "Огляд",
    routeLabel: "Огляд",
    domainHint: "overview",
  },
  {
    test: (pathname) => pathname.startsWith("/notifications"),
    title: "Сповіщення",
    routeLabel: "Сповіщення",
    domainHint: "general",
  },
  {
    test: (pathname) => pathname.startsWith("/activity"),
    title: "Активність",
    routeLabel: "Активність",
    domainHint: "overview",
  },
  {
    test: (pathname) => pathname.startsWith("/team"),
    title: "Команда",
    routeLabel: "Команда",
    domainHint: "team",
  },
  {
    test: (pathname) => pathname.startsWith("/settings/members"),
    title: "Управління командою",
    routeLabel: "Доступи та ролі",
    domainHint: "team",
  },
  {
    test: (pathname) => pathname.startsWith("/admin/observability"),
    title: "Admin Observability",
    routeLabel: "Observability",
    domainHint: "admin",
  },
  {
    test: (pathname) => pathname === "/orders/estimates",
    title: "Прорахунки замовлень",
    routeLabel: "Прорахунки",
    domainHint: "orders",
  },
  {
    test: (pathname) => /^\/orders\/estimates\/[^/]+$/.test(pathname),
    title: "Прорахунок",
    routeLabel: "Деталі прорахунку",
    domainHint: "orders",
    entityType: "quote",
    entityId: (pathname) => pathname.split("/").at(-1) ?? null,
  },
  {
    test: (pathname) => pathname.startsWith("/orders/customers"),
    title: "Замовники",
    routeLabel: "Замовники",
    domainHint: "orders",
  },
  {
    test: (pathname) => pathname === "/orders/production",
    title: "Замовлення",
    routeLabel: "Черга замовлень",
    domainHint: "orders",
  },
  {
    test: (pathname) => /^\/orders\/production\/[^/]+$/.test(pathname),
    title: "Замовлення",
    routeLabel: "Деталі замовлення",
    domainHint: "orders",
    entityType: "order",
    entityId: (pathname) => pathname.split("/").at(-1) ?? null,
  },
  {
    test: (pathname) => pathname.startsWith("/orders/ready-to-ship"),
    title: "Готові до відвантаження",
    routeLabel: "Готові до відвантаження",
    domainHint: "logistics",
  },
  {
    test: (pathname) => pathname.startsWith("/catalog/products"),
    title: "Каталог продукції",
    routeLabel: "Каталог",
    domainHint: "catalog",
  },
  {
    test: (pathname) => pathname.startsWith("/logistics"),
    title: "Логістика",
    routeLabel: "Логістика",
    domainHint: "logistics",
  },
  {
    test: (pathname) => pathname === "/design",
    title: "Дизайн",
    routeLabel: "Дизайн",
    domainHint: "design",
  },
  {
    test: (pathname) => /^\/design\/[^/]+$/.test(pathname),
    title: "Дизайн-задача",
    routeLabel: "Деталі дизайн-задачі",
    domainHint: "design",
    entityType: "design_task",
    entityId: (pathname) => pathname.split("/").at(-1) ?? null,
  },
  {
    test: (pathname) => pathname.startsWith("/contractors"),
    title: "Підрядники",
    routeLabel: "Підрядники",
    domainHint: "contractors",
  },
];

export function buildToShoAiRouteContext(input: {
  pathname: string;
  search?: string;
  title?: string;
}): ToShoAiRouteContext {
  const pathname = input.pathname.trim() || "/";
  const search = input.search?.trim() || "";
  const match = ROUTE_RULES.find((entry) => entry.test(pathname));

  return {
    pathname,
    search,
    href: `${pathname}${search}`,
    title: input.title?.trim() || match?.title || "Поточна сторінка",
    routeLabel: match?.routeLabel || input.title?.trim() || "Поточна сторінка",
    domainHint: match?.domainHint || "general",
    entityType: match?.entityType ?? null,
    entityId: match?.entityId?.(pathname) ?? null,
  };
}

export function saveToShoAiLastContext(context: ToShoAiRouteContext) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(TOSHO_AI_LAST_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Ignore storage access failures.
  }
}

export function readToShoAiLastContext(): ToShoAiRouteContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(TOSHO_AI_LAST_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ToShoAiRouteContext>;
    if (typeof parsed?.pathname !== "string") return null;
    return buildToShoAiRouteContext({
      pathname: parsed.pathname,
      search: typeof parsed.search === "string" ? parsed.search : "",
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    });
  } catch {
    return null;
  }
}

function getErrorMessage(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === "string") return error;
  }
  return "ToSho AI тимчасово недоступний.";
}

export async function callToShoAiApi(
  action: string,
  payload: Record<string, unknown>
): Promise<ToShoAiApiResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Потрібна активна сесія, щоб відкрити ToSho AI.");
  }

  const response = await fetch("/.netlify/functions/tosho-ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const raw = await response.text();
  let parsed: unknown = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { error: raw };
    }
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(parsed));
  }

  return parsed as ToShoAiApiResponse;
}

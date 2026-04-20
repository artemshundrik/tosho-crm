import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  LayoutGrid,
  Palette,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { DashboardSkeleton } from "@/components/app/page-skeleton-templates";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveActivityType } from "@/lib/activity";
import { listCustomerLeadLogoDirectory, normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { usePageData } from "@/hooks/usePageData";
import { listQuotes } from "@/lib/toshoApi";
import { resolveWorkspaceId } from "@/lib/workspace";
import { listWorkspaceMembersForDisplay } from "@/lib/workspaceMemberDirectory";

type QuoteStatus =
  | "new"
  | "estimating"
  | "estimated"
  | "awaiting_approval"
  | "approved"
  | "cancelled";

type DesignStatus =
  | "new"
  | "changes"
  | "in_progress"
  | "pm_review"
  | "client_review"
  | "approved"
  | "cancelled";

type QuoteRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  customer_name?: string | null;
  customer_logo_url?: string | null;
  assigned_to?: string | null;
  assignedToLabel?: string | null;
  assignedToAvatarUrl?: string | null;
  created_at?: string | null;
};

type DesignTaskRow = {
  id: string;
  quoteId: string;
  quoteNumber: string | null;
  designTaskNumber: string | null;
  title: string | null;
  customerName: string | null;
  customerLogoUrl: string | null;
  status: DesignStatus;
  assigneeUserId: string | null;
  assigneeLabel?: string | null;
  assigneeAvatarUrl?: string | null;
  createdAt: string | null;
};

type ActivityRow = {
  id: string;
  title?: string | null;
  action?: string | null;
  actor_name?: string | null;
  user_id?: string | null;
  entity_type?: string | null;
  href?: string | null;
  created_at?: string | null;
  avatar_url?: string | null;
  type?: "quotes" | "design" | "team" | "other";
};

type OverviewData = {
  quoteCounts: Record<QuoteStatus, number>;
  totalQuotesCount: number;
  myQuotesCount: number;
  recentQuotes: QuoteRow[];
  designCounts: Record<DesignStatus, number>;
  myDesignCounts: Record<DesignStatus, number>;
  unassignedActiveDesignCount: number;
  managerDesignQueue: DesignTaskRow[];
  myDesignQueue: DesignTaskRow[];
  activity: ActivityRow[];
};

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

type SignalTone = "neutral" | "info" | "warning" | "success";

type OverviewMetric = {
  label: string;
  value: number;
  detail: string;
  tone: SignalTone;
  icon: typeof FileText;
};

type OverviewSignal = {
  title: string;
  count: number;
  detail: string;
  to: string;
  tone: SignalTone;
  icon: typeof FileText;
};

type OverviewDesignTaskLogRow = {
  id: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
  title?: string | null;
  created_at?: string | null;
};

type OverviewActivityLogRow = {
  id: string;
  title?: string | null;
  action?: string | null;
  actor_name?: string | null;
  user_id?: string | null;
  entity_type?: string | null;
  href?: string | null;
  created_at?: string | null;
};

type LinkedOverviewQuoteRow = {
  id: string;
  number?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_logo_url?: string | null;
  title?: string | null;
};

const QUOTE_STATUSES: QuoteStatus[] = [
  "new",
  "estimating",
  "estimated",
  "awaiting_approval",
  "approved",
  "cancelled",
];

const DESIGN_STATUSES: DesignStatus[] = [
  "new",
  "changes",
  "in_progress",
  "pm_review",
  "client_review",
  "approved",
  "cancelled",
];

const getErrorMessage = (error: unknown): string => {
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
};

const isMissingColumnLike = (error: unknown, columns?: string[]) => {
  const message = getErrorMessage(error).toLowerCase();
  const hasMissingColumnSignal =
    (message.includes("column") && message.includes("does not exist")) ||
    message.includes("schema cache") ||
    message.includes("could not find");

  if (!hasMissingColumnSignal) return false;
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
    if (!result.error) {
      return ((result.data as T[] | null) ?? []) as T[];
    }
    lastError = result.error;
    if (!isMissingColumnLike(result.error, variant.optionalColumns)) {
      throw result.error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

const quoteStatusLabel: Record<QuoteStatus, string> = {
  new: "Нові",
  estimating: "На прорахунку",
  estimated: "Пораховано",
  awaiting_approval: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

const designStatusLabel: Record<DesignStatus, string> = {
  new: "Нові",
  changes: "Правки",
  in_progress: "В роботі",
  pm_review: "PM review",
  client_review: "Client review",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

const quoteStatusTone: Record<QuoteStatus, SignalTone> = {
  new: "info",
  estimating: "info",
  estimated: "neutral",
  awaiting_approval: "warning",
  approved: "success",
  cancelled: "neutral",
};

const designStatusTone: Record<DesignStatus, SignalTone> = {
  new: "info",
  changes: "warning",
  in_progress: "info",
  pm_review: "warning",
  client_review: "warning",
  approved: "success",
  cancelled: "neutral",
};

const progressBarClassByTone: Record<SignalTone, string> = {
  neutral: "bg-neutral-soft-border",
  info: "bg-info-soft-border",
  warning: "bg-warning-soft-border",
  success: "bg-success-soft-border",
};

const metricIconClassByTone: Record<SignalTone, string> = {
  neutral: "border-border/60 bg-background/80 text-foreground",
  info: "border-info-soft-border bg-info-soft text-info-foreground",
  warning: "border-warning-soft-border bg-warning-soft text-warning-foreground",
  success: "border-success-soft-border bg-success-soft text-success-foreground",
};

const signalAccentClassByTone: Record<SignalTone, string> = {
  neutral: "border-border/60 bg-background/70",
  info: "border-info-soft-border/80 bg-info-soft/70",
  warning: "border-warning-soft-border/80 bg-warning-soft/70",
  success: "border-success-soft-border/80 bg-success-soft/70",
};

const quoteStatusFromDb = (value?: string | null): QuoteStatus => {
  if (!value) return "new";
  const legacyMap: Record<string, QuoteStatus> = {
    draft: "new",
    in_progress: "estimating",
    sent: "estimated",
    rejected: "cancelled",
    completed: "approved",
  };
  return (legacyMap[value] ?? value) as QuoteStatus;
};

const isActiveDesignStatus = (status: DesignStatus) => status !== "approved" && status !== "cancelled";

const normalizeLookupKey = (value?: string | null) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");

const emptyCounts = <T extends string>(statuses: readonly T[]): Record<T, number> =>
  statuses.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<T, number>);

const createEmptyOverviewData = (): OverviewData => ({
  quoteCounts: emptyCounts(QUOTE_STATUSES),
  totalQuotesCount: 0,
  myQuotesCount: 0,
  recentQuotes: [],
  designCounts: emptyCounts(DESIGN_STATUSES),
  myDesignCounts: emptyCounts(DESIGN_STATUSES),
  unassignedActiveDesignCount: 0,
  managerDesignQueue: [],
  myDesignQueue: [],
  activity: [],
});

const formatDateTime = (value?: string | null) => {
  if (!value) return "Не вказано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Не вказано";
  return date.toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getInitials = (name?: string | null) => {
  const source = name?.trim() || "Користувач";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

const sumCounts = <T extends string>(counts: Record<T, number>, statuses: readonly T[]) =>
  statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

const ratioPercent = (value: number, total: number) => {
  if (!total || value <= 0) return 0;
  return Math.max(8, Math.round((value / total) * 100));
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const overviewActivityIcon = (type?: string) => {
  if (type === "quotes") return FileText;
  if (type === "design") return Palette;
  if (type === "team") return Users;
  return ActivityIcon;
};

const firstNonEmptyString = (...values: Array<unknown>) => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

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

const parseDesignTask = (
  row: {
    id: string;
    entity_id?: string | null;
    metadata?: Record<string, unknown> | null;
    title?: string | null;
    created_at?: string | null;
  },
  lookups: {
    memberByUserId: Map<string, OverviewMember>;
    partyByTypedId: Map<string, PartyDirectoryEntry>;
    partyByNormalizedName: Map<string, PartyDirectoryEntry>;
    quoteById: Map<
      string,
      {
        id: string;
        number: string | null;
        customerName: string | null;
        customerLogoUrl: string | null;
        customerId: string | null;
        customerType: "customer" | "lead" | null;
      }
    >;
  }
): DesignTaskRow => {
  const metadata = row.metadata ?? {};
  const quoteIdFromMeta =
    typeof metadata.quote_id === "string" && metadata.quote_id.trim() ? metadata.quote_id.trim() : null;
  const entityQuoteId = typeof row.entity_id === "string" && row.entity_id.trim() ? row.entity_id.trim() : null;
  const resolvedQuoteId = quoteIdFromMeta ?? entityQuoteId ?? "";
  const linkedQuote = resolvedQuoteId ? lookups.quoteById.get(resolvedQuoteId) ?? null : null;
  const statusRaw = typeof metadata.status === "string" ? metadata.status : "new";
  const status = (DESIGN_STATUSES.includes(statusRaw as DesignStatus) ? statusRaw : "new") as DesignStatus;
  const assigneeUserId =
    typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id.trim()
      ? metadata.assignee_user_id.trim()
      : null;
  const assigneeMeta = assigneeUserId ? lookups.memberByUserId.get(assigneeUserId) : undefined;
  const customerTypeRaw =
    typeof metadata.customer_type === "string" ? metadata.customer_type.trim().toLowerCase() : "";
  const customerType =
    customerTypeRaw === "customer" || customerTypeRaw === "lead"
      ? (customerTypeRaw as "customer" | "lead")
      : linkedQuote?.customerType ?? null;
  const customerId =
    typeof metadata.customer_id === "string" && metadata.customer_id.trim()
      ? metadata.customer_id.trim()
      : linkedQuote?.customerId ?? null;
  const party =
    customerType && customerId
      ? lookups.partyByTypedId.get(`${customerType}:${customerId}`) ?? null
      : null;
  const metadataCustomerName = firstNonEmptyString(metadata.customer_name);
  const matchedPartyByName = lookups.partyByNormalizedName.get(normalizeLookupKey(metadataCustomerName));
  const customerName =
    party?.label ??
    linkedQuote?.customerName ??
    metadataCustomerName ??
    matchedPartyByName?.label ??
    null;
  const customerLogoUrl =
    party?.logoUrl ??
    linkedQuote?.customerLogoUrl ??
    normalizeCustomerLogoUrl(firstNonEmptyString(metadata.customer_logo_url)) ??
    matchedPartyByName?.logoUrl ??
    null;
  const taskTitle =
    firstNonEmptyString(
      metadata.product_name,
      metadata.quote_item_name,
      metadata.item_name,
      metadata.model,
      row.title
    ) ?? "Дизайн-задача";

  return {
    id: row.id,
    quoteId: resolvedQuoteId,
    quoteNumber: firstNonEmptyString(metadata.quote_number) ?? linkedQuote?.number ?? null,
    designTaskNumber: firstNonEmptyString(metadata.design_task_number),
    title: taskTitle,
    customerName,
    customerLogoUrl,
    status,
    assigneeUserId,
    assigneeLabel: assigneeMeta?.label ?? firstNonEmptyString(metadata.assignee_label) ?? null,
    assigneeAvatarUrl: assigneeMeta?.avatarUrl ?? firstNonEmptyString(metadata.assignee_avatar_url) ?? null,
    createdAt: row.created_at ?? null,
  };
};

async function readOverviewDesignTaskLogs(teamId: string) {
  return await selectOverviewRows<OverviewDesignTaskLogRow>(
    (columns) =>
      supabase
        .from("activity_log")
        .select(columns)
        .eq("team_id", teamId)
        .eq("action", "design_task")
        .order("created_at", { ascending: false })
        .limit(60),
    [
      { columns: "id,entity_id,metadata,title,created_at", optionalColumns: ["title"] },
      { columns: "id,entity_id,metadata,created_at", optionalColumns: [] },
    ]
  );
}

async function readOverviewActivity(teamId: string) {
  return await selectOverviewRows<OverviewActivityLogRow>(
    (columns) =>
      supabase
        .from("activity_log")
        .select(columns)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(6),
    [
      { columns: "id,title,action,actor_name,user_id,entity_type,href,created_at", optionalColumns: ["href"] },
      { columns: "id,title,action,actor_name,user_id,entity_type,created_at", optionalColumns: ["title"] },
      { columns: "id,action,actor_name,user_id,entity_type,created_at", optionalColumns: [] },
    ]
  );
}

async function readOverviewLinkedQuotes(teamId: string, linkedQuoteIds: string[]) {
  if (linkedQuoteIds.length === 0) return [];

  return await selectOverviewRows<LinkedOverviewQuoteRow>(
    (columns) =>
      supabase
        .schema("tosho")
        .from("quotes")
        .select(columns)
        .eq("team_id", teamId)
        .in("id", linkedQuoteIds),
    [
      {
        columns: "id,number,customer_id,customer_name,customer_logo_url,title",
        optionalColumns: ["customer_name", "customer_logo_url"],
      },
      {
        columns: "id,number,customer_id,customer_name,title",
        optionalColumns: ["customer_name"],
      },
      {
        columns: "id,number,customer_id,title",
        optionalColumns: [],
      },
    ]
  );
}

function OverviewMetricCard({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  tone: SignalTone;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-[24px] border border-border/60 bg-background/85 p-4 shadow-[var(--shadow-elevated-sm)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-2xl border",
            metricIconClassByTone[tone]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function OverviewStatusTile({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: SignalTone;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tracking-tight text-foreground">{value}</div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/70">
        <div
          className={cn("h-full rounded-full transition-all", progressBarClassByTone[tone])}
          style={{ width: `${ratioPercent(value, total)}%` }}
        />
      </div>
    </div>
  );
}

function OverviewSignalCard({
  title,
  count,
  detail,
  to,
  tone,
  icon: Icon,
}: {
  title: string;
  count: number;
  detail: string;
  to: string;
  tone: SignalTone;
  icon: typeof FileText;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group rounded-[24px] border p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated-sm)]",
        signalAccentClassByTone[tone]
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{detail}</div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-2xl border border-background/70 bg-background/80 text-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-2xl font-semibold tracking-tight text-foreground">{count}</div>
        <div className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          Відкрити <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}

function OverviewQueueRow({
  to,
  title,
  subtitle,
  meta,
  badgeLabel,
  badgeTone,
  entityName,
  entityLogoUrl,
  responsibleName,
}: {
  to: string;
  title: string;
  subtitle: string;
  meta: string;
  badgeLabel: string;
  badgeTone: SignalTone;
  entityName?: string | null;
  entityLogoUrl?: string | null;
  responsibleName?: string | null;
}) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 max-w-full items-start gap-3 rounded-[22px] border border-border/60 bg-background/70 px-4 py-3 transition-all hover:border-border hover:bg-background/90 hover:shadow-[var(--shadow-elevated-sm)]"
    >
      <EntityAvatar
        src={entityLogoUrl ?? null}
        name={entityName ?? title}
        fallback={getInitials(entityName ?? title)}
        size={36}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-sm font-semibold text-foreground">{title}</div>
          <Badge tone={badgeTone === "warning" ? "warning" : badgeTone === "success" ? "success" : badgeTone === "info" ? "info" : "neutral"} size="sm">
            {badgeLabel}
          </Badge>
        </div>
        <div className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{meta}</span>
          {responsibleName ? <span className="truncate">Відповідальний: {responsibleName}</span> : null}
        </div>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function OverviewPage() {
  const { teamId, userId, role, accessRole, jobRole, permissions } = useAuth();

  const isManagerView = permissions.canViewManagerOverview;

  const { data, loading, showSkeleton, refetch } = usePageData<OverviewData>({
    cacheKey: `overview-crm:${teamId ?? "none"}:${userId ?? "none"}:${role ?? "none"}:${accessRole ?? "none"}:${jobRole ?? "none"}`,
    loadFn: async () => {
      if (!teamId) return createEmptyOverviewData();

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
        // The overview should remain useful even if member directory resolution fails.
      }
      const { byUserId: memberByUserId, byNormalizedName: memberByNormalizedName } = buildMemberLookups(members);

      let partyDirectory: PartyDirectoryEntry[] = [];
      try {
        partyDirectory = await listCustomerLeadLogoDirectory(teamId);
      } catch {
        // Keep overview usable if customer/lead logo directory fails.
      }
      const { byTypedId: partyByTypedId, byNormalizedName: partyByNormalizedName } =
        buildPartyLookups(partyDirectory);

      const quoteCountPromises = QUOTE_STATUSES.map(async (status) => {
        const { count, error } = await supabase
          .schema("tosho")
          .from("quotes")
          .select("id", { head: true, count: "planned" })
          .eq("team_id", teamId)
          .eq("status", status);
        if (error) throw error;
        return { status, count: count ?? 0 };
      });

      const totalQuotesPromise = supabase
        .schema("tosho")
        .from("quotes")
        .select("id", { head: true, count: "planned" })
        .eq("team_id", teamId);

      const myQuotesPromise = userId
        ? supabase
            .schema("tosho")
            .from("quotes")
            .select("id", { head: true, count: "planned" })
            .eq("team_id", teamId)
            .eq("assigned_to", userId)
        : Promise.resolve({ count: 0, error: null } as { count: number | null; error: null });

      const [
        quoteCountsRows,
        totalQuotesRes,
        myQuotesRes,
        recentQuotesRes,
        designTaskRows,
        activityRows,
      ] = await Promise.all([
        Promise.all(quoteCountPromises),
        totalQuotesPromise,
        myQuotesPromise,
        listQuotes({ teamId, limit: 8 }),
        readOverviewDesignTaskLogs(teamId),
        readOverviewActivity(teamId),
      ]);

      if (totalQuotesRes.error) throw totalQuotesRes.error;
      if (myQuotesRes.error) throw myQuotesRes.error;

      const quoteCounts = emptyCounts(QUOTE_STATUSES);
      quoteCountsRows.forEach((row) => {
        quoteCounts[row.status] = row.count;
      });

      const recentQuotes = ((recentQuotesRes ?? []) as QuoteRow[]).map((quote) => {
        const member = quote.assigned_to ? memberByUserId.get(quote.assigned_to) : undefined;
        return {
          ...quote,
          customer_logo_url: normalizeCustomerLogoUrl(quote.customer_logo_url ?? null),
          assignedToLabel: member?.fullName ?? null,
          assignedToAvatarUrl: member?.avatarUrl ?? null,
        };
      });

      const designCounts = emptyCounts(DESIGN_STATUSES);
      const myDesignCounts = emptyCounts(DESIGN_STATUSES);

      const linkedQuoteIds = Array.from(
        new Set(
          designTaskRows
            .map((row) => {
              const metadata = row.metadata ?? {};
              return (
                (typeof metadata.quote_id === "string" && metadata.quote_id.trim()
                  ? metadata.quote_id.trim()
                  : typeof row.entity_id === "string" && row.entity_id.trim()
                    ? row.entity_id.trim()
                    : "") || ""
              );
            })
            .filter((value): value is string => Boolean(value) && isUuid(value))
        )
      );

      const quoteById = new Map<
        string,
        {
          id: string;
          number: string | null;
          customerName: string | null;
          customerLogoUrl: string | null;
          customerId: string | null;
          customerType: "customer" | "lead" | null;
        }
      >();

      if (linkedQuoteIds.length > 0) {
        const quoteRows = await readOverviewLinkedQuotes(teamId, linkedQuoteIds);

        quoteRows.forEach((quote) => {
          const customerId =
            typeof quote.customer_id === "string" && quote.customer_id.trim() ? quote.customer_id.trim() : null;
          const party = customerId ? partyByTypedId.get(`customer:${customerId}`) ?? null : null;
          const customerName =
            party?.label ??
            firstNonEmptyString(quote.customer_name, quote.title) ??
            null;
          quoteById.set(quote.id, {
            id: quote.id,
            number: firstNonEmptyString(quote.number),
            customerName,
            customerLogoUrl: party?.logoUrl ?? normalizeCustomerLogoUrl(quote.customer_logo_url ?? null),
            customerId,
            customerType:
              customerId
                ? "customer"
                : customerName
                  ? partyByNormalizedName.get(normalizeLookupKey(customerName))?.entityType ?? null
                  : null,
          });
        });
      }

      const designTasks = designTaskRows.map((row) =>
        parseDesignTask(row, {
          memberByUserId,
          partyByTypedId,
          partyByNormalizedName,
          quoteById,
        })
      );

      for (const task of designTasks) {
        designCounts[task.status] += 1;
        if (userId && task.assigneeUserId === userId) {
          myDesignCounts[task.status] += 1;
        }
      }

      const unassignedActiveDesignCount = designTasks.filter(
        (task) => !task.assigneeUserId && isActiveDesignStatus(task.status)
      ).length;

      const managerDesignQueue = designTasks
        .filter(
          (task) =>
            isActiveDesignStatus(task.status) &&
            (!task.assigneeUserId || task.status === "pm_review" || task.status === "client_review")
        )
        .slice(0, 8);

      const myDesignQueue = designTasks
        .filter((task) => userId && task.assigneeUserId === userId && isActiveDesignStatus(task.status))
        .slice(0, 8);

      return {
        quoteCounts,
        totalQuotesCount: totalQuotesRes.count ?? 0,
        myQuotesCount: myQuotesRes.count ?? 0,
        recentQuotes,
        designCounts,
        myDesignCounts,
        unassignedActiveDesignCount,
        managerDesignQueue,
        myDesignQueue,
        activity: activityRows.map((row) => {
          const actorName = row.actor_name?.trim() || "Користувач";
          const member =
            (row.user_id ? memberByUserId.get(row.user_id) : null) ??
            memberByNormalizedName.get(normalizeLookupKey(actorName)) ??
            null;
          return {
            ...row,
            title: row.title?.trim() || row.action?.trim() || "Подія",
            actor_name: member?.label ?? actorName,
            avatar_url: member?.avatarUrl ?? null,
            type: resolveActivityType(row),
          };
        }),
      };
    },
    cacheTTL: 10 * 60 * 1000,
    showSkeletonOnStale: false,
    backgroundRefetch: false,
  });

  const safeData = data ?? createEmptyOverviewData();
  const designStatusView = isManagerView ? safeData.designCounts : safeData.myDesignCounts;
  const designQueue = isManagerView ? safeData.managerDesignQueue : safeData.myDesignQueue;

  const activeQuoteCount = useMemo(
    () => safeData.quoteCounts.new + safeData.quoteCounts.estimating + safeData.quoteCounts.estimated + safeData.quoteCounts.awaiting_approval,
    [safeData.quoteCounts]
  );
  const activeDesignCount = useMemo(
    () => sumCounts(safeData.designCounts, DESIGN_STATUSES.filter(isActiveDesignStatus)),
    [safeData.designCounts]
  );
  const myActiveDesignCount = useMemo(
    () => sumCounts(safeData.myDesignCounts, DESIGN_STATUSES.filter(isActiveDesignStatus)),
    [safeData.myDesignCounts]
  );
  const teamDesignReviewCount = (safeData.designCounts.pm_review ?? 0) + (safeData.designCounts.client_review ?? 0);
  const myDesignReviewCount = (safeData.myDesignCounts.pm_review ?? 0) + (safeData.myDesignCounts.client_review ?? 0);

  const heroTitle = isManagerView ? "Картина команди на зараз" : "Мій робочий фокус";
  const heroSummary = isManagerView
    ? teamDesignReviewCount > 0 || safeData.quoteCounts.awaiting_approval > 0 || safeData.unassignedActiveDesignCount > 0
      ? `Увага потрібна в погодженнях, розподілі дизайну й нових прорахунках. Сторінка зібрана так, щоб одразу перейти до вузьких місць.`
      : "Критичних черг зараз немає. Сторінка лишає під рукою поточні прорахунки, дизайн і свіжі зміни по команді."
    : myActiveDesignCount > 0 || myDesignReviewCount > 0
      ? "Тут зібрано ваші задачі, вільний дизайн і останні рухи по команді, щоб без зайвих переходів зрозуміти, що робити далі."
      : "Сторінка показує робочий стан без шуму: ваші задачі, вільний дизайн, поточні прорахунки і недавні зміни команди.";

  const topStats = useMemo<OverviewMetric[]>(() => {
    if (isManagerView) {
      return [
        {
          label: "Активні прорахунки",
          value: activeQuoteCount,
          detail: `${safeData.quoteCounts.awaiting_approval} чекають погодження`,
          tone: safeData.quoteCounts.awaiting_approval > 0 ? "warning" : "info",
          icon: FileText,
        },
        {
          label: "Новий вхід",
          value: safeData.quoteCounts.new,
          detail: "Нові заявки, які ще не розібрані",
          tone: safeData.quoteCounts.new > 0 ? "info" : "neutral",
          icon: Plus,
        },
        {
          label: "Дизайн в роботі",
          value: activeDesignCount,
          detail: `${teamDesignReviewCount} задач у рев'ю`,
          tone: teamDesignReviewCount > 0 ? "warning" : "info",
          icon: Palette,
        },
        {
          label: "Без виконавця",
          value: safeData.unassignedActiveDesignCount,
          detail: "Активні задачі, які треба розподілити",
          tone: safeData.unassignedActiveDesignCount > 0 ? "warning" : "success",
          icon: LayoutGrid,
        },
      ];
    }

    return [
      {
        label: "Мої дизайн-задачі",
        value: myActiveDesignCount,
        detail: `${myDesignReviewCount} потребують перевірки`,
        tone: myDesignReviewCount > 0 ? "warning" : myActiveDesignCount > 0 ? "info" : "neutral",
        icon: Palette,
      },
      {
        label: "Вільний дизайн",
        value: safeData.unassignedActiveDesignCount,
        detail: "Можна швидко забрати в роботу",
        tone: safeData.unassignedActiveDesignCount > 0 ? "info" : "neutral",
        icon: LayoutGrid,
      },
      {
        label: "Мої прорахунки",
        value: safeData.myQuotesCount,
        detail: `${safeData.quoteCounts.awaiting_approval} у команді чекають рішення`,
        tone: safeData.myQuotesCount > 0 ? "info" : "neutral",
        icon: FileText,
      },
      {
        label: "Завершено командою",
        value: safeData.designCounts.approved + safeData.quoteCounts.approved,
        detail: "Затверджені дизайни та прорахунки",
        tone: "success",
        icon: CheckCircle2,
      },
    ];
  }, [
    activeDesignCount,
    activeQuoteCount,
    isManagerView,
    myActiveDesignCount,
    myDesignReviewCount,
    safeData.designCounts,
    safeData.myQuotesCount,
    safeData.quoteCounts,
    safeData.unassignedActiveDesignCount,
    teamDesignReviewCount,
  ]);

  const attentionSignals = useMemo<OverviewSignal[]>(() => {
    if (isManagerView) {
      return [
        {
          title: "Нові прорахунки",
          count: safeData.quoteCounts.new,
          detail: "Потрібно швидко розібрати новий вхід і призначення.",
          to: "/orders/estimates",
          tone: safeData.quoteCounts.new > 0 ? "info" : "neutral",
          icon: Plus,
        },
        {
          title: "Погодження менеджера",
          count: safeData.quoteCounts.awaiting_approval,
          detail: "Прорахунки зависли перед наступним кроком.",
          to: "/orders/estimates",
          tone: safeData.quoteCounts.awaiting_approval > 0 ? "warning" : "neutral",
          icon: Clock3,
        },
        {
          title: "Дизайн без власника",
          count: safeData.unassignedActiveDesignCount,
          detail: "Активні задачі без виконавця або розподілу.",
          to: "/design",
          tone: safeData.unassignedActiveDesignCount > 0 ? "warning" : "success",
          icon: AlertTriangle,
        },
        {
          title: "Черга на рев'ю",
          count: teamDesignReviewCount,
          detail: "PM review та client review в одному фокусі.",
          to: "/design",
          tone: teamDesignReviewCount > 0 ? "warning" : "success",
          icon: Palette,
        },
      ];
    }

    return [
      {
        title: "Мої активні задачі",
        count: myActiveDesignCount,
        detail: "Все, що зараз у вас у роботі або чекає руху.",
        to: "/design",
        tone: myActiveDesignCount > 0 ? "info" : "neutral",
        icon: Palette,
      },
      {
        title: "Очікують перевірки",
        count: myDesignReviewCount,
        detail: "Задачі в PM review і client review.",
        to: "/design",
        tone: myDesignReviewCount > 0 ? "warning" : "success",
        icon: Clock3,
      },
      {
        title: "Вільні задачі",
        count: safeData.unassignedActiveDesignCount,
        detail: "Черга, яку можна взяти без додаткових переходів.",
        to: "/design",
        tone: safeData.unassignedActiveDesignCount > 0 ? "info" : "neutral",
        icon: LayoutGrid,
      },
      {
        title: "Мої прорахунки",
        count: safeData.myQuotesCount,
        detail: "Швидкий вхід у ваші поточні прорахунки.",
        to: "/orders/estimates",
        tone: safeData.myQuotesCount > 0 ? "info" : "neutral",
        icon: FileText,
      },
    ];
  }, [
    isManagerView,
    myActiveDesignCount,
    myDesignReviewCount,
    safeData.myQuotesCount,
    safeData.quoteCounts.awaiting_approval,
    safeData.quoteCounts.new,
    safeData.unassignedActiveDesignCount,
    teamDesignReviewCount,
  ]);

  if (showSkeleton || loading) {
    return <DashboardSkeleton />;
  }

  return (
    <PageCanvas>
      <PageCanvasBody className="min-w-0 space-y-5 px-3 py-3 pb-20 md:space-y-6 md:pb-6">
        <section className="relative min-w-0 max-w-full overflow-hidden rounded-[30px] border border-border/60 bg-card/90 shadow-[var(--shadow-elevated-sm)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.10),transparent_32%)]" />
          <div className="absolute -left-16 top-0 h-40 w-40 rounded-full bg-info-soft/60 blur-3xl" />
          <div className="absolute -right-10 bottom-0 h-40 w-40 rounded-full bg-success-soft/50 blur-3xl" />

          <div className="relative grid min-w-0 gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="min-w-0 space-y-5">
              <div className="space-y-3">
                <Badge tone={isManagerView ? "info" : "success"} size="sm" pill>
                  {isManagerView ? "Огляд команди" : "Мій робочий стіл"}
                </Badge>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[32px] sm:leading-[1.05]">
                    {heroTitle}
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
                    {heroSummary}
                  </p>
                </div>
              </div>

              <div className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-4">
                {topStats.map((stat) => (
                  <OverviewMetricCard
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                    detail={stat.detail}
                    tone={stat.tone}
                    icon={stat.icon}
                  />
                ))}
              </div>

              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button asChild variant="primary" size="sm" className="w-full justify-between gap-2 whitespace-normal text-left sm:w-auto sm:justify-start">
                  <Link to="/orders/estimates">
                    Прорахунки <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm" className="w-full justify-between gap-2 whitespace-normal text-left sm:w-auto sm:justify-start">
                  <Link to="/design">
                    Дошка дизайну <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-between gap-2 whitespace-normal text-left sm:w-auto sm:justify-start">
                  <Link to="/activity">
                    Активність <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between gap-2 whitespace-normal text-left sm:w-auto sm:justify-start"
                  onClick={() => {
                    void refetch();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Оновити
                </Button>
              </div>
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-1">
              <div className="min-w-0 rounded-[26px] border border-border/60 bg-background/80 p-4 shadow-[var(--shadow-elevated-sm)]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Потрібна увага зараз</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Найважливіші сигнали без переходу між модулями.
                    </div>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-foreground">
                    <Clock3 className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 min-w-0 space-y-3">
                  {attentionSignals.slice(0, 3).map((signal) => (
                    <div
                      key={signal.title}
                      className="flex min-w-0 max-w-full items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{signal.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{signal.detail}</div>
                      </div>
                      <div className="shrink-0 text-xl font-semibold tracking-tight text-foreground">{signal.count}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 rounded-[26px] border border-border/60 bg-background/80 p-4 shadow-[var(--shadow-elevated-sm)]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Ритм команди</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Короткий зріз по чергах, дизайну й останніх подіях.
                    </div>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-foreground">
                    <ActivityIcon className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Прорахунки</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{activeQuoteCount}</div>
                    <div className="mt-1 text-xs text-muted-foreground">активних зараз</div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Дизайн</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      {isManagerView ? activeDesignCount : myActiveDesignCount}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {isManagerView ? "активних задач у команді" : "моїх активних задач"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Стрічка</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{safeData.activity.length}</div>
                    <div className="mt-1 text-xs text-muted-foreground">останніх подій на екрані</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="min-w-0 rounded-[28px] border border-border/60 bg-card/90 p-4 shadow-[var(--shadow-elevated-sm)] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold tracking-tight text-foreground">Прорахунки</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Статуси по воронці та останні прорахунки, з яких реально починається робота.
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full gap-2 whitespace-normal text-left sm:w-auto">
                <Link to="/orders/estimates">
                  Відкрити модуль <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {QUOTE_STATUSES.map((status) => (
                <OverviewStatusTile
                  key={status}
                  label={quoteStatusLabel[status]}
                  value={safeData.quoteCounts[status]}
                  total={Math.max(1, safeData.totalQuotesCount)}
                  tone={quoteStatusTone[status]}
                />
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {safeData.recentQuotes.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border/60 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                  Ще немає прорахунків.
                </div>
              ) : (
                safeData.recentQuotes.map((quote) => {
                  const status = quoteStatusFromDb(quote.status);
                  return (
                    <OverviewQueueRow
                      key={quote.id}
                      to={`/orders/estimates/${quote.id}`}
                      title={quote.number ?? quote.id.slice(0, 8)}
                      subtitle={quote.customer_name ?? "Без замовника"}
                      meta={formatDateTime(quote.created_at)}
                      badgeLabel={quoteStatusLabel[status]}
                      badgeTone={quoteStatusTone[status]}
                      entityName={quote.customer_name ?? quote.number ?? quote.id.slice(0, 8)}
                      entityLogoUrl={quote.customer_logo_url ?? null}
                      responsibleName={quote.assignedToLabel}
                    />
                  );
                })
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-[28px] border border-border/60 bg-card/90 p-4 shadow-[var(--shadow-elevated-sm)] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold tracking-tight text-foreground">
                  {isManagerView ? "Дизайн по команді" : "Мій дизайн"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Статуси задач і черга, яка реально вимагає руху зараз.
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full gap-2 whitespace-normal text-left sm:w-auto">
                <Link to="/design">
                  Відкрити дошку <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
              {DESIGN_STATUSES.map((status) => (
                <OverviewStatusTile
                  key={status}
                  label={designStatusLabel[status]}
                  value={designStatusView[status]}
                  total={Math.max(1, sumCounts(designStatusView, DESIGN_STATUSES))}
                  tone={designStatusTone[status]}
                />
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {designQueue.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border/60 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                  {isManagerView ? "У черзі немає задач, що потребують уваги." : "У вас немає активних дизайн-задач."}
                </div>
              ) : (
                designQueue.map((task) => (
                  <OverviewQueueRow
                    key={task.id}
                    to={`/design/${task.id}`}
                    title={task.designTaskNumber ?? task.quoteNumber ?? task.title ?? task.id.slice(0, 8)}
                    subtitle={[task.title, task.customerName].filter(Boolean).join(" · ") || "Дизайн-задача"}
                    meta={formatDateTime(task.createdAt)}
                    badgeLabel={designStatusLabel[task.status]}
                    badgeTone={designStatusTone[task.status]}
                    entityName={task.customerName ?? task.title ?? task.designTaskNumber ?? task.id.slice(0, 8)}
                    entityLogoUrl={task.customerLogoUrl ?? null}
                    responsibleName={task.assigneeLabel}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="min-w-0 rounded-[28px] border border-border/60 bg-card/90 p-4 shadow-[var(--shadow-elevated-sm)] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold tracking-tight text-foreground">Сигнали по роботі</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Найкорисніші переходи без пошуку по модулях.
                </div>
              </div>
              <Badge tone="neutral" size="sm" pill>
                {attentionSignals.reduce((sum, item) => sum + item.count, 0)} сигналів
              </Badge>
            </div>

            <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
              {attentionSignals.map((signal) => (
                <OverviewSignalCard
                  key={signal.title}
                  title={signal.title}
                  count={signal.count}
                  detail={signal.detail}
                  to={signal.to}
                  tone={signal.tone}
                  icon={signal.icon}
                />
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-[28px] border border-border/60 bg-card/90 p-4 shadow-[var(--shadow-elevated-sm)] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-lg font-semibold tracking-tight text-foreground">Останні дії</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Свіжа активність по команді без перевантаження довгою стрічкою.
                </div>
              </div>
              <div className="flex min-w-0 w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Оновити"
                  className="self-start"
                  onClick={() => {
                    void refetch();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full gap-2 whitespace-normal text-left sm:w-auto">
                  <Link to="/activity">
                    Вся стрічка <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {safeData.activity.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-border/60 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                  Подій поки немає.
                </div>
              ) : (
                safeData.activity.map((row) => {
                  const destination = row.href ?? "/activity";
                  const Icon = overviewActivityIcon(row.type);
                  const tone =
                    row.type === "quotes" ? "info" : row.type === "design" ? "success" : row.type === "team" ? "neutral" : "warning";

                  return (
                    <Link
                      key={row.id}
                      to={destination}
                      className="group flex min-w-0 max-w-full items-start gap-3 rounded-[22px] border border-border/60 bg-background/70 px-4 py-3 transition-all hover:border-border hover:bg-background/90 hover:shadow-[var(--shadow-elevated-sm)]"
                    >
                      <AvatarBase
                        src={row.avatar_url ?? null}
                        name={row.actor_name ?? "Користувач"}
                        fallback={getInitials(row.actor_name)}
                        variant="sm"
                      />
                      <div
                        className={cn(
                          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                          metricIconClassByTone[tone]
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-medium text-foreground">{row.title ?? "Подія"}</div>
                          <Badge tone={tone === "warning" ? "warning" : tone === "success" ? "success" : tone === "info" ? "info" : "neutral"} size="sm">
                            {row.type === "quotes" ? "Прорахунки" : row.type === "design" ? "Дизайн" : row.type === "team" ? "Команда" : "Інше"}
                          </Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {row.actor_name ?? "Користувач"} · {formatDateTime(row.created_at)}
                        </div>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </PageCanvasBody>
    </PageCanvas>
  );
}

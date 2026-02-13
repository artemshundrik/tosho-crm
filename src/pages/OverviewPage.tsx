import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, FileText, LayoutGrid, Palette, Plus, RefreshCw } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { DashboardSkeleton } from "@/components/app/page-skeleton-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { usePageData } from "@/hooks/usePageData";

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
  assigned_to?: string | null;
  created_at?: string | null;
};

type DesignTaskRow = {
  id: string;
  quoteId: string;
  quoteNumber: string | null;
  title: string | null;
  status: DesignStatus;
  assigneeUserId: string | null;
  createdAt: string | null;
};

type ActivityRow = {
  id: string;
  title?: string | null;
  action?: string | null;
  href?: string | null;
  created_at?: string | null;
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

const quoteStatusLabel: Record<QuoteStatus, string> = {
  new: "Нові",
  estimating: "На прорахунку",
  estimated: "Пораховано",
  awaiting_approval: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

const quoteStatusClass: Record<QuoteStatus, string> = {
  new: "bg-muted/40 text-muted-foreground border-border",
  estimating: "bg-sky-500/15 text-sky-200 border-sky-500/40",
  estimated: "bg-violet-500/15 text-violet-200 border-violet-500/40",
  awaiting_approval: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  approved: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
  cancelled: "bg-rose-500/15 text-rose-200 border-rose-500/40",
};

const designStatusLabel: Record<DesignStatus, string> = {
  new: "Новий",
  changes: "Правки",
  in_progress: "В роботі",
  pm_review: "На перевірці",
  client_review: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
};

const designStatusClass: Record<DesignStatus, string> = {
  new: "bg-muted/40 text-muted-foreground border-border",
  changes: "bg-amber-500/15 text-amber-200 border-amber-500/40",
  in_progress: "bg-sky-500/15 text-sky-200 border-sky-500/40",
  pm_review: "bg-indigo-500/15 text-indigo-200 border-indigo-500/40",
  client_review: "bg-yellow-500/15 text-yellow-200 border-yellow-500/40",
  approved: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
  cancelled: "bg-rose-500/15 text-rose-200 border-rose-500/40",
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

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

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

const parseDesignTask = (row: {
  id: string;
  entity_id?: string | null;
  title?: string | null;
  metadata?: unknown;
  created_at?: string | null;
}): DesignTaskRow => {
  const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  const quoteIdFromMeta = typeof metadata.quote_id === "string" && metadata.quote_id ? metadata.quote_id : null;
  const quoteNumber =
    typeof metadata.quote_number === "string" && metadata.quote_number.trim() ? metadata.quote_number.trim() : null;
  const statusRaw = typeof metadata.status === "string" ? metadata.status : "new";
  const status = (DESIGN_STATUSES.includes(statusRaw as DesignStatus) ? statusRaw : "new") as DesignStatus;
  const assigneeUserId =
    typeof metadata.assignee_user_id === "string" && metadata.assignee_user_id ? metadata.assignee_user_id : null;

  return {
    id: row.id,
    quoteId: quoteIdFromMeta ?? (row.entity_id ?? ""),
    quoteNumber,
    title: row.title ?? null,
    status,
    assigneeUserId,
    createdAt: row.created_at ?? null,
  };
};

const loadRecentQuotes = async (teamId: string): Promise<QuoteRow[]> => {
  try {
    const { data, error } = await supabase
      .schema("tosho")
      .from("v_quotes_list")
      .select("id,number,status,customer_name,assigned_to,created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return (data as QuoteRow[] | null) ?? [];
  } catch {
    const { data: quoteRows, error: quoteError } = await supabase
      .schema("tosho")
      .from("quotes")
      .select("id,number,status,customer_id,assigned_to,created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (quoteError) throw quoteError;

    const rows = (quoteRows as Array<QuoteRow & { customer_id?: string | null }> | null) ?? [];
    const customerIds = Array.from(new Set(rows.map((row) => row.customer_id).filter(Boolean) as string[]));

    let customerNameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .schema("tosho")
        .from("customers")
        .select("id,name,legal_name")
        .in("id", customerIds);
      customerNameById = new Map(
        ((customers as Array<{ id: string; name?: string | null; legal_name?: string | null }> | null) ?? []).map((c) => [
          c.id,
          c.name ?? c.legal_name ?? "—",
        ])
      );
    }

    return rows.map((row) => ({
      id: row.id,
      number: row.number ?? null,
      status: row.status ?? null,
      assigned_to: row.assigned_to ?? null,
      created_at: row.created_at ?? null,
      customer_name: row.customer_id ? customerNameById.get(row.customer_id) ?? "—" : "—",
    }));
  }
};

export function OverviewPage() {
  const { teamId, userId, role, accessRole, jobRole, permissions } = useAuth();

  const isManagerView = permissions.canViewManagerOverview;

  const {
    data,
    loading,
    showSkeleton,
    refetch,
  } = usePageData<OverviewData>({
    cacheKey: `overview-crm:${teamId ?? "none"}:${userId ?? "none"}:${role ?? "none"}:${accessRole ?? "none"}:${jobRole ?? "none"}`,
    loadFn: async () => {
      if (!teamId) return createEmptyOverviewData();

      const quoteCountPromises = QUOTE_STATUSES.map(async (status) => {
        const { count, error } = await supabase
          .schema("tosho")
          .from("quotes")
          .select("id", { head: true, count: "exact" })
          .eq("team_id", teamId)
          .eq("status", status);
        if (error) throw error;
        return { status, count: count ?? 0 };
      });

      const totalQuotesPromise = supabase
        .schema("tosho")
        .from("quotes")
        .select("id", { head: true, count: "exact" })
        .eq("team_id", teamId);

      const myQuotesPromise =
        userId
          ? supabase
              .schema("tosho")
              .from("quotes")
              .select("id", { head: true, count: "exact" })
              .eq("team_id", teamId)
              .eq("assigned_to", userId)
          : Promise.resolve({ count: 0, error: null } as { count: number | null; error: null });

      const designTasksPromise = supabase
        .from("activity_log")
        .select("id,entity_id,title,metadata,created_at")
        .eq("team_id", teamId)
        .eq("action", "design_task")
        .order("created_at", { ascending: false })
        .limit(400);

      const activityPromise = supabase
        .from("activity_log")
        .select("id,title,action,href,created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(8);

      const [
        quoteCountsRows,
        totalQuotesRes,
        myQuotesRes,
        recentQuotes,
        designTasksRes,
        activityRes,
      ] = await Promise.all([
        Promise.all(quoteCountPromises),
        totalQuotesPromise,
        myQuotesPromise,
        loadRecentQuotes(teamId),
        designTasksPromise,
        activityPromise,
      ]);

      if (totalQuotesRes.error) throw totalQuotesRes.error;
      if (myQuotesRes.error) throw myQuotesRes.error;
      if (designTasksRes.error) throw designTasksRes.error;
      if (activityRes.error) throw activityRes.error;

      const quoteCounts = emptyCounts(QUOTE_STATUSES);
      quoteCountsRows.forEach((row) => {
        quoteCounts[row.status] = row.count;
      });

      const designCounts = emptyCounts(DESIGN_STATUSES);
      const myDesignCounts = emptyCounts(DESIGN_STATUSES);

      const designTasks = ((designTasksRes.data as Array<{
        id: string;
        entity_id?: string | null;
        title?: string | null;
        metadata?: unknown;
        created_at?: string | null;
      }> | null) ?? []).map(parseDesignTask);

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
        activity: ((activityRes.data as ActivityRow[] | null) ?? []).map((row) => ({
          ...row,
          title: row.title?.trim() || row.action?.trim() || "Подія",
        })),
      };
    },
    cacheTTL: 60 * 1000,
    showSkeletonOnStale: false,
    backgroundRefetch: true,
    refetchInterval: 60 * 1000,
  });

  const safeData = data ?? createEmptyOverviewData();

  const headerActions = useMemo(
    () => (
      <>
        <Button asChild variant="secondary">
          <Link to="/design">Дизайн</Link>
        </Button>
        <Button asChild>
          <Link to="/orders/estimates">Прорахунки</Link>
        </Button>
      </>
    ),
    []
  );

  usePageHeaderActions(headerActions, []);

  const topStats = useMemo(() => {
    if (isManagerView) {
      return [
        { label: "Прорахунків всього", value: safeData.totalQuotesCount, icon: FileText },
        { label: "Нові прорахунки", value: safeData.quoteCounts.new, icon: Plus },
        { label: "На погодженні", value: safeData.quoteCounts.awaiting_approval, icon: Clock3 },
        { label: "Дизайн без виконавця", value: safeData.unassignedActiveDesignCount, icon: Palette },
      ];
    }

    const myDesignActive = DESIGN_STATUSES.reduce((sum, status) => {
      if (!isActiveDesignStatus(status)) return sum;
      return sum + (safeData.myDesignCounts[status] ?? 0);
    }, 0);

    const myReviewCount = (safeData.myDesignCounts.pm_review ?? 0) + (safeData.myDesignCounts.client_review ?? 0);

    return [
      { label: "Мої дизайн-задачі", value: myDesignActive, icon: Palette },
      { label: "Вільні задачі", value: safeData.unassignedActiveDesignCount, icon: LayoutGrid },
      { label: "Мої прорахунки", value: safeData.myQuotesCount, icon: FileText },
      { label: "Очікують перевірки", value: myReviewCount, icon: Clock3 },
    ];
  }, [isManagerView, safeData]);

  const designStatusView = isManagerView ? safeData.designCounts : safeData.myDesignCounts;
  const designQueue = isManagerView ? safeData.managerDesignQueue : safeData.myDesignQueue;

  if (showSkeleton || loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {topStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-border/60 bg-card/80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight">{stat.value}</div>
                  </div>
                  <div className="h-9 w-9 rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Прорахунки</CardTitle>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/orders/estimates">
                  Відкрити <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {QUOTE_STATUSES.map((status) => (
                <Badge key={status} variant="outline" className={cn("text-xs", quoteStatusClass[status])}>
                  {quoteStatusLabel[status]}: {safeData.quoteCounts[status]}
                </Badge>
              ))}
            </div>

            {safeData.recentQuotes.length === 0 ? (
              <div className="text-sm text-muted-foreground">Ще немає прорахунків.</div>
            ) : (
              <div className="space-y-2">
                {safeData.recentQuotes.map((quote) => {
                  const status = quoteStatusFromDb(quote.status);
                  return (
                    <Link
                      key={quote.id}
                      to={`/orders/estimates/${quote.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 hover:bg-muted/20 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{quote.number ?? quote.id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {quote.customer_name ?? "Без замовника"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={cn("text-[11px]", quoteStatusClass[status])}>
                          {quoteStatusLabel[status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDateTime(quote.created_at)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{isManagerView ? "Дизайн по команді" : "Мої дизайн-задачі"}</CardTitle>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/design">
                  Дошка дизайну <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {DESIGN_STATUSES.map((status) => (
                <Badge key={status} variant="outline" className={cn("text-xs", designStatusClass[status])}>
                  {designStatusLabel[status]}: {designStatusView[status]}
                </Badge>
              ))}
            </div>

            {designQueue.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {isManagerView ? "У черзі немає задач, що потребують уваги." : "У вас немає активних дизайн-задач."}
              </div>
            ) : (
              <div className="space-y-2">
                {designQueue.map((task) => (
                  <Link
                    key={task.id}
                    to={`/design/${task.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {task.quoteNumber ?? task.quoteId.slice(0, 8)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{task.title ?? "Дизайн-задача"}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={cn("text-[11px]", designStatusClass[task.status])}>
                        {designStatusLabel[task.status]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(task.createdAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Останні дії</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Оновити"
                onClick={() => {
                  void refetch();
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/activity">
                  Всі події <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {safeData.activity.length === 0 ? (
            <div className="text-sm text-muted-foreground">Подій поки немає.</div>
          ) : (
            <div className="space-y-2">
              {safeData.activity.map((row) => {
                const destination = row.href ?? "/activity";
                return (
                  <Link
                    key={row.id}
                    to={destination}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0 text-sm truncate">{row.title ?? "Подія"}</div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDateTime(row.created_at)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

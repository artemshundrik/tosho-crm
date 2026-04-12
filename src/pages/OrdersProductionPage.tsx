import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useNavigationType } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { AppPageLoader } from "@/components/app/AppPageLoader";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { AvatarBase, EntityAvatar } from "@/components/app/avatar-kit";
import { usePageHeaderActions } from "@/components/app/page-header-actions";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { ActiveHereCard } from "@/components/app/workspace-presence-widgets";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { KanbanBoard, KanbanCard, KanbanColumn } from "@/components/kanban";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SEGMENTED_GROUP,
  SEGMENTED_TRIGGER,
  TOOLBAR_CONTROL,
} from "@/components/ui/controlStyles";
import { Input } from "@/components/ui/input";
import { HoverCopyText } from "@/components/ui/hover-copy-text";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ORDER_READINESS_COLUMNS } from "@/features/orders/config";
import { EstimatesKanbanCanvas } from "@/features/quotes/components/EstimatesKanbanCanvas";
import {
  formatOrderDate,
  formatOrderMoney,
  loadDerivedOrders,
  type DerivedOrderRecord,
} from "@/features/orders/orderRecords";
import { cn } from "@/lib/utils";
import { shouldRestorePageUiState } from "@/lib/pageUiState";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  LayoutGrid,
  List,
  Loader2,
  Package,
  Palette,
  X,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";

type HeaderFilter = "all" | "created" | "ready" | "counterparty" | "design";

type OrdersProductionPageCachePayload = {
  records: DerivedOrderRecord[];
  cachedAt: number;
};

type OrdersProductionPageFiltersState = {
  search?: string;
  headerFilter?: HeaderFilter;
  managerFilter?: string;
  viewTab?: "queue" | "register";
  cachedAt?: number;
};

const HEADER_FILTER_OPTIONS: Array<{ value: HeaderFilter; label: string }> = [
  { value: "all", label: "Всі статуси" },
  { value: "created", label: "Створено замовлення" },
  { value: "ready", label: "Готово до замовлення" },
  { value: "counterparty", label: "Лід / реквізити" },
  { value: "design", label: "Макет / візуал" },
];

const ALL_MANAGERS_FILTER = "__all__";

const normalizeText = (value?: string | null) => (value ?? "").trim().toLowerCase();

const getInitials = (value?: string | null) => {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
};

function readOrdersProductionPageCache(teamId: string): OrdersProductionPageCachePayload | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`orders-production-page-cache:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrdersProductionPageCachePayload;
    if (!Array.isArray(parsed.records)) return null;
    return {
      records: parsed.records,
      cachedAt: Number(parsed.cachedAt ?? Date.now()),
    };
  } catch {
    return null;
  }
}

function readOrdersProductionPageFiltersState(teamId: string): OrdersProductionPageFiltersState | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(`orders-production-page-filters:${teamId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrdersProductionPageFiltersState;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...parsed,
      cachedAt: Number(parsed.cachedAt ?? 0),
    };
  } catch {
    return null;
  }
}

const renderDocBadge = (label: string, ready: boolean) => (
  <Badge
    variant="outline"
    className={cn(
      "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
      ready
        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
        : "border-border/70 bg-muted/20 text-muted-foreground"
    )}
  >
    {label}
  </Badge>
);

export default function OrdersProductionPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { teamId, loading: authLoading, session, userId } = useAuth();
  const workspacePresence = useWorkspacePresence();
  const desktopKanbanViewportRef = useRef<HTMLDivElement | null>(null);
  const initialCache = readOrdersProductionPageCache(teamId ?? "");
  const initialFilters = readOrdersProductionPageFiltersState(teamId ?? "");
  const restoredFilters = shouldRestorePageUiState(navigationType, initialFilters?.cachedAt) ? initialFilters : null;
  const [loading, setLoading] = useState(() => !(initialCache && initialCache.records.length > 0));
  const [refreshing, setRefreshing] = useState(false);
  const [desktopKanbanViewportHeight, setDesktopKanbanViewportHeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<DerivedOrderRecord[]>(() => initialCache?.records ?? []);
  const [search, setSearch] = useState(() => restoredFilters?.search ?? "");
  const [headerFilter, setHeaderFilter] = useState<HeaderFilter>(() => restoredFilters?.headerFilter ?? "all");
  const [managerFilter, setManagerFilter] = useState<string>(
    () => restoredFilters?.managerFilter ?? ALL_MANAGERS_FILTER
  );
  const [viewTab, setViewTab] = useState<"queue" | "register">(() => restoredFilters?.viewTab ?? "register");

  const openRecord = (record: DerivedOrderRecord) => {
    if (record.source === "stored") {
      navigate(`/orders/production/${record.id}`);
      return;
    }
    navigate(`/orders/estimates/${record.quoteId}`);
  };

  const loadOrders = async () => {
    if (!teamId) return;

    const cached = readOrdersProductionPageCache(teamId);
    const hasCachedRecords = (cached?.records.length ?? 0) > 0;

    if (records.length > 0 || hasCachedRecords) setRefreshing(true);
    else setLoading(true);

    try {
      setError(null);
      const nextRecords = await loadDerivedOrders(teamId, userId);
      setRecords(nextRecords);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          `orders-production-page-cache:${teamId}`,
          JSON.stringify({
            records: nextRecords,
            cachedAt: Date.now(),
          } satisfies OrdersProductionPageCachePayload)
        );
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Не вдалося підготувати реєстр замовлень.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!teamId) return;
    const cached = readOrdersProductionPageCache(teamId);
    if (cached?.records.length) {
      setRecords(cached.records);
      setLoading(false);
      setError(null);
    }
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !teamId) return;
    sessionStorage.setItem(
      `orders-production-page-filters:${teamId}`,
      JSON.stringify({
        search,
        headerFilter,
        managerFilter,
        viewTab,
        cachedAt: Date.now(),
      } satisfies OrdersProductionPageFiltersState)
    );
  }, [teamId, search, headerFilter, managerFilter, viewTab]);

  const managerFilterOptions = useMemo(
    () =>
      Array.from(
        new Map(
          records
            .filter((record) => record.managerLabel.trim())
            .map((record) => [
              record.managerLabel.trim(),
              {
                id: record.managerLabel.trim(),
                label: record.managerLabel.trim(),
                avatarUrl: record.managerAvatarUrl ?? null,
              },
            ])
        ).values()
      ).sort((a, b) => a.label.localeCompare(b.label, "uk")),
    [records]
  );

  const renderManagerFilterValue = (value: string) => {
    if (value === ALL_MANAGERS_FILTER) return <span>Всі менеджери</span>;
    const option = managerFilterOptions.find((entry) => entry.id === value) ?? null;
    const label = option?.label ?? value;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <AvatarBase
          src={option?.avatarUrl ?? null}
          name={label}
          fallback={getInitials(label)}
          size={18}
          className="shrink-0 border-border/60"
          fallbackClassName="text-[9px] font-semibold"
        />
        <span className="truncate">{label}</span>
      </span>
    );
  };

  const filteredRecords = useMemo(() => {
    const query = normalizeText(search);
    return records.filter((record) => {
      if (headerFilter === "created" && record.source !== "stored") return false;
      if (headerFilter === "ready" && !(record.source !== "stored" && record.readinessColumn === "ready")) return false;
      if (headerFilter === "counterparty" && record.readinessColumn !== "counterparty") return false;
      if (headerFilter === "design" && record.readinessColumn !== "design") return false;
      if (managerFilter !== ALL_MANAGERS_FILTER && record.managerLabel.trim() !== managerFilter) return false;

      if (!query) return true;

      const haystack = [
        record.quoteNumber,
        record.customerName,
        record.paymentRail,
        record.managerLabel,
        record.contactEmail,
        record.contactPhone,
        record.legalEntityLabel,
        record.signatoryLabel,
        ...record.items.map((item) => item.name),
        ...record.blockers,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [headerFilter, managerFilter, records, search]);

  const recordsByColumn = useMemo(() => {
    const map = new Map<(typeof ORDER_READINESS_COLUMNS)[number]["id"], DerivedOrderRecord[]>();
    ORDER_READINESS_COLUMNS.forEach((column) => map.set(column.id, []));
    filteredRecords.forEach((record) => {
      const list = map.get(record.readinessColumn) ?? [];
      list.push(record);
      map.set(record.readinessColumn, list);
    });
    return map;
  }, [filteredRecords]);

  const summary = useMemo(() => {
    const ready = records.filter((record) => record.readinessColumn === "ready").length;
    const counterparty = records.filter((record) => record.readinessColumn === "counterparty").length;
    const design = records.filter((record) => record.readinessColumn === "design").length;
    return {
      total: records.length,
      ready,
      counterparty,
      design,
    };
  }, [records]);

  useEffect(() => {
    if (viewTab !== "queue") return;
    if (typeof window === "undefined") return;

    const viewport = desktopKanbanViewportRef.current;
    if (!viewport) return;

    let frameId = 0;
    const measure = () => {
      frameId = 0;
      const rect = viewport.getBoundingClientRect();
      const nextHeight = Math.max(320, Math.floor(window.innerHeight - rect.top - 20));
      setDesktopKanbanViewportHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    const scheduleMeasure = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleMeasure();
          })
        : null;

    resizeObserver?.observe(viewport);
    if (viewport.parentElement) {
      resizeObserver?.observe(viewport.parentElement);
    }

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, [filteredRecords.length, viewTab]);

  const headerActions = (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="flex w-full flex-col gap-2 self-stretch sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          <div className={cn(SEGMENTED_GROUP, "w-full sm:w-auto")}>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={viewTab === "register"}
              onClick={() => setViewTab("register")}
              className={cn(SEGMENTED_TRIGGER, "px-5")}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Список</span>
            </Button>
            <Button
              variant="segmented"
              size="xs"
              aria-pressed={viewTab === "queue"}
              onClick={() => setViewTab("queue")}
              className={cn(SEGMENTED_TRIGGER, "px-5")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Kanban</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative w-full xl:max-w-[370px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Пошук за назвою..."
            className={cn(TOOLBAR_CONTROL, "pl-9 pr-9")}
          />
          {search ? (
            <Button
              type="button"
              variant="control"
              size="iconSm"
              aria-label="Очистити пошук"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
          {(loading || refreshing) && search ? (
            <Loader2 className="absolute right-10 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:flex-1">
          <Select value={headerFilter} onValueChange={(value) => setHeaderFilter(value as HeaderFilter)}>
            <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[210px]")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEADER_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={managerFilter} onValueChange={setManagerFilter}>
            <SelectTrigger className={cn(TOOLBAR_CONTROL, "w-full sm:w-[210px]")}>
              <div className="flex min-w-0 items-center">{renderManagerFilterValue(managerFilter)}</div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MANAGERS_FILTER}>{renderManagerFilterValue(ALL_MANAGERS_FILTER)}</SelectItem>
              {managerFilterOptions.map((manager) => (
                <SelectItem key={manager.id} value={manager.id}>
                  {renderManagerFilterValue(manager.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ActiveHereCard entries={workspacePresence.activeHereEntries} variant="minimal" />

        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="text-sm font-semibold text-foreground">
            <span className="tabular-nums">{filteredRecords.length}</span>
            <span className="ml-1 text-muted-foreground">знайдено</span>
          </div>
        </div>
      </div>
    </div>
  );

  usePageHeaderActions(headerActions, [
    filteredRecords.length,
    headerFilter,
    loading,
    records.length,
    refreshing,
    search,
    teamId,
    userId,
    viewTab,
    managerFilter,
    managerFilterOptions,
    workspacePresence.activeHereEntries,
  ]);

  if (authLoading) {
    return <AppPageLoader title="Завантаження" subtitle="Підтягуємо затверджені прорахунки та чергу замовлень." />;
  }

  if (!session) {
    return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  }

  if (!teamId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Немає доступної команди. Перевір членство або інвайт.
      </div>
    );
  }

  return (
    <PageCanvas>
      {viewTab === "register" ? (
        <PageCanvasBody className="space-y-6 px-5 py-3 pb-20 md:pb-6">
          <div className="grid gap-4 xl:grid-cols-4">
            <Card className="overflow-hidden border-border/70 bg-card/95 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">Усі затверджені прорахунки</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight">{summary.total}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-emerald-900/75 dark:text-emerald-100/80">Готово до замовлення</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-emerald-900 dark:text-emerald-50">
                    {summary.ready}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white/70 p-2.5 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-200" />
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-amber-900/75 dark:text-amber-100/80">Лід / реквізити</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-amber-900 dark:text-amber-50">
                    {summary.counterparty}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-white/70 p-2.5 dark:border-amber-500/20 dark:bg-amber-500/10">
                  <Building2 className="h-5 w-5 text-amber-700 dark:text-amber-200" />
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden border-sky-200 bg-sky-50/70 p-4 dark:border-sky-500/20 dark:bg-sky-500/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-sky-900/75 dark:text-sky-100/80">Макет / візуал</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-sky-900 dark:text-sky-50">
                    {summary.design}
                  </div>
                </div>
                <div className="rounded-xl border border-sky-200 bg-white/70 p-2.5 dark:border-sky-500/20 dark:bg-sky-500/10">
                  <Palette className="h-5 w-5 text-sky-700 dark:text-sky-200" />
                </div>
              </div>
            </Card>
          </div>

          <Tabs value={viewTab}>
            <TabsContent value="register" className="mt-0 space-y-4">
              {loading ? (
                <AppSectionLoader label="Готуємо таблицю замовлень..." />
              ) : error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : filteredRecords.length === 0 ? (
                <Card className="border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                  Немає записів для відображення у таблиці.
                </Card>
              ) : (
                <Card className="overflow-hidden border-border/70 bg-card/95">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="pl-6">Прорахунок</TableHead>
                          <TableHead>Контрагент</TableHead>
                          <TableHead>Стан</TableHead>
                          <TableHead>Позиції</TableHead>
                          <TableHead>Оплата</TableHead>
                          <TableHead>Документи</TableHead>
                          <TableHead>Готовність</TableHead>
                          <TableHead className="pr-6 text-right">Сума</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRecords.map((record) => (
                          <TableRow
                            key={record.id}
                            className="cursor-pointer hover:bg-muted/10"
                            onClick={() => openRecord(record)}
                          >
                            <TableCell className="pl-6 align-top">
                              <div className="space-y-1">
                                <HoverCopyText
                                  value={record.quoteNumber}
                                  textClassName="font-semibold text-foreground"
                                  successMessage="Номер замовлення скопійовано"
                                  copyLabel="Скопіювати номер замовлення"
                                >
                                  {record.quoteNumber}
                                </HoverCopyText>
                                <div className="text-xs text-muted-foreground">{formatOrderDate(record.updatedAt)}</div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex items-center gap-3">
                                <EntityAvatar
                                  src={record.customerLogoUrl}
                                  name={record.customerName}
                                  fallback={getInitials(record.customerName)}
                                  size={36}
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{record.customerName}</div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    {record.partyType === "customer" ? "Замовник" : "Лід"}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                                  record.source === "stored"
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                                    : "border-border/70 bg-muted/20 text-muted-foreground"
                                )}
                              >
                                {record.source === "stored" ? "Створено замовлення" : "Черга з прорахунку"}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top">
                              {record.items.length > 0 ? (
                                <div className="flex min-w-0 items-center gap-2 text-sm">
                                  <span className="shrink-0 font-medium text-foreground">{record.itemCount}</span>
                                  <span className="text-muted-foreground">•</span>
                                  <span className="truncate text-muted-foreground">
                                    {record.items[0]?.name || "Немає позицій"}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">Немає позицій</div>
                              )}
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="max-w-[220px] text-sm text-foreground">{record.paymentRail}</div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex flex-wrap gap-1.5">
                                {renderDocBadge("Договір", record.docs.contract)}
                                {renderDocBadge("Рахунок", record.docs.invoice)}
                                {renderDocBadge("СП", record.docs.specification)}
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                                  record.readinessColumn === "ready"
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                                    : record.readinessColumn === "design"
                                      ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                                      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                                )}
                              >
                                {record.readinessColumn === "ready"
                                  ? "Готово"
                                  : record.readinessColumn === "design"
                                    ? "Очікує макет"
                                    : "Потрібні дані"}
                              </Badge>
                            </TableCell>
                            <TableCell className="pr-6 text-right align-top font-semibold text-foreground">
                              {formatOrderMoney(record.total, record.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </PageCanvasBody>
      ) : (
        <EstimatesKanbanCanvas className="px-5 py-3 pb-3">
          {loading ? (
            <AppSectionLoader label="Завантаження черги..." />
          ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : filteredRecords.length === 0 ? (
              <Card className="border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                У затверджених прорахунках поки немає записів для формування замовлень.
              </Card>
            ) : (
              <div
                ref={desktopKanbanViewportRef}
                className="min-h-0 overflow-hidden"
                style={
                  desktopKanbanViewportHeight
                    ? { height: `${desktopKanbanViewportHeight}px` }
                    : undefined
                }
              >
                <KanbanBoard className="h-full pb-2 md:pb-3" rowClassName="h-full items-stretch">
                  {ORDER_READINESS_COLUMNS.map((column) => {
                    const columnRecords = recordsByColumn.get(column.id) ?? [];
                    return (
                      <KanbanColumn
                        key={column.id}
                        className={cn(
                          "kanban-column-surface basis-1/3 shrink-0 flex flex-col h-full"
                        )}
                        bodyClassName="px-2.5 pb-1.5 pt-2.5 space-y-2"
                        header={
                          <div className="kanban-column-header flex items-center justify-between gap-2 px-3.5 py-3 shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", column.dotClass)} />
                              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                                {column.label}
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/80">
                              {columnRecords.length}
                            </span>
                          </div>
                        }
                      >
                        {columnRecords.length === 0 ? (
                          <div className="kanban-empty-state rounded-md border border-dashed border-border/50 px-3 py-6 text-center text-[11px] text-muted-foreground/70">
                            {column.description}
                          </div>
                        ) : (
                          columnRecords.map((record) => (
                            <KanbanCard
                              key={record.id}
                              className="kanban-estimate-card cursor-pointer overflow-hidden rounded-[18px] border border-border/60 bg-gradient-to-br from-card via-card/95 to-card/75 p-4 transition-[border-color] duration-220 ease-out hover:border-foreground/24 dark:hover:border-foreground/22"
                              onClick={() => openRecord(record)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <EntityAvatar
                                    src={record.customerLogoUrl}
                                    name={record.customerName}
                                    fallback={getInitials(record.customerName)}
                                    size={40}
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-foreground">
                                      {record.customerName}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground">
                                      <HoverCopyText
                                        value={record.quoteNumber}
                                        textClassName="font-medium"
                                        successMessage="Номер замовлення скопійовано"
                                        copyLabel="Скопіювати номер замовлення"
                                      >
                                        {record.quoteNumber}
                                      </HoverCopyText>{" "}
                                      • {formatOrderMoney(record.total, record.currency)}
                                    </div>
                                  </div>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                    record.readinessColumn === "ready"
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                                      : record.readinessColumn === "design"
                                        ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                                        : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                                  )}
                                >
                                  {record.readinessColumn === "ready" ? "Готово" : "Увага"}
                                </Badge>
                              </div>

                              <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Wallet className="h-3.5 w-3.5" />
                                  <span className="truncate">{record.paymentRail}</span>
                                </div>
                                <div>{record.itemCount} позицій для переносу в замовлення</div>
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  <span className="truncate">
                                    {record.hasApprovedVisualization && record.hasApprovedLayout
                                      ? "Візуал і макет погоджені"
                                      : "Дизайн потребує підтвердження"}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {renderDocBadge("Договір", record.docs.contract)}
                                {renderDocBadge("Рахунок", record.docs.invoice)}
                                {renderDocBadge("СП", record.docs.specification)}
                                {renderDocBadge("Техкарта", record.docs.techCard)}
                              </div>

                              {record.blockers.length > 0 ? (
                                <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-950 dark:text-amber-100">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Що блокує переведення у замовлення
                                  </div>
                                  <div className="space-y-1 text-xs leading-5 text-amber-900 dark:text-amber-100/90">
                                    {record.blockers.slice(0, 3).map((blocker) => (
                                      <div key={blocker}>{blocker}</div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-4 rounded-xl border border-emerald-300/60 bg-emerald-50/80 p-3 text-xs font-medium text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                                  Умови виконані. Можна створювати пакет документів і переводити в замовлення.
                                </div>
                              )}
                            </KanbanCard>
                          ))
                        )}
                      </KanbanColumn>
                    );
                  })}
                </KanbanBoard>
              </div>
            )}
        </EstimatesKanbanCanvas>
      )}
    </PageCanvas>
  );
}

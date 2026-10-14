import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useNavigationType } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { AvatarBase } from "@/components/app/avatar-kit";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarFilterSelect, ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { Factory, FileText, Plus } from "@/components/icons/appIcons";
import { MobileStatusChips } from "@/components/kanban";
import { CreateManualOrderDialog } from "@/components/orders/CreateManualOrderDialog";
import { Button } from "@/components/ui/button";
import { TOOLBAR_ACTION_BUTTON } from "@/components/ui/controlStyles";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getSpecificationGroupBlocker,
  getSpecificationRecordBlocker,
  openGroupedSpecification,
} from "@/features/orders/order-list/groupedSpecification";
import { OrderListMobileCard, OrderListTableRow, type OrderListRowView } from "@/features/orders/order-list/OrderListRows";
import { OrderStageStrip, type OrderListScope } from "@/features/orders/order-list/OrderStageStrip";
import { useOrderRecords } from "@/features/orders/order-list/useOrderRecords";
import {
  ACTIVE_ORDER_STAGES,
  getOrderDocMarks,
  getOrderNextStep,
  getOrderPaidShare,
  isMyTurn,
  summarizeOrderStages,
  type ActiveOrderStage,
} from "@/features/orders/orderListStages";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { isCashlessPaymentMethod } from "@/features/orders/paymentRules";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { MOBILE_CARD_LIST, MOBILE_CHIPS_ROW, MOBILE_PAGE_BODY } from "@/layout/mobileRhythm";
import { shouldRestorePageUiState } from "@/lib/pageUiState";
import { cn } from "@/lib/utils";

/**
 * Список замовлень (REQ-322#p12, макет ListFinal): лише замовлення ZM-, згори
 * смуга етапів, у рядку — що далі й чий хід. Затверджені прорахунки, з яких ще
 * не зробили замовлення, живуть на окремому екрані «Черга з прорахунків».
 */
type PaymentFilter = "all" | "cashless" | "cash" | "crypto";
type SortMode = "my-turn" | "recent";

type FiltersState = {
  search?: string;
  managerFilter?: string;
  customerFilter?: string;
  paymentFilter?: PaymentFilter;
  sortMode?: SortMode;
  myTurnOnly?: boolean;
  scope?: OrderListScope;
  stage?: ActiveOrderStage | null;
  cachedAt?: number;
};

const ALL = "__all__";
const filtersKey = (teamId: string) => `orders-production-page-filters:${teamId}`;

function readFilters(teamId: string | null | undefined): FiltersState | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(filtersKey(teamId)) ?? "null") as FiltersState | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const PAYMENT_FILTER_OPTIONS: { value: PaymentFilter; label: string }[] = [
  { value: "all", label: "Будь-яка оплата" },
  { value: "cashless", label: "Безготівка" },
  { value: "cash", label: "Готівка" },
  { value: "crypto", label: "Криптовалюта" },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "my-turn", label: "Спершу мій хід" },
  { value: "recent", label: "Спершу новіші" },
];

const paymentKind = (record: DerivedOrderRecord): PaymentFilter =>
  record.paymentMethodId === "crypto"
    ? "crypto"
    : isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)
      ? "cashless"
      : "cash";

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

export default function OrdersProductionPage() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { teamId, session, userId } = useAuth();
  const isNarrowViewport = useIsNarrowViewport();
  const { records, setRecords, loading, refreshing, error, reload } = useOrderRecords(teamId, userId);

  const restored = useMemo(() => {
    const stored = readFilters(teamId);
    return shouldRestorePageUiState(navigationType, stored?.cachedAt) ? stored : null;
  }, [teamId, navigationType]);
  const [search, setSearch] = useState(() => restored?.search ?? "");
  const [managerFilter, setManagerFilter] = useState(() => restored?.managerFilter ?? ALL);
  const [customerFilter, setCustomerFilter] = useState(() => restored?.customerFilter ?? ALL);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>(() => restored?.paymentFilter ?? "all");
  const [sortMode, setSortMode] = useState<SortMode>(() => restored?.sortMode ?? "my-turn");
  const [myTurnOnly, setMyTurnOnly] = useState(() => restored?.myTurnOnly ?? false);
  const [scope, setScope] = useState<OrderListScope>(() => restored?.scope ?? "active");
  const [stage, setStage] = useState<ActiveOrderStage | null>(() => restored?.stage ?? null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !teamId) return;
    try {
      sessionStorage.setItem(
        filtersKey(teamId),
        JSON.stringify({
          search,
          managerFilter,
          customerFilter,
          paymentFilter,
          sortMode,
          myTurnOnly,
          scope,
          stage,
          cachedAt: Date.now(),
        } satisfies FiltersState)
      );
    } catch {
      // Сховище недоступне — фільтри просто не переживуть перезавантаження.
    }
  }, [teamId, search, managerFilter, customerFilter, paymentFilter, sortMode, myTurnOnly, scope, stage]);

  // Лише справжні замовлення: затверджені прорахунки — на екрані черги.
  const orders = useMemo(() => records.filter((record) => record.source === "stored"), [records]);
  const queue = useMemo(() => {
    const pending = records.filter((record) => record.source !== "stored");
    const ready = pending.filter((record) => record.readinessColumn === "ready").length;
    return { ready, blocked: pending.length - ready };
  }, [records]);

  const views = useMemo<OrderListRowView[]>(
    () =>
      orders.map((record) => ({
        record,
        step: getOrderNextStep(record),
        paid: getOrderPaidShare(record),
        docs: getOrderDocMarks(record),
        mine: isMyTurn(record, userId),
      })),
    [orders, userId]
  );
  const summary = useMemo(() => summarizeOrderStages(orders), [orders]);
  const myTurnCount = useMemo(() => views.filter((view) => view.mine).length, [views]);

  const managerOptions = useMemo(
    () =>
      Array.from(
        new Map(
          orders
            .filter((record) => record.managerLabel.trim())
            .map((record) => [record.managerLabel.trim(), record.managerAvatarUrl ?? null] as const)
        ).entries()
      ).sort(([a], [b]) => a.localeCompare(b, "uk")),
    [orders]
  );
  const customerOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((record) => record.customerName.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "uk")
      ),
    [orders]
  );

  const filteredViews = useMemo(() => {
    const query = normalize(search);
    const list = views.filter(({ record, step, mine }) => {
      if (scope === "active" && (step.stage === "done" || step.stage === "cancelled")) return false;
      if (scope === "done" && step.stage !== "done") return false;
      if (stage && step.stage !== stage) return false;
      if (myTurnOnly && !mine) return false;
      if (managerFilter !== ALL && record.managerLabel.trim() !== managerFilter) return false;
      if (customerFilter !== ALL && record.customerName.trim() !== customerFilter) return false;
      if (paymentFilter !== "all" && paymentKind(record) !== paymentFilter) return false;
      if (!query) return true;
      return [record.quoteNumber, record.customerName, record.managerLabel, step.title, ...record.items.map((item) => item.name)]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
    const recency = (record: DerivedOrderRecord) => Date.parse(record.createdAt ?? "") || 0;
    return list.sort((a, b) =>
      sortMode === "my-turn" && a.mine !== b.mine ? (a.mine ? -1 : 1) : recency(b.record) - recency(a.record)
    );
  }, [views, search, scope, stage, myTurnOnly, managerFilter, customerFilter, paymentFilter, sortMode]);

  const selectedRecords = useMemo(() => orders.filter((record) => selectedIds.includes(record.id)), [orders, selectedIds]);
  const selectionBlocker = selectedRecords.length > 0 ? getSpecificationGroupBlocker(selectedRecords) : null;

  const openRecord = useCallback((record: DerivedOrderRecord) => navigate(`/orders/production/${record.id}`), [navigate]);

  const toggleSelect = (record: DerivedOrderRecord, checked: boolean) => {
    if (!checked) {
      setSelectedIds((current) => current.filter((id) => id !== record.id));
      return;
    }
    const next = selectedRecords.some((entry) => entry.id === record.id) ? selectedRecords : [...selectedRecords, record];
    const blocker = getSpecificationGroupBlocker(next);
    if (blocker) {
      toast.error(blocker);
      return;
    }
    setSelectedIds(next.map((entry) => entry.id));
  };

  const createGroupedSpecification = async () => {
    if (!teamId) return;
    try {
      const markedById = await openGroupedSpecification(teamId, selectedRecords);
      setRecords((current) =>
        current.map((record) => {
          const specificationCreatedAt = markedById.get(record.id);
          return specificationCreatedAt
            ? { ...record, specificationCreatedAt, docs: { ...record.docs, specification: true } }
            : record;
        })
      );
      setSelectedIds([]);
    } catch (specError: unknown) {
      toast.error(specError instanceof Error ? specError.message : "Не вдалося відкрити СП.");
    }
  };

  const changeScope = (next: OrderListScope) => {
    setScope(next);
    if (next !== "active") setStage(null);
  };
  const changeStage = (next: ActiveOrderStage | null) => {
    setStage(next);
    if (next) setScope("active");
  };

  const activeFilterCount =
    (managerFilter !== ALL ? 1 : 0) +
    (customerFilter !== ALL ? 1 : 0) +
    (paymentFilter !== "all" ? 1 : 0) +
    (myTurnOnly ? 1 : 0);

  // useMemo обов'язковий: без нього це новий вузол на кожен рендер, і шапка
  // сторінки перезаписується по колу (див. usePageHeaderActions).
  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        mobileCompact
        mobileFilterCount={activeFilterCount}
        mobilePrimary={
          <Button
            onClick={() => setCreateOrderOpen(true)}
            size="icon"
            aria-label="Створити замовлення"
            className="h-11 w-11 shrink-0"
          >
            <Plus className="h-5 w-5" />
          </Button>
        }
        topLeft={
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
              <Factory className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-lg font-semibold text-foreground">Замовлення</div>
          </div>
        }
        topRight={
          <Button onClick={() => setCreateOrderOpen(true)} className={cn(TOOLBAR_ACTION_BUTTON, "w-full gap-2 sm:w-auto")}>
            <Plus className="h-4 w-4" />
            Створити замовлення
          </Button>
        }
        search={
          <ToolbarSearch
            value={search}
            onChange={setSearch}
            placeholder="Номер, замовник, товар..."
            loading={(loading || refreshing) && Boolean(search)}
          />
        }
        filters={
          <>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={myTurnOnly}
              onClick={() => setMyTurnOnly((value) => !value)}
              className={cn("gap-2 rounded-full", myTurnOnly && "tone-info")}
            >
              Мій хід
              <span className="figure text-xs">{myTurnCount}</span>
            </Button>
            <ToolbarFilterSelect
              value={managerFilter}
              onValueChange={setManagerFilter}
              neutralValue={ALL}
              className="sm:w-[170px]"
              options={[
                { value: ALL, label: "Всі менеджери" },
                ...managerOptions.map(([label, avatarUrl]) => ({
                  value: label,
                  label: (
                    <span className="flex min-w-0 items-center gap-2">
                      <AvatarBase
                        src={avatarUrl}
                        name={label}
                        fallback={label.slice(0, 1)}
                        size={18}
                        className="shrink-0 border-border/60"
                        fallbackClassName="text-3xs font-semibold"
                      />
                      <span className="truncate">{label}</span>
                    </span>
                  ),
                })),
              ]}
            />
            <ToolbarFilterSelect
              value={customerFilter}
              onValueChange={setCustomerFilter}
              neutralValue={ALL}
              className="sm:w-[170px]"
              options={[{ value: ALL, label: "Всі замовники" }, ...customerOptions.map((name) => ({ value: name, label: name }))]}
            />
            <ToolbarFilterSelect
              value={paymentFilter}
              onValueChange={(value) => setPaymentFilter(value as PaymentFilter)}
              neutralValue="all"
              className="sm:w-[160px]"
              options={PAYMENT_FILTER_OPTIONS}
            />
            <ToolbarFilterSelect
              value={sortMode}
              onValueChange={(value) => setSortMode(value as SortMode)}
              neutralValue="my-turn"
              className="sm:w-[160px]"
              options={SORT_OPTIONS}
            />
          </>
        }
        meta={<ToolbarMeta count={filteredViews.length} countLabel="знайдено" />}
      />
    ),
    [
      activeFilterCount,
      customerFilter,
      customerOptions,
      filteredViews.length,
      loading,
      managerFilter,
      managerOptions,
      myTurnCount,
      myTurnOnly,
      paymentFilter,
      refreshing,
      search,
      sortMode,
    ]
  );

  usePageHeaderActions(headerActions, [headerActions]);

  // Гейта на auth loading тут немає свідомо: поки він true, RequireAuth малює
  // оболонку застосунку, і жодна сторінка не монтується (REQ-19).
  if (!session) return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Немає доступної команди. Перевір членство або інвайт.</div>;
  }

  const firstSelected = selectedRecords[0];

  return (
    <PageCanvas>
      <PageCanvasBody className="space-y-4 py-3 pb-24 md:pb-6">
        <div className="px-5 max-md:px-4">
          <OrderStageStrip
            summary={summary}
            totalCount={orders.length}
            scope={scope}
            onScopeChange={changeScope}
            stage={stage}
            onStageChange={changeStage}
            queue={queue}
          />
        </div>

        {loading ? (
          <AppSectionLoader label="Готуємо список замовлень..." variant="table" />
        ) : error ? (
          <div className="px-5">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          </div>
        ) : filteredViews.length === 0 ? (
          <div className="px-5 max-md:px-4">
            <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
              {myTurnOnly ? "Зараз хід не за тобою." : "Немає замовлень за цими фільтрами."}
            </div>
          </div>
        ) : isNarrowViewport ? (
          <div className={cn(MOBILE_PAGE_BODY, MOBILE_CARD_LIST, "pb-3")}>
            <MobileStatusChips
              chips={[
                { key: "all", label: "Всі", count: summary.activeCount },
                ...ACTIVE_ORDER_STAGES.map((item) => ({
                  key: item.id,
                  label: item.label,
                  count: summary.byStage[item.id].count,
                })),
              ]}
              activeKey={stage ?? "all"}
              onSelect={(key) => changeStage(key === "all" ? null : (key as ActiveOrderStage))}
              className={MOBILE_CHIPS_ROW}
            />
            {filteredViews.map((view) => (
              <OrderListMobileCard key={view.record.id} view={view} onOpen={openRecord} />
            ))}
          </div>
        ) : (
          // overflow-x-auto не ставимо: він гасить липку шапку таблиці.
          <Table variant="list" size="sm" stickyHeader className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[52px] pl-6" aria-label="Обрати для СП" />
                <TableHead className="w-[140px]">Номер</TableHead>
                <TableHead className="w-auto">Замовник · що замовили</TableHead>
                <TableHead className="w-[112px] text-right">Сума</TableHead>
                <TableHead className="w-[132px]">Оплата</TableHead>
                <TableHead className="w-[116px]">Документи</TableHead>
                <TableHead className="w-[300px]">Що далі · чий хід</TableHead>
                <TableHead className="w-[56px] pr-6" aria-label="Менеджер" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredViews.map((view) => (
                <OrderListTableRow
                  key={view.record.id}
                  view={view}
                  onOpen={openRecord}
                  selected={selectedIds.includes(view.record.id)}
                  selectBlocker={getSpecificationRecordBlocker(view.record)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </PageCanvasBody>

      {firstSelected ? (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 max-md:bottom-20">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-popover px-4 py-2.5 shadow-lg">
            <span className="text-sm text-foreground">
              {selectedRecords.length} обрано · {firstSelected.customerName}
            </span>
            <Button
              size="sm"
              onClick={() => void createGroupedSpecification()}
              disabled={Boolean(selectionBlocker)}
              // Системний title навмисно: вимкнена кнопка не отримує подій миші (REQ-175#p6).
              title={selectionBlocker ?? undefined}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Одна СП на обрані
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
              Скасувати
            </Button>
          </div>
        </div>
      ) : null}

      <CreateManualOrderDialog
        open={createOrderOpen}
        onOpenChange={setCreateOrderOpen}
        onCreated={({ id }) => {
          void reload();
          navigate(`/orders/production/${id}`);
        }}
      />
    </PageCanvas>
  );
}

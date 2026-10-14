import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { AvatarBase } from "@/components/app/avatar-kit";
import { usePageHeaderActions } from "@/components/app/usePageHeaderActions";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { ToolbarMeta, ToolbarSearch } from "@/components/app/headers/toolbarPrimitives";
import { PageCanvas, PageCanvasBody } from "@/components/canvas/PageCanvas";
import { ArrowLeft, Check } from "@/components/icons/appIcons";
import { MobileStatusChips } from "@/components/kanban";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CustomerWithItems, summarizeOrderItems } from "@/features/orders/order-list/OrderListRows";
import { useOrderRecords } from "@/features/orders/order-list/useOrderRecords";
import { formatOrderMoney, type DerivedOrderRecord } from "@/features/orders/orderRecords";
import { isCashlessPaymentMethod } from "@/features/orders/paymentRules";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { MOBILE_CARD_LIST, MOBILE_CHIPS_ROW, MOBILE_PAGE_BODY } from "@/layout/mobileRhythm";
import { ROUTES } from "@/layout/routes";
import { cn } from "@/lib/utils";

/**
 * Черга з прорахунків (REQ-322#p12, макет ListQueue): затверджені прорахунки, з
 * яких ще не зроблено замовлення. Раніше вони змішувались зі справжніми
 * замовленнями в одному списку. Тут у рядку видно, чого бракує, а кнопка веде
 * туди, де робиться саме цей крок.
 */
type QueueTab = "ready" | "counterparty" | "design" | "all";

const TABS: { id: QueueTab; label: string }[] = [
  { id: "ready", label: "Можна оформлювати" },
  { id: "counterparty", label: "Бракує даних" },
  { id: "design", label: "Чекає дизайн" },
  { id: "all", label: "Усі" },
];

/** Короткі назви кроків готовності (повні — у buildDerivedReadinessSteps). */
const SHORT_LABELS: [marker: string, short: string][] = [
  ["Прорахунок затверджено", ""],
  ["Ліда переведено", "Замовник"],
  ["email та мобільний", "Контакти"],
  ["реквізити", "Реквізити"],
  ["ПІБ підписанта", "Підписант"],
  ["ІПН", "ІПН"],
  ["мобільний номер", "Телефон"],
  ["позиції", "Позиції"],
  ["тираж", "Тираж"],
  ["Візуал", "Візуал"],
  ["Макет", "Макет"],
];

const shortLabel = (label: string) => SHORT_LABELS.find(([marker]) => label.includes(marker))?.[1] ?? label;

const initials = (value: string) => value.trim().slice(0, 1).toUpperCase() || "?";

const paymentChip = (record: DerivedOrderRecord) =>
  record.paymentMethodId === "crypto"
    ? "крипта"
    : isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)
      ? "безготівка"
      : "готівка";

function RequirementChips({ record }: { record: DerivedOrderRecord }) {
  const steps = record.readinessSteps
    .map((step) => ({ ...step, short: shortLabel(step.label) }))
    .filter((step) => step.short);
  // Не за способом оплати: лід без картки замовника ще може потребувати реквізитів (REQ-322#p4).
  const needsRequisites = steps.some((step) => step.short === "Реквізити");
  const missing = steps.filter((step) => !step.done);
  const done = steps.filter((step) => step.done);
  // Коли чогось бракує, виконане згортаємо в один чип: рядок пояснює саме нестачу.
  const doneChips =
    missing.length > 0 && done.length > 1
      ? [{ key: "done", text: `${done.length} готово`, title: done.map((step) => step.label).join("\n") }]
      : done.map((step) => ({ key: step.label, text: step.short, title: step.label }));
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {missing.map((step) => (
        <span
          key={step.label}
          title={step.label}
          className="tone-warning inline-flex h-[22px] items-center rounded-md border px-1.5 text-xs font-semibold"
        >
          {step.short}
        </span>
      ))}
      {doneChips.map((chip) => (
        <span
          key={chip.key}
          title={chip.title}
          className="tone-success-subtle tone-text-success inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-xs"
        >
          <Check className="h-3 w-3" aria-hidden />
          {chip.text}
        </span>
      ))}
      {!needsRequisites ? (
        <span className="inline-flex h-[22px] items-center text-xs text-muted-foreground">
          реквізити й договір не потрібні
        </span>
      ) : null}
    </div>
  );
}

const queueAction = (record: DerivedOrderRecord): { label: string; to: string } => {
  const quote = `/orders/estimates/${record.quoteId}`;
  if (record.readinessColumn === "ready") return { label: "Створити замовлення", to: quote };
  if (record.readinessColumn === "counterparty") return { label: "Доповнити дані", to: quote };
  return record.designTaskId
    ? { label: "Відкрити дизайн", to: `/design/${record.designTaskId}` }
    : { label: "Відкрити прорахунок", to: quote };
};

export default function OrdersQueuePage() {
  const navigate = useNavigate();
  const { teamId, session, userId } = useAuth();
  const isNarrowViewport = useIsNarrowViewport();
  const { records, loading, refreshing, error } = useOrderRecords(teamId, userId);
  const [tab, setTab] = useState<QueueTab>("ready");
  const [search, setSearch] = useState("");

  const pending = useMemo(() => records.filter((record) => record.source !== "stored"), [records]);
  const counts = useMemo(
    () => ({
      ready: pending.filter((record) => record.readinessColumn === "ready").length,
      counterparty: pending.filter((record) => record.readinessColumn === "counterparty").length,
      design: pending.filter((record) => record.readinessColumn === "design").length,
      all: pending.length,
    }),
    [pending]
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pending.filter((record) => {
      if (tab !== "all" && record.readinessColumn !== tab) return false;
      if (!query) return true;
      return [record.quoteNumber, record.customerName, ...record.items.map((item) => item.name)]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [pending, tab, search]);

  const headerActions = useMemo(
    () => (
      <UnifiedPageToolbar
        mobileCompact
        topLeft={
          <div className="min-w-0">
            <Link
              to={ROUTES.ordersProduction}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Замовлення
            </Link>
            <div className="text-lg font-semibold text-foreground">Черга з прорахунків</div>
            <div className="text-sm text-muted-foreground">Затверджені прорахунки, з яких ще не зроблено замовлення</div>
          </div>
        }
        search={
          <ToolbarSearch
            value={search}
            onChange={setSearch}
            placeholder="Номер, замовник, товар..."
            loading={(loading || refreshing) && Boolean(search)}
          />
        }
        meta={<ToolbarMeta count={visible.length} countLabel="знайдено" />}
      />
    ),
    [loading, refreshing, search, visible.length]
  );
  usePageHeaderActions(headerActions, [headerActions]);

  if (!session) return <div className="p-6 text-sm text-destructive">User not authenticated</div>;
  if (!teamId) {
    return <div className="p-6 text-sm text-muted-foreground">Немає доступної команди. Перевір членство або інвайт.</div>;
  }

  const open = (record: DerivedOrderRecord) => navigate(queueAction(record).to);

  return (
    <PageCanvas>
      <PageCanvasBody className="space-y-3 py-3 pb-20 md:pb-6">
        {isNarrowViewport ? null : (
          <div className="flex gap-1 border-b border-border/60 px-5" role="tablist" aria-label="Стан прорахунків">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "-mb-px inline-flex items-baseline gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-sm font-medium transition-colors",
                  tab === item.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
                <span className="figure text-xs text-muted-foreground">{counts[item.id]}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <AppSectionLoader label="Збираємо чергу..." variant="table" />
        ) : error ? (
          <div className="px-5">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          </div>
        ) : isNarrowViewport ? (
          <div className={cn(MOBILE_PAGE_BODY, MOBILE_CARD_LIST, "pb-3")}>
            <MobileStatusChips
              chips={TABS.map((item) => ({ key: item.id, label: item.label, count: counts[item.id] }))}
              activeKey={tab}
              onSelect={(key) => setTab(key as QueueTab)}
              className={MOBILE_CHIPS_ROW}
            />
            {visible.map((record) => {
              const items = summarizeOrderItems(record);
              const action = queueAction(record);
              return (
                <div key={record.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{record.customerName}</div>
                      <div className="font-mono text-2xs text-muted-foreground">{record.quoteNumber}</div>
                    </div>
                    <div className="figure shrink-0 text-sm font-semibold">{formatOrderMoney(record.total, record.currency)}</div>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {items.name}
                    {items.qty ? ` · ${items.qty}` : ""} · {paymentChip(record)}
                  </div>
                  <RequirementChips record={record} />
                  <Button size="sm" variant={record.readinessColumn === "ready" ? "primary" : "outline"} onClick={() => open(record)}>
                    {action.label}
                  </Button>
                </div>
              );
            })}
            {visible.length === 0 ? <QueueEmpty tab={tab} /> : null}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-5">
            <QueueEmpty tab={tab} />
          </div>
        ) : (
          <Table variant="list" size="sm" stickyHeader className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px] pl-6">Прорахунок</TableHead>
                <TableHead className="w-auto">Замовник · що</TableHead>
                <TableHead className="w-[112px] text-right">Сума</TableHead>
                <TableHead className="w-[104px]">Оплата</TableHead>
                <TableHead className="w-[320px]">Що треба для замовлення</TableHead>
                <TableHead className="w-[176px]" aria-label="Дія" />
                <TableHead className="w-[52px] pr-6" aria-label="Менеджер" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((record) => {
                const action = queueAction(record);
                return (
                  <TableRow key={record.id} className="cursor-pointer hover:bg-muted/10" onClick={() => open(record)}>
                    <TableCell className="pl-6 font-mono text-sm font-semibold">{record.quoteNumber}</TableCell>
                    <TableCell>
                      <CustomerWithItems record={record} />
                    </TableCell>
                    <TableCell className="figure text-right font-semibold">
                      {formatOrderMoney(record.total, record.currency)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-2xs font-semibold text-muted-foreground">
                        {paymentChip(record)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <RequirementChips record={record} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="xs"
                        variant={record.readinessColumn === "ready" ? "primary" : "outline"}
                        onClick={(event) => {
                          event.stopPropagation();
                          open(record);
                        }}
                      >
                        {action.label}
                      </Button>
                    </TableCell>
                    <TableCell className="pr-6">
                      <AvatarBase
                        src={record.managerAvatarUrl ?? null}
                        name={record.managerLabel}
                        fallback={initials(record.managerLabel)}
                        size={22}
                        className="shrink-0 border-border/60"
                        fallbackClassName="text-3xs font-semibold"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </PageCanvasBody>
    </PageCanvas>
  );
}

function QueueEmpty({ tab }: { tab: QueueTab }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
      {tab === "ready" ? "Немає прорахунків, з яких можна одразу зробити замовлення." : "Тут порожньо."}
    </div>
  );
}

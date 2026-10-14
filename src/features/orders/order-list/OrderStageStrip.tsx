import { Link } from "react-router-dom";

import { ArrowRight } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { SegmentedGroup } from "@/components/ui/segmented-group";
import { ACTIVE_ORDER_STAGES, type ActiveOrderStage, type OrderStageSummary } from "@/features/orders/orderListStages";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { ROUTES } from "@/layout/routes";
import { cn } from "@/lib/utils";

export type OrderListScope = "active" | "done" | "all";

/** Кольори етапів: ті самі токени, що в смугах «Стеку» й прорахунку. */
export const ORDER_STAGE_COLORS: Record<ActiveOrderStage, string> = {
  setup: "bg-chart-1",
  customer: "bg-chart-4",
  production: "bg-chart-3",
  shipment: "bg-chart-2",
  awaitingPayment: "bg-chart-5",
};

const money = (value: number) => formatOrderMoney(value, "UAH");

/**
 * Смуга етапів над списком (макет ListFinal, REQ-322#p12): «У роботі», сума за
 * етапами, клік по етапу фільтрує таблицю. Праворуч — плитка черги з
 * прорахунків, яка тепер окремим екраном.
 */
export function OrderStageStrip({
  summary,
  totalCount,
  scope,
  onScopeChange,
  stage,
  onStageChange,
  queue,
}: {
  summary: OrderStageSummary;
  totalCount: number;
  scope: OrderListScope;
  onScopeChange: (scope: OrderListScope) => void;
  stage: ActiveOrderStage | null;
  onStageChange: (stage: ActiveOrderStage | null) => void;
  queue: { ready: number; blocked: number };
}) {
  const visible = ACTIVE_ORDER_STAGES.filter((item) => summary.byStage[item.id].total > 0);
  const scopes: { id: OrderListScope; label: string; count: number }[] = [
    { id: "active", label: "Активні", count: summary.activeCount },
    { id: "done", label: "Завершені", count: summary.doneCount },
    { id: "all", label: "Усі", count: totalCount },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section className="rounded-xl border border-border/60 bg-card p-4" aria-label="Етапи замовлень">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">У роботі</div>
            <div className="figure mt-1 text-2xl font-semibold leading-none text-foreground sm:text-[28px]">
              {money(summary.activeTotal)}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {summary.activeCount} замовлень · отримано {money(summary.receivedTotal)}
            </div>
          </div>
          <SegmentedGroup className={SEGMENTED_GROUP}>
            {scopes.map((item) => (
              <Button
                key={item.id}
                variant="segmented"
                size="xs"
                aria-pressed={scope === item.id}
                onClick={() => onScopeChange(item.id)}
                className={cn(SEGMENTED_TRIGGER, "gap-1.5")}
              >
                {item.label}
                <span className="figure text-muted-foreground">{item.count}</span>
              </Button>
            ))}
          </SegmentedGroup>
        </div>

        {visible.length > 0 ? (
          <div className="mt-4 flex h-2.5 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
            {visible.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-[2px] transition-opacity",
                  ORDER_STAGE_COLORS[item.id],
                  stage && stage !== item.id && "opacity-30"
                )}
                style={{ flexGrow: summary.byStage[item.id].total, flexBasis: 0, minWidth: 6 }}
              />
            ))}
          </div>
        ) : null}

        {/* На телефоні етапи — чипами над списком, тут вони лише дублювали б їх. */}
        <div className="mt-3 grid grid-cols-3 gap-1 max-md:hidden xl:grid-cols-5">
          {ACTIVE_ORDER_STAGES.map((item) => {
            const data = summary.byStage[item.id];
            const active = stage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => onStageChange(active ? null : item.id)}
                className={cn(
                  "flex min-w-0 flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                  active ? "border-border bg-muted/50" : "border-transparent hover:bg-muted/40"
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-[3px]", ORDER_STAGE_COLORS[item.id])} aria-hidden />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="figure flex items-baseline gap-1.5 text-sm">
                  <span className="font-semibold text-foreground">{data.count}</span>
                  <span className="truncate text-xs text-muted-foreground">{money(data.total)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Link
        to={ROUTES.ordersQueue}
        className="group flex flex-col justify-between gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:bg-muted/30 max-md:gap-1.5 max-md:p-3"
      >
        <div>
          <div className="text-sm font-semibold text-foreground">Черга з прорахунків</div>
          <div className="mt-1 text-sm text-foreground">
            <span className="figure font-semibold">{queue.ready}</span> затверджені — можна оформлювати
          </div>
          {queue.blocked > 0 ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              ще {queue.blocked} чекають реквізити або дизайн
            </div>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          Відкрити чергу
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </div>
  );
}

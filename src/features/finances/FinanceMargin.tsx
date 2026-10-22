import * as React from "react";
import { toast } from "sonner";
import { TrendingUp } from "@/components/icons/appIcons";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import {
  useFinanceDerivedOrderInfo,
  useFinanceExpenses,
  useFinanceInvoices,
  useFinanceOrderMeta,
  useFinancePaidPurchaseCosts,
  useFinancePayments,
} from "./queries";
import {
  ORDER_TYPE_LABELS,
  type FinanceExpense,
  type FinanceInvoice,
  type FinanceOrderMeta,
  type FinancePayment,
  type PaidPurchaseCost,
} from "./types";
import { buildFinanceMarginRows, type MarginOrderInfo } from "./financeMarginRows";
import { Badge } from "@/components/ui/badge";
import { FinanceSkeleton } from "./FinanceSkeleton";

type FinanceMarginProps = {
  teamId: string | null;
  userId: string | null;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const uah = (value: number) => formatOrderMoney(value, "UAH");

const EMPTY_PAYMENTS: FinancePayment[] = [];
const EMPTY_INVOICES: FinanceInvoice[] = [];
const EMPTY_EXPENSES: FinanceExpense[] = [];
const EMPTY_ORDER_META = new Map<string, FinanceOrderMeta>();
const EMPTY_PURCHASE_COSTS: PaidPurchaseCost[] = [];
const EMPTY_ORDERS = new Map<string, MarginOrderInfo>();

export function FinanceMargin({ teamId, userId }: FinanceMarginProps) {
  // Спільні finance-хуки (див. queries.ts): рендер з кешу між вкладками;
  // мапа замовлень — той самий ключ, що в дашборда (один мережевий виклик).
  const paymentsQuery = useFinancePayments(teamId);
  const invoicesQuery = useFinanceInvoices(teamId);
  const expensesQuery = useFinanceExpenses(teamId);
  const orderMetaQuery = useFinanceOrderMeta(teamId);
  const ordersQuery = useFinanceDerivedOrderInfo(teamId, userId ?? null);
  // Закупки під замовлення: збій читання (таблиці ще нема) не блокує маржу — тоді їх просто нема.
  const purchaseCostsQuery = useFinancePaidPurchaseCosts(teamId);

  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const invoices = invoicesQuery.data ?? EMPTY_INVOICES;
  const expenses = expensesQuery.data ?? EMPTY_EXPENSES;
  const orderMeta = orderMetaQuery.data ?? EMPTY_ORDER_META;
  const purchaseCosts = purchaseCostsQuery.data ?? EMPTY_PURCHASE_COSTS;
  const ordersByQuote: Map<string, MarginOrderInfo> = ordersQuery.data ?? EMPTY_ORDERS;
  const loading =
    paymentsQuery.isPending ||
    invoicesQuery.isPending ||
    expensesQuery.isPending ||
    orderMetaQuery.isPending ||
    // Без закупок маржа спершу показалася б завищеною, а потім «просіла».
    purchaseCostsQuery.isPending;

  const loadError =
    paymentsQuery.error ?? invoicesQuery.error ?? expensesQuery.error ?? orderMetaQuery.error ?? null;
  React.useEffect(() => {
    if (loadError) {
      toast.error("Не вдалося завантажити маржу", { description: getErrorMessage(loadError, "") });
    }
  }, [loadError]);

  const rows = React.useMemo(
    () =>
      buildFinanceMarginRows({ invoices, payments, expenses, purchaseCosts, ordersByQuote, orderMeta }),
    [invoices, payments, expenses, purchaseCosts, ordersByQuote, orderMeta]
  );

  const totals = React.useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.received += row.received;
        acc.expenses += row.expenses;
        acc.margin += row.margin;
        return acc;
      },
      { received: 0, expenses: 0, margin: 0 }
    );
  }, [rows]);

  if (loading) {
    return (
      <FinanceSkeleton variant="stats" />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Отримано (факт)" value={uah(totals.received)} />
        <Stat label="Витрати на замовлення" value={uah(totals.expenses)} />
        <Stat label="Маржа (факт)" value={uah(totals.margin)} tone={totals.margin < 0 ? "danger" : "success"} />
      </div>

      <p className="text-xs text-muted-foreground">
        Фактична маржа = отримано − витрати (оплачені закупки замовлення з ПДВ + розподілені витрати), по кожному
        замовленню. Закупка, оплачена з Фінансів як витрата, рахується один раз. Планова маржа (з прорахунку)
        з'явиться згодом. Сортування — від найгіршої маржі.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Ще немає даних. Маржа з'явиться, коли будуть оплати й витрати по замовленнях.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60">
          <div className="hidden grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] gap-2 border-b border-border/60 bg-muted/20 px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Замовлення</span>
            <span className="text-right">Виставлено</span>
            <span className="text-right">Отримано</span>
            <span className="text-right">Витрати</span>
            <span className="text-right">Маржа по оплатах</span>
          </div>
          <div className="divide-y divide-border/50">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-2 gap-x-2 gap-y-1 px-4 py-3 sm:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] sm:items-center"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{row.number}</span>
                    {row.orderType ? (
                      <Badge variant="outline" className="text-3xs text-muted-foreground">
                        {ORDER_TYPE_LABELS[row.orderType]}
                      </Badge>
                    ) : null}
                  </div>
                  <span className="block truncate text-xs text-muted-foreground">{row.customerName}</span>
                </div>
                <Cell label="Виставлено" value={uah(row.invoiced)} />
                <Cell label="Отримано" value={uah(row.received)} />
                <Cell label="Витрати" value={uah(row.expenses)} />
                <Cell
                  label="Маржа по оплатах"
                  value={uah(row.margin)}
                  className={cn("font-semibold", row.margin < 0 ? "text-destructive" : "text-foreground")}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 bg-card p-4",
        tone === "danger" && "border-destructive/40 bg-destructive/5",
        tone === "success" && "flag-success"
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="figure mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Cell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between sm:block sm:text-right">
      <span className="text-xs text-muted-foreground sm:hidden">{label}</span>
      <span className={cn("text-sm text-foreground", className)}>{value}</span>
    </div>
  );
}

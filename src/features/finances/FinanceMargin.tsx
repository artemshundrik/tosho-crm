import * as React from "react";
import { toast } from "sonner";
import { Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatOrderMoney, loadDerivedOrders } from "@/features/orders/orderRecords";
import { listExpenses, listInvoices, listOrderMeta, listPayments } from "./api";
import {
  invoiceIsReceivable,
  ORDER_TYPE_LABELS,
  paymentUahValue,
  type FinanceExpense,
  type FinanceInvoice,
  type FinanceOrderMeta,
  type FinancePayment,
  type OrderType,
} from "./types";
import { Badge } from "@/components/ui/badge";

type FinanceMarginProps = {
  teamId: string | null;
  userId: string | null;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const uah = (value: number) => formatOrderMoney(value, "UAH");

type OrderInfo = { number: string; customerName: string; total: number; currency: string };

type MarginRow = {
  quoteId: string;
  number: string;
  customerName: string;
  orderType: OrderType | null;
  invoiced: number;
  received: number;
  expenses: number;
  margin: number; // received − expenses (factual)
};

export function FinanceMargin({ teamId, userId }: FinanceMarginProps) {
  const [payments, setPayments] = React.useState<FinancePayment[]>([]);
  const [invoices, setInvoices] = React.useState<FinanceInvoice[]>([]);
  const [expenses, setExpenses] = React.useState<FinanceExpense[]>([]);
  const [orderMeta, setOrderMeta] = React.useState<Map<string, FinanceOrderMeta>>(new Map());
  const [ordersByQuote, setOrdersByQuote] = React.useState<Map<string, OrderInfo>>(new Map());
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!teamId) return;
    let active = true;
    setLoading(true);
    void Promise.all([listPayments(teamId), listInvoices(teamId), listExpenses(teamId), listOrderMeta(teamId)])
      .then(([p, inv, exp, meta]) => {
        if (!active) return;
        setPayments(p);
        setInvoices(inv);
        setExpenses(exp);
        setOrderMeta(meta);
      })
      .catch((error) => {
        if (active) toast.error("Не вдалося завантажити маржу", { description: getErrorMessage(error, "") });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [teamId]);

  React.useEffect(() => {
    if (!teamId) return;
    let active = true;
    void loadDerivedOrders(teamId, userId)
      .then((records) => {
        if (!active) return;
        setOrdersByQuote(
          new Map(
            records.map((r) => [
              r.quoteId,
              { number: r.quoteNumber, customerName: r.customerName, total: r.total, currency: r.currency },
            ])
          )
        );
      })
      .catch(() => {
        /* names fall back to quote id */
      });
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  const rows = React.useMemo<MarginRow[]>(() => {
    const byQuote = new Map<string, MarginRow>();
    const ensure = (quoteId: string): MarginRow => {
      let row = byQuote.get(quoteId);
      if (!row) {
        const order = ordersByQuote.get(quoteId);
        row = {
          quoteId,
          number: order?.number ?? quoteId.slice(0, 8),
          customerName: order?.customerName ?? "Замовлення",
          orderType: orderMeta.get(quoteId)?.orderType ?? null,
          invoiced: 0,
          received: 0,
          expenses: 0,
          margin: 0,
        };
        byQuote.set(quoteId, row);
      }
      return row;
    };

    for (const inv of invoices) {
      if (!inv.quoteId || !invoiceIsReceivable(inv.status)) continue;
      ensure(inv.quoteId).invoiced += inv.amount;
    }
    for (const p of payments) {
      ensure(p.quoteId).received += paymentUahValue(p);
    }
    for (const exp of expenses) {
      for (const alloc of exp.allocations) {
        ensure(alloc.quoteId).expenses += alloc.amount;
      }
    }
    for (const row of byQuote.values()) {
      row.margin = row.received - row.expenses;
    }

    return Array.from(byQuote.values()).sort((a, b) => a.margin - b.margin); // worst margin first
  }, [invoices, payments, expenses, orderMeta, ordersByQuote]);

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
      <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
      </div>
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
        Фактична маржа = отримано − розподілені витрати, по кожному замовленню. Планова маржа (з прорахунку) з'явиться
        згодом. Сортування — від найгіршої маржі.
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
          <div className="hidden grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] gap-2 border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Замовлення</span>
            <span className="text-right">Виставлено</span>
            <span className="text-right">Отримано</span>
            <span className="text-right">Витрати</span>
            <span className="text-right">Маржа</span>
          </div>
          <div className="divide-y divide-border/50">
            {rows.map((row) => (
              <div
                key={row.quoteId}
                className="grid grid-cols-2 gap-x-2 gap-y-1 px-4 py-3 sm:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] sm:items-center"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{row.number}</span>
                    {row.orderType ? (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
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
                  label="Маржа"
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
        "rounded-2xl border border-border/60 bg-card p-4",
        tone === "danger" && "border-destructive/40 bg-destructive/5",
        tone === "success" && "border-success/40 bg-success/5"
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

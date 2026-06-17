import * as React from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, Loader2, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import { listInvoices, listLegalEntities, listOrdersForFinance, listPayments } from "./api";
import {
  invoiceIsReceivable,
  formatLegalEntityLabel,
  paymentUahValue,
  type FinanceInvoice,
  type FinanceLegalEntity,
  type FinanceOrderRef,
  type FinancePayment,
} from "./types";
import {
  buildReconciliationHtml,
  downloadHtmlAsExcel,
  escapeHtml,
  fmtDate,
  fmtMoney,
  openPrintableDocument,
  type ReconOperation,
} from "./documentHtml";

type FinanceReconciliationProps = { teamId: string | null; userId: string | null };

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export function FinanceReconciliation({ teamId, userId }: FinanceReconciliationProps) {
  const [orders, setOrders] = React.useState<FinanceOrderRef[]>([]);
  const [invoices, setInvoices] = React.useState<FinanceInvoice[]>([]);
  const [payments, setPayments] = React.useState<FinancePayment[]>([]);
  const [entities, setEntities] = React.useState<FinanceLegalEntity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [customerKey, setCustomerKey] = React.useState("");
  const [sellerId, setSellerId] = React.useState("");

  React.useEffect(() => {
    if (!teamId) return;
    let active = true;
    setLoading(true);
    void Promise.all([
      listOrdersForFinance(teamId, userId),
      listInvoices(teamId),
      listPayments(teamId),
      listLegalEntities(teamId),
    ])
      .then(([o, inv, p, ent]) => {
        if (!active) return;
        setOrders(o);
        setInvoices(inv);
        setPayments(p);
        setEntities(ent);
        if (ent[0]) setSellerId((prev) => prev || ent[0].id);
      })
      .catch((error) => active && toast.error("Не вдалося завантажити дані", { description: getErrorMessage(error, "") }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [teamId, userId]);

  // Customers derived from orders (key = customerId or name fallback).
  const customers = React.useMemo(() => {
    const map = new Map<string, { key: string; name: string; quoteIds: Set<string> }>();
    for (const o of orders) {
      const key = o.customerId ?? `name:${o.customerName}`;
      const existing = map.get(key) ?? { key, name: o.customerName, quoteIds: new Set<string>() };
      existing.quoteIds.add(o.quoteId);
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "uk"));
  }, [orders]);

  const selected = customers.find((c) => c.key === customerKey) ?? null;
  const seller = entities.find((e) => e.id === sellerId) ?? null;

  const operations = React.useMemo<ReconOperation[]>(() => {
    if (!selected) return [];
    const ops: ReconOperation[] = [];
    for (const inv of invoices) {
      if (!inv.quoteId || !selected.quoteIds.has(inv.quoteId) || !invoiceIsReceivable(inv.status)) continue;
      ops.push({
        date: inv.issueDate ?? inv.createdAt?.slice(0, 10) ?? "",
        doc: `Рахунок №${inv.number ?? "—"}`,
        charged: inv.amount,
        paid: 0,
      });
    }
    for (const p of payments) {
      if (!selected.quoteIds.has(p.quoteId)) continue;
      ops.push({
        date: p.paidAt,
        doc: "Оплата",
        charged: 0,
        paid: paymentUahValue(p),
      });
    }
    return ops.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }, [selected, invoices, payments]);

  const totalCharged = operations.reduce((s, o) => s + o.charged, 0);
  const totalPaid = operations.reduce((s, o) => s + o.paid, 0);
  const closingBalance = totalCharged - totalPaid;

  const sellerName = seller ? formatLegalEntityLabel(seller) : "Постачальник";
  const periodLabel = "весь період";

  const generatePdf = () => {
    if (!selected) {
      toast.error("Оберіть замовника.");
      return;
    }
    const html = buildReconciliationHtml({
      sellerName,
      buyerName: selected.name,
      periodLabel,
      operations,
      openingBalance: 0,
      closingBalance,
    });
    if (!openPrintableDocument(html)) toast.error("Браузер заблокував нове вікно.");
  };

  const generateExcel = () => {
    if (!selected) {
      toast.error("Оберіть замовника.");
      return;
    }
    const rows = operations
      .map(
        (op) =>
          `<tr><td>${escapeHtml(fmtDate(op.date))}</td><td>${escapeHtml(op.doc)}</td><td>${
            op.charged || ""
          }</td><td>${op.paid || ""}</td></tr>`
      )
      .join("");
    const table = `<table border="1">
      <tr><th colspan="4">Акт звірки — ${escapeHtml(selected.name)} / ${escapeHtml(sellerName)}</th></tr>
      <tr><th>Дата</th><th>Документ</th><th>Нараховано</th><th>Оплачено</th></tr>
      ${rows}
      <tr><th colspan="2">Разом</th><th>${totalCharged}</th><th>${totalPaid}</th></tr>
      <tr><th colspan="3">Сальдо на кінець</th><th>${closingBalance}</th></tr>
    </table>`;
    downloadHtmlAsExcel(`Акт_звірки_${selected.name}`, table);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Завантаження…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Акт звірки з даних: рахунки − оплати = сальдо. Оберіть замовника й сформуйте PDF або Excel.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Замовник</Label>
          <Select value={customerKey} onValueChange={setCustomerKey}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Оберіть замовника" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Наша юрособа</Label>
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Оберіть" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {formatLegalEntityLabel(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selected ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Нараховано" value={formatOrderMoney(totalCharged, "UAH")} />
            <Stat label="Оплачено" value={formatOrderMoney(totalPaid, "UAH")} />
            <Stat
              label="Сальдо"
              value={formatOrderMoney(closingBalance, "UAH")}
              tone={closingBalance > 0 ? "warning" : closingBalance < 0 ? "info" : undefined}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-8 gap-1.5" onClick={generatePdf} disabled={operations.length === 0}>
              <FileDown className="h-4 w-4" /> Сформувати PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={generateExcel}
              disabled={operations.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
          </div>

          {operations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
              Немає операцій по цьому замовнику.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <div className="grid grid-cols-4 gap-2 border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Дата</span>
                <span>Документ</span>
                <span className="text-right">Нараховано</span>
                <span className="text-right">Оплачено</span>
              </div>
              <div className="divide-y divide-border/50">
                {operations.map((op, i) => (
                  <div key={i} className="grid grid-cols-4 gap-2 px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">{fmtDate(op.date)}</span>
                    <span>{op.doc}</span>
                    <span className="text-right">{op.charged ? fmtMoney(op.charged) : ""}</span>
                    <span className="text-right">{op.paid ? fmtMoney(op.paid) : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background">
            <ScrollText className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Оберіть замовника, щоб сформувати акт звірки.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" | "info" }) {
  return (
    <div
      className={
        "rounded-2xl border border-border/60 bg-card p-4" +
        (tone === "warning" ? " border-warning/40 bg-warning/5" : tone === "info" ? " border-info/40 bg-info/5" : "")
      }
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

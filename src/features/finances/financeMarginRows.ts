import {
  invoiceIsReceivable,
  paymentUahValue,
  type FinanceExpense,
  type FinanceInvoice,
  type FinanceOrderMeta,
  type FinancePayment,
  type OrderType,
  type PaidPurchaseCost,
} from "./types";

export type MarginOrderInfo = { number: string; customerName: string };

export type MarginRow = {
  /** `quoteId`; для замовлення без прорахунку — його `orderId` (ним же ключуються платежі й рахунки). */
  key: string;
  number: string;
  customerName: string;
  orderType: OrderType | null;
  invoiced: number;
  received: number;
  expenses: number;
  margin: number; // отримано − витрати (по оплатах)
};

const kopecks = (value: number) => Math.round(value * 100) / 100;

/**
 * Рядки маржі по замовленнях.
 *
 * Витрати рядка = вартість із ПДВ оплачених закупок + розподіли звичайних витрат.
 * Витрата, що виросла із закупки (`expenseId` є серед `purchaseCosts`), у розподілах
 * ігнорується: інакше та сама закупка порахувалась би двічі — раз із рядка закупки,
 * раз із розподілу її витрати на той самий прорахунок.
 */
export function buildFinanceMarginRows(params: {
  invoices: FinanceInvoice[];
  payments: FinancePayment[];
  expenses: FinanceExpense[];
  purchaseCosts: PaidPurchaseCost[];
  ordersByQuote: Map<string, MarginOrderInfo>;
  orderMeta?: Map<string, Pick<FinanceOrderMeta, "orderType">>;
}): MarginRow[] {
  const { invoices, payments, expenses, purchaseCosts, ordersByQuote, orderMeta } = params;
  const byKey = new Map<string, MarginRow>();

  const ensure = (quoteId: string, fallbackNumber?: string): MarginRow => {
    let row = byKey.get(quoteId);
    if (!row) {
      const order = ordersByQuote.get(quoteId);
      row = {
        key: quoteId,
        number: order?.number ?? fallbackNumber ?? quoteId.slice(0, 8),
        customerName: order?.customerName ?? "Замовлення",
        orderType: orderMeta?.get(quoteId)?.orderType ?? null,
        invoiced: 0,
        received: 0,
        expenses: 0,
        margin: 0,
      };
      byKey.set(quoteId, row);
    }
    // Рядок міг завестись від платежу ще без номера — номер закупки його уточнює.
    if (fallbackNumber && !ordersByQuote.has(quoteId)) row.number = fallbackNumber;
    return row;
  };

  for (const inv of invoices) {
    if (!inv.quoteId || !invoiceIsReceivable(inv.status)) continue;
    ensure(inv.quoteId).invoiced += inv.amount;
  }
  for (const p of payments) {
    ensure(p.quoteId).received += paymentUahValue(p);
  }

  const purchaseExpenseIds = new Set(purchaseCosts.map((cost) => cost.expenseId));
  for (const cost of purchaseCosts) {
    // Замовлення без прорахунку: платежі й рахунки ключуються його id, тож і закупки туди ж.
    ensure(cost.quoteId ?? cost.orderId, cost.orderNumber).expenses += cost.costWithVat;
  }
  for (const exp of expenses) {
    if (purchaseExpenseIds.has(exp.id)) continue;
    for (const alloc of exp.allocations) {
      ensure(alloc.quoteId).expenses += alloc.amount;
    }
  }

  for (const row of byKey.values()) {
    row.invoiced = kopecks(row.invoiced);
    row.received = kopecks(row.received);
    row.expenses = kopecks(row.expenses);
    row.margin = kopecks(row.received - row.expenses);
  }

  return Array.from(byKey.values()).sort((a, b) => a.margin - b.margin); // worst margin first
}

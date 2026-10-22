export type PurchaseVatMode = "with_vat" | "no_vat";

export type OrderPurchase = {
  id: string;
  orderId: string;
  orderItemId: string | null;
  description: string;
  supplierName: string;
  supplierInvoiceNumber: string | null;
  supplierInvoiceDate: string;
  qty: number | null;
  unit: string | null;
  amount: number | null;
  vatMode: PurchaseVatMode | null;
  costWithVat: number | null; // null — суми сховані
  receivedOn: string | null;
  receivedQty: number | null;
  receivedDocKind: "waybill" | "act" | null;
  receivedDocNumber: string | null;
  receivedByName: string | null;
  expenseId: string | null;
  paidOn: string | null;
  /** Фактично сплачено (сума витрати; для ФОП без × 1,2). null — не оплачено або суми сховані. */
  paidAmount: number | null;
};

const money = (value: number) => Math.round(value * 100) / 100;

/** ФОП-рахунок (без ПДВ) для нас дорожчий на 20%: ПДВ доплачуємо самі. */
export function purchaseCostWithVat(amount: number, vatMode: PurchaseVatMode): number {
  return vatMode === "no_vat" ? money(amount * 1.2) : money(amount);
}

/** ПДВ у витраті: з ПДВ — шоста частина оплаченого, без ПДВ — нуль. */
export function purchaseExpenseVat(paid: number, vatMode: PurchaseVatMode): number {
  return vatMode === "with_vat" ? money(paid / 6) : 0;
}

export type OrderEconomicsSummary = {
  invoiceTotal: number;
  costAll: number;
  costPaid: number;
  expectedRemainder: number;
  confirmedRemainder: number;
  marginPct: number | null;
  expectedMarginPct: number | null;
  received: number;
  total: number;
};

export function summarizeOrderEconomics(
  purchases: OrderPurchase[],
  invoiceTotal: number,
  currency: string | null,
): OrderEconomicsSummary {
  let costAll = 0;
  let costPaid = 0;
  let received = 0;
  for (const p of purchases) {
    const cost = p.costWithVat ?? 0;
    costAll = money(costAll + cost);
    if (p.expenseId || p.paidOn) costPaid = money(costPaid + cost);
    if (p.receivedOn) received += 1;
  }
  const expectedRemainder = money(invoiceTotal - costAll);
  const confirmedRemainder = money(invoiceTotal - costPaid);
  const cur = (currency ?? "UAH").trim().toUpperCase();
  const pctAllowed = invoiceTotal > 0 && cur !== "USD" && cur !== "EUR";
  return {
    invoiceTotal,
    costAll,
    costPaid,
    expectedRemainder,
    confirmedRemainder,
    marginPct: pctAllowed ? (confirmedRemainder / invoiceTotal) * 100 : null,
    expectedMarginPct: pctAllowed ? (expectedRemainder / invoiceTotal) * 100 : null,
    received,
    total: purchases.length,
  };
}

export type PurchaseGroup = {
  itemId: string | null;
  title: string;
  qtyLabel: string | null;
  purchases: OrderPurchase[];
};

export function groupPurchasesByItem(
  purchases: OrderPurchase[],
  items: { id: string; name: string; qty: number | null; unit: string | null }[],
): PurchaseGroup[] {
  const groups: PurchaseGroup[] = [];
  for (const item of items) {
    const own = purchases.filter((p) => p.orderItemId === item.id);
    if (own.length === 0) continue;
    const qtyLabel = item.qty != null ? [item.qty, item.unit].filter(Boolean).join(" ") : null;
    groups.push({ itemId: item.id, title: item.name, qtyLabel, purchases: own });
  }
  const whole = purchases.filter((p) => p.orderItemId === null);
  if (whole.length > 0) {
    groups.push({ itemId: null, title: "На все замовлення", qtyLabel: null, purchases: whole });
  }
  return groups;
}

/**
 * Сплачено не стільки, скільки в рахунку постачальника: тоді рядок показує
 * «оплачено X з Y». Порівнюємо з `amount` (сума як у рахунку): для ФОП сплачене
 * теж без × 1,2. Маржа й далі рахується з собівартості рядка.
 */
export function purchasePaidDiffers(p: Pick<OrderPurchase, "paidAmount" | "amount">): boolean {
  if (p.paidAmount == null || p.amount == null) return false;
  return Math.abs(p.paidAmount - p.amount) >= 0.005;
}

export function isPurchaseShortReceived(p: OrderPurchase): boolean {
  return p.receivedQty != null && p.qty != null && p.receivedQty < p.qty;
}

/** Скільки неотриманих рядків називаємо поіменно; решта — «та ще N». Як у гейті бази. */
const BLOCKER_NAMES_SHOWN = 5;

/**
 * Що не дає виписати ВН; порожній масив — можна. Текст — дослівно як у гейті
 * бази (orders_waybill_purchase_gate): перші 5 описів у порядку внесення + «та ще N».
 */
export function waybillBlockers(purchases: OrderPurchase[], purchasesNone: boolean): string[] {
  if (purchases.length === 0) {
    return purchasesNone ? [] : ["Внесіть закупки або позначку «закупок немає»"];
  }
  const pending = purchases.filter((p) => !p.receivedOn);
  if (pending.length === 0) return [];
  const names = pending.slice(0, BLOCKER_NAMES_SHOWN).map((p) => p.description).join(", ");
  const rest = pending.length - BLOCKER_NAMES_SHOWN;
  return [`Склад ще не підтвердив отримання: ${names}${rest > 0 ? ` та ще ${rest}` : ""}`];
}

import type { DerivedOrderRecord } from "./orderRecords";
import { isCashlessPaymentMethod } from "./paymentRules";

/**
 * Рахунок через бухгалтерію (REQ-322#p10, СЕО 14.10.2026).
 *
 * Номер рахунку — з BAS, не з CRM (бухгалтерія 07.10.2026). Менеджер просить
 * рахунок, бухгалтер вносить номер і дату з BAS або повертає запит із
 * коментарем. Доки номера немає, менеджер рахунок не відкриває. Правила
 * переходів тримає тригер tosho.enforce_order_invoice_flow
 * (scripts/orders-invoice-request.sql) — тут лише запити й похідний стан.
 */
export type OrderInvoiceState = "none" | "requested" | "returned" | "issued";

export type OrderInvoiceFields = Pick<
  DerivedOrderRecord,
  "invoiceNumber" | "invoiceRequestedAt" | "invoiceReturnNote"
>;

export const getOrderInvoiceState = (record: OrderInvoiceFields): OrderInvoiceState => {
  if (record.invoiceNumber) return "issued";
  if (record.invoiceRequestedAt) return "requested";
  if (record.invoiceReturnNote) return "returned";
  return "none";
};

const PAID_STATUSES = new Set(["partially_paid", "awaiting_balance", "fully_paid"]);

/**
 * Чому виписаний рахунок не можна виправити (REQ-335, вузька версія). Підписана
 * СП потребує нової СП, а з оплатою незрозуміло, що робити з різницею — обидва
 * питання ще відкриті. Те саме стереже tosho.correct_order_invoice.
 */
export const getInvoiceCorrectionBlocker = (
  record: Pick<DerivedOrderRecord, "invoiceNumber" | "specificationSignedAt" | "paymentStatus">
): string | null => {
  if (!record.invoiceNumber) return "Рахунок ще не виписано";
  if (record.specificationSignedAt) return "СП уже підписана — для нової ціни потрібна нова СП";
  if (PAID_STATUSES.has(record.paymentStatus)) return "За рахунком уже є оплата — виправити поки не можна";
  return null;
};

/** «403,68», «1 200» → число; порожнє чи не число — null. */
export const parseMoneyInput = (value: string): number | null => {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Рахунок потрібен лише на безготівці. */
export const needsOrderInvoice = (record: Pick<DerivedOrderRecord, "paymentMethodId" | "paymentRail">) =>
  isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail);

export type IndivisiblePrice = { name: string; price: number; down: number; up: number };

/**
 * Ціни з ПДВ, що не діляться на 1,2 до копійки. Бухгалтерія заборонила
 * округлення: ціна без ПДВ має рівно 2 знаки, тож ціна з ПДВ — кратна 6 коп.
 * Повертаємо обидві найближчі подільні — обирає менеджер.
 */
export const findIndivisiblePrices = (
  items: Array<{ name: string; unitPrice: number | string | null | undefined }>
): IndivisiblePrice[] => {
  const result: IndivisiblePrice[] = [];
  for (const item of items) {
    const kopecks = Math.round((Number(item.unitPrice) || 0) * 100);
    if (kopecks <= 0) continue;
    const rest = kopecks % 6;
    if (rest === 0) continue;
    result.push({
      name: item.name,
      price: kopecks / 100,
      down: (kopecks - rest) / 100,
      up: (kopecks - rest + 6) / 100,
    });
  }
  return result;
};

import { ORDER_PAYMENT_TERMS_OPTIONS } from "./config";

/**
 * Правила, що залежать від способу оплати замовлення. Погоджено СЕО 14.10.2026:
 * на готівці немає договору, СП, рахунку й ВН, а передоплата — щонайменше 50%.
 * Спец: docs/superpowers/specs/2026-10-14-order-documents-by-payment-design.md.
 */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Готівкові / на карту",
  bank_uah: "Безготівкові, грн.",
  bank_fx: "Безготівкові (валютні), $ / €",
  crypto: "Криптовалюта",
  pending: "Потрібно обрати після конвертації ліда",
};

export const CASH_MIN_PREPAYMENT_PCT = 50;

export const normalizePaymentMethodId = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  return normalized in PAYMENT_METHOD_LABELS ? normalized : "";
};

export const isCashlessPaymentMethod = (methodId?: string | null, label?: string | null) => {
  const normalizedId = normalizePaymentMethodId(methodId);
  if (normalizedId === "bank_uah" || normalizedId === "bank_fx") return true;
  return (label ?? "").trim().toLowerCase().includes("безготів");
};

const method = (id: string) => ({ id, label: PAYMENT_METHOD_LABELS[id] });

/**
 * Картка замовника — головне джерело: менеджер там явно обрав «Готівка» чи
 * «Рахунок». Порожнє поле (старі замовники) лишає колишнє вгадування, щоб не
 * перевернути вже наявні прорахунки.
 */
export const resolveOrderPaymentMethod = (input: {
  partyType: "customer" | "lead";
  customerPaymentType?: string | null;
  currency?: string | null;
  hasLegalEntityIdentity: boolean;
}) => {
  if (input.partyType === "lead") return method("pending");
  const paymentType = (input.customerPaymentType ?? "").trim();
  if (paymentType === "cash") return method("cash");
  const currency = (input.currency ?? "UAH").trim().toUpperCase();
  const isForeignCurrency = currency === "USD" || currency === "EUR";
  if (paymentType === "invoice") return method(isForeignCurrency ? "bank_fx" : "bank_uah");
  if (isForeignCurrency) return method("bank_fx");
  return method(input.hasLegalEntityIdentity ? "bank_uah" : "cash");
};

export const getAllowedPaymentTermsOptions = (methodId?: string | null) =>
  normalizePaymentMethodId(methodId) === "cash"
    ? ORDER_PAYMENT_TERMS_OPTIONS.filter((option) => option.advance >= CASH_MIN_PREPAYMENT_PCT)
    : [...ORDER_PAYMENT_TERMS_OPTIONS];

export const getMinimumPrepaymentError = (input: {
  methodId?: string | null;
  prepaymentPct?: number | null;
  paymentTerms?: string | null;
}) => {
  if (normalizePaymentMethodId(input.methodId) !== "cash") return null;
  const advance =
    typeof input.prepaymentPct === "number"
      ? input.prepaymentPct
      : ORDER_PAYMENT_TERMS_OPTIONS.find((option) => option.id === input.paymentTerms)?.advance ?? null;
  if (advance === null || advance >= CASH_MIN_PREPAYMENT_PCT) return null;
  return `На готівці передоплата не менше ${CASH_MIN_PREPAYMENT_PCT}%: 50/50, 70/30 або 100%.`;
};

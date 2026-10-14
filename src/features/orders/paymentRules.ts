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

/**
 * Від реквізитів, договору, СП і рахунку звільняє лише явна «Готівка» в картці
 * замовника. Порожнє поле (старі замовники) вимагає їх, як і до 14.10.2026:
 * інакше компанія з неповними реквізитами вгадувалась би як готівка й мовчки
 * ставала замовленням без договору.
 */
export const customerRequiresDocuments = (customerPaymentType?: string | null) =>
  (customerPaymentType ?? "").trim() !== "cash";

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

/**
 * Відтермінування доплати рахують у робочих або календарних днях від дати ВН
 * (СЕО, 14.10.2026). Порожнє значення — старі замовлення, у яких договір і СП
 * завжди казали «робочих днів».
 */
export type BalanceDaysKind = "working" | "calendar";

export const BALANCE_DAYS_KIND_LABELS: Record<BalanceDaysKind, string> = {
  working: "робочих",
  calendar: "календарних",
};

export const normalizeBalanceDaysKind = (value?: string | null): BalanceDaysKind =>
  value === "calendar" ? "calendar" : "working";

/** «протягом N …»: 1, 21, 31 — однина родового відмінка, решта — множина. */
export const formatBalanceDaysTerm = (days: number, kind: BalanceDaysKind) => {
  const singular = days % 10 === 1 && days % 100 !== 11;
  const adjective = kind === "calendar" ? (singular ? "календарного" : "календарних") : singular ? "робочого" : "робочих";
  return `${days} ${adjective} ${singular ? "дня" : "днів"}`;
};

export const formatBalanceDaysShort = (days: number, kind: BalanceDaysKind) =>
  `${days} ${kind === "calendar" ? "к.д." : "р.д."}`;

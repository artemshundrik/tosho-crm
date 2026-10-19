import { ORDER_PAYMENT_TERMS_OPTIONS } from "./config";

/**
 * Правила, що залежать від способу оплати замовлення. Погоджено СЕО 14.10.2026:
 * на готівці немає договору, СП, рахунку й ВН, а передоплата — щонайменше 50%.
 * Спец: docs/superpowers/specs/2026-10-14-order-documents-by-payment-design.md.
 */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Готівка",
  card: "На карту",
  bank_uah: "Безготівкові, грн.",
  bank_fx: "Безготівкові (валютні), $ / €",
  crypto: "Криптовалюта",
  pending: "Потрібно обрати після конвертації ліда",
};

export const CASH_MIN_PREPAYMENT_PCT = 50;

/** «На карту» живе за правилами готівки: без документів, передоплата від 50% (REQ-322#p17). */
export const isCashLikePaymentMethod = (methodId?: string | null) => {
  const normalized = (methodId ?? "").trim();
  return normalized === "cash" || normalized === "card";
};

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
  isCashLikePaymentMethod(methodId)
    ? ORDER_PAYMENT_TERMS_OPTIONS.filter((option) => option.advance >= CASH_MIN_PREPAYMENT_PCT)
    : [...ORDER_PAYMENT_TERMS_OPTIONS];

export const getMinimumPrepaymentError = (input: {
  methodId?: string | null;
  prepaymentPct?: number | null;
  paymentTerms?: string | null;
}) => {
  if (!isCashLikePaymentMethod(input.methodId)) return null;
  const advance =
    typeof input.prepaymentPct === "number"
      ? input.prepaymentPct
      : ORDER_PAYMENT_TERMS_OPTIONS.find((option) => option.id === input.paymentTerms)?.advance ?? null;
  if (advance === null || advance >= CASH_MIN_PREPAYMENT_PCT) return null;
  return `На готівці й на карту передоплата не менше ${CASH_MIN_PREPAYMENT_PCT}%: 50/50, 70/30 або 100%.`;
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

/** Сьогоднішня дата в часі браузера, YYYY-MM-DD. */
export const localTodayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

const isoToUtc = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const utcToIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const DAY_MS = 86_400_000;

/**
 * Останній день доплати: дата ВН + N днів. Робочі — пн–пт без календаря
 * свят: за воєнного стану святкові дні не вихідні (Закон 2136-IX), тож
 * вихідні тут лише субота й неділя. День ВН не рахується.
 */
export const addBalanceDays = (startIso: string, days: number, kind: BalanceDaysKind): string => {
  const start = isoToUtc(startIso);
  if (kind === "calendar") return utcToIso(start + days * DAY_MS);
  let cursor = start;
  let left = days;
  while (left > 0) {
    cursor += DAY_MS;
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return utcToIso(cursor);
};

/** Скільки календарних днів від `fromIso` до `toIso` (від'ємне — уже минуло). */
export const daysBetween = (fromIso: string, toIso: string) => Math.round((isoToUtc(toIso) - isoToUtc(fromIso)) / DAY_MS);

/** «28.10» — коротка дата для рядків і чипів. */
export const formatDayMonth = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/**
 * «Як платить» (REQ-322#p17) — одне поле замість типу оплати й юрособи.
 * «За рахунком» несе юрособу (`invoice:<id>`), а гривня чи валюта береться з
 * поля «Валюта». Решта — способи без документів.
 */
export const PAY_HOW_INVOICE_PREFIX = "invoice:";

export const PAY_HOW_WITHOUT_DOCUMENTS = [
  { id: "cash", label: "Готівка" },
  { id: "card", label: "На карту" },
  { id: "crypto", label: "Криптовалюта" },
] as const;

export const bankPaymentMethodFor = (currency?: string | null) => {
  const code = (currency ?? "UAH").trim().toUpperCase();
  return code === "USD" || code === "EUR" ? "bank_fx" : "bank_uah";
};

export const toPayHowValue = (methodId: string, legalEntityId: string) =>
  isCashlessPaymentMethod(methodId, null) ? `${PAY_HOW_INVOICE_PREFIX}${legalEntityId}` : methodId;

export const fromPayHowValue = (value: string, currency?: string | null) =>
  value.startsWith(PAY_HOW_INVOICE_PREFIX)
    ? { methodId: bankPaymentMethodFor(currency), legalEntityId: value.slice(PAY_HOW_INVOICE_PREFIX.length) }
    : { methodId: value, legalEntityId: null };

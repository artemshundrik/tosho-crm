/**
 * Оплати замовлення (REQ-322#p26): скільки внесено, скільки треба наперед і
 * який з цього статус. Ті самі правила рахує база у scripts/order-payments.sql
 * (order_prepayment_amount, order_payment_status_from_sum) — міняти лише разом.
 */
import { ORDER_PAYMENT_TERMS_OPTIONS, ORDER_STATUS_SECTIONS } from "./config";

export type OrderPayment = {
  id: string;
  amount: number;
  paidAt: string;
  kind: "prepayment" | "balance";
  createdAt: string;
  enteredBy: string | null;
  enteredByName: string | null;
  /** Рахунок і № платіжки бачать лише бухгалтерія, СЕО і Фінанси; іншим — null. */
  accountName: string | null;
  bankTxnRef: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type DerivedPaymentStatus = "awaiting_payment" | "partially_paid" | "fully_paid" | "awaiting_balance";

export const CANCEL_REASONS = ["Помилка в сумі", "Не те замовлення", "Дубль", "Повернули гроші"] as const;

export const paymentStatusLabel = (id: string): string =>
  ORDER_STATUS_SECTIONS.find((section) => section.id === "payment")?.items.find((item) => item.id === id)?.label ?? id;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const moneyFormat = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «49 680,00 грн» — у віконці оплати копійки важливі, тож не formatOrderMoney. */
export const formatUah = (value: number) => `${moneyFormat.format(roundMoney(value))} грн`;

/** % передоплати: з умов замовлення, інакше з пресету; невідомо — 0. */
export const prepaymentPct = (input: { prepaymentPct?: number | null; paymentTerms?: string | null }): number => {
  if (typeof input.prepaymentPct === "number") return input.prepaymentPct;
  return ORDER_PAYMENT_TERMS_OPTIONS.find((option) => option.id === input.paymentTerms)?.advance ?? 0;
};

export const prepaymentAmount = (
  total: number,
  input: { prepaymentPct?: number | null; paymentTerms?: string | null }
): number => roundMoney(((Number(total) || 0) * prepaymentPct(input)) / 100);

export const paidTotal = (payments: OrderPayment[]): number =>
  roundMoney(payments.reduce((sum, payment) => (payment.cancelledAt ? sum : sum + payment.amount), 0));

export const derivePaymentStatus = (paid: number, total: number, pre: number, current: string): DerivedPaymentStatus => {
  if (paid <= 0) return "awaiting_payment";
  if (total > 0 && paid >= total) return "fully_paid";
  if ((pre > 0 && paid >= pre) || (pre <= 0 && paid > 0)) {
    return current === "awaiting_balance" ? "awaiting_balance" : "partially_paid";
  }
  return "awaiting_payment";
};

export type QuickAmount = { key: string; label: string; amount: number | null };

/** Швидкі суми у віконці: % з умов, 50, 70 — менші за залишок; «Увесь залишок»; «Інша». */
export const quickAmounts = (total: number, prePct: number | null, paid: number): QuickAmount[] => {
  const remaining = roundMoney(total - paid);
  const pcts = [...new Set([prePct ?? 0, 50, 70])].filter((pct) => pct > 0).sort((a, b) => a - b);
  const chips: QuickAmount[] = pcts
    .map((pct) => ({ key: `p${pct}`, label: `${pct}%`, amount: roundMoney((total * pct) / 100) }))
    .filter((chip) => chip.amount > 0 && chip.amount < remaining);
  if (remaining > 0) chips.push({ key: "rest", label: "Увесь залишок", amount: remaining });
  chips.push({ key: "other", label: "Інша", amount: null });
  return chips;
};

/** «49 680,00», «49680.5 грн», «49 680» → число; нуль, мінус і сміття → null. */
export const parseAmountInput = (raw: string): number | null => {
  const cleaned = raw
    .replace(/грн\.?/gi, "")
    .replace(/[\s  ]/g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
};

export const paymentHint = (paid: number, total: number, pre: number): string => {
  if (paid <= 0) return pre > 0 ? `Передоплата за умовами — ${formatUah(pre)}` : "Оплат ще не було";
  if (total > 0 && paid >= total) return "Оплачено повністю";
  if (paid < pre) return `До передоплати бракує ${formatUah(pre - paid)}`;
  return `Залишок ${formatUah(total - paid)}`;
};

export const paymentWarnings = (p: {
  amount: number;
  paid: number;
  total: number;
  pre: number;
  ref: string;
  payments: OrderPayment[];
}): string[] => {
  const warnings: string[] = [];
  const remaining = roundMoney(p.total - p.paid);
  if (p.amount > remaining) {
    warnings.push(`Більше за залишок на ${formatUah(p.amount - remaining)} — перевірте суму`);
  }
  const ref = p.ref.trim();
  if (ref && p.payments.some((payment) => !payment.cancelledAt && payment.bankTxnRef?.trim() === ref)) {
    warnings.push(`Платіжку № ${ref} вже внесено`);
  }
  return warnings;
};

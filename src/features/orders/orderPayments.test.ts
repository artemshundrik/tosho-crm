import { describe, expect, it } from "vitest";

import {
  derivePaymentStatus,
  paidTotal,
  parseAmountInput,
  paymentHint,
  paymentWarnings,
  prepaymentAmount,
  quickAmounts,
  type OrderPayment,
} from "./orderPayments";

const spaces = (text: string) => text.replace(/[  ]/g, " ");

const payment = (patch: Partial<OrderPayment>): OrderPayment => ({
  id: "p",
  amount: 0,
  paidAt: "2026-10-19",
  kind: "prepayment",
  createdAt: "2026-10-19T10:00:00Z",
  enteredBy: null,
  enteredByName: null,
  accountName: null,
  bankTxnRef: null,
  notes: null,
  cancelledAt: null,
  cancelReason: null,
  ...patch,
});

/** Числа з прототипу: замовлення на 99 360 грн, 50/50. */
describe("оплати замовлення", () => {
  it("передоплата з умов або пресету", () => {
    expect(prepaymentAmount(99360, { prepaymentPct: 50 })).toBe(49680);
    expect(prepaymentAmount(99360, { paymentTerms: "70/30" })).toBe(69552);
    expect(prepaymentAmount(99360, { paymentTerms: "100_after" })).toBe(0);
  });

  it("статус із суми", () => {
    expect(derivePaymentStatus(49680, 99360, 49680, "awaiting_payment")).toBe("partially_paid");
    expect(derivePaymentStatus(45000, 99360, 49680, "awaiting_payment")).toBe("awaiting_payment");
    expect(derivePaymentStatus(99360, 99360, 49680, "partially_paid")).toBe("fully_paid");
    expect(derivePaymentStatus(60000, 99360, 49680, "awaiting_balance")).toBe("awaiting_balance");
    expect(derivePaymentStatus(1, 99360, 0, "awaiting_payment")).toBe("partially_paid");
    expect(derivePaymentStatus(0, 99360, 0, "fully_paid")).toBe("awaiting_payment");
  });

  it("швидкі суми без дублів і не більші за залишок", () => {
    expect(quickAmounts(99360, 50, 0).map((c) => c.key)).toEqual(["p50", "p70", "rest", "other"]);
    expect(quickAmounts(99360, 30, 0).map((c) => c.key)).toEqual(["p30", "p50", "p70", "rest", "other"]);
    expect(quickAmounts(99360, 50, 49680).map((c) => c.key)).toEqual(["rest", "other"]);
    expect(quickAmounts(99360, 50, 49680).find((c) => c.key === "rest")?.amount).toBe(49680);
    expect(quickAmounts(99360, 50, 99360).map((c) => c.key)).toEqual(["other"]);
  });

  it("розбирає суму з поля", () => {
    expect(parseAmountInput("49 680,00")).toBe(49680);
    expect(parseAmountInput("49680.5 грн")).toBe(49680.5);
    expect(parseAmountInput("49 680")).toBe(49680);
    expect(parseAmountInput("0")).toBeNull();
    expect(parseAmountInput("-5")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("1,234")).toBeNull();
  });

  it("скасований платіж у суму не йде", () => {
    expect(paidTotal([payment({ amount: 100 }), payment({ amount: 50, cancelledAt: "2026-10-19T11:00:00Z" })])).toBe(100);
  });

  it("підказка й попередження", () => {
    expect(spaces(paymentHint(45000, 99360, 49680))).toBe("До передоплати бракує 4 680,00 грн");
    expect(spaces(paymentHint(0, 99360, 49680))).toBe("Передоплата за умовами — 49 680,00 грн");
    expect(paymentHint(99360, 99360, 49680)).toBe("Оплачено повністю");
    expect(spaces(paymentHint(60000, 99360, 49680))).toBe("Лишилось 39 360,00 грн");
    expect(spaces(paymentHint(100000, 99360, 49680))).toBe("Переплата 640,00 грн");
    expect(spaces(paymentWarnings({ amount: 120000, paid: 0, total: 99360, pre: 49680, ref: "", payments: [] })[0])).toMatch(
      /^Більше за залишок на 20 640,00 грн/
    );
    expect(spaces(paymentWarnings({ amount: 45000, paid: 0, total: 99360, pre: 49680, ref: "", payments: [] })[0])).toBe(
      "Менше за передоплату на 4 680,00 грн — запуск лишиться закритим"
    );
    expect(
      paymentWarnings({ amount: 49680, paid: 0, total: 99360, pre: 49680, ref: "9898", payments: [payment({ bankTxnRef: "9898" })] })
    ).toEqual(["Платіжку № 9898 вже внесено"]);
    expect(
      paymentWarnings({
        amount: 49680,
        paid: 0,
        total: 99360,
        pre: 49680,
        ref: "9898",
        payments: [payment({ bankTxnRef: "9898", cancelledAt: "2026-10-19T11:00:00Z" })],
      })
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { buildFinanceMarginRows, type PaidPurchaseCost } from "./financeMarginRows";
import type { FinanceExpense, FinanceInvoice, FinancePayment } from "./types";

const expense = (over: Partial<FinanceExpense> = {}): FinanceExpense => ({
  id: "e1",
  teamId: "t1",
  legalEntityId: null,
  accountId: null,
  categoryId: null,
  supplierName: "Постачальник",
  amount: 0,
  currency: "UAH",
  fxRate: null,
  vatAmount: 0,
  expenseDate: "2026-10-10",
  isRecurring: false,
  recurrence: null,
  amountVaries: false,
  billedNextMonth: false,
  objectGroup: null,
  reminderLeadDays: null,
  vendorOptions: [],
  eventType: null,
  monthUahOverrides: {},
  nextChargeDate: null,
  vendorKey: null,
  logoUrl: null,
  archivedAt: null,
  notes: null,
  file: null,
  enteredBy: null,
  createdAt: null,
  updatedAt: null,
  allocations: [],
  orderPurchase: null,
  ...over,
});

const payment = (quoteId: string, amount: number): FinancePayment =>
  ({ id: `p-${quoteId}-${amount}`, quoteId, amount, currency: "UAH", uahEquivalent: amount }) as FinancePayment;

const purchase = (over: Partial<PaidPurchaseCost> = {}): PaidPurchaseCost => ({
  quoteId: "q1",
  orderId: "o1",
  orderNumber: "ZM-1026-0001",
  costWithVat: 6434.5,
  expenseId: "e1",
  ...over,
});

const build = (over: Partial<Parameters<typeof buildFinanceMarginRows>[0]> = {}) =>
  buildFinanceMarginRows({
    invoices: [] as FinanceInvoice[],
    payments: [],
    expenses: [],
    purchaseCosts: [],
    ordersByQuote: new Map(),
    ...over,
  });

describe("buildFinanceMarginRows", () => {
  it("рахує витрату зі зв'язаною закупкою один раз, навіть якщо вона розподілена на той самий прорахунок", () => {
    const rows = build({
      payments: [payment("q1", 10000)],
      expenses: [
        expense({
          id: "e1",
          amount: 6434.5,
          allocations: [{ id: "a1", expenseId: "e1", quoteId: "q1", amount: 6434.5 }],
        }),
      ],
      purchaseCosts: [purchase()],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].expenses).toBe(6434.5);
    expect(rows[0].margin).toBe(3565.5);
  });

  it("ФОП-закупка 1 000 дає витрату маржі 1 200 (вартість із ПДВ)", () => {
    const rows = build({ purchaseCosts: [purchase({ costWithVat: 1200, expenseId: "e9" })] });
    expect(rows[0].expenses).toBe(1200);
  });

  it("розподіл звичайної витрати лишається в марже, а лише закупкові розподіли відкидаються", () => {
    const rows = build({
      expenses: [
        expense({ id: "e1", allocations: [{ id: "a1", expenseId: "e1", quoteId: "q1", amount: 500 }] }),
        expense({ id: "e2", allocations: [{ id: "a2", expenseId: "e2", quoteId: "q1", amount: 6434.5 }] }),
      ],
      purchaseCosts: [purchase({ expenseId: "e2" })],
    });
    expect(rows[0].expenses).toBe(6934.5);
  });

  it("замовлення без прорахунку — один рядок за orderId разом зі своїми оплатами", () => {
    const rows = build({
      payments: [payment("o7", 1000)],
      purchaseCosts: [purchase({ quoteId: null, orderId: "o7", orderNumber: "ZM-1026-0007", costWithVat: 300 })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("o7");
    expect(rows[0].number).toBe("ZM-1026-0007");
    expect(rows[0].expenses).toBe(300);
    expect(rows[0].margin).toBe(700);
  });

  it("сума кількох закупок одного прорахунку округлюється до копійок", () => {
    const rows = build({
      purchaseCosts: [
        purchase({ expenseId: "e1", costWithVat: 0.1 }),
        purchase({ expenseId: "e2", costWithVat: 0.2 }),
      ],
    });
    expect(rows[0].expenses).toBe(0.3);
  });

  it("сортує від найгіршої маржі", () => {
    const rows = build({
      payments: [payment("q1", 100), payment("q2", 100)],
      purchaseCosts: [purchase({ quoteId: "q2", orderId: "o2", expenseId: "e2", costWithVat: 50 })],
    });
    expect(rows.map((r) => r.key)).toEqual(["q2", "q1"]);
  });
});

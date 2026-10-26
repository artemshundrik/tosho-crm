import { describe, expect, it } from "vitest";

import {
  findIndivisiblePrices,
  getInvoiceCorrectionBlocker,
  getOrderInvoiceState,
  parseMoneyInput,
} from "./orderInvoice";

const empty = { invoiceNumber: null, invoiceRequestedAt: null, invoiceReturnNote: null };

describe("getOrderInvoiceState", () => {
  it("номер є — виписано, навіть якщо запит лишився в історії", () => {
    expect(getOrderInvoiceState({ ...empty, invoiceNumber: "407", invoiceRequestedAt: "2026-10-15" })).toBe("issued");
  });
  it("попросили — у бухгалтерії; повернули — повернено; інакше — ще ні", () => {
    expect(getOrderInvoiceState({ ...empty, invoiceRequestedAt: "2026-10-15" })).toBe("requested");
    expect(getOrderInvoiceState({ ...empty, invoiceReturnNote: "Ціна" })).toBe("returned");
    expect(getOrderInvoiceState(empty)).toBe("none");
  });
});

describe("findIndivisiblePrices", () => {
  it("ціна з ПДВ має бути кратна 6 коп — пропонує обидві найближчі", () => {
    expect(
      findIndivisiblePrices([
        { name: "Футболка", unitPrice: 403.7 },
        { name: "Чашка", unitPrice: 403.68 },
        { name: "Ручка", unitPrice: 120 },
        { name: "Без ціни", unitPrice: null },
      ])
    ).toEqual([{ name: "Футболка", price: 403.7, down: 403.68, up: 403.74 }]);
  });
  it("рядкова ціна з плаваючою точкою не дає хибної тривоги", () => {
    // 0.3 і 1.02 у float неточні, але в копійках — 30 і 102, обидва кратні 6.
    expect(findIndivisiblePrices([{ name: "A", unitPrice: "0.3" }, { name: "B", unitPrice: 1.02 }])).toEqual([]);
    expect(findIndivisiblePrices([{ name: "C", unitPrice: "1.03" }])).toEqual([
      { name: "C", price: 1.03, down: 1.02, up: 1.08 },
    ]);
  });
});

describe("getInvoiceCorrectionBlocker", () => {
  const issued = { invoiceNumber: "448", specificationSignedAt: null, paymentStatus: "awaiting_payment" };
  it("виписаний рахунок без підписаної СП і оплат — можна виправити", () => {
    expect(getInvoiceCorrectionBlocker(issued)).toBeNull();
  });
  it("без номера, з підписаною СП чи з оплатою — ні", () => {
    expect(getInvoiceCorrectionBlocker({ ...issued, invoiceNumber: null })).toBe("Рахунок ще не виписано");
    expect(getInvoiceCorrectionBlocker({ ...issued, specificationSignedAt: "2026-10-26" })).toMatch(/СП уже підписана/);
    expect(getInvoiceCorrectionBlocker({ ...issued, paymentStatus: "partially_paid" })).toMatch(/оплата/);
  });
});

describe("parseMoneyInput", () => {
  it("кома, пробіли між розрядами, порожнє", () => {
    expect(parseMoneyInput("403,68")).toBe(403.68);
    expect(parseMoneyInput("1 200")).toBe(1200);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("абв")).toBeNull();
  });
});

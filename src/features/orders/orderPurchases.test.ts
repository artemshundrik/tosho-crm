import { describe, expect, it } from "vitest";
import {
  groupPurchasesByItem,
  isPurchaseShortReceived,
  purchaseCostWithVat,
  purchaseExpenseVat,
  summarizeOrderEconomics,
  waybillBlockers,
  type OrderPurchase,
} from "./orderPurchases";
import {
  canConfirmPurchaseReceipt,
  canEditOrderPurchases,
  canMarkNoPurchases,
  canSeeOrderMargin,
  canSeeOrderPurchaseAmounts,
  canViewOrderEconomics,
} from "@/lib/permissions";

function line(id: string, amount: number | null, paid: boolean, extra: Partial<OrderPurchase> = {}): OrderPurchase {
  return {
    id,
    orderId: "o1",
    orderItemId: "i1",
    description: `Рядок ${id}`,
    supplierName: "Постачальник",
    supplierInvoiceNumber: null,
    supplierInvoiceDate: "2026-10-01",
    qty: null,
    unit: null,
    amount,
    vatMode: "with_vat",
    costWithVat: amount,
    receivedOn: "2026-10-10",
    receivedQty: null,
    receivedDocKind: null,
    receivedDocNumber: null,
    receivedByName: null,
    expenseId: paid ? `e-${id}` : null,
    paidOn: paid ? "2026-10-05" : null,
    ...extra,
  };
}

const rows378: OrderPurchase[] = [
  line("1", 16.5, true),
  line("2", 26.1, true),
  line("3", 5250.3, true),
  line("4", 6434.5, true),
  line("5", 44699.18, false),
  line("6", 70, true),
  line("7", 0, true),
];

const unreceived = (title: string) =>
  line("u", 100, false, { description: title, receivedOn: null });

describe("purchase math", () => {
  it("cost with VAT", () => {
    expect(purchaseCostWithVat(1000, "no_vat")).toBe(1200);
    expect(purchaseCostWithVat(5250.3, "with_vat")).toBe(5250.3);
    expect(purchaseCostWithVat(16.67, "no_vat")).toBe(20);
  });
  it("expense VAT", () => {
    expect(purchaseExpenseVat(6434.5, "with_vat")).toBe(1072.42);
    expect(purchaseExpenseVat(1000, "no_vat")).toBe(0);
  });
});

describe("summarizeOrderEconomics", () => {
  it("order 378", () => {
    const s = summarizeOrderEconomics(rows378, 95400, "UAH");
    expect(s.costAll).toBe(56496.58);
    expect(s.expectedRemainder).toBe(38903.42);
    expect(s.confirmedRemainder).toBe(83602.6);
    expect(s.expectedMarginPct).toBeCloseTo(40.78, 2);
    expect(s.received).toBe(7);
    expect(s.total).toBe(7);
  });
  it("null margin without total or for foreign currency", () => {
    expect(summarizeOrderEconomics(rows378, 0, "UAH").marginPct).toBeNull();
    expect(summarizeOrderEconomics(rows378, 95400, "USD").marginPct).toBeNull();
    expect(summarizeOrderEconomics(rows378, 95400, null).marginPct).not.toBeNull();
  });
  it("hidden amounts count as zero", () => {
    const hidden = line("h", null, false, { costWithVat: null, vatMode: null });
    expect(summarizeOrderEconomics([hidden], 95400, "UAH").costAll).toBe(0);
  });
});

describe("groupPurchasesByItem", () => {
  it("puts whole-order lines last", () => {
    const whole = line("w", 10, false, { orderItemId: null });
    const item = line("a", 10, false, { orderItemId: "i1" });
    const groups = groupPurchasesByItem(
      [whole, item],
      [{ id: "i1", name: "Парасолі", qty: 200, unit: "шт" }],
    );
    expect(groups.at(-1)?.title).toBe("На все замовлення");
    expect(groups[0].title).toBe("Парасолі");
    expect(groups[0].qtyLabel).toBe("200 шт");
  });
});

describe("waybill", () => {
  it("blockers", () => {
    expect(waybillBlockers([], false)).toEqual(["Внесіть закупки або позначку «закупок немає»"]);
    expect(waybillBlockers([], true)).toEqual([]);
    expect(waybillBlockers([unreceived("Парасолі")], false)).toEqual([
      "Склад ще не підтвердив отримання: Парасолі",
    ]);
  });
  it("short receipt", () => {
    expect(isPurchaseShortReceived(line("s", 1, false, { qty: 10, receivedQty: 8 }))).toBe(true);
    expect(isPurchaseShortReceived(line("s", 1, false, { qty: 10, receivedQty: 10 }))).toBe(false);
  });
});

describe("access", () => {
  it("pm confirms receipt but sees no amounts", () => {
    expect(canConfirmPurchaseReceipt("member", "pm")).toBe(true);
    expect(canSeeOrderPurchaseAmounts("member", "pm")).toBe(false);
  });
  it("junior accountant sees amounts, not margin", () => {
    expect(canSeeOrderPurchaseAmounts("member", "junior_accountant")).toBe(true);
    expect(canSeeOrderMargin("member", "junior_accountant")).toBe(false);
    expect(canEditOrderPurchases("member", "junior_accountant")).toBe(false);
  });
  it("manager sees nothing", () => {
    expect(canViewOrderEconomics("member", "manager")).toBe(false);
  });
  it("none marker", () => {
    expect(canMarkNoPurchases("member", "accountant")).toBe(true);
    expect(canMarkNoPurchases("member", "seo")).toBe(false);
    expect(canMarkNoPurchases("owner", "seo")).toBe(false);
  });
  it("writer", () => {
    expect(canEditOrderPurchases("owner", null)).toBe(true);
    expect(canSeeOrderMargin("member", "seo")).toBe(true);
  });
});

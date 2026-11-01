import { describe, expect, it } from "vitest";

import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

import { buildOrderTurnItems, myTurnLens } from "./buildMyTurn";

const now = new Date("2026-11-01T12:00:00Z");

const order = (patch: Partial<DerivedOrderRecord>): DerivedOrderRecord =>
  ({
    id: "o1",
    quoteNumber: "TS-1",
    customerName: "Зелена",
    customerLogoUrl: null,
    paymentMethodId: "bank_uah",
    paymentRail: "Безготівкові, грн.",
    total: 10000,
    prepaymentPct: 70,
    balancePct: 30,
    balanceTiming: "before_shipment",
    paymentStatus: "awaiting_payment",
    orderStatus: "approved",
    deliveryStatus: "not_shipped",
    designStatuses: [],
    contractCreatedAt: "2026-10-01",
    specificationCreatedAt: "2026-10-01",
    contractSignedAt: "2026-10-01",
    specificationSignedAt: "2026-10-01",
    invoiceCreatedAt: null,
    invoiceNumber: null,
    invoiceRequestedAt: null,
    invoiceReturnNote: null,
    managerUserId: "me",
    approvals: [],
    items: [],
    createdAt: "2026-10-30T12:00:00Z",
    updatedAt: "2026-10-30T12:00:00Z",
    ...patch,
  }) as unknown as DerivedOrderRecord;

describe("myTurnLens", () => {
  it("власник бачить свої справи, а не зведення по команді", () => {
    expect(myTurnLens("chief")).toBe("general");
    expect(myTurnLens("sales")).toBe("sales");
  });
});

describe("buildOrderTurnItems", () => {
  const manager = { userId: "me", canIssueInvoice: false, canApproveLaunch: false };

  it("бере лише замовлення, що чекають мене", () => {
    expect(buildOrderTurnItems([order({}), order({ id: "o2", managerUserId: "other" })], manager, now).map((i) => i.entityKey)).toEqual(["o1"]);
  });

  it("чекає три дні й довше — горить", () => {
    const [item] = buildOrderTurnItems([order({ updatedAt: "2026-10-28T12:00:00Z" })], manager, now);
    expect(item.lane).toBe("now");
    expect(item.to).toBe("/orders/production/o1");
    const [fresh] = buildOrderTurnItems([order({})], manager, now);
    expect(fresh.lane).toBe("today");
  });

  it("бухгалтерові називає прохання, а не крок замовлення", () => {
    const [item] = buildOrderTurnItems(
      [order({ managerUserId: "other", invoiceRequestedAt: "2026-10-31T12:00:00Z" })],
      { userId: "acc", canIssueInvoice: true, canApproveLaunch: false },
      now
    );
    expect(item.subtitle).toBe("внести номер рахунку з BAS");
    expect(item.when).toBe("чекає 1 день");
  });
});

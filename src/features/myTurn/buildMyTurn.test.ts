import { describe, expect, it } from "vitest";

import type { OverviewDesignInput, OverviewQuoteInput } from "@/features/overview/buildOverview";
import type { OverviewLens } from "@/features/overview/overviewRoles";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";

import { buildMyTurn, buildOrderTurnItems, myTurnLens, summarizeTurn, turnSubject } from "./buildMyTurn";

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

const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const quote = (patch: Partial<OverviewQuoteInput>): OverviewQuoteInput => ({
  id: "q1",
  number: "TS-1026-0001",
  status: "estimating",
  customerName: "Вукі",
  customerLogoUrl: null,
  assignedTo: "me",
  assignedToLabel: null,
  createdAt: daysAgo(3),
  updatedAt: daysAgo(3),
  deadlineAt: null,
  ...patch,
});

const design = (patch: Partial<OverviewDesignInput>): OverviewDesignInput => ({
  id: "d1",
  designTaskNumber: null,
  quoteNumber: "TS-1026-0066",
  title: "Візуал набору",
  customerName: "Укравіт",
  customerLogoUrl: null,
  status: "client_review",
  assigneeUserId: "designer",
  assigneeLabel: "Лєна",
  managerUserId: "me",
  createdAt: daysAgo(9),
  statusChangedAt: null,
  deadlineAt: null,
  ...patch,
});

const turn = (lens: OverviewLens, userId: string, data: { quotes?: OverviewQuoteInput[]; designTasks?: OverviewDesignInput[] }) =>
  buildMyTurn({
    now,
    userId,
    lens,
    quotes: data.quotes ?? [],
    designTasks: data.designTasks ?? [],
    activityCount: 0,
    orders: [],
    viewer: { userId, canIssueInvoice: false, canApproveLaunch: false },
  });

describe("один адресат на сигнал", () => {
  it("«клієнт мовчить» — лише менеджеру цього замовника", () => {
    const tasks = [design({}), design({ id: "d2", managerUserId: "other" })];
    expect(turn("sales", "me", { designTasks: tasks }).map((i) => i.entityKey)).toEqual(["d1"]);
    // Власник — не менеджер жодного з них, і чужих клієнтів у його ході немає.
    expect(turn("chief", "owner", { designTasks: tasks })).toEqual([]);
  });

  it("мовчання рахується від дня, коли дизайн віддали клієнту", () => {
    const [item] = turn("sales", "me", { designTasks: [design({ statusChangedAt: daysAgo(5) })] });
    expect(item.when).toContain("5");
    // Віддали вчора — нагадувати ще рано, хоч задача й стара.
    expect(turn("sales", "me", { designTasks: [design({ statusChangedAt: daysAgo(1) })] })).toEqual([]);
  });

  it("нічий прорахунок — не хід кожного менеджера, а хід того, хто роздає", () => {
    const quotes = [quote({ assignedTo: null })];
    expect(turn("sales", "me", { quotes })).toEqual([]);
    expect(turn("chief", "ceo", { quotes }).map((i) => i.id)).toEqual(["quote-unassigned:q1"]);
  });
});

describe("turnSubject", () => {
  it("бере погляд і права з посади людини", () => {
    expect(turnSubject({ userId: "c", accessRole: "member", jobRole: "seo" })).toEqual({
      lens: "chief",
      viewer: { userId: "c", canIssueInvoice: true, canApproveLaunch: true },
    });
    expect(turnSubject({ userId: "m", accessRole: "member", jobRole: "manager" }).lens).toBe("sales");
  });
});

describe("summarizeTurn", () => {
  it("рахує смуги й бере першу справу як найгострішу", () => {
    const items = turn("sales", "me", {
      quotes: [quote({ id: "q1" }), quote({ id: "q2", status: "awaiting_approval", updatedAt: daysAgo(7) })],
    });
    const summary = summarizeTurn(items);
    expect(summary.now + summary.today + summary.later).toBe(items.length);
    expect(summary.top?.entityKey).toBe("q2");
  });
});

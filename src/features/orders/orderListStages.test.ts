import { describe, expect, it } from "vitest";

import {
  getOrderDocMarks,
  getOrderNextStep,
  getOrderPaidShare,
  isMyTurn,
  summarizeOrderStages,
  type OrderListInput,
} from "./orderListStages";

/**
 * Список замовлень (REQ-322#p12): згори етапи, у рядку — що далі й чий хід.
 * Погоджень і підписів ще немає в даних (p6, p7), тож етап виводиться зі
 * статусів, створених документів і запиту рахунку (p10).
 */
const cashless: OrderListInput = {
  paymentMethodId: "bank_uah",
  paymentRail: "Безготівкові, грн.",
  total: 10000,
  prepaymentPct: 70,
  balancePct: 30,
  balanceTiming: "before_shipment",
  balanceDaysAfterShipment: null,
  balanceDaysKind: "working",
  paymentTerms: "70/30",
  paymentStatus: "awaiting_payment",
  orderStatus: "approved",
  deliveryStatus: "not_shipped",
  designStatuses: [],
  contractCreatedAt: null,
  specificationCreatedAt: null,
  invoiceCreatedAt: null,
  invoiceNumber: null,
  invoiceRequestedAt: null,
  invoiceReturnNote: null,
  inheritedContractOrderNumber: null,
  managerUserId: "me",
};

const withDocs = { ...cashless, contractCreatedAt: "2026-10-14", specificationCreatedAt: "2026-10-14" };
const cash: OrderListInput = { ...cashless, paymentMethodId: "cash", paymentRail: "Готівкові / на карту" };

describe("getOrderNextStep", () => {
  it("безготівка без договору — оформлення, хід менеджера", () => {
    expect(getOrderNextStep(cashless)).toMatchObject({
      stage: "setup",
      turn: "manager",
      title: "Створити договір",
      actionLabel: "Договір",
    });
  });

  it("договір є, СП немає — створити СП", () => {
    expect(getOrderNextStep({ ...cashless, contractCreatedAt: "2026-10-14" })).toMatchObject({
      stage: "setup",
      title: "Створити СП",
      actionLabel: "Створити СП",
    });
  });

  it("документи й рахунок є, передоплати немає — чекаємо замовника, з сумою", () => {
    expect(getOrderNextStep({ ...withDocs, invoiceNumber: "407" })).toMatchObject({
      stage: "customer",
      turn: "customer",
      title: "Передоплата 70%",
      amountDue: 7000,
      actionLabel: null,
    });
  });

  it("передоплата є — можна запускати", () => {
    expect(getOrderNextStep({ ...withDocs, paymentStatus: "partially_paid" })).toMatchObject({
      stage: "setup",
      turn: "manager",
      title: "Можна запускати",
      actionLabel: "Запустити",
    });
  });

  it("готівка без передоплати — чекаємо замовника без документів", () => {
    expect(getOrderNextStep(cash)).toMatchObject({ stage: "customer", title: "Передоплата 70%" });
  });

  it("у виробництві — хід виробництва", () => {
    expect(getOrderNextStep({ ...withDocs, orderStatus: "in_production" })).toMatchObject({
      stage: "production",
      turn: "production",
    });
  });

  it("готове без доплати до відвантаження — хід замовника", () => {
    expect(getOrderNextStep({ ...withDocs, orderStatus: "ready", paymentStatus: "partially_paid" })).toMatchObject({
      stage: "shipment",
      turn: "customer",
      title: "Доплата 30% — без неї не відвантажуємо",
      amountDue: 3000,
    });
  });

  it("готове й оплачене — відвантажити", () => {
    expect(getOrderNextStep({ ...withDocs, orderStatus: "ready", paymentStatus: "fully_paid" })).toMatchObject({
      stage: "shipment",
      turn: "manager",
      actionLabel: "Відвантажити",
    });
  });

  it("відвантажене з відтермінуванням — чекаємо оплату", () => {
    const deferred = {
      ...withDocs,
      prepaymentPct: 0,
      balancePct: 100,
      balanceTiming: "after_shipment" as const,
      balanceDaysAfterShipment: 14,
      balanceDaysKind: "calendar" as const,
      orderStatus: "shipped",
    };
    expect(getOrderNextStep(deferred)).toMatchObject({
      stage: "awaitingPayment",
      turn: "customer",
      title: "Оплата після ВН",
      detail: "до 14 к.д.",
      amountDue: 10000,
    });
  });

  it("відвантажене й оплачене — завершене; completed — теж", () => {
    expect(getOrderNextStep({ ...withDocs, orderStatus: "shipped", paymentStatus: "fully_paid" }).stage).toBe("done");
    expect(getOrderNextStep({ ...withDocs, orderStatus: "completed" }).stage).toBe("done");
  });

  it("скасоване — поза етапами", () => {
    expect(getOrderNextStep({ ...withDocs, designStatuses: ["cancelled"] })).toMatchObject({
      stage: "cancelled",
      turn: null,
    });
  });
});

describe("getOrderPaidShare", () => {
  it("скільки отримано за статусом", () => {
    expect(getOrderPaidShare(cashless)).toEqual({ pct: 0, label: "0 з 70%" });
    expect(getOrderPaidShare({ ...cashless, paymentStatus: "partially_paid" })).toEqual({ pct: 70, label: "70% є" });
    expect(getOrderPaidShare({ ...cashless, paymentStatus: "fully_paid" })).toEqual({ pct: 100, label: "Оплачено" });
  });

  it("готове з частковою оплатою — чекає доплату", () => {
    expect(getOrderPaidShare({ ...cashless, paymentStatus: "partially_paid", orderStatus: "ready" })).toEqual({
      pct: 70,
      label: "чекає 30%",
    });
  });

  it("відтермінування — строк після ВН", () => {
    expect(
      getOrderPaidShare({
        ...cashless,
        prepaymentPct: 0,
        balancePct: 100,
        balanceTiming: "after_shipment",
        balanceDaysAfterShipment: 30,
        balanceDaysKind: "calendar",
      })
    ).toEqual({ pct: 0, label: "30 к.д. після ВН" });
  });
});

describe("getOrderDocMarks", () => {
  it("на готівці літер немає", () => {
    expect(getOrderDocMarks(cash)).toBeNull();
  });

  it("Д/С/Р/В зі створених документів; успадкований договір — готовий", () => {
    const marks = getOrderDocMarks({
      ...cashless,
      inheritedContractOrderNumber: "ZM-0926-0001",
      invoiceNumber: "407",
      invoiceCreatedAt: "2026-10-14",
    });
    expect(marks?.map((mark) => `${mark.letter}:${mark.ready}`)).toEqual(["Д:true", "С:false", "Р:true", "В:false"]);
  });
});

describe("summarizeOrderStages", () => {
  it("рахує активні етапи й отримане, завершені й скасовані — окремо", () => {
    const summary = summarizeOrderStages([
      cashless,
      { ...withDocs, paymentStatus: "partially_paid", orderStatus: "in_production" },
      { ...withDocs, orderStatus: "completed", paymentStatus: "fully_paid" },
      { ...withDocs, designStatuses: ["cancelled"] },
    ]);
    expect(summary.activeCount).toBe(2);
    expect(summary.activeTotal).toBe(20000);
    expect(summary.receivedTotal).toBe(7000);
    expect(summary.doneCount).toBe(1);
    expect(summary.byStage.setup).toEqual({ count: 1, total: 10000 });
    expect(summary.byStage.production).toEqual({ count: 1, total: 10000 });
  });
});

describe("isMyTurn", () => {
  const manager = (userId: string | null) => ({ userId, canIssueInvoice: false });
  it("менеджерський хід — лише на своєму замовленні", () => {
    expect(isMyTurn(cashless, manager("me"))).toBe(true);
    expect(isMyTurn(cashless, manager("other"))).toBe(false);
    expect(isMyTurn(cashless, manager(null))).toBe(false);
  });

  it("попросили рахунок — хід бухгалтерії на будь-якому замовленні, не менеджера", () => {
    const requested = { ...withDocs, invoiceRequestedAt: "2026-10-15T10:00:00Z" };
    expect(isMyTurn(requested, { userId: "accountant", canIssueInvoice: true })).toBe(true);
    expect(isMyTurn(requested, manager("me"))).toBe(false);
  });
});

describe("рахунок через бухгалтерію (p10)", () => {
  it("з договором і СП безготівці бракує рахунку — менеджер просить", () => {
    const next = getOrderNextStep(withDocs);
    expect(next).toMatchObject({ stage: "setup", turn: "manager", title: "Попросити рахунок" });
  });

  it("попросили — хід бухгалтерії, Р обведена", () => {
    const requested = { ...withDocs, invoiceRequestedAt: "2026-10-15T10:00:00Z" };
    expect(getOrderNextStep(requested)).toMatchObject({ turn: "accounting", title: "Рахунок у бухгалтерії" });
    expect(getOrderDocMarks(requested)?.find((mark) => mark.key === "invoice")).toMatchObject({
      ready: false,
      inProgress: true,
    });
  });

  it("попросили ще до договору — хід однаково бухгалтерії, не «Створити договір»", () => {
    const early = { ...cashless, invoiceRequestedAt: "2026-10-15T10:00:00Z" };
    expect(getOrderNextStep(early)).toMatchObject({ turn: "accounting" });
    expect(isMyTurn(early, { userId: "accountant", canIssueInvoice: true })).toBe(true);
  });

  it("попросили в запущеному замовленні — у бухгалтера це теж його хід", () => {
    const launched = { ...withDocs, orderStatus: "in_production", invoiceRequestedAt: "2026-10-15T10:00:00Z" };
    expect(isMyTurn(launched, { userId: "accountant", canIssueInvoice: true })).toBe(true);
  });

  it("повернули — знову менеджер, з причиною", () => {
    const returned = { ...withDocs, invoiceReturnNote: "Ціна не ділиться на 1,2" };
    expect(getOrderNextStep(returned)).toMatchObject({
      turn: "manager",
      title: "Рахунок повернули — виправити",
      detail: "Ціна не ділиться на 1,2",
    });
  });

  it("виписано — чекаємо передоплату від замовника", () => {
    const issued = { ...withDocs, invoiceNumber: "407", invoiceCreatedAt: "2026-10-15" };
    expect(getOrderNextStep(issued)).toMatchObject({ stage: "customer", turn: "customer" });
    expect(getOrderDocMarks(issued)?.find((mark) => mark.key === "invoice")?.ready).toBe(true);
  });

  it("готівці рахунок не потрібен", () => {
    expect(getOrderNextStep({ ...cash, contractCreatedAt: null }).title).toBe("Передоплата 70%");
  });
});

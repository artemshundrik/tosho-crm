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
  contractSignedAt: null,
  specificationSignedAt: null,
  approvals: [],
  items: [],
  currency: "UAH",
  incotermsCode: "FCA",
  incotermsPlace: null,
  contractNumber: null,
  contractDate: null,
  contractProductionDays: null,
  contractAutoProlongation: false,
  ourLegalEntityId: null,
  closingDocument: null,
  actNumber: null,
  actDate: null,
  waybillNumber: null,
  waybillDate: null,
};

// Договір і СП підписані — далі в безготівки лише рахунок і оплата.
const withDocs = {
  ...cashless,
  contractCreatedAt: "2026-10-14",
  specificationCreatedAt: "2026-10-14",
  contractSignedAt: "2026-10-15",
  specificationSignedAt: "2026-10-15",
};
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

  it("договір є, рахунку немає — спершу рахунок (p15)", () => {
    expect(getOrderNextStep({ ...cashless, contractCreatedAt: "2026-10-14" })).toMatchObject({
      stage: "setup",
      turn: "manager",
      title: "Попросити рахунок",
    });
    expect(
      getOrderNextStep({ ...cashless, contractCreatedAt: "2026-10-14", invoiceReturnNote: "не та сума" })
    ).toMatchObject({ title: "Рахунок повернули — виправити", detail: "не та сума" });
  });

  it("договір і рахунок є, СП немає — створити СП", () => {
    expect(getOrderNextStep({ ...cashless, contractCreatedAt: "2026-10-14", invoiceNumber: "407" })).toMatchObject({
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
    // Без дати ВН строку немає: бухгалтерія вносить номер з BAS.
    expect(getOrderNextStep(deferred, "2026-10-20")).toMatchObject({
      stage: "awaitingPayment",
      turn: "accounting",
      title: "Внести номер ВН",
      detail: "від дати рахуємо 14 к.д.",
      amountDue: 10000,
    });
    // ВН від 15.10 + 14 календарних — до 29.10.
    const withWaybill = { ...deferred, waybillNumber: "РН-0000012", waybillDate: "2026-10-15" };
    expect(getOrderNextStep(withWaybill, "2026-10-20")).toMatchObject({
      turn: "customer",
      title: "Оплата після ВН",
      detail: "до 29.10",
    });
    expect(getOrderNextStep(withWaybill, "2026-10-29").detail).toBe("сьогодні останній день");
    expect(getOrderNextStep(withWaybill, "2026-10-30")).toMatchObject({
      title: "Доплату прострочено",
      detail: "чекали до 29.10",
    });
  });

  it("закривається актом — строк від дати акта", () => {
    const deferredAct = {
      ...withDocs,
      prepaymentPct: 0,
      balancePct: 100,
      balanceTiming: "after_shipment" as const,
      balanceDaysAfterShipment: 5,
      balanceDaysKind: "working" as const,
      orderStatus: "shipped",
      closingDocument: "act" as const,
      waybillDate: "2026-10-01",
    };
    expect(getOrderNextStep(deferredAct, "2026-10-20").title).toBe("Внести номер акта");
    // Акт у п'ятницю 16.10 + 5 робочих — до п'ятниці 23.10.
    expect(getOrderNextStep({ ...deferredAct, actNumber: "ОУ-7", actDate: "2026-10-16" }, "2026-10-20").detail).toBe(
      "до 23.10"
    );
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

  it("Д/С готові, коли підписані; створені — обведені; успадкований підписаний договір — готовий", () => {
    const marks = getOrderDocMarks({
      ...cashless,
      inheritedContractOrderNumber: "TO-0926-0001",
      contractSignedAt: "2026-09-02",
      specificationCreatedAt: "2026-10-14",
      invoiceNumber: "407",
      invoiceCreatedAt: "2026-10-14",
    });
    expect(marks?.map((mark) => `${mark.letter}:${mark.ready ? "так" : mark.inProgress ? "в роботі" : "ні"}`)).toEqual([
      "Д:так",
      "С:в роботі",
      "Р:так",
      "В:ні",
    ]);
  });

  it("«В» готова з номером ВН; закривається актом — «А»", () => {
    expect(getOrderDocMarks({ ...cashless, waybillNumber: "РН-1", waybillDate: "2026-10-15" })?.at(-1)).toMatchObject({
      letter: "В",
      ready: true,
    });
    expect(getOrderDocMarks({ ...cashless, closingDocument: "act" })?.at(-1)).toMatchObject({ letter: "А", ready: false });
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
  const manager = (userId: string | null) => ({ userId, canIssueInvoice: false, canApproveLaunch: false });
  it("менеджерський хід — лише на своєму замовленні", () => {
    expect(isMyTurn(cashless, manager("me"))).toBe(true);
    expect(isMyTurn(cashless, manager("other"))).toBe(false);
    expect(isMyTurn(cashless, manager(null))).toBe(false);
  });

  it("попросили рахунок — хід бухгалтерії на будь-якому замовленні, не менеджера", () => {
    const requested = { ...withDocs, invoiceRequestedAt: "2026-10-15T10:00:00Z" };
    expect(isMyTurn(requested, { userId: "accountant", canIssueInvoice: true, canApproveLaunch: false })).toBe(true);
    expect(isMyTurn(requested, manager("me"))).toBe(false);
  });

  it("відвантажили з відтермінуванням без номера ВН — хід бухгалтерії", () => {
    const shipped = {
      ...withDocs,
      prepaymentPct: 0,
      balancePct: 100,
      balanceTiming: "after_shipment" as const,
      orderStatus: "shipped",
    };
    expect(isMyTurn(shipped, { userId: "accountant", canIssueInvoice: true, canApproveLaunch: false })).toBe(true);
    expect(
      isMyTurn(
        { ...shipped, waybillNumber: "РН-1", waybillDate: "2026-10-15" },
        { userId: "accountant", canIssueInvoice: true, canApproveLaunch: false }
      )
    ).toBe(false);
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
    expect(isMyTurn(early, { userId: "accountant", canIssueInvoice: true, canApproveLaunch: false })).toBe(true);
  });

  it("попросили в запущеному замовленні — у бухгалтера це теж його хід", () => {
    const launched = { ...withDocs, orderStatus: "in_production", invoiceRequestedAt: "2026-10-15T10:00:00Z" };
    expect(isMyTurn(launched, { userId: "accountant", canIssueInvoice: true, canApproveLaunch: false })).toBe(true);
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

describe("погодження, підпис і виняток у списку (p6–p8)", () => {
  const created = { ...cashless, contractCreatedAt: "2026-10-14", specificationCreatedAt: "2026-10-14" };
  const approval = (kind: "contract" | "specification" | "launch", status: "pending" | "approved" | "returned") => ({
    id: `${kind}-${status}`,
    orderId: "o",
    kind,
    status,
    documentStamp: null,
    requestNote: null,
    requestedBy: "me",
    requestedAt: "2026-10-15T10:00:00Z",
    decidedBy: null,
    decidedAt: null,
    decisionNote: status === "returned" ? "Не та дата" : null,
  });
  const accountant = { userId: "acc", canIssueInvoice: true, canApproveLaunch: false };
  const ceo = { userId: "ceo", canIssueInvoice: true, canApproveLaunch: true };

  it("створені й не надіслані — менеджер шле договір на погодження", () => {
    expect(getOrderNextStep(created)).toMatchObject({ turn: "manager", title: "Договір — на погодження" });
  });

  it("договір на погодженні — хід бухгалтерії, і бухгалтер бачить його в «Мій хід»", () => {
    const pending = { ...created, approvals: [approval("contract", "pending")] };
    expect(getOrderNextStep(pending)).toMatchObject({ turn: "accounting", title: "Договір на погодженні" });
    expect(isMyTurn(pending, accountant)).toBe(true);
    expect(isMyTurn(pending, { userId: "me", canIssueInvoice: false, canApproveLaunch: false })).toBe(false);
  });

  it("повернули — менеджер бачить причину", () => {
    const returned = { ...created, approvals: [approval("contract", "returned")] };
    expect(getOrderNextStep(returned)).toMatchObject({ turn: "manager", detail: "Не та дата" });
  });

  it("обидва погоджено — чекаємо підпис замовника", () => {
    const approved = { ...created, approvals: [approval("contract", "approved"), approval("specification", "approved")] };
    expect(getOrderNextStep(approved)).toMatchObject({ turn: "customer", title: "Чекаємо підпис договору" });
  });

  it("просять запустити без умов — хід керівництва, бухгалтеру це не його хід", () => {
    const asked = { ...created, approvals: [approval("launch", "pending")] };
    expect(getOrderNextStep(asked)).toMatchObject({ turn: "management" });
    expect(isMyTurn(asked, ceo)).toBe(true);
    expect(isMyTurn(asked, accountant)).toBe(false);
  });
});

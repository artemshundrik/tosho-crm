import { describe, expect, it } from "vitest";

import { documentStamp, type ApprovalRecord, type OrderApproval } from "./orderApprovals";
import {
  buildPaymentReminderText,
  buildSignatureReminderText,
  getDocumentDispatchState,
  getInvoiceDue,
  getSendableDocuments,
  invoiceStamp,
  previousWorkingDay,
  workingDaysBetween,
  type DispatchRecord,
  type OrderDocumentDispatch,
} from "./orderDocumentDispatch";

/**
 * Надсилання документів замовнику (REQ-343): «надіслано» — факт із відбитком,
 * рахунок дійсний 5 робочих днів, підписане на папері кроку не потребує.
 */
const approved = (kind: "contract" | "specification", stamp: string | null): OrderApproval => ({
  id: kind,
  orderId: "o",
  kind,
  status: "approved",
  documentStamp: stamp,
  requestNote: null,
  requestedBy: "me",
  requestedAt: "2026-10-15T09:00:00Z",
  decidedBy: "acc",
  decidedAt: "2026-10-15T12:00:00Z",
  decisionNote: null,
});

const base: DispatchRecord = {
  paymentMethodId: "bank_uah",
  paymentRail: "Безготівкові, грн.",
  contractCreatedAt: "2026-10-14",
  specificationCreatedAt: "2026-10-14",
  inheritedContractOrderNumber: null,
  contractSignedAt: null,
  specificationSignedAt: null,
  approvals: [],
  items: [{ name: "Ручка", qty: 700, unitPrice: 16.62 } as ApprovalRecord["items"][number]],
  total: 11634,
  currency: "UAH",
  prepaymentPct: 100,
  balancePct: 0,
  balanceTiming: "before_shipment",
  balanceDaysAfterShipment: null,
  balanceDaysKind: "working",
  incotermsCode: "FCA",
  incotermsPlace: null,
  contractNumber: null,
  contractDate: null,
  contractProductionDays: 50,
  contractAutoProlongation: false,
  ourLegalEntityId: null,
  invoiceNumber: null,
  invoiceDate: null,
  invoiceCreatedAt: null,
  paymentStatus: "not_paid",
  documentDispatches: [],
};

const withApprovals: DispatchRecord = {
  ...base,
  approvals: [approved("contract", documentStamp(base, "contract")), approved("specification", documentStamp(base, "specification"))],
};

const mark = (patch: Partial<OrderDocumentDispatch>): OrderDocumentDispatch => ({
  id: Math.random().toString(36),
  orderId: "o",
  document: "specification",
  event: "sent",
  channel: "email",
  documentStamp: null,
  note: null,
  createdBy: "me",
  createdAt: "2026-10-16T09:00:00Z",
  ...patch,
});

describe("робочі дні", () => {
  it("з п'ятниці до вівторка — два робочі дні", () => {
    expect(workingDaysBetween("2026-10-16", "2026-10-20")).toBe(2);
    expect(workingDaysBetween("2026-10-16", "2026-10-16")).toBe(0);
  });

  it("за день до понеділка — п'ятниця", () => {
    expect(previousWorkingDay("2026-10-26")).toBe("2026-10-23");
  });
});

describe("getInvoiceDue — 5 робочих днів з дати рахунку (p13)", () => {
  const invoice = {
    invoiceNumber: "407",
    invoiceDate: "2026-10-16",
    invoiceCreatedAt: null,
    prepaymentPct: 70,
    balanceTiming: "before_shipment",
    paymentStatus: "not_paid",
  };

  it("строк, попередження за день і прострочка", () => {
    expect(getInvoiceDue(invoice, "2026-10-21")).toMatchObject({ dueDate: "2026-10-23", warning: false, overdue: false });
    expect(getInvoiceDue(invoice, "2026-10-22")).toMatchObject({ warning: true, overdue: false });
    expect(getInvoiceDue(invoice, "2026-10-26")).toMatchObject({ warning: false, overdue: true });
  });

  it("оплата пішла або відтермінування від ВН — строку рахунку немає", () => {
    expect(getInvoiceDue({ ...invoice, paymentStatus: "partially_paid" }, "2026-10-26")).toBeNull();
    expect(getInvoiceDue({ ...invoice, prepaymentPct: 0, balanceTiming: "after_shipment" }, "2026-10-26")).toBeNull();
  });
});

describe("getDocumentDispatchState", () => {
  it("не погоджено — надсилати ще не можна; погоджено — треба надіслати", () => {
    expect(getDocumentDispatchState(base, "specification").state).toBe("notReady");
    expect(getDocumentDispatchState(withApprovals, "specification")).toEqual({ state: "unsent", since: "2026-10-15T12:00:00Z" });
  });

  it("надіслано з чинним відбитком — чекаємо, нагадування видно", () => {
    const record = {
      ...withApprovals,
      documentDispatches: [
        mark({ documentStamp: documentStamp(base, "specification") }),
        mark({ event: "reminded", channel: "viber", createdAt: "2026-10-20T09:00:00Z" }),
      ],
    };
    const state = getDocumentDispatchState(record, "specification");
    expect(state.state).toBe("sent");
    expect(state.state === "sent" && state.reminded?.channel).toBe("viber");
  });

  it("позначка Вчасно без відбитка — чинна", () => {
    const record = { ...withApprovals, documentDispatches: [mark({ channel: "vchasno", documentStamp: null })] };
    expect(getDocumentDispatchState(record, "specification").state).toBe("sent");
  });

  it("підписали на папері одразу — кроку надсилання немає", () => {
    expect(getDocumentDispatchState({ ...withApprovals, specificationSignedAt: "2026-10-16" }, "specification").state).toBe("none");
  });

  it("успадкований договір і готівка — нічого не надсилаємо", () => {
    expect(getDocumentDispatchState({ ...withApprovals, inheritedContractOrderNumber: "TS-1" }, "contract").state).toBe("none");
    expect(getDocumentDispatchState({ ...withApprovals, paymentMethodId: "cash", paymentRail: "Готівкові" }, "specification").state).toBe("none");
  });

  it("рахунок: перевиписали з іншим номером — надіслати наново; оплачено — більше не треба", () => {
    const issued = { ...base, invoiceNumber: "407", invoiceDate: "2026-10-16", invoiceCreatedAt: "2026-10-16T10:00:00Z" };
    const sent = { ...issued, documentDispatches: [mark({ document: "invoice", documentStamp: invoiceStamp(issued) })] };
    expect(getDocumentDispatchState(sent, "invoice").state).toBe("sent");
    expect(getDocumentDispatchState({ ...sent, invoiceNumber: "412" }, "invoice").state).toBe("unsent");
    expect(getDocumentDispatchState({ ...sent, paymentStatus: "partially_paid" }, "invoice").state).toBe("none");
  });

  it("що пропонувати позначити: погоджені договір і СП, без рахунку без номера", () => {
    expect(getSendableDocuments(withApprovals).map((item) => item.document)).toEqual(["contract", "specification"]);
  });
});

describe("тексти «Нагадати замовнику» (p11)", () => {
  it("підпис і оплата", () => {
    expect(buildSignatureReminderText({ orderNumber: "TS-1026-0012", documents: ["contract", "specification"], sentAt: "2026-10-16T09:00:00Z" })).toBe(
      "Добрий день! Нагадую про підпис: договір і СП по замовленню TS-1026-0012. Надсилали 16.10. Якщо є правки чи питання — напишіть, будь ласка."
    );
    expect(buildPaymentReminderText({ invoiceNumber: "407", invoiceDate: "2026-10-16", amount: "11 634 грн", dueDate: "2026-10-23" })).toContain(
      "рахунку № 407 від 16.10 на суму 11 634 грн. Рахунок дійсний до 23.10."
    );
  });
});

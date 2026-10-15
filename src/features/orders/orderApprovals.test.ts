import { describe, expect, it } from "vitest";

import { documentStamp, getDocumentApprovalState, isDocumentSigned, type ApprovalRecord } from "./orderApprovals";

const base: ApprovalRecord = {
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
};

describe("documentStamp", () => {
  it("строк доплати до відвантаження не впливає: після перезавантаження він приходить з успадкованого договору", () => {
    expect(documentStamp({ ...base, balanceDaysAfterShipment: 14 }, "specification")).toBe(
      documentStamp(base, "specification")
    );
  });

  it("числа в одному форматі: 33.333 локально й 33.33 з бази — той самий документ", () => {
    expect(documentStamp({ ...base, prepaymentPct: 33.333 }, "specification")).toBe(
      documentStamp({ ...base, prepaymentPct: 33.33 }, "specification")
    );
  });

  it("інша наша юрособа — інший договір і СП; без юрособи відбиток не змінився", () => {
    for (const kind of ["contract", "specification"] as const) {
      expect(documentStamp({ ...base, ourLegalEntityId: "fop-1" }, kind)).not.toBe(documentStamp(base, kind));
      expect(documentStamp({ ...base, ourLegalEntityId: "fop-1" }, kind)).not.toBe(
        documentStamp({ ...base, ourLegalEntityId: "fop-2" }, kind)
      );
    }
    expect(documentStamp(base, "contract")).toBe("contract|||false|100.00|0.00|before_shipment|||50.00");
  });

  it("інша ціна — інший документ", () => {
    const changed = { ...base, items: [{ ...base.items[0], unitPrice: 16.68 }] };
    expect(documentStamp(changed, "specification")).not.toBe(documentStamp(base, "specification"));
  });
});

describe("підпис і змінений документ", () => {
  const approved = {
    id: "a",
    orderId: "o",
    kind: "specification" as const,
    status: "approved" as const,
    documentStamp: documentStamp(base, "specification"),
    requestNote: null,
    requestedBy: "m",
    requestedAt: "2026-10-15T10:00:00Z",
    decidedBy: "acc",
    decidedAt: "2026-10-15T11:00:00Z",
    decisionNote: null,
  };

  it("підписана й незмінена СП — підпис чинний", () => {
    const signed = { ...base, approvals: [approved], specificationSignedAt: "2026-10-16" };
    expect(isDocumentSigned(signed, "specification")).toBe(true);
  });

  it("СП перестворили з іншими умовами — підпис уже не про неї, треба погодити наново", () => {
    const changed = { ...base, approvals: [approved], specificationSignedAt: "2026-10-16", prepaymentPct: 50, balancePct: 50 };
    expect(getDocumentApprovalState(changed, "specification").state).toBe("stale");
    expect(isDocumentSigned(changed, "specification")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import type { DerivedOrderRecord } from "./orderRecords";
import {
  getMissingRequirementLabels,
  getOrderDocumentKinds,
  getSpecificationRequirementChecks,
} from "./orderDocumentRequirements";

const base = {
  paymentMethodId: "cash",
  paymentRail: "Готівкові / на карту",
  contractCreatedAt: null,
  specificationCreatedAt: null,
  invoiceCreatedAt: null,
  invoiceNumber: null,
};

describe("getOrderDocumentKinds", () => {
  it("безготівка — усі чотири документи", () => {
    expect(getOrderDocumentKinds({ ...base, paymentMethodId: "bank_uah", paymentRail: "Безготівкові, грн." })).toEqual([
      "contract",
      "specification",
      "invoice",
      "techCard",
    ]);
  });

  it("готівка — лише техкарта", () => {
    expect(getOrderDocumentKinds(base)).toEqual(["techCard"]);
  });

  it("готівка зі старим виписаним рахунком — рахунок лишається, щоб його можна було відкрити", () => {
    expect(getOrderDocumentKinds({ ...base, invoiceNumber: "СФ-0042", invoiceCreatedAt: "2026-09-01" })).toEqual([
      "invoice",
      "techCard",
    ]);
  });
});

describe("СП без погодженого візуалу", () => {
  it("не каже «Можна створити», коли друк однаково відмовить", () => {
    const record = {
      items: [{ id: "1" }],
      paymentMethodId: "bank_uah",
      paymentRail: "Безготівкові, грн.",
      contractCreatedAt: "2026-10-14",
      paymentTerms: "70_30",
      incotermsCode: "FCA",
      hasApprovedVisualization: false,
    } as unknown as DerivedOrderRecord;
    const labels = getMissingRequirementLabels(getSpecificationRequirementChecks(record));
    expect(labels).toContain("Погоджена візуалізація");
  });
});

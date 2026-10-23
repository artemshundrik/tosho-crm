import { describe, expect, it } from "vitest";

import type { DerivedOrderRecord } from "./orderRecords";
import {
  canCreateSpecification,
  getMissingRequirementLabels,
  getOrderDocumentKinds,
  getSpecificationBlocker,
  getSpecificationRequirementChecks,
} from "./orderDocumentRequirements";

const base = {
  paymentMethodId: "cash",
  paymentRail: "Готівкові / на карту",
  contractCreatedAt: null,
  specificationCreatedAt: null,
  invoiceCreatedAt: null,
  invoiceNumber: null,
  closingDocument: null,
};

describe("getOrderDocumentKinds", () => {
  it("безготівка — усі чотири документи", () => {
    expect(getOrderDocumentKinds({ ...base, paymentMethodId: "bank_uah", paymentRail: "Безготівкові, грн." })).toEqual([
      "contract",
      "invoice",
      "specification",
      "techCard",
    ]);
  });

  it("безготівка з актом — рахунок перед СП, акт після них; видаткову CRM не друкує", () => {
    const cashless = { ...base, paymentMethodId: "bank_uah", paymentRail: "Безготівкові, грн." };
    expect(getOrderDocumentKinds({ ...cashless, closingDocument: "act" })).toEqual([
      "contract",
      "invoice",
      "specification",
      "act",
      "techCard",
    ]);
    expect(getOrderDocumentKinds({ ...cashless, closingDocument: "waybill" })).not.toContain("act");
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
  // Не кожному замовнику візуал потрібен у СП — менеджер вирішує у вікні параметрів (REQ-322#p37).
  const record = {
    items: [{ id: "1" }],
    paymentMethodId: "bank_uah",
    paymentRail: "Безготівкові, грн.",
    contractCreatedAt: "2026-10-14",
    invoiceNumber: "407",
    customerVatId: "1234567890",
    paymentTerms: "70_30",
    incotermsCode: "FCA",
    hasApprovedVisualization: false,
  } as unknown as DerivedOrderRecord;

  it("не блокується відсутнім візуалом", () => {
    expect(getMissingRequirementLabels(getSpecificationRequirementChecks(record))).toEqual([]);
    expect(getSpecificationBlocker(record)).toBeNull();
    expect(canCreateSpecification(record)).toBe(true);
  });
});

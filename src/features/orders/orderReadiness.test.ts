import { describe, expect, it } from "vitest";

import { buildDerivedReadinessSteps, getReadinessColumn, type DerivedReadinessInput } from "./orderReadiness";

const ready: DerivedReadinessInput = {
  partyType: "customer",
  requiresCustomerDocuments: true,
  hasEmail: true,
  hasPhone: true,
  hasLegalEntityIdentity: true,
  hasFullSignatoryName: true,
  isVatPayer: true,
  hasValidVatId: true,
  hasItems: true,
  runChoicePending: false,
  requiresVisualization: true,
  hasApprovedVisualization: true,
  requiresLayout: true,
  hasApprovedLayout: true,
};

const blockersOf = (input: DerivedReadinessInput) =>
  buildDerivedReadinessSteps(input)
    .filter((step) => !step.done && step.blocking)
    .map((step) => step.label);

describe("buildDerivedReadinessSteps", () => {
  it("безготівка без реквізитів блокується реквізитами, ПІБ і ІПН", () => {
    const blockers = blockersOf({
      ...ready,
      hasLegalEntityIdentity: false,
      hasFullSignatoryName: false,
      hasValidVatId: false,
    });
    expect(blockers).toEqual([
      "Заповнені реквізити, юр. назва та підписант",
      "Вказано повне ПІБ підписанта (прізвище, імʼя, по-батькові)",
      "Вказано ІПН платника ПДВ (12 цифр)",
    ]);
  });

  it("готівка без реквізитів не блокується", () => {
    expect(
      blockersOf({
        ...ready,
        requiresCustomerDocuments: false,
        hasLegalEntityIdentity: false,
        hasFullSignatoryName: false,
        hasValidVatId: false,
        hasEmail: false,
      })
    ).toEqual([]);
  });

  it("готівка без телефону блокується телефоном", () => {
    expect(blockersOf({ ...ready, requiresCustomerDocuments: false, hasPhone: false })).toEqual([
      "Заповнений мобільний номер",
    ]);
  });

  it("безготівка вимагає і email, і телефон", () => {
    expect(blockersOf({ ...ready, hasEmail: false })).toEqual(["Заповнені email та мобільний номер"]);
  });

  it("дизайн блокує будь-який спосіб оплати", () => {
    expect(blockersOf({ ...ready, requiresCustomerDocuments: false, hasApprovedLayout: false })).toEqual([
      "Макет погоджено",
    ]);
  });
});

describe("getReadinessColumn", () => {
  it("контрагент, дизайн, готово", () => {
    expect(getReadinessColumn(["Заповнений мобільний номер"])).toBe("counterparty");
    expect(getReadinessColumn(["Заповнені реквізити, юр. назва та підписант"])).toBe("counterparty");
    expect(getReadinessColumn(["Макет погоджено"])).toBe("design");
    expect(getReadinessColumn([])).toBe("ready");
  });
});

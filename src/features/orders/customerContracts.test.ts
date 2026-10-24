import { describe, expect, it } from "vitest";

import { canManageOrderDocuments } from "@/lib/permissions";

import { isCustomerContractActive } from "./customerContracts";
import { getInvoiceContractBlocker } from "./orderDocumentRequirements";

describe("договір поза CRM", () => {
  it("закінчений без пролонгації не діє, пролонгований і безстроковий — діють", () => {
    expect(isCustomerContractActive({ validUntil: "2026-10-01", autoProlongation: false }, "2026-10-24")).toBe(false);
    expect(isCustomerContractActive({ validUntil: "2026-10-01", autoProlongation: true }, "2026-10-24")).toBe(true);
    expect(isCustomerContractActive({ validUntil: null, autoProlongation: false }, "2026-10-24")).toBe(true);
    expect(isCustomerContractActive({ validUntil: "2026-10-24", autoProlongation: false }, "2026-10-24")).toBe(true);
  });
});

describe("рахунок без підписаного договору (REQ-322#p40)", () => {
  it("блокує, поки договір не підписано", () => {
    expect(getInvoiceContractBlocker({ contractSignedAt: null, contractCreatedAt: null })).toMatch(/Немає договору/);
    expect(getInvoiceContractBlocker({ contractSignedAt: null, contractCreatedAt: "2026-10-20T10:00:00Z" })).toMatch(
      /не підписаний/
    );
    expect(
      getInvoiceContractBlocker({ contractSignedAt: "2026-10-21T00:00:00Z", contractCreatedAt: "2026-10-20T10:00:00Z" })
    ).toBeNull();
  });
});

describe("хто вносить договори й править назви (REQ-322#p41)", () => {
  it("СЕО, власник і вся бухгалтерія — так; менеджер — ні", () => {
    for (const job of ["seo", "chief_accountant", "accountant", "junior_accountant"]) {
      expect(canManageOrderDocuments("member", job)).toBe(true);
    }
    expect(canManageOrderDocuments("owner", null)).toBe(true);
    expect(canManageOrderDocuments("member", "manager")).toBe(false);
    expect(canManageOrderDocuments("member", "pm")).toBe(false);
  });
});

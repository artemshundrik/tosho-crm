import { describe, expect, it, vi } from "vitest";

// customerValidation → customerLogo тягне клієнт бази, якому потрібен window.
// Правилам він не потрібен, а логічні тести йдуть без браузера.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import type { CustomerFormState } from "./CustomerDialog";
import { validateCustomerForm } from "./customerValidation";
import type { LeadFormState } from "./LeadDialog";
import { getLeadConversionMissingFields } from "./leadRecord";

/**
 * «Готівка — реквізити необовʼязкові» (REQ-329).
 *
 * Форма ліда й картка замовника ОБІЦЯЮТЬ це підписом, а правила переведення й
 * перевірки форми про спосіб оплати не знали: 09.10.2026 лід IFB, що заплатив
 * як фізособа, не переводився в замовника без ЄДРПОУ, адреси й підписанта.
 * Тест тримає обіцянку підпису й правило на одному боці.
 */

const lead = (overrides: Partial<LeadFormState>) =>
  ({
    paymentType: "invoice",
    ownershipType: "",
    taxId: "",
    legalAddress: "",
    iban: "",
    signatoryPosition: "",
    email: "",
    ...overrides,
  }) as LeadFormState;

const customer = (overrides: Partial<CustomerFormState>) =>
  ({
    name: "IFB",
    source: "Сайт",
    paymentType: "invoice",
    logoUploadMode: "url",
    logoUrl: "",
    contacts: [{ phone: "+380669917080", email: "" }],
    ...overrides,
  }) as CustomerFormState;

describe("переведення ліда в замовника", () => {
  it("на «Готівці» досить телефону — як у ліда IFB", () => {
    expect(getLeadConversionMissingFields(lead({ paymentType: "cash" }), ["+380669917080"])).toEqual([]);
  });

  it("на «Готівці» без телефону — бракує лише телефону", () => {
    expect(getLeadConversionMissingFields(lead({ paymentType: "cash" }), [])).toEqual(["телефон"]);
  });

  it("на «Рахунку» реквізити й пошта й далі обовʼязкові", () => {
    expect(getLeadConversionMissingFields(lead({ ownershipType: "fop" }), ["+380669917080"])).toEqual([
      "ІПН",
      "прописка",
      "IBAN",
      "посада підписанта",
      "email",
    ]);
  });
});

describe("новий замовник у повній формі", () => {
  it("на «Готівці» пошта не потрібна", () => {
    expect(validateCustomerForm(customer({ paymentType: "cash" }), { isNew: true }).contactEmail).toBeUndefined();
  });

  it("на «Рахунку» пошта потрібна", () => {
    expect(validateCustomerForm(customer({}), { isNew: true }).contactEmail).toBeDefined();
  });
});

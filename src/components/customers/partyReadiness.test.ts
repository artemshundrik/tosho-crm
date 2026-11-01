import { describe, expect, it, vi } from "vitest";

// leadRecord → customerLogo тягне клієнт бази, якому потрібен window.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import type { CustomerFormState } from "./CustomerDialog";
import type { LeadFormState } from "./LeadDialog";
import { getLeadConversionMissingFields } from "./leadRecord";
import { customerReadinessInput, getPartyReadiness, leadReadinessInput, type PartyReadinessInput } from "./partyReadiness";
import { createEmptyCustomerLegalEntity } from "@/lib/customerLegalEntities";

const EMPTY: PartyReadinessInput = {
  paymentType: "invoice",
  ownershipType: "",
  taxId: "",
  legalAddress: "",
  iban: "",
  signatoryPosition: "",
  phones: [],
  documentEmail: "",
};

describe("getPartyReadiness", () => {
  it("на Готівці один пункт — телефон", () => {
    expect(getPartyReadiness({ ...EMPTY, paymentType: "cash" }).total).toBe(1);
    expect(getPartyReadiness({ ...EMPTY, paymentType: "cash", phones: ["+380671234567"] }).missing).toEqual([]);
  });

  it("на Рахунку сім пунктів у сталому порядку", () => {
    expect(getPartyReadiness(EMPTY).missing).toEqual([
      "ownership",
      "taxId",
      "legalAddress",
      "iban",
      "signatory",
      "phone",
      "documentEmail",
    ]);
  });

  it("ФОП називає ІПН і прописку", () => {
    const r = getPartyReadiness({ ...EMPTY, ownershipType: "fop" });
    expect(r.items.find((i) => i.key === "taxId")?.label).toBe("ІПН");
    expect(r.items.find((i) => i.key === "legalAddress")?.label).toBe("прописка");
  });

  it("пробіли — не значення", () => {
    expect(getPartyReadiness({ ...EMPTY, iban: "   " }).missing).toContain("iban");
    expect(getPartyReadiness({ ...EMPTY, phones: ["  "] }).missing).toContain("phone");
  });

  it("MAS Seeds з прототипу: 1/7", () => {
    const r = getPartyReadiness({ ...EMPTY, phones: ["+380501112233"] });
    expect(r.done).toBe(1);
    expect(r.total).toBe(7);
  });
});

describe("входи готовності", () => {
  it("замовник: реквізити з основної юрособи, пошта — бухгалтера або основного контакту", () => {
    const entity = { ...createEmptyCustomerLegalEntity(), ownershipType: "tov", taxId: "44885114", iban: "UA30" };
    const form = {
      paymentType: "invoice",
      legalEntities: [entity],
      contacts: [{ name: "", position: "", phone: "+380501112233", email: "boss@mas.ua", birthday: "", telegram: "" }],
      accountantEmail: "",
    } as unknown as CustomerFormState;
    const input = customerReadinessInput(form);
    expect(input.ownershipType).toBe("tov");
    expect(input.taxId).toBe("44885114");
    expect(input.iban).toBe("UA30");
    expect(input.phones).toEqual(["+380501112233"]);
    expect(input.documentEmail).toBe("boss@mas.ua");
    expect(customerReadinessInput({ ...form, accountantEmail: "buh@mas.ua" }).documentEmail).toBe("buh@mas.ua");
  });

  it("замовник без юросіб — усі реквізити порожні", () => {
    const form = { paymentType: "invoice", legalEntities: [], contacts: [], accountantEmail: "" } as unknown as CustomerFormState;
    expect(getPartyReadiness(customerReadinessInput(form)).done).toBe(0);
  });

  it("лід: пошта ліда — пошта для документів", () => {
    const form = { paymentType: "invoice", ownershipType: "fop", taxId: "", legalAddress: "", iban: "", signatoryPosition: "", email: "a@b.ua" } as LeadFormState;
    expect(leadReadinessInput(form, ["+380"]).documentEmail).toBe("a@b.ua");
  });
});

it("getLeadConversionMissingFields віддає ті самі підписи, що й раніше", () => {
  const lead = { paymentType: "invoice", ownershipType: "", taxId: "", legalAddress: "", iban: "", signatoryPosition: "", email: "" } as LeadFormState;
  expect(getLeadConversionMissingFields(lead, [])).toEqual([
    "форма власності",
    "ЄДРПОУ / ІПН",
    "юридична адреса",
    "IBAN",
    "посада підписанта",
    "телефон",
    "email",
  ]);
  expect(getLeadConversionMissingFields({ ...lead, ownershipType: "fop" }, ["+380"])).toEqual([
    "ІПН",
    "прописка",
    "IBAN",
    "посада підписанта",
    "email",
  ]);
});

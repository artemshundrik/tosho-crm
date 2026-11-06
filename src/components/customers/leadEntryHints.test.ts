import { describe, expect, it } from "vitest";

import { getLeadEntryHints, isMissingReferredByColumn, telegramFromPhoneField } from "./leadEntryHints";
import type { LeadFormState } from "./partyFormTypes";

// Лише поля, які читають підказки; leadRecord тягне window і в node не вантажиться.
const form = (patch: Partial<LeadFormState>) =>
  ({ phones: [""], email: "", telegram: "", source: "Сайт", referredBy: "", ...patch }) as LeadFormState;

describe("getLeadEntryHints", () => {
  it("справжній номер — нічого", () => {
    expect(getLeadEntryHints(form({ phones: ["+380 50 111 22 33"] }))).toEqual([]);
  });

  it("не пошта в полі пошти", () => {
    expect(getLeadEntryHints(form({ email: "тг masseeds" }))).toEqual([{ field: "email", kind: "not_email" }]);
    expect(getLeadEntryHints(form({ email: "masseeds" }))).toEqual([{ field: "email", kind: "not_email" }]);
    expect(getLeadEntryHints(form({ email: "info@mas.ua" }))).toEqual([]);
    expect(getLeadEntryHints(form({ email: "" }))).toEqual([]);
  });

  it("рекомендація без імені — питає, від кого", () => {
    expect(getLeadEntryHints(form({ source: "Рекомендація" }))).toEqual([{ field: "referredBy", kind: "referral_without_name" }]);
    expect(getLeadEntryHints(form({ source: "Рекомендація", referredBy: "Олена з Нова Пошта" }))).toEqual([]);
  });
});

describe("telegramFromPhoneField", () => {
  it("упізнає нік і посилання, а номер лишає телефоном", () => {
    expect(telegramFromPhoneField("@masseeds")).toBe("@masseeds");
    expect(telegramFromPhoneField("t.me/masseeds")).toBe("@masseeds");
    expect(telegramFromPhoneField("https://t.me/masseeds")).toBe("@masseeds");
    expect(telegramFromPhoneField("+380 50 111 22 33")).toBeNull();
  });
});

describe("isMissingReferredByColumn", () => {
  it("впізнає стару схему без колонки", () => {
    expect(isMissingReferredByColumn({ message: 'column "referred_by" of relation "leads" does not exist' })).toBe(true);
    expect(isMissingReferredByColumn({ message: "Could not find the 'referred_by' column of 'customers' in the schema cache" })).toBe(true);
    expect(isMissingReferredByColumn({ message: "permission denied" })).toBe(false);
    expect(isMissingReferredByColumn(null)).toBe(false);
  });
});

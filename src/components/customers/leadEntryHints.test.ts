import { describe, expect, it } from "vitest";

import { getLeadEntryHints, isMissingReferredByColumn, moveTelegramFromPhones } from "./leadEntryHints";
import type { LeadFormState } from "./LeadDialog";

// Лише поля, які читають підказки; leadRecord тягне window і в node не вантажиться.
const form = (patch: Partial<LeadFormState>) =>
  ({ phones: [""], email: "", telegram: "", source: "Сайт", referredBy: "", ...patch }) as LeadFormState;

describe("getLeadEntryHints", () => {
  it("нік Telegram у полі телефону — пропонує перенести", () => {
    expect(getLeadEntryHints(form({ phones: ["@masseeds"] }))).toEqual([
      { field: "phone", kind: "telegram_in_phone", telegram: "@masseeds" },
    ]);
    expect(getLeadEntryHints(form({ phones: ["t.me/masseeds"] }))).toEqual([
      { field: "phone", kind: "telegram_in_phone", telegram: "@masseeds" },
    ]);
    expect(getLeadEntryHints(form({ phones: ["https://t.me/masseeds"] }))).toEqual([
      { field: "phone", kind: "telegram_in_phone", telegram: "@masseeds" },
    ]);
  });

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

describe("moveTelegramFromPhones", () => {
  it("переносить нік у Telegram і прибирає його з телефонів", () => {
    const moved = moveTelegramFromPhones(form({ phones: ["@test"] }));
    expect(moved.telegram).toBe("@test");
    expect(moved.phones).toEqual([""]);
    expect(moveTelegramFromPhones(form({ phones: ["+380501112233", "t.me/abc_d"], telegram: "@old" }))).toMatchObject({
      telegram: "@old",
      phones: ["+380501112233"],
    });
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

import { describe, expect, it } from "vitest";

import {
  cleanLeadPhones,
  getLeadContactIssue,
  hasLeadContact,
  leadContactLabel,
} from "./leadContact";

/**
 * Правило «телефон АБО Telegram» (REQ-298).
 *
 * НАВІЩО ТЕСТ НА ТРЬОХ РЯДКАХ УМОВИ. Цінність не в самій умові, а в тому, що її
 * читають троє — форма (зірочка), швидке створення з прорахунку й сторінка
 * «Замовники». Тест тримає їх на одному правилі: зламавши його заради одного
 * місця, видно одразу, що поламались усі три.
 */
describe("звʼязок із лідом", () => {
  it("порожня форма — звʼязку немає", () => {
    expect(hasLeadContact({ phones: [""], telegram: "" })).toBe(false);
    expect(getLeadContactIssue({ phones: [""], telegram: "" })).toMatch(/телефону або Telegram/);
  });

  it("самого телефону досить", () => {
    expect(hasLeadContact({ phones: ["+380671234567"], telegram: "" })).toBe(true);
    expect(getLeadContactIssue({ phones: ["+380671234567"], telegram: "" })).toBeNull();
  });

  it("самого Telegram теж досить — заради цього все й робилось", () => {
    expect(hasLeadContact({ phones: [""], telegram: "@marketing_lead" })).toBe(true);
    expect(getLeadContactIssue({ phones: ["", " "], telegram: "@marketing_lead" })).toBeNull();
  });

  it("посилання на профіль рахується як нік", () => {
    expect(hasLeadContact({ phones: [], telegram: "https://t.me/marketing_lead" })).toBe(true);
  });

  it("сам «@» чи пробіли за звʼязок не рахуються", () => {
    expect(hasLeadContact({ phones: ["   "], telegram: "@" })).toBe(false);
    expect(hasLeadContact({ phones: [], telegram: "   " })).toBe(false);
  });

  it("порожні рядки з форми не потрапляють у базу", () => {
    expect(cleanLeadPhones([" +380671234567 ", "", "  ", null, undefined])).toEqual(["+380671234567"]);
  });
});

describe("чим набрати ліда у списку", () => {
  it("номер має перевагу", () => {
    expect(leadContactLabel({ phone_numbers: ["+380671234567"], telegram: "marketing_lead" })).toBe(
      "+380671234567"
    );
  });

  it("без номера показуємо нік, а не «Не вказано»", () => {
    expect(leadContactLabel({ phone_numbers: [], telegram: "marketing_lead" })).toBe("@marketing_lead");
    expect(leadContactLabel({ phone_numbers: [""], telegram: "@marketing_lead" })).toBe("@marketing_lead");
  });

  it("немає нічого — чесне «Не вказано»", () => {
    expect(leadContactLabel({ phone_numbers: null, telegram: null })).toBe("Не вказано");
  });
});

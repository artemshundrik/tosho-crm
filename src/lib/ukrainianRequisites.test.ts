import { describe, expect, it } from "vitest";
import { bankFromIban, ibanIssue, normalizeIban, taxIdIssue, vatIdIssue } from "./ukrainianRequisites";

const PRIVAT = "UA303052990000026007000000000";

describe("IBAN", () => {
  it("вставлений з банку — з пробілами й малими літерами — нормалізується", () => {
    expect(normalizeIban(" ua 30 3052 9900 0002 6007 0000 0000 0")).toBe(PRIVAT);
    expect(normalizeIban(" ua 30 3052 9900 0002 6007 0000 0000 0")).toMatch(/^UA\d{27}$/);
    expect(ibanIssue(" ua 30 3052 9900 0002 6007 0000 0000 0")).toBeNull();
    expect(bankFromIban(" ua 30 3052 9900 0002 6007 0000 0000 0")?.mfo).toBe("305299");
  });

  it("банк визначається з МФО — цифр 5–10", () => {
    expect(bankFromIban(PRIVAT)).toEqual({ mfo: "305299", bankName: "АТ КБ «ПриватБанк»" });
  });

  it("невідомий МФО — не вигадуємо", () => {
    expect(bankFromIban("UA309999990000026007000000000")).toEqual({ mfo: "999999", bankName: null });
  });

  it("неповний IBAN — банку немає, є помилка", () => {
    expect(bankFromIban("UA30305299")).toBeNull();
    expect(ibanIssue("UA30305299")).toBe("IBAN — це UA і 27 цифр");
    expect(ibanIssue("")).toBeNull();
  });
});

describe("коди", () => {
  it("ЄДРПОУ — 8 цифр, ІПН ФОП — 10", () => {
    expect(taxIdIssue("44885114", "tov")).toBeNull();
    expect(taxIdIssue("4488511", "tov")).toBe("ЄДРПОУ — 8 цифр");
    expect(taxIdIssue("44885114", "fop")).toBe("ІПН ФОП — 10 цифр");
    expect(taxIdIssue("3012345678", "fop")).toBeNull();
    expect(taxIdIssue("", "tov")).toBeNull();
  });

  it("ІПН платника ПДВ — 12 цифр або порожньо", () => {
    expect(vatIdIssue("448851126587")).toBeNull();
    expect(vatIdIssue("")).toBeNull();
    expect(vatIdIssue("44885112")).toBe("ІПН платника ПДВ — 12 цифр");
  });
});

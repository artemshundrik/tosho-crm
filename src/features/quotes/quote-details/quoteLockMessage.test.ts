import { describe, expect, it } from "vitest";
import { QUOTE_LOCKED_BY_OTHER_MESSAGE, getErrorMessage } from "./config";

describe("відмова через чужий лок прорахунку", () => {
  it("перекладається з англійської бази людською мовою", () => {
    const fromDb = { code: "P0001", message: "Quote is locked by another user" };
    expect(getErrorMessage(fromDb, "запасний текст")).toBe(QUOTE_LOCKED_BY_OTHER_MESSAGE);
  });

  it("лок дизайн-задачі не видається за лок прорахунку", () => {
    const fromDb = { message: "Design task is locked by another user" };
    expect(getErrorMessage(fromDb, "запасний текст")).toBe("Design task is locked by another user");
  });

  it("інші помилки й порожнеча — як і були", () => {
    expect(getErrorMessage(new Error("щось інше"), "запасний текст")).toBe("щось інше");
    expect(getErrorMessage(null, "запасний текст")).toBe("запасний текст");
  });
});

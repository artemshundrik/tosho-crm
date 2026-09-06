import { describe, expect, it } from "vitest";

import { formatQuoteItemMethodsSummary } from "./quoteItemMethodsSummary";

const directory = new Map([["m-1", "Вишивка"]]);

describe("підсумок нанесень позиції", () => {
  it("бере назву з довідника й дописує розмір", () => {
    expect(
      formatQuoteItemMethodsSummary([{ method_id: "m-1", print_width_mm: 100, print_height_mm: 30 }], directory)
    ).toBe("Вишивка 100x30 мм");
  });

  it("готовий підпис перебиває довідник", () => {
    expect(formatQuoteItemMethodsSummary([{ label: "Шовкодрук, груди" }], directory)).toBe("Шовкодрук, груди");
  });

  it("запис без методу не стає нанесенням (REQ-178#p5)", () => {
    // Саме так лежить у трьох давніх позиціях (лютий–квітень 2026): порожня
    // пара {method_id: null}. Заглушка видавала її за метод, і — гірше —
    // непорожній підсумок робив із позиції таку, що «має друк», тобто
    // замовлення чекало б погодження дизайну, якого ніхто не малює.
    expect(formatQuoteItemMethodsSummary([{ method_id: null, count: 1 }], directory)).toBeNull();
    expect(formatQuoteItemMethodsSummary([{ method_id: "  " }], directory)).toBeNull();
    // Позиція без методу, але з місцем — той самий випадок: наносити нічого.
    expect(
      formatQuoteItemMethodsSummary([{ method_id: null, print_position_id: "p-1" }], directory)
    ).toBeNull();
  });

  it("порожня пара не з'їдає сусідню заповнену", () => {
    expect(formatQuoteItemMethodsSummary([{ method_id: null }, { method_id: "m-1" }], directory)).toBe(
      "Вишивка"
    );
  });

  it("метод, якого немає в довіднику, лишається заглушкою — вибір там БУВ", () => {
    expect(formatQuoteItemMethodsSummary([{ method_id: "m-зниклий" }], directory)).toBe("Метод нанесення");
  });
});

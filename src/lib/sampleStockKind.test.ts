import { describe, expect, it } from "vitest";

import { STOCK_KINDS, STOCK_KIND_LABELS, normalizeStockKind } from "./sampleStockKind";

describe("normalizeStockKind", () => {
  it("розпізнає обидва підрозділи", () => {
    expect(normalizeStockKind("sample")).toBe("sample");
    expect(normalizeStockKind("supply")).toBe("supply");
    expect(normalizeStockKind(" SUPPLY ")).toBe("supply");
  });

  it("невідоме значення стає «Взірцями», а не окремим станом", () => {
    // Рядок, що не належить жодному підрозділу, зник би зі складу зовсім —
    // фільтр «Взірці» його б не взяв, «Залишки» теж. Склад мовчки
    // недорахованих позицій гірший за склад, де щось лежить не на тій полиці.
    expect(normalizeStockKind(null)).toBe("sample");
    expect(normalizeStockKind(undefined)).toBe("sample");
    expect(normalizeStockKind("")).toBe("sample");
    expect(normalizeStockKind("витратка")).toBe("sample");
  });

  it("поки міграцію не застосовано, весь склад читається як «Взірці»", () => {
    // Сторінка в такому разі перечитує дані без колонки stock_kind, тож у
    // кожному рядку приходить undefined — і жодна позиція не має зникнути.
    const rowsWithoutColumn = [undefined, undefined, undefined];
    expect(rowsWithoutColumn.map((value) => normalizeStockKind(value))).toEqual([
      "sample",
      "sample",
      "sample",
    ]);
  });
});

describe("STOCK_KINDS", () => {
  it("залишки стоять перед взірцями", () => {
    // Порядок вкладок у тулбарі й списку в картці товару. Заданий Артемом;
    // тест тримає його, щоб він не з'їхав при наступній правці сторінки.
    expect(STOCK_KINDS).toEqual(["supply", "sample"]);
  });

  it("підписи такі, як просили в картці", () => {
    expect(STOCK_KIND_LABELS.sample).toBe("Взірці");
    expect(STOCK_KIND_LABELS.supply).toBe("Залишки на складі");
  });
});

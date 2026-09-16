import { describe, expect, it } from "vitest";

import { moneyRangeOf, sumMoneyRanges } from "./moneyRange";

describe("moneyRangeOf", () => {
  it("один тираж — точна сума, а не діапазон", () => {
    expect(moneyRangeOf([1200])).toEqual({ min: 1200, max: 1200 });
  });

  it("кілька тиражів — від найдешевшого до найдорожчого", () => {
    expect(moneyRangeOf([1200, 900, 2400])).toEqual({ min: 900, max: 2400 });
  });

  it("позиція без тиражів нічого не додає", () => {
    expect(moneyRangeOf([])).toEqual({ min: 0, max: 0 });
  });
});

describe("sumMoneyRanges", () => {
  it("точні суми складаються як звичайні числа", () => {
    expect(
      sumMoneyRanges([
        { min: 1000, max: 1000 },
        { min: 2000, max: 2000 },
      ])
    ).toEqual({ min: 3000, max: 3000 });
  });

  it("дно з дном, стеля зі стелею", () => {
    expect(
      sumMoneyRanges([
        { min: 900, max: 2400 },
        { min: 1000, max: 1000 },
      ])
    ).toEqual({ min: 1900, max: 3400 });
  });

  it("порожній документ — нуль, а не NaN", () => {
    expect(sumMoneyRanges([])).toEqual({ min: 0, max: 0 });
  });
});

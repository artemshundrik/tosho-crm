import { describe, expect, it } from "vitest";

import {
  hasVariantGroup,
  isVariantQuoteItem,
  moneyRangeOf,
  quoteItemsTotalRange,
  variantGroupRange,
} from "./quoteItemVariants";

describe("isVariantQuoteItem", () => {
  it("роль дає лише явне true", () => {
    expect(isVariantQuoteItem({ isVariant: true })).toBe(true);
    expect(isVariantQuoteItem({ isVariant: false })).toBe(false);
    expect(isVariantQuoteItem({ isVariant: "true" })).toBe(false);
    expect(isVariantQuoteItem({ isVariant: 1 })).toBe(false);
  });

  it("порожні метадані ролі не мають", () => {
    expect(isVariantQuoteItem(null)).toBe(false);
    expect(isVariantQuoteItem(undefined)).toBe(false);
    expect(isVariantQuoteItem({})).toBe(false);
    expect(isVariantQuoteItem("isVariant")).toBe(false);
    expect(isVariantQuoteItem([{ isVariant: true }])).toBe(false);
  });

  it("не заважає сусіднім ключам metadata", () => {
    expect(isVariantQuoteItem({ sku: "ABC", isVariant: true })).toBe(true);
    expect(isVariantQuoteItem({ sku: "ABC", catalogVariant: { id: "x", name: "Синій" } })).toBe(
      false
    );
  });
});

describe("moneyRangeOf", () => {
  it("один тираж — точне число", () => {
    expect(moneyRangeOf([1200])).toEqual({ min: 1200, max: 1200 });
  });

  it("кілька тиражів — межі", () => {
    expect(moneyRangeOf([1200, 900, 2400])).toEqual({ min: 900, max: 2400 });
  });

  it("порожньо — нуль, а не Infinity", () => {
    expect(moneyRangeOf([])).toEqual({ min: 0, max: 0 });
  });
});

describe("quoteItemsTotalRange — гілка БЕЗ ролі «варіант»", () => {
  /**
   * НАЙВАЖЛИВІШИЙ ТЕСТ У ФАЙЛІ. Документи, які клієнт уже бачив, не мають
   * зрушити ні на копійку: поки жодна позиція не позначена, підсумок — звичайна
   * сума, рівно як до появи ролі.
   */
  it("складає позиції, як і до появи ролі", () => {
    expect(
      quoteItemsTotalRange([
        { range: { min: 1000, max: 1000 } },
        { range: { min: 2500, max: 2500 } },
        { range: { min: 400, max: 400 } },
      ])
    ).toEqual({ min: 3900, max: 3900 });
  });

  it("складає межі тиражів кожної позиції окремо", () => {
    expect(
      quoteItemsTotalRange([
        { range: { min: 1000, max: 1800 } },
        { range: { min: 2500, max: 3000 } },
      ])
    ).toEqual({ min: 3500, max: 4800 });
  });

  it("явне isVariant: false рахується як звичайна позиція", () => {
    expect(
      quoteItemsTotalRange([
        { isVariant: false, range: { min: 1000, max: 1000 } },
        { isVariant: false, range: { min: 2000, max: 2000 } },
      ])
    ).toEqual({ min: 3000, max: 3000 });
  });

  it("порожній документ — нуль", () => {
    expect(quoteItemsTotalRange([])).toEqual({ min: 0, max: 0 });
  });
});

describe("quoteItemsTotalRange — гілка З роллю «варіант»", () => {
  /** Живий випадок: три щоденники, клієнт візьме один. */
  it("три варіанти дають межі, а не суму", () => {
    expect(
      quoteItemsTotalRange([
        { isVariant: true, range: { min: 13_199, max: 13_199 } },
        { isVariant: true, range: { min: 9_624, max: 9_624 } },
        { isVariant: true, range: { min: 21_000, max: 21_000 } },
      ])
    ).toEqual({ min: 9_624, max: 21_000 });
  });

  it("варіанти дають межі, звичайні позиції додаються зверху", () => {
    expect(
      quoteItemsTotalRange([
        { isVariant: true, range: { min: 10_000, max: 10_000 } },
        { isVariant: true, range: { min: 15_000, max: 15_000 } },
        { range: { min: 2_000, max: 2_000 } },
      ])
    ).toEqual({ min: 12_000, max: 17_000 });
  });

  it("варіант із кількома тиражами розсуває межі групи", () => {
    expect(
      quoteItemsTotalRange([
        { isVariant: true, range: { min: 8_000, max: 12_000 } },
        { isVariant: true, range: { min: 10_000, max: 11_000 } },
      ])
    ).toEqual({ min: 8_000, max: 12_000 });
  });

  /** Позначка на одній позиції нічого не ламає — і нічого не змінює. */
  it("один варіант поводиться як звичайна позиція", () => {
    expect(
      quoteItemsTotalRange([
        { isVariant: true, range: { min: 5_000, max: 7_000 } },
        { range: { min: 1_000, max: 1_000 } },
      ])
    ).toEqual({ min: 6_000, max: 8_000 });
  });

  it("документ лише з варіантів не сумується взагалі", () => {
    expect(
      quoteItemsTotalRange([
        { isVariant: true, range: { min: 100, max: 100 } },
        { isVariant: true, range: { min: 200, max: 200 } },
      ])
    ).toEqual({ min: 100, max: 200 });
  });
});

describe("hasVariantGroup", () => {
  it("одна позначена позиція групою не є", () => {
    expect(hasVariantGroup([{ isVariant: true }, {}])).toBe(false);
  });

  it("дві й більше — група", () => {
    expect(hasVariantGroup([{ isVariant: true }, { isVariant: true }])).toBe(true);
  });

  it("без позначок групи немає", () => {
    expect(hasVariantGroup([{}, { isVariant: false }])).toBe(false);
  });
});

describe("variantGroupRange", () => {
  it("межі групи — те саме, що підсумок підставляє замість доданків", () => {
    expect(
      variantGroupRange([
        { isVariant: true, range: { min: 13_199, max: 13_199 } },
        { isVariant: true, range: { min: 9_624, max: 9_624 } },
        { isVariant: true, range: { min: 21_000, max: 21_000 } },
        { range: { min: 2_000, max: 2_000 } },
      ])
    ).toEqual({ min: 9_624, max: 21_000 });
  });

  it("порожня ціна варіанта опускає нижню межу до нуля — і це видно", () => {
    expect(
      variantGroupRange([
        { isVariant: true, range: { min: 0, max: 0 } },
        { isVariant: true, range: { min: 18_583, max: 18_583 } },
      ])
    ).toEqual({ min: 0, max: 18_583 });
  });

  it("менше двох позначених — рядка немає", () => {
    expect(variantGroupRange([{ isVariant: true, range: { min: 5_000, max: 7_000 } }])).toBeNull();
    expect(variantGroupRange([{ range: { min: 1_000, max: 1_000 } }])).toBeNull();
    expect(variantGroupRange([])).toBeNull();
  });

  /** Поріг той самий, що в `hasVariantGroup`: рядок і пам'ятка в КП з'являються разом. */
  it("поріг збігається з hasVariantGroup", () => {
    const items = [
      { isVariant: true, range: { min: 1, max: 1 } },
      { isVariant: true, range: { min: 2, max: 2 } },
    ];
    expect(hasVariantGroup(items)).toBe(true);
    expect(variantGroupRange(items)).not.toBeNull();
  });
});

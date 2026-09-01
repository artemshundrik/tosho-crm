import { describe, expect, it } from "vitest";

import {
  DEAL_TYPE_ORDER,
  LEGACY_DEFAULT_MARKUP_RATE,
  LEGACY_MIN_MARKUP_RATE,
  resolveQuoteDealType,
  DEFAULT_DEAL_TYPE,
  defaultMarkupRateFor,
  formatRatePercent,
  marginFromMarkup,
  markupFromMargin,
  minMarkupRateFor,
  normalizeQuoteDealType,
  QUOTE_DEAL_TYPES,
} from "@/lib/quoteDealType";

describe("markupFromMargin / marginFromMarkup", () => {
  it("перекладає чотири цілі Олени в накрутку", () => {
    // Права колонка її таблиці: 30→42,9 · 35→53,8 · 40→66,7 · 45→81,8.
    expect(markupFromMargin(30)).toBeCloseTo(42.857, 3);
    expect(markupFromMargin(35)).toBeCloseTo(53.846, 3);
    expect(markupFromMargin(40)).toBeCloseTo(66.667, 3);
    expect(markupFromMargin(45)).toBeCloseTo(81.818, 3);
  });

  it("повертає назад ту саму маржу", () => {
    for (const margin of [30, 35, 40, 45, 19.1]) {
      expect(marginFromMarkup(markupFromMargin(margin))).toBeCloseTo(margin, 9);
    }
  });

  it("не ділить на нуль на маржі 100 % і вище", () => {
    expect(Number.isFinite(markupFromMargin(100))).toBe(true);
    expect(Number.isFinite(markupFromMargin(140))).toBe(true);
  });
});

describe("шкала за типом угоди", () => {
  it("покриває рівно чотири типи Олени", () => {
    expect(DEAL_TYPE_ORDER).toEqual(["tender", "standard", "design", "custom"]);
  });

  it("підставляє накрутку, що дає цільову маржу типу", () => {
    expect(marginFromMarkup(defaultMarkupRateFor("tender"))).toBeCloseTo(30, 9);
    expect(marginFromMarkup(defaultMarkupRateFor("standard"))).toBeCloseTo(35, 9);
    expect(marginFromMarkup(defaultMarkupRateFor("design"))).toBeCloseTo(40, 9);
    expect(marginFromMarkup(defaultMarkupRateFor("custom"))).toBeCloseTo(45, 9);
  });

  it("тримає дно окремим числом від підставленого", () => {
    // Рішення Артема 01.09.2026: дно залежить від типу й поки дорівнює цілі.
    // Послабити його треба правкою floorMargin, а не переписуванням читачів,
    // тому дно живе окремим полем, а не виводиться з defaultMarkupRate.
    for (const type of DEAL_TYPE_ORDER) {
      expect(minMarkupRateFor(type)).toBeCloseTo(defaultMarkupRateFor(type), 9);
    }
  });

  it("піднімає дно разом із типом", () => {
    expect(minMarkupRateFor("tender")).toBeLessThan(minMarkupRateFor("standard"));
    expect(minMarkupRateFor("standard")).toBeLessThan(minMarkupRateFor("design"));
    expect(minMarkupRateFor("design")).toBeLessThan(minMarkupRateFor("custom"));
  });

  it("дає кожному типу підпис для інтерфейсу", () => {
    for (const type of DEAL_TYPE_ORDER) {
      expect(QUOTE_DEAL_TYPES[type].label.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeQuoteDealType", () => {
  it("порожнє поле читає як стандартний виробничий", () => {
    // 291 наявний прорахунок заведено до появи колонки — вони не «без типу»,
    // вони стандартні, інакше дно на них не порахується взагалі.
    expect(normalizeQuoteDealType(null)).toBe(DEFAULT_DEAL_TYPE);
    expect(normalizeQuoteDealType(undefined)).toBe(DEFAULT_DEAL_TYPE);
    expect(normalizeQuoteDealType("")).toBe(DEFAULT_DEAL_TYPE);
  });

  it("не пропускає чуже значення в шкалу", () => {
    expect(normalizeQuoteDealType("merch")).toBe(DEFAULT_DEAL_TYPE);
    expect(normalizeQuoteDealType("TENDER")).toBe("tender");
  });

  it("лишає відомий тип як є", () => {
    expect(normalizeQuoteDealType("custom")).toBe("custom");
  });
});

describe("formatRatePercent", () => {
  it("показує число так, як його написала Олена", () => {
    expect(formatRatePercent(defaultMarkupRateFor("tender"))).toBe("42,9");
    expect(formatRatePercent(defaultMarkupRateFor("standard"))).toBe("53,8");
    expect(formatRatePercent(defaultMarkupRateFor("design"))).toBe("66,7");
    expect(formatRatePercent(defaultMarkupRateFor("custom"))).toBe("81,8");
  });

  it("не тягне нуль після коми на круглих числах", () => {
    expect(formatRatePercent(40)).toBe("40");
  });
});

describe("шкала діє лише на поліграфії", () => {
  it("мерч і «інше» лишаються на старих 40 / 20", () => {
    // Артем 01.09.2026 зупинив увімкнення на все: домовленість з Оленою виросла
    // з поліграфії, і мерч (211 прорахунків із 291) про неї ніхто не питав.
    for (const quoteType of ["merch", "other", null, undefined, ""]) {
      expect(resolveQuoteDealType(quoteType, "custom")).toBeNull();
    }
    expect(defaultMarkupRateFor(null)).toBe(LEGACY_DEFAULT_MARKUP_RATE);
    expect(minMarkupRateFor(null)).toBe(LEGACY_MIN_MARKUP_RATE);
  });

  it("на поліграфії шкала вмикається й тримає свій тип", () => {
    expect(resolveQuoteDealType("print", "tender")).toBe("tender");
    expect(resolveQuoteDealType("PRINT", "custom")).toBe("custom");
  });

  it("поліграфія з порожнім типом — стандартний виробничий, а не стара шкала", () => {
    // Тут порожнеча означає саме «не обрали», бо колонка з DEFAULT 'standard'.
    expect(resolveQuoteDealType("print", null)).toBe("standard");
    expect(minMarkupRateFor(resolveQuoteDealType("print", null))).toBeCloseTo(53.846, 3);
  });
});

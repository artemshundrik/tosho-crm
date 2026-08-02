import { describe, expect, it } from "vitest";

import {
  countBusinessDays,
  countBusinessDaysInYear,
  eachDateKey,
  isBusinessDay,
} from "./teamAbsenceCalendar";

/**
 * Ці числа списують людині дні відпустки, тож рахунок перевіряється явно.
 * Сценарій — реальний серпень 2026: 1-е серпня субота, 24-те (День
 * Незалежності) у воєнний час лишається робочим, поки в календарі немає
 * винятку.
 */

describe("eachDateKey", () => {
  it("розгортає діапазон включно з обома кінцями", () => {
    expect(eachDateKey("2026-08-03", "2026-08-06")).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
    ]);
  });

  it("один день — один ключ", () => {
    expect(eachDateKey("2026-08-03", "2026-08-03")).toEqual(["2026-08-03"]);
  });

  it("перевернутий діапазон дає порожньо, а не нескінченність", () => {
    expect(eachDateKey("2026-08-06", "2026-08-03")).toEqual([]);
  });

  it("переходить через межу місяця", () => {
    expect(eachDateKey("2026-07-30", "2026-08-02")).toEqual([
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });
});

describe("isBusinessDay", () => {
  it("субота і неділя — не робочі", () => {
    expect(isBusinessDay("2026-08-01")).toBe(false); // сб
    expect(isBusinessDay("2026-08-02")).toBe(false); // нд
    expect(isBusinessDay("2026-08-03")).toBe(true); // пн
  });

  it("виняток календаря робить будній день вихідним", () => {
    const exceptions = new Map([["2026-08-24", false]]);
    expect(isBusinessDay("2026-08-24")).toBe(true);
    expect(isBusinessDay("2026-08-24", exceptions)).toBe(false);
  });

  it("виняток може зробити суботу робочою", () => {
    const exceptions = new Map([["2026-08-01", true]]);
    expect(isBusinessDay("2026-08-01", exceptions)).toBe(true);
  });
});

describe("countBusinessDays", () => {
  it("двотижнева відпустка з двома вихідними коштує 10 днів квоти", () => {
    // 10.08 (пн) – 21.08 (пт): 12 календарних, з них 4 вихідні.
    expect(countBusinessDays("2026-08-10", "2026-08-21")).toBe(10);
  });

  it("відпустка, що починається в п'ятницю і йде через вихідні", () => {
    // 07.08 (пт) – 10.08 (пн): пт + сб + нд + пн = 2 робочі.
    expect(countBusinessDays("2026-08-07", "2026-08-10")).toBe(2);
  });

  it("день-у-вихідний не списує нічого", () => {
    expect(countBusinessDays("2026-08-01", "2026-08-02")).toBe(0);
  });

  it("свято в календарі винятків вирізається з квоти", () => {
    const exceptions = new Map([["2026-08-24", false]]); // Незалежності — вихідний
    // 24.08 (пн) – 28.08 (пт): 5 робочих, мінус свято = 4.
    expect(countBusinessDays("2026-08-24", "2026-08-28")).toBe(5);
    expect(countBusinessDays("2026-08-24", "2026-08-28", exceptions)).toBe(4);
  });

  it("один робочий день — рівно один", () => {
    expect(countBusinessDays("2026-08-03", "2026-08-03")).toBe(1);
  });
});

describe("countBusinessDaysInYear", () => {
  it("новорічна відпустка ділиться між роками", () => {
    const absence = { startDate: "2026-12-28", endDate: "2027-01-08" };
    // 2026: 28–31 грудня (пн–чт) = 4 робочі дні.
    expect(countBusinessDaysInYear(absence, 2026)).toBe(4);
    // 2027: 1–8 січня, з них 1 (пт), 4–8 (пн–пт) = 6 робочих.
    expect(countBusinessDaysInYear(absence, 2027)).toBe(6);
  });

  it("відсутність поза роком не списує нічого", () => {
    const absence = { startDate: "2025-03-03", endDate: "2025-03-07" };
    expect(countBusinessDaysInYear(absence, 2026)).toBe(0);
  });
});

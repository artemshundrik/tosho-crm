import { describe, expect, it } from "vitest";

import {
  countBusinessDays,
  countBusinessDaysInYear,
  countQuotaDaysInYear,
  DEFAULT_ABSENCE_QUOTAS,
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

describe("квота: відпустка календарними, решта робочими", () => {
  // 24.08.2026 (пн) — свято; решта днів звичайні.
  const holidays = new Map<string, boolean>([["2026-08-24", false]]);

  it("відпустка їсть вихідні всередині діапазону", () => {
    // 12.08 (ср) – 25.08 (вт) = 14 календарних днів
    const range = { startDate: "2026-08-12", endDate: "2026-08-25" };
    expect(countQuotaDaysInYear("vacation", range, 2026)).toBe(14);
    // для порівняння: робочими було б 10
    expect(countBusinessDays(range.startDate, range.endDate)).toBe(10);
  });

  it("свято всередині відпустки квоту НЕ їсть (ст. 78 КЗпП)", () => {
    const range = { startDate: "2026-08-21", endDate: "2026-08-26" }; // 6 календарних
    // Без завантаженого календаря свято просто невідоме — рахуються всі 6.
    // Це і є причина, чому виклики зобов'язані передавати exceptions.
    expect(countQuotaDaysInYear("vacation", range, 2026)).toBe(6);
    expect(countQuotaDaysInYear("vacation", range, 2026, holidays)).toBe(5);
  });

  it("day-off і лікарняний лишаються робочими днями", () => {
    // 15.08 (сб) – 16.08 (нд): для відпустки це 2 дні, для решти — 0
    const weekend = { startDate: "2026-08-15", endDate: "2026-08-16" };
    expect(countQuotaDaysInYear("vacation", weekend, 2026)).toBe(2);
    expect(countQuotaDaysInYear("day_off", weekend, 2026)).toBe(0);
    expect(countQuotaDaysInYear("sick_leave", weekend, 2026)).toBe(0);
  });

  it("свято не їсть і робочу квоту", () => {
    const single = { startDate: "2026-08-24", endDate: "2026-08-24" };
    expect(countQuotaDaysInYear("day_off", single, 2026, holidays)).toBe(0);
    expect(countQuotaDaysInYear("vacation", single, 2026, holidays)).toBe(0);
  });

  it("новорічна відпустка ділиться між роками", () => {
    const range = { startDate: "2026-12-28", endDate: "2027-01-05" };
    // 28–31.12 = 4 дні у 2026
    expect(countQuotaDaysInYear("vacation", range, 2026)).toBe(4);
    // 01–05.01 = 5 днів у 2027, але 1 січня свято → 4
    expect(countQuotaDaysInYear("vacation", range, 2027, new Map([["2027-01-01", false]]))).toBe(4);
  });

  it("дефолтні квоти — 24 / 5 / 10", () => {
    expect(DEFAULT_ABSENCE_QUOTAS).toEqual({ vacation: 24, day_off: 5, sick_leave: 10 });
  });
});

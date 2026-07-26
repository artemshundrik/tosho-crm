import { describe, expect, it } from "vitest";
import {
  computeEarnings,
  countWorkdays,
  creativePayout,
  listWorkdays,
  monthKeyOf,
  pickRateForMonth,
  resolveTerms,
  type DesignerPayDefaults,
  type DesignerPayRate,
} from "./designerPayrollMath";

/**
 * Ці числа йдуть у зарплату, тож арифметика перевіряється явно, а не «на око».
 * Сценарій — реальний липень 2026 (1 липня = середа, 23 робочі дні).
 */

const DEFAULTS: DesignerPayDefaults = {
  visualNorm: 250,
  overNormRate: 100,
  creativePercent: 30,
  minCreativeCost: 4500,
};

/**
 * Реальний лікарняний Лєни з tosho.team_absences: понеділок 13 липня 2026,
 * «Отруїлась». Це 9-й робочий день місяця (1-е — середа).
 */
const SICK_13_07 = [{ start: "2026-07-13", end: "2026-07-13", kind: "sick_leave", comment: "Отруїлась" }];

describe("listWorkdays", () => {
  it("повертає всі робочі дні місяця, включно з днями відсутності", () => {
    const cells = listWorkdays({
      monthKey: "2026-07",
      asOf: new Date("2026-07-26T12:00:00Z"),
      absences: SICK_13_07,
    });
    // Сітка показує всі 23 квадратики — день хвороби не зникає, а фарбується.
    expect(cells).toHaveLength(23);
    expect(cells.filter((cell) => cell.passed)).toHaveLength(18);
  });

  it("позначає день хвороби типом і коментарем", () => {
    const cells = listWorkdays({
      monthKey: "2026-07",
      asOf: new Date("2026-07-26T12:00:00Z"),
      absences: SICK_13_07,
    });
    const sick = cells.filter((cell) => cell.absence);
    expect(sick).toHaveLength(1);
    expect(sick[0].day).toBe("2026-07-13");
    expect(sick[0].absence).toEqual({ kind: "sick_leave", comment: "Отруїлась" });
    // 9-й робочий день липня.
    expect(cells.indexOf(sick[0])).toBe(8);
  });

  it("без відсутностей жоден день не позначений", () => {
    const cells = listWorkdays({ monthKey: "2026-07", asOf: new Date("2026-07-26T12:00:00Z") });
    expect(cells.every((cell) => cell.absence === null)).toBe(true);
  });
});

describe("countWorkdays", () => {
  /**
   * Рішення CEO 2026-07-26: лікарняний поки НЕ зменшує базу, тому
   * loadDesignerEarnings навмисно не передає absences у розрахунок. Ці два
   * тести фіксують обидві гілки, щоб зміна рішення була свідомою, а не
   * випадковою.
   */
  it("без переданих відсутностей день хвороби рахується як відпрацьований", () => {
    const { total, passed } = countWorkdays({ monthKey: "2026-07", asOf: new Date("2026-07-26T12:00:00Z") });
    expect(total).toBe(23);
    expect(passed).toBe(18);
  });

  it("з переданими відсутностями день хвороби випадає з бази", () => {
    const { total, passed } = countWorkdays({
      monthKey: "2026-07",
      asOf: new Date("2026-07-26T12:00:00Z"),
      absences: SICK_13_07,
    });
    expect(total).toBe(22);
    expect(passed).toBe(17);
  });

  it("рахує пн–пт у липні 2026 (23 робочі дні)", () => {
    const { total } = countWorkdays({ monthKey: "2026-07", asOf: new Date("2026-07-31T12:00:00Z") });
    expect(total).toBe(23);
  });

  it("на 26 липня минуло 18 робочих днів (вихідні не рахуються)", () => {
    const { total, passed } = countWorkdays({ monthKey: "2026-07", asOf: new Date("2026-07-26T12:00:00Z") });
    expect(total).toBe(23);
    expect(passed).toBe(18);
  });

  it("поточний робочий день зараховується цілком", () => {
    // 27 липня — понеділок, 19-й робочий день
    const { passed } = countWorkdays({ monthKey: "2026-07", asOf: new Date("2026-07-27T09:00:00Z") });
    expect(passed).toBe(19);
  });

  it("виняток календаря робить будній день вихідним", () => {
    const exceptions = new Map<string, boolean>([["2026-07-02", false]]);
    const { total } = countWorkdays({ monthKey: "2026-07", asOf: new Date("2026-07-31T12:00:00Z"), exceptions });
    expect(total).toBe(22);
  });

  it("виняток може зробити суботу робочою", () => {
    const exceptions = new Map<string, boolean>([["2026-07-04", true]]); // субота
    const { total } = countWorkdays({ monthKey: "2026-07", asOf: new Date("2026-07-31T12:00:00Z"), exceptions });
    expect(total).toBe(24);
  });

  it("відпустка зупиняє лічильник: дні всередині діапазону не рахуються", () => {
    const absences = [{ start: "2026-07-06", end: "2026-07-10" }]; // 5 робочих днів
    const { total, passed } = countWorkdays({
      monthKey: "2026-07",
      asOf: new Date("2026-07-26T12:00:00Z"),
      absences,
    });
    expect(total).toBe(18);
    expect(passed).toBe(13);
  });
});

describe("resolveTerms", () => {
  const rate: DesignerPayRate = {
    baseMonthRate: 40000,
    visualNorm: null,
    overNormRate: null,
    creativePercent: null,
    effectiveFrom: "2026-07-01",
  };

  it("бере командні дефолти, коли індивідуальних немає", () => {
    expect(resolveTerms(rate, DEFAULTS)).toEqual({
      baseMonthRate: 40000,
      visualNorm: 250,
      overNormRate: 100,
      creativePercent: 30,
    });
  });

  it("індивідуальні значення перебивають дефолти", () => {
    const custom = { ...rate, visualNorm: 150, overNormRate: 120 };
    const terms = resolveTerms(custom, DEFAULTS);
    expect(terms.visualNorm).toBe(150);
    expect(terms.overNormRate).toBe(120);
    expect(terms.creativePercent).toBe(30); // не переозначено — лишився дефолт
  });

  it("нуль як індивідуальне значення НЕ підміняється дефолтом", () => {
    const zeroed = { ...rate, overNormRate: 0 };
    expect(resolveTerms(zeroed, DEFAULTS).overNormRate).toBe(0);
  });
});

describe("pickRateForMonth", () => {
  const rates: DesignerPayRate[] = [
    { baseMonthRate: 30000, visualNorm: null, overNormRate: null, creativePercent: null, effectiveFrom: "2026-05-01" },
    { baseMonthRate: 40000, visualNorm: null, overNormRate: null, creativePercent: null, effectiveFrom: "2026-07-01" },
  ];

  it("бере ставку, чинну на початок місяця", () => {
    expect(pickRateForMonth(rates, "2026-07")?.baseMonthRate).toBe(40000);
    expect(pickRateForMonth(rates, "2026-06")?.baseMonthRate).toBe(30000);
  });

  it("майбутня ставка не діє заднім числом", () => {
    expect(pickRateForMonth(rates, "2026-04")).toBeNull();
  });
});

describe("computeEarnings", () => {
  const terms = resolveTerms(
    { baseMonthRate: 40000, visualNorm: null, overNormRate: null, creativePercent: null, effectiveFrom: "2026-07-01" },
    DEFAULTS
  );

  it("нараховує базу пропорційно робочим дням", () => {
    const result = computeEarnings({
      monthKey: "2026-07",
      terms,
      workdaysTotal: 23,
      workdaysPassed: 18,
      visuals: 220,
      visualFiles: 240,
    });
    // 40000 × 18/23 = 31 304.35 → 31 304
    expect(result.baseAccrued).toBe(31304);
  });

  it("під нормою доплати немає", () => {
    const result = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 18, visuals: 220, visualFiles: 240,
    });
    expect(result.visualsOverNorm).toBe(0);
    expect(result.overNormPay).toBe(0);
    expect(result.earnedTotal).toBe(31304);
  });

  it("понад норму рахується по ставці за візуал", () => {
    const result = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 23, visuals: 281, visualFiles: 320,
    });
    expect(result.visualsOverNorm).toBe(31);
    expect(result.overNormPay).toBe(3100);
    expect(result.earnedTotal).toBe(40000 + 3100);
  });

  it("прогноз екстраполює темп візуалів на повний місяць", () => {
    const result = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 18, visuals: 220, visualFiles: 240,
    });
    // 220/18×23 = 281.1 → 281 візуал; понад норму 31 × 100 = 3100
    expect(result.forecastVisuals).toBe(281);
    expect(result.forecastTotal).toBe(43100);
  });

  it("на початку місяця (0 днів) не ділить на нуль", () => {
    const result = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 0, visuals: 0, visualFiles: 0,
    });
    expect(result.baseAccrued).toBe(0);
    expect(result.forecastVisuals).toBe(0);
    expect(Number.isFinite(result.forecastTotal)).toBe(true);
    expect(result.forecastTotal).toBe(40000);
  });

  it("сирі файли не впливають на гроші — платимо за унікальні роботи", () => {
    const many = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 23, visuals: 260, visualFiles: 500,
    });
    const few = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 23, visuals: 260, visualFiles: 262,
    });
    expect(many.earnedTotal).toBe(few.earnedTotal);
  });
});

describe("платні креативи", () => {
  const terms = resolveTerms(
    { baseMonthRate: 40000, visualNorm: null, overNormRate: null, creativePercent: null, effectiveFrom: "2026-07-01" },
    DEFAULTS
  );
  const base = { monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 23, visuals: 100, visualFiles: 100 };

  it("creativePayout = вартість × відсоток", () => {
    expect(creativePayout(6000, 30)).toBe(1800);
    expect(creativePayout(4500, 30)).toBe(1350);
  });

  it("некоректна вартість не дає нарахування", () => {
    expect(creativePayout(0, 30)).toBe(0);
    expect(creativePayout(-100, 30)).toBe(0);
    expect(creativePayout(Number.NaN, 30)).toBe(0);
  });

  it("затверджений креатив іде в «зароблено»", () => {
    const result = computeEarnings({
      ...base,
      creatives: [{ taskId: "t1", taskNumber: "DZ-1", title: "Набір", projectCost: 6000, payout: 1800, earned: true }],
    });
    expect(result.creativesPay).toBe(1800);
    expect(result.creativesPendingPay).toBe(0);
    expect(result.earnedTotal).toBe(40000 + 1800);
  });

  it("незатверджений — лише в прогнозі, не в «зароблено»", () => {
    const result = computeEarnings({
      ...base,
      creatives: [{ taskId: "t1", taskNumber: "DZ-1", title: "Набір", projectCost: 6000, payout: 1800, earned: false }],
    });
    expect(result.creativesPay).toBe(0);
    expect(result.creativesPendingPay).toBe(1800);
    expect(result.earnedTotal).toBe(40000);
    expect(result.forecastTotal).toBe(40000 + 1800);
  });

  it("відкат статусу прибирає нарахування (earned: true → false)", () => {
    const approved = computeEarnings({
      ...base,
      creatives: [{ taskId: "t1", taskNumber: null, title: null, projectCost: 6000, payout: 1800, earned: true }],
    });
    const rolledBack = computeEarnings({
      ...base,
      creatives: [{ taskId: "t1", taskNumber: null, title: null, projectCost: 6000, payout: 1800, earned: false }],
    });
    expect(approved.earnedTotal - rolledBack.earnedTotal).toBe(1800);
  });

  it("кілька креативів підсумовуються окремо за станом", () => {
    const result = computeEarnings({
      ...base,
      creatives: [
        { taskId: "a", taskNumber: null, title: null, projectCost: 6000, payout: 1800, earned: true },
        { taskId: "b", taskNumber: null, title: null, projectCost: 10000, payout: 3000, earned: true },
        { taskId: "c", taskNumber: null, title: null, projectCost: 5000, payout: 1500, earned: false },
      ],
    });
    expect(result.creativesPay).toBe(4800);
    expect(result.creativesPendingPay).toBe(1500);
    expect(result.forecastTotal).toBe(40000 + 4800 + 1500);
  });

  it("без креативів поведінка не змінюється", () => {
    expect(computeEarnings(base).earnedTotal).toBe(computeEarnings({ ...base, creatives: [] }).earnedTotal);
  });
});

describe("monthKeyOf", () => {
  it("формує ключ місяця в UTC", () => {
    expect(monthKeyOf(new Date("2026-07-26T23:30:00Z"))).toBe("2026-07");
  });
});

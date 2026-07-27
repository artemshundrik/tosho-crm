import { describe, expect, it } from "vitest";
import {
  computeEarnings,
  countWorkdays,
  creativePayout,
  listWorkdays,
  isDeletedWorksRuleActive,
  monthKeyOf,
  outputWorkKey,
  outputWorkKind,
  workSurvivedMonth,
  pickRateForMonth,
  resolveTerms,
  type DesignerPayDefaults,
  type DesignerPayRate,
} from "./designerPayrollMath";

/**
 * Ці числа йдуть у зарплату, тож арифметика перевіряється явно, а не «на око».
 * Сценарій — реальний липень 2026 (1 липня = середа, 23 робочі дні) і реальні
 * лічильники робіт із прод-БД.
 */

const DEFAULTS: DesignerPayDefaults = {
  visualNormPerDay: 8,
  layoutNormPerDay: 5,
  visualOverRate: 100,
  layoutOverRate: 200,
  creativePercent: 30,
  minCreativeCost: 4500,
};

const RATE: DesignerPayRate = {
  baseMonthRate: 40000,
  visualNormPerDay: null,
  layoutNormPerDay: null,
  visualOverRate: null,
  layoutOverRate: null,
  creativePercent: null,
  effectiveFrom: "2026-07-01",
};

/**
 * Реальний лікарняний Лєни з tosho.team_absences: понеділок 13 липня 2026,
 * «Отруїлась». Це 9-й робочий день місяця (1-е — середа).
 */
const SICK_13_07 = [{ start: "2026-07-13", end: "2026-07-13", kind: "sick_leave", comment: "Отруїлась" }];

const none = { works: 0, files: 0 };

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
   * Викликається двічі з різними аргументами: без absences — для бази,
   * з absences — для норми. Обидві гілки зафіксовані, щоб зміна рішення була
   * свідомою, а не випадковою.
   */
  it("без переданих відсутностей день хвороби рахується як відпрацьований (база)", () => {
    const { total, passed } = countWorkdays({ monthKey: "2026-07", asOf: new Date("2026-07-26T12:00:00Z") });
    expect(total).toBe(23);
    expect(passed).toBe(18);
  });

  it("з переданими відсутностями день хвороби випадає (норма)", () => {
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

  it("у травні 2026 робочих днів 21 — саме тому норма денна, а не місячна", () => {
    const { total } = countWorkdays({ monthKey: "2026-05", asOf: new Date("2026-05-31T12:00:00Z") });
    expect(total).toBe(21);
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
  it("бере командні дефолти, коли індивідуальних немає", () => {
    expect(resolveTerms(RATE, DEFAULTS)).toEqual({
      baseMonthRate: 40000,
      visualNormPerDay: 8,
      layoutNormPerDay: 5,
      visualOverRate: 100,
      layoutOverRate: 200,
      creativePercent: 30,
    });
  });

  it("індивідуальні значення перебивають дефолти", () => {
    const terms = resolveTerms({ ...RATE, visualNormPerDay: 6, layoutOverRate: 250 }, DEFAULTS);
    expect(terms.visualNormPerDay).toBe(6);
    expect(terms.layoutOverRate).toBe(250);
    expect(terms.layoutNormPerDay).toBe(5); // не переозначено — лишився дефолт
    expect(terms.creativePercent).toBe(30);
  });

  it("нуль як індивідуальне значення НЕ підміняється дефолтом", () => {
    expect(resolveTerms({ ...RATE, visualOverRate: 0 }, DEFAULTS).visualOverRate).toBe(0);
    expect(resolveTerms({ ...RATE, layoutNormPerDay: 0 }, DEFAULTS).layoutNormPerDay).toBe(0);
  });
});

describe("pickRateForMonth", () => {
  const rates: DesignerPayRate[] = [
    { ...RATE, baseMonthRate: 30000, effectiveFrom: "2026-05-01" },
    { ...RATE, baseMonthRate: 40000, effectiveFrom: "2026-07-01" },
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
  const terms = resolveTerms(RATE, DEFAULTS);

  /**
   * Липень 2026 Лєни, реальні цифри з прод-БД станом на 26.07:
   * 106 візуалів і 76 макетів, 18 робочих днів минуло, 13.07 — лікарняний,
   * тож нормо-днів минуло 17.
   */
  const LENA_JULY = {
    monthKey: "2026-07",
    terms,
    workdaysTotal: 23,
    workdaysPassed: 18,
    normDaysTotal: 22,
    normDaysPassed: 17,
    visuals: { works: 106, files: 116 },
    layouts: { works: 76, files: 104 },
  };

  it("нараховує базу пропорційно робочим дням, без вирахування лікарняного", () => {
    // 40000 × 18/23 = 31 304.35 → 31 304 (а не 18-1=17 днів)
    expect(computeEarnings(LENA_JULY).baseAccrued).toBe(31304);
  });

  it("норма рахується від нормо-днів: 8×17 візуалів і 5×17 макетів", () => {
    const result = computeEarnings(LENA_JULY);
    expect(result.visuals.normToDate).toBe(136);
    expect(result.layouts.normToDate).toBe(85);
  });

  it("липень Лєни: обидва види під нормою, доплати немає", () => {
    const result = computeEarnings(LENA_JULY);
    expect(result.visuals.over).toBe(0); // 106 при нормі 136
    expect(result.layouts.over).toBe(0); // 76 при нормі 85
    expect(result.overNormPay).toBe(0);
    expect(result.earnedTotal).toBe(31304);
  });

  it("прогноз екстраполює темп на повний місяць за нормо-днями", () => {
    const result = computeEarnings(LENA_JULY);
    // візуали: 106/17×22 = 137.2 → 137 при нормі 8×22 = 176 → нуль
    expect(result.visuals.forecastWorks).toBe(137);
    expect(result.visuals.forecastPay).toBe(0);
    // макети: 76/17×22 = 98.4 → 98 при нормі 5×22 = 110 → теж нуль
    expect(result.layouts.forecastWorks).toBe(98);
    expect(result.layouts.forecastPay).toBe(0);
    expect(result.forecastTotal).toBe(40000);
  });

  it("квітень Лєни: 116 макетів проти норми 110 = 1 200 ₴", () => {
    const result = computeEarnings({
      monthKey: "2026-04",
      terms,
      workdaysTotal: 22,
      workdaysPassed: 22,
      visuals: { works: 107, files: 148 },
      layouts: { works: 116, files: 151 },
    });
    expect(result.visuals.over).toBe(0); // 107 при нормі 176
    expect(result.layouts.over).toBe(6);
    expect(result.overNormPay).toBe(1200);
    expect(result.earnedTotal).toBe(40000 + 1200);
  });

  it("червень Лєни: 183 візуали проти норми 176 = 700 ₴", () => {
    const result = computeEarnings({
      monthKey: "2026-06",
      terms,
      workdaysTotal: 22,
      workdaysPassed: 22,
      visuals: { works: 183, files: 340 },
      layouts: { works: 89, files: 104 },
    });
    expect(result.visuals.over).toBe(7);
    expect(result.layouts.over).toBe(0); // 89 при нормі 110
    expect(result.overNormPay).toBe(700);
    expect(result.earnedTotal).toBe(40000 + 700);
  });

  /**
   * Головна причина переходу на денну норму: однаковий виробіток у місяцях
   * різної довжини не має давати різну доплату «за календар».
   */
  it("той самий виробіток у місяці на 21 і на 23 дні дає різну норму, але однаковий сенс", () => {
    const shortMonth = computeEarnings({
      monthKey: "2026-05", terms, workdaysTotal: 21, workdaysPassed: 21,
      visuals: { works: 21 * 8 + 10, files: 0 }, layouts: none,
    });
    const longMonth = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 23,
      visuals: { works: 23 * 8 + 10, files: 0 }, layouts: none,
    });
    // Перевиконання на 10 робіт в обох місяцях — і доплата однакова.
    expect(shortMonth.visuals.over).toBe(10);
    expect(longMonth.visuals.over).toBe(10);
    expect(shortMonth.overNormPay).toBe(longMonth.overNormPay);
  });

  it("відсутності зменшують норму, а не базу", () => {
    const shared = {
      monthKey: "2026-07" as const, terms, workdaysTotal: 23, workdaysPassed: 23,
      visuals: { works: 150, files: 150 }, layouts: none,
    };
    const healthy = computeEarnings(shared);
    const twoWeeksOff = computeEarnings({ ...shared, normDaysTotal: 13, normDaysPassed: 13 });
    // База однакова — ставка за лікарняний не ріжеться.
    expect(twoWeeksOff.baseAccrued).toBe(healthy.baseAccrued);
    // А норма менша: 8×13 = 104 замість 8×23 = 184, тож 150 робіт її перекривають.
    expect(healthy.visuals.over).toBe(0);
    expect(twoWeeksOff.visuals.over).toBe(46);
  });

  it("на початку місяця (0 днів) не ділить на нуль", () => {
    const result = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 0, visuals: none, layouts: none,
    });
    expect(result.baseAccrued).toBe(0);
    expect(result.visuals.forecastWorks).toBe(0);
    expect(Number.isFinite(result.forecastTotal)).toBe(true);
    expect(result.forecastTotal).toBe(40000);
  });

  it("сирі файли не впливають на гроші — платимо за унікальні роботи", () => {
    const shared = { monthKey: "2026-07" as const, terms, workdaysTotal: 23, workdaysPassed: 23, layouts: none };
    const many = computeEarnings({ ...shared, visuals: { works: 200, files: 500 } });
    const few = computeEarnings({ ...shared, visuals: { works: 200, files: 202 } });
    expect(many.earnedTotal).toBe(few.earnedTotal);
  });

  it("макети рахуються за своїм тарифом, а не за візуальним", () => {
    const result = computeEarnings({
      monthKey: "2026-07", terms, workdaysTotal: 23, workdaysPassed: 23,
      visuals: { works: 185, files: 185 }, // +1 понад норму 184 → 100 ₴
      layouts: { works: 116, files: 116 }, // +1 понад норму 115 → 200 ₴
    });
    expect(result.visuals.pay).toBe(100);
    expect(result.layouts.pay).toBe(200);
    expect(result.overNormPay).toBe(300);
  });
});

describe("платні креативи", () => {
  const terms = resolveTerms(RATE, DEFAULTS);
  const base = {
    monthKey: "2026-07",
    terms,
    workdaysTotal: 23,
    workdaysPassed: 23,
    visuals: { works: 100, files: 100 },
    layouts: none,
  };

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

/**
 * Одиниця виробітку спільна для зарплати і для дашборда «Дизайнери» — якщо вона
 * розійдеться, дизайнер побачить одну цифру у віджеті й іншу на сторінці.
 */
describe("одиниця виробітку", () => {
  it("два формати одного макета — одна робота", () => {
    expect(outputWorkKey("t1", "Візитка_Ощад.ai")).toBe(outputWorkKey("t1", "Візитка_Ощад.pdf"));
  });

  it("перезалив під тією самою назвою нової роботи не додає", () => {
    expect(outputWorkKey("t1", "візуал-04.png")).toBe(outputWorkKey("t1", "ВІЗУАЛ-04.PNG"));
  });

  it("та сама назва в різних задачах — різні роботи", () => {
    expect(outputWorkKey("t1", "візуал-01.png")).not.toBe(outputWorkKey("t2", "візуал-01.png"));
  });

  it("перейменований перезалив рахується як нова робота (відомий залишковий ризик)", () => {
    expect(outputWorkKey("t1", "візуал-01.png")).not.toBe(outputWorkKey("t1", "візуал-01_v2.png"));
  });

  it("вид: усе, що не visualization, — макет", () => {
    expect(outputWorkKind("visualization")).toBe("visualization");
    expect(outputWorkKind("layout")).toBe("layout");
    expect(outputWorkKind(null)).toBe("layout");
    expect(outputWorkKind(undefined)).toBe("layout");
  });
});

/**
 * Правило «видалене того ж місяця не рахується» (з серпня 2026). Головне, що
 * тут зафіксовано: липень і раніші місяці ним НЕ зачіпаються — інакше вже
 * виплачені суми поїхали б заднім числом.
 */
describe("видалені роботи", () => {
  it("діє з серпня 2026, липень і раніше — за старим правилом", () => {
    expect(isDeletedWorksRuleActive("2026-06")).toBe(false);
    expect(isDeletedWorksRuleActive("2026-07")).toBe(false);
    expect(isDeletedWorksRuleActive("2026-08")).toBe(true);
    expect(isDeletedWorksRuleActive("2026-12")).toBe(true);
    expect(isDeletedWorksRuleActive("2027-01")).toBe(true);
  });

  it("робота з єдиним видаленим файлом не рахується", () => {
    expect(workSurvivedMonth(["f1"], new Set(["f1"]))).toBe(false);
  });

  it("робота живе, поки живий хоч один її файл (.ai видалили, .pdf лишився)", () => {
    expect(workSurvivedMonth(["f1", "f2"], new Set(["f1"]))).toBe(true);
  });

  it("нічого не видаляли — рахується як і раніше", () => {
    expect(workSurvivedMonth(["f1", "f2"], new Set())).toBe(true);
  });

  it("робота без файлів роботою не є", () => {
    expect(workSurvivedMonth([], new Set())).toBe(false);
  });
});

describe("monthKeyOf", () => {
  it("формує ключ місяця в UTC", () => {
    expect(monthKeyOf(new Date("2026-07-26T23:30:00Z"))).toBe("2026-07");
  });
});

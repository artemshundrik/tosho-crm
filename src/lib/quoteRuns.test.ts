import { describe, expect, it } from "vitest";
import type { QuoteRun } from "@/lib/toshoApi";
import {
  computeRunSalePricing,
  getRunSalePricingFromRun,
  mergeQuoteRunsWithExisting,
} from "./quoteRuns";

/**
 * Це — ГРОШІ. computeRunSalePricing — єдине джерело правди продажної ціни
 * прорахунку (калькулятор + КП). Очікувані числа нижче пораховані вручну з
 * бізнес-формули, а не переписані з коду: собівартість + валовий прибуток
 * (бажаний дохід менеджера / його ставку) + постійні витрати (% від валового)
 * + ПДВ (% від валового + постійних).
 */
describe("computeRunSalePricing", () => {
  it("типовий прорахунок без ПДВ: дохід 1000 при ставці 10% вимагає 10 000 валового", () => {
    const pricing = computeRunSalePricing({
      quantity: 100,
      costTotal: 5000,
      desiredManagerIncome: 1000,
      managerRate: 10,
      fixedCostRate: 20,
      vatRate: 0,
    });
    // Валовий: 1000 / 0.10 = 10 000; постійні: 10 000 × 20% = 2 000.
    expect(pricing.requiredGrossProfit).toBe(10_000);
    expect(pricing.fixedCosts).toBe(2_000);
    expect(pricing.vatAmount).toBe(0);
    expect(pricing.markupTotal).toBe(12_000);
    expect(pricing.saleTotal).toBe(17_000);
    expect(pricing.saleUnitPrice).toBe(170);
    expect(pricing.costPerUnit).toBe(50);
  });

  it("ПДВ нараховується на (валовий + постійні), а не на собівартість", () => {
    const pricing = computeRunSalePricing({
      quantity: 10,
      costTotal: 1000,
      desiredManagerIncome: 500,
      managerRate: 25,
      fixedCostRate: 10,
      vatRate: 20,
    });
    // Валовий: 500 / 0.25 = 2000; постійні: 200; ПДВ: (2000 + 200) × 20% = 440.
    expect(pricing.requiredGrossProfit).toBe(2000);
    expect(pricing.fixedCosts).toBe(200);
    expect(pricing.vatAmount).toBe(440);
    expect(pricing.saleTotal).toBe(1000 + 2640);
    // Собівартість у базу ПДВ НЕ входить: якби входила, ПДВ був би 640.
    expect(pricing.vatAmount).not.toBe(640);
  });

  it("нульова ставка менеджера означає нульову націнку: продаж = собівартість", () => {
    const pricing = computeRunSalePricing({
      quantity: 5,
      costTotal: 777,
      desiredManagerIncome: 99_999,
      managerRate: 0,
      fixedCostRate: 20,
      vatRate: 20,
    });
    expect(pricing.requiredGrossProfit).toBe(0);
    expect(pricing.markupTotal).toBe(0);
    expect(pricing.saleTotal).toBe(777);
  });

  it("нульовий тираж: тотали рахуються, поштучні ціни — null (не ділимо на нуль)", () => {
    const pricing = computeRunSalePricing({
      quantity: 0,
      costTotal: 300,
      desiredManagerIncome: 100,
      managerRate: 50,
      fixedCostRate: 0,
      vatRate: 0,
    });
    expect(pricing.saleTotal).toBe(500);
    expect(pricing.saleUnitPrice).toBeNull();
    expect(pricing.costPerUnit).toBeNull();
  });

  it("сміттєві входи (NaN, від'ємні) приводяться до нуля, а не отруюють суму", () => {
    const pricing = computeRunSalePricing({
      quantity: Number.NaN,
      costTotal: Number.NaN,
      desiredManagerIncome: -500,
      managerRate: Number.NaN,
      fixedCostRate: Number.NaN,
      vatRate: Number.NaN,
    });
    expect(pricing.saleTotal).toBe(0);
    expect(pricing.markupTotal).toBe(0);
    expect(pricing.saleUnitPrice).toBeNull();
    expect(Number.isNaN(pricing.saleTotal)).toBe(false);
  });

  it("дробові ставки: 33.33% не дає NaN і зводиться назад у дохід менеджера", () => {
    const pricing = computeRunSalePricing({
      quantity: 1,
      costTotal: 0,
      desiredManagerIncome: 333.3,
      managerRate: 33.33,
      fixedCostRate: 0,
      vatRate: 0,
    });
    // Зворотна перевірка формули: валовий × ставку = бажаний дохід.
    expect((pricing.requiredGrossProfit * 33.33) / 100).toBeCloseTo(333.3, 6);
  });
});

describe("getRunSalePricingFromRun", () => {
  it("собівартість = (модель + друк) × тираж + логістика разово", () => {
    const pricing = getRunSalePricingFromRun({
      quantity: 100,
      unit_price_model: 50,
      unit_price_print: 10,
      logistics_cost: 500,
      desired_manager_income: 0,
      manager_rate: 30,
      fixed_cost_rate: 0,
      vat_rate: 0,
    });
    // Логістика НЕ множиться на тираж: (50+10)×100 + 500 = 6500.
    expect(pricing.costTotal).toBe(6500);
    expect(pricing.costPerUnit).toBe(65);
    expect(pricing.saleTotal).toBe(6500);
  });
});

describe("mergeQuoteRunsWithExisting", () => {
  const run = (overrides: Partial<QuoteRun>): QuoteRun => ({
    quantity: 10,
    unit_price_model: 100,
    unit_price_print: 20,
    logistics_cost: 50,
    desired_manager_income: 500,
    manager_rate: 30,
    fixed_cost_rate: 15,
    vat_rate: 20,
    ...overrides,
  });

  const defaults = {
    quoteId: "quote-1",
    quoteItemId: "item-1",
    managerRate: Number.NaN, // «не перекривати» — резолвиться у ставку самого run-у
    defaultManagerRate: 30,
    defaultFixedCostRate: 15,
    defaultVatRate: 20,
  };

  it("оновлення тиражів зберігає id і ЦІНИ наявних ранів (кількість — єдине, що міняється)", () => {
    const existing = [run({ id: "a", quantity: 10 }), run({ id: "b", quantity: 20, unit_price_model: 999 })];
    const { payload, idsToDelete } = mergeQuoteRunsWithExisting({
      ...defaults,
      existingRuns: existing,
      nextRuns: [
        { id: "a", quantity: 15 },
        { id: "b", quantity: 25 },
      ],
    });
    expect(payload.map((r) => r.id)).toEqual(["a", "b"]);
    expect(payload[0].quantity).toBe(15);
    expect(payload[1].unit_price_model).toBe(999);
    expect(idsToDelete).toEqual([]);
  });

  it("явний id перемагає позицію: перестановка ранів не перемішує їхні ціни", () => {
    const existing = [
      run({ id: "first", unit_price_model: 111 }),
      run({ id: "second", unit_price_model: 222 }),
    ];
    const { payload } = mergeQuoteRunsWithExisting({
      ...defaults,
      existingRuns: existing,
      nextRuns: [
        { id: "second", quantity: 5 },
        { id: "first", quantity: 7 },
      ],
    });
    expect(payload[0]).toMatchObject({ id: "second", unit_price_model: 222, quantity: 5 });
    expect(payload[1]).toMatchObject({ id: "first", unit_price_model: 111, quantity: 7 });
  });

  it("ран без id позиційно всиновлює existing тієї ж позиції — id і ціни перевикористовуються", () => {
    // Це НЕ «додавання нового»: наступний ран без id на позиції 1 підхоплює
    // existing[1] цілком (id + ціни), тож рядок у БД оновлюється, а не
    // видаляється-створюється. Перший варіант цього тесту очікував
    // idsToDelete=["drop"] — і був неправильною гіпотезою про семантику.
    const existing = [run({ id: "keep" }), run({ id: "drop", unit_price_model: 777 })];
    const { payload, idsToDelete } = mergeQuoteRunsWithExisting({
      ...defaults,
      existingRuns: existing,
      nextRuns: [{ id: "keep", quantity: 10 }, { quantity: 33 }],
    });
    expect(idsToDelete).toEqual([]);
    expect(payload[1]).toMatchObject({ id: "drop", unit_price_model: 777, quantity: 33 });
  });

  it("скорочення списку: зайвий existing потрапляє в idsToDelete", () => {
    const existing = [run({ id: "keep" }), run({ id: "drop" })];
    const { payload, idsToDelete } = mergeQuoteRunsWithExisting({
      ...defaults,
      existingRuns: existing,
      nextRuns: [{ id: "keep", quantity: 10 }],
    });
    expect(payload.map((r) => r.id)).toEqual(["keep"]);
    expect(idsToDelete).toEqual(["drop"]);
  });

  it("розширення понад existing: справді новий ран отримує свіжий id і нульові ціни", () => {
    const existing = [run({ id: "only" })];
    const { payload, idsToDelete } = mergeQuoteRunsWithExisting({
      ...defaults,
      existingRuns: existing,
      nextRuns: [{ id: "only", quantity: 10 }, { quantity: 33 }],
    });
    expect(idsToDelete).toEqual([]);
    const created = payload[1];
    expect(created.id).toBeTruthy();
    expect(created.id).not.toBe("only");
    expect(created).toMatchObject({ quantity: 33, unit_price_model: 0, unit_price_print: 0 });
  });

  it("нульові тиражі відкидаються з обох боків і не потрапляють у idsToDelete", () => {
    const existing = [run({ id: "zero", quantity: 0 }), run({ id: "live", quantity: 5 })];
    const { payload, idsToDelete } = mergeQuoteRunsWithExisting({
      ...defaults,
      existingRuns: existing,
      nextRuns: [
        { id: "live", quantity: 5 },
        { id: "x", quantity: 0 },
      ],
    });
    expect(payload.map((r) => r.id)).toEqual(["live"]);
    // Задокументована поведінка: existing-ран з нульовим тиражем ІГНОРУЄТЬСЯ,
    // тобто НЕ видаляється (лишається в БД як є). Якщо колись вирішимо чистити
    // такі рядки — цей тест нагадає, що поведінка зміниться свідомо.
    expect(idsToDelete).toEqual([]);
  });

  it("ставки: НАЯВНИЙ тираж тримає свою ставку, навіть якщо людині її підняли", () => {
    // Було навпаки: поточна ставка перекривала збережену при кожному
    // пересохраненні, тож прорахунок, надісланий клієнту при 30 %, мовчки
    // дорожчав до 45 %. Рішення СЕО 18.08 — старі прорахунки не чіпаємо.
    const existing = [run({ id: "a", manager_rate: 30 })];
    const { payload } = mergeQuoteRunsWithExisting({
      ...defaults,
      managerRate: 45,
      existingRuns: existing,
      nextRuns: [{ id: "a", quantity: 10 }],
    });
    expect(payload[0].manager_rate).toBe(30);
  });

  it("ставки: НОВИЙ тираж бере поточну ставку людини", () => {
    const { payload } = mergeQuoteRunsWithExisting({
      ...defaults,
      managerRate: 45,
      existingRuns: [],
      nextRuns: [{ quantity: 10 }],
    });
    expect(payload[0].manager_rate).toBe(45);
  });

  it("ставки: без поточної ставки новий тираж бере дефолтну", () => {
    const { payload } = mergeQuoteRunsWithExisting({
      ...defaults,
      managerRate: Number.NaN,
      existingRuns: [],
      nextRuns: [{ quantity: 10 }],
    });
    expect(payload[0].manager_rate).toBe(defaults.defaultManagerRate);
  });

  it("ставки: наявний тираж без збереженої ставки бере дефолтну, а не поточну", () => {
    const existing = [run({ id: "a", manager_rate: Number.NaN as unknown as number })];
    const { payload } = mergeQuoteRunsWithExisting({
      ...defaults,
      managerRate: 45,
      existingRuns: existing,
      nextRuns: [{ id: "a", quantity: 10 }],
    });
    expect(payload[0].manager_rate).toBe(defaults.defaultManagerRate);
  });

  it("новий ран без прототипу бере дефолтні ставки й нульові ціни", () => {
    const { payload } = mergeQuoteRunsWithExisting({
      ...defaults,
      existingRuns: [],
      nextRuns: [{ quantity: 100 }],
    });
    expect(payload[0]).toMatchObject({
      quantity: 100,
      unit_price_model: 0,
      unit_price_print: 0,
      logistics_cost: 0,
      manager_rate: 30,
      fixed_cost_rate: 15,
      vat_rate: 20,
      quote_id: "quote-1",
      quote_item_id: "item-1",
    });
  });
});

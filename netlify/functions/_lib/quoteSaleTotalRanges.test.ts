import { describe, expect, it } from "vitest";

import {
  addRange,
  formatMoneyRange,
  quoteSaleTotalRanges,
  runSaleTotal,
  ZERO_RANGE,
  type QuoteRunPricingRow,
} from "./quotePricing";

/**
 * Тиражі однієї позиції — ВЗАЄМОВИКЛЮЧНІ варіанти: замовник бере один зі
 * 100/150/200, а не всі три. Складати їх означає називати суму, якої не буде в
 * жодному можливому замовленні; на проді це завищувало дайджест і відповіді
 * ToSho AI щонайменше на 3,9 млн грн (REQ-77).
 *
 * Помилку легко повернути непомітно: `+ runSaleTotal(run)` у циклі виглядає
 * абсолютно природно, і саме так вона й прожила в чотирьох файлах. Тести нижче
 * тримають межу з обох боків — і що варіанти НЕ складаються, і що різні
 * позиції складаються, бо переплутати ці два випадки так само легко.
 */

const run = (over: Partial<QuoteRunPricingRow>): QuoteRunPricingRow => ({
  quote_id: "q1",
  quote_item_id: "i1",
  quantity: 100,
  unit_price_model: 10,
  unit_price_print: 0,
  logistics_cost: 0,
  markup_rate: 0,
  ...over,
});

describe("quoteSaleTotalRanges", () => {
  it("не складає взаємовиключні тиражі однієї позиції — бере межі", () => {
    const totals = quoteSaleTotalRanges([
      run({ quantity: 100 }), // 1000
      run({ quantity: 150 }), // 1500
      run({ quantity: 200 }), // 2000
    ]);

    // Стара поведінка дала б 4500 — суму, якої не буде в жодному замовленні.
    expect(totals.get("q1")).toEqual({ min: 1000, max: 2000 });
  });

  it("різні позиції складаються — це не варіанти, а окремі товари", () => {
    const totals = quoteSaleTotalRanges([
      run({ quote_item_id: "i1", quantity: 100 }), // 1000
      run({ quote_item_id: "i2", quantity: 300 }), // 3000
    ]);

    expect(totals.get("q1")).toEqual({ min: 4000, max: 4000 });
  });

  it("межі рахуються по кожній позиції окремо, а не по прорахунку загалом", () => {
    const totals = quoteSaleTotalRanges([
      run({ quote_item_id: "i1", quantity: 100 }), // 1000
      run({ quote_item_id: "i1", quantity: 200 }), // 2000
      run({ quote_item_id: "i2", quantity: 500 }), // 5000
      run({ quote_item_id: "i2", quantity: 700 }), // 7000
    ]);

    // Найдешевший сценарій — найдешевший тираж У КОЖНІЙ позиції: 1000 + 5000.
    // Найдорожчий — 2000 + 7000. Не 1000..7000 і не сума всіх чотирьох.
    expect(totals.get("q1")).toEqual({ min: 6000, max: 9000 });
  });

  it("один тираж у позиції — межі збігаються, тобто звичайна точна сума", () => {
    const totals = quoteSaleTotalRanges([run({ quantity: 100 })]);
    const range = totals.get("q1")!;

    expect(range.min).toBe(range.max);
    expect(range.min).toBe(runSaleTotal(run({ quantity: 100 })));
  });

  it("тримає прорахунки нарізно", () => {
    const totals = quoteSaleTotalRanges([
      run({ quote_id: "q1", quantity: 100 }),
      run({ quote_id: "q2", quantity: 300 }),
    ]);

    expect(totals.get("q1")).toEqual({ min: 1000, max: 1000 });
    expect(totals.get("q2")).toEqual({ min: 3000, max: 3000 });
  });

  it("рядок без позиції не зникає і не склеюється з чужим тиражем", () => {
    const totals = quoteSaleTotalRanges([
      run({ quote_item_id: null, quantity: 100 }), // 1000
      run({ quote_item_id: null, quantity: 300 }), // 3000
    ]);

    // Згрупувати їх нічим, тож кожен сам собі позиція — обидва в сумі.
    expect(totals.get("q1")).toEqual({ min: 4000, max: 4000 });
  });

  it("рядок без прорахунку пропускається, а не валить розрахунок", () => {
    const totals = quoteSaleTotalRanges([run({ quote_id: null }), run({ quantity: 100 })]);

    expect(totals.size).toBe(1);
    expect(totals.get("q1")).toEqual({ min: 1000, max: 1000 });
  });

  it("порожній вхід дає порожню мапу", () => {
    expect(quoteSaleTotalRanges([]).size).toBe(0);
  });

  /**
   * Живий випадок TS-0826-0036 (REQ-267#p1): три парасольки по одному тиражу,
   * клієнт узяв одну. До цього дайджест малював 43 823 ₴ на угоді в 13 199 ₴.
   */
  it("викидає позиції, від яких клієнт відмовився", () => {
    const totals = quoteSaleTotalRanges(
      [
        run({ quote_item_id: "lido", quantity: 100 }), // 1000
        run({ quote_item_id: "reflect", quantity: 150 }), // 1500
        run({ quote_item_id: "odessa", quantity: 200 }), // 2000
      ],
      new Set(["reflect", "odessa"])
    );
    expect(totals.get("q1")).toEqual({ min: 1000, max: 1000 });
  });

  /**
   * Найважливіше: виклик БЕЗ переліку відхилених має рахувати так, як рахував
   * до появи прапорця. Усі 333 наявні позиції мають `is_approved = null`, і
   * зміна поведінки за замовчуванням обнулила б дайджест першої ж ночі.
   */
  it("без переліку відхилених рахує все, як рахував", () => {
    const runs = [
      run({ quote_item_id: "lido", quantity: 100 }),
      run({ quote_item_id: "reflect", quantity: 150 }),
    ];
    expect(quoteSaleTotalRanges(runs)).toEqual(quoteSaleTotalRanges(runs, new Set()));
    expect(quoteSaleTotalRanges(runs).get("q1")).toEqual({ min: 2500, max: 2500 });
  });
});

describe("складання й показ меж", () => {
  it("суми по кількох прорахунках складаються межа до межі", () => {
    const total = [
      { min: 1000, max: 2000 },
      { min: 500, max: 500 },
    ].reduce(addRange, ZERO_RANGE);

    expect(total).toEqual({ min: 1500, max: 2500 });
  });

  it("невідомий прорахунок нічого не додає", () => {
    expect(addRange({ min: 10, max: 20 }, undefined)).toEqual({ min: 10, max: 20 });
  });

  it("точна сума показується одним числом, а не «10 – 10»", () => {
    expect(formatMoneyRange({ min: 10, max: 10 }, (v) => `${v} ₴`)).toBe("10 ₴");
  });

  it("неточна — межами", () => {
    expect(formatMoneyRange({ min: 10, max: 20 }, (v) => `${v} ₴`)).toBe("10 ₴ – 20 ₴");
  });

  it("порожнє значення показується нулем, а не «—»", () => {
    expect(formatMoneyRange(undefined, (v) => `${v} ₴`)).toBe("0 ₴");
  });
});

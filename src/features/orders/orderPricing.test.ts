import { describe, expect, it } from "vitest";

import { collectRunsForItem, getRunLineTotal, getRunUnitPrice } from "./orderItemPricing";
import { applyApprovedRunToggle, needsApprovedRunChoice, pickApprovedRun } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * ЦЕ — ГРОШІ, ЯКІ ЙДУТЬ КЛІЄНТУ.
 *
 * Ціна з цих функцій лягає в `order_items`, а звідти — у рахунок і в
 * специфікацію. Два роки вона рахувалась як `model + print + логістика`, тобто
 * була собівартістю: замовлення виходили вдвічі дешевші за прорахунок
 * (TS-0726-0013 — 74 300 ₴ замість 152 300 ₴, заміряно на проді 25.08.2026).
 * Числа нижче взяті з реального прорахунку TS-0826-0026, щоб тест падав саме
 * на тому, на чому болить.
 */

const run = (overrides: Partial<QuoteRun> = {}): QuoteRun => ({
  id: overrides.id ?? "run-1",
  quote_id: "quote-1",
  quote_item_id: "item-1",
  quantity: 180,
  unit_price_model: 25.8,
  unit_price_print: 0,
  logistics_cost: 0,
  desired_manager_income: 350,
  manager_rate: 15,
  fixed_cost_rate: 30,
  vat_rate: 20,
  ...overrides,
});

describe("ціна тиражу в замовленні", () => {
  it("несе продажну ціну з націнкою, а не собівартість", () => {
    // Собівартість тут 25,8 × 180 = 4 644. Продаж — 8 284: саме це число
    // показує картка прорахунку, і саме воно має піти в рахунок.
    expect(getRunLineTotal(run())).toBeCloseTo(8284, 2);
    expect(getRunUnitPrice(run())).toBeCloseTo(46.0222, 3);
  });

  it("не плутає ціну за одиницю із сумою тиражу", () => {
    expect(getRunUnitPrice(run()) * 180).toBeCloseTo(getRunLineTotal(run()), 6);
  });

  it("логістику розкидає по одиницях, а не додає до кожної", () => {
    const withLogistics = run({ logistics_cost: 900 });
    expect(getRunLineTotal(withLogistics)).toBeCloseTo(8284 + 900, 2);
    expect(getRunUnitPrice(withLogistics)).toBeCloseTo((8284 + 900) / 180, 6);
  });

  it("тираж без заробітку менеджера дає ціну = собівартості (націнки немає)", () => {
    expect(getRunLineTotal(run({ desired_manager_income: 0 }))).toBeCloseTo(4644, 2);
  });
});

describe("який тираж іде в замовлення", () => {
  const small = run({ id: "run-180", quantity: 180 });
  const big = run({ id: "run-270", quantity: 270, desired_manager_income: 500 });

  it("бере позначений клієнтом, а не перший створений", () => {
    const approvedBig = { ...big, is_approved: true };
    expect(pickApprovedRun([small, approvedBig])?.id).toBe("run-270");
  });

  it("коли тираж один — бере його й нічого не питає", () => {
    expect(pickApprovedRun([small])?.id).toBe("run-180");
    expect(needsApprovedRunChoice([small])).toBe(false);
  });

  it("коли тиражів кілька й вибору немає — вимагає вибір", () => {
    expect(pickApprovedRun([small, big])).toBeNull();
    expect(needsApprovedRunChoice([small, big])).toBe(true);
  });

  it("позначений тираж знімає вимогу вибору", () => {
    expect(needsApprovedRunChoice([{ ...small, is_approved: true }, big])).toBe(false);
  });
});

describe("тиражі позиції", () => {
  const own = run({ id: "own", quote_item_id: "item-1" });
  const other = run({ id: "other", quote_item_id: "item-2" });

  it("бере лише свої", () => {
    expect(collectRunsForItem([own, other], { id: "item-1", quoteItemId: "item-1" }, 2).map((r) => r.id)).toEqual([
      "own",
    ]);
  });

  it("для єдиної позиції підбирає й тиражі без привʼязки (старі прорахунки)", () => {
    const orphan = run({ id: "orphan", quote_item_id: null });
    expect(collectRunsForItem([orphan], { id: "item-1", quoteItemId: "item-1" }, 1).map((r) => r.id)).toEqual([
      "orphan",
    ]);
  });

  it("для однієї з кількох позицій чужі тиражі не підтягує", () => {
    const orphan = run({ id: "orphan", quote_item_id: null });
    expect(collectRunsForItem([orphan], { id: "item-1", quoteItemId: "item-1" }, 2)).toEqual([]);
  });
});

describe("позначка «погоджено клієнтом»", () => {
  const a = run({ id: "a", quantity: 180 });
  const b = run({ id: "b", quantity: 270 });
  const otherItem = run({ id: "c", quote_item_id: "item-2" });

  it("гасить позначку в сусідів тієї самої позиції", () => {
    const next = applyApprovedRunToggle([{ ...a, is_approved: true }, b], "b", "item-1");
    expect(next.map((r) => [r.id, r.is_approved])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("не чіпає тиражі іншої позиції", () => {
    const next = applyApprovedRunToggle([a, { ...otherItem, is_approved: true }], "a", "item-1");
    expect(next.find((r) => r.id === "c")?.is_approved).toBe(true);
  });

  it("повторне натискання знімає позначку", () => {
    const next = applyApprovedRunToggle([{ ...a, is_approved: true }, b], "a", "item-1");
    expect(next.every((r) => r.is_approved !== true)).toBe(true);
  });

  it("невідомий тираж лишає масив як був", () => {
    const runs = [a, b];
    expect(applyApprovedRunToggle(runs, "no-such-id", "item-1")).toBe(runs);
    expect(applyApprovedRunToggle(runs, null, "item-1")).toBe(runs);
  });
});

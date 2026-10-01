import { describe, expect, it } from "vitest";
import { computeQuoteListTotal } from "./quoteListTotal";

// Собівартість 1000, накрутка 50 %, ставки нульові ⇒ ціна 1500.
const run = (id: string, quantity: number, extra: Record<string, unknown> = {}) => ({
  id,
  quote_item_id: "i1",
  quantity,
  unit_price_model: 10,
  unit_price_print: 0,
  logistics_cost: 0,
  markup_rate: 50,
  manager_rate: 0,
  fixed_cost_rate: 0,
  vat_rate: 0,
  ...extra,
});
const items = [{ id: "i1", qty: 100, unit_price: 0, line_total: 0 }];

describe("computeQuoteListTotal", () => {
  it("бере погоджений тираж", () => {
    const result = computeQuoteListTotal(items, [run("a", 100), run("b", 200, { is_approved: true })]);
    expect(result?.partial).toBe(false);
    expect(result?.amount).toBeCloseTo(3000, 2);
  });

  it("єдиний тираж без позначки — він і є сума", () => {
    const result = computeQuoteListTotal(items, [run("a", 100)]);
    expect(result).toEqual({ amount: expect.closeTo(1500, 2), partial: false });
  });

  it("кілька тиражів без позначки — нижня межа", () => {
    const result = computeQuoteListTotal(items, [run("a", 200), run("b", 100)]);
    expect(result?.partial).toBe(true);
    expect(result?.amount).toBeCloseTo(1500, 2);
  });

  it("без тиражів — копія з позиції; без даних — null", () => {
    expect(computeQuoteListTotal([{ id: "i1", qty: 2, unit_price: 50, line_total: null }], [])?.amount).toBe(100);
    expect(computeQuoteListTotal(items, [])).toBeNull();
  });
});

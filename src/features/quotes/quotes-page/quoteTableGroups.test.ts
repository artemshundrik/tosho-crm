import { describe, expect, it } from "vitest";

import { groupQuoteRows, isQuoteOurTurn } from "./quoteTableGroups";

const row = (id: string, status: string) => ({ id, status });

describe("groupQuoteRows", () => {
  it("складає групи шляхом прорахунку й зберігає порядок усередині", () => {
    const rows = [row("a", "approved"), row("b", "estimating"), row("c", "awaiting_approval"), row("d", "estimating")];
    const groups = groupQuoteRows(rows, () => ({ amount: 100, partial: false }));
    expect(groups.map((g) => g.status)).toEqual(["estimating", "awaiting_approval", "approved"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["b", "d"]);
    expect(groups[0].amount).toBe(200);
    expect(groups[0].partial).toBe(false);
  });

  it("сума «від», коли хоч один рядок без суми чи з кількома тиражами", () => {
    const totals: Record<string, { amount: number; partial: boolean } | null> = {
      a: { amount: 50, partial: false },
      b: null,
      c: { amount: 10, partial: true },
    };
    const [first, second] = groupQuoteRows([row("a", "estimated"), row("b", "estimated"), row("c", "approved")], (r) => totals[r.id]);
    expect(first).toMatchObject({ amount: 50, partial: true });
    expect(second).toMatchObject({ amount: 10, partial: true });
  });
});

describe("isQuoteOurTurn", () => {
  it("хід наш, доки прорахунок не пішов клієнту", () => {
    expect(isQuoteOurTurn("estimating")).toBe(true);
    expect(isQuoteOurTurn("estimated")).toBe(true);
    expect(isQuoteOurTurn("awaiting_approval")).toBe(false);
    expect(isQuoteOurTurn("approved")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildQuoteSearchOrFilter, countQuotesByStatus } from "./quoteListFilters";

describe("buildQuoteSearchOrFilter", () => {
  it("без пошуку фільтра немає", () => {
    expect(buildQuoteSearchOrFilter(["number"], "", ["x"])).toBeNull();
  });
  it("додає знайдені за артикулом id", () => {
    expect(buildQuoteSearchOrFilter(["number", "title"], "ab", ["1", "2"])).toBe(
      "number.ilike.%ab%,title.ilike.%ab%,id.in.(1,2)"
    );
  });
});

describe("countQuotesByStatus", () => {
  it("рахує по статусах", () => {
    expect(countQuotesByStatus([{ status: "approved" }, { status: "approved" }, { status: "cancelled" }])).toEqual({
      approved: 2,
      cancelled: 1,
    });
  });
});

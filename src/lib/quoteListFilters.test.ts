import { describe, expect, it } from "vitest";
import { applyQuoteListFilters, buildQuoteCustomerOrFilter, buildQuoteSearchOrFilter, countQuotesByStatus } from "./quoteListFilters";

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

describe("buildQuoteCustomerOrFilter", () => {
  it("замовник: за id або за назвою без id, торговою й юридичною", () => {
    expect(
      buildQuoteCustomerOrFilter({ kind: "customer", id: "c1", name: " Фантом ", legalName: "ТОВ Фантом" })
    ).toBe(
      'customer_id.eq.c1,and(customer_id.is.null,customer_name.ilike."Фантом"),and(customer_id.is.null,customer_name.ilike."ТОВ Фантом")'
    );
  });
  it("лід: лише назва при порожньому customer_id, юрназву не чіпає", () => {
    expect(buildQuoteCustomerOrFilter({ kind: "lead", id: "l1", name: "Рога", legalName: "ТОВ Копита" })).toBe(
      'and(customer_id.is.null,customer_name.ilike."Рога")'
    );
  });
  it("екранує % _ коми дужки та лапки", () => {
    expect(buildQuoteCustomerOrFilter({ kind: "lead", id: "l1", name: '50%_(a, "b")' })).toBe(
      'and(customer_id.is.null,customer_name.ilike."50\\\\%\\\\_(a, \\"b\\")")'
    );
  });
  it("однакові торгова й юридична назви не дублюються", () => {
    expect(buildQuoteCustomerOrFilter({ kind: "customer", id: "c1", name: "A", legalName: "A" })).toBe(
      'customer_id.eq.c1,and(customer_id.is.null,customer_name.ilike."A")'
    );
  });
});

describe("applyQuoteListFilters з замовником", () => {
  it("додає окремий or", () => {
    const calls: string[] = [];
    const query = { or: (f: string) => (calls.push(f), query), in: () => query, eq: () => query };
    applyQuoteListFilters(query, {
      escapedSearch: "",
      skuQuoteIds: [],
      searchableColumns: [],
      customer: { kind: "customer", id: "c1", name: "A" },
    });
    expect(calls).toEqual(['customer_id.eq.c1,and(customer_id.is.null,customer_name.ilike."A")']);
  });
});

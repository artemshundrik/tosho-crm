import { describe, expect, it } from "vitest";
import { customerFilterNames, taskMatchesCustomerFilter } from "./customerFilter";

const customer = { kind: "customer" as const, id: "c1", name: "Фантом", legalName: "ТОВ Фантом Плюс" };

describe("taskMatchesCustomerFilter", () => {
  const quotes = new Set(["q1"]);
  it("за id замовника або ліда", () => {
    expect(taskMatchesCustomerFilter({ customerId: "c1" }, customer, quotes)).toBe(true);
    expect(taskMatchesCustomerFilter({ customerId: "l1" }, { kind: "lead", id: "l1", name: "X" }, quotes)).toBe(true);
    expect(taskMatchesCustomerFilter({ customerId: "c2" }, customer, quotes)).toBe(false);
  });
  it("за назвою без регістру, торговою й юридичною", () => {
    expect(taskMatchesCustomerFilter({ customerName: "  фантом " }, customer, quotes)).toBe(true);
    expect(taskMatchesCustomerFilter({ customerName: "тов фантом плюс" }, customer, quotes)).toBe(true);
    expect(taskMatchesCustomerFilter({ customerName: "Інший" }, customer, quotes)).toBe(false);
  });
  it("через прорахунок замовника", () => {
    expect(taskMatchesCustomerFilter({ quoteId: "q1" }, customer, quotes)).toBe(true);
    expect(taskMatchesCustomerFilter({ quoteId: "q2" }, customer, quotes)).toBe(false);
    expect(taskMatchesCustomerFilter({}, customer, quotes)).toBe(false);
  });
});

describe("customerFilterNames", () => {
  it("юрназва ліда не береться", () => {
    expect(customerFilterNames({ kind: "lead", id: "l", name: "A", legalName: "B" })).toEqual(["A"]);
  });
});

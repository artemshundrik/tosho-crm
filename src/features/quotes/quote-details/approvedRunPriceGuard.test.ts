import { describe, expect, it } from "vitest";
import type { QuoteRun } from "@/lib/toshoApi";

import { findApprovedRunPriceChanges, revertApprovedRunPrices } from "./approvedRunPriceGuard";

/**
 * Сторож ціни, яку клієнт уже погодив (REQ-178#p10). Це ГРОШІ: помилка тут або
 * пропускає тиху зміну погодженої ціни, або питає на кожну правку й тим самим
 * навчає прощіпувати попередження не читаючи.
 */

const run = (over: Partial<QuoteRun> & { id: string }): QuoteRun => ({
  quantity: 100,
  unit_price_model: 50,
  unit_price_print: 10,
  logistics_cost: 500,
  desired_manager_income: 0,
  markup_rate: 40,
  manager_rate: 10,
  fixed_cost_rate: 5,
  vat_rate: 0,
  ...over,
});

describe("findApprovedRunPriceChanges", () => {
  it("мовчить, коли погодженого тиражу немає взагалі", () => {
    const before = [run({ id: "a" })];
    const after = [run({ id: "a", unit_price_model: 80 })];
    expect(findApprovedRunPriceChanges(after, before)).toEqual([]);
  });

  it("мовчить про одинокий непозначений тираж — його ще рахують", () => {
    const before = [run({ id: "a", is_approved: false })];
    const after = [run({ id: "a", is_approved: false, markup_rate: 90 })];
    expect(findApprovedRunPriceChanges(after, before)).toEqual([]);
  });

  it("ловить зміну ціни погодженого тиражу", () => {
    const before = [run({ id: "a", is_approved: true })];
    const after = [run({ id: "a", is_approved: true, unit_price_model: 80 })];
    const changes = findApprovedRunPriceChanges(after, before);
    expect(changes).toHaveLength(1);
    expect(changes[0].runId).toBe("a");
    expect(changes[0].after).toBeGreaterThan(changes[0].before);
  });

  it("ловить зміну накрутки — не лише витрат", () => {
    const before = [run({ id: "a", is_approved: true })];
    const after = [run({ id: "a", is_approved: true, markup_rate: 55 })];
    expect(findApprovedRunPriceChanges(after, before)).toHaveLength(1);
  });

  it("мовчить, коли витрату переклали, а підсумок не зрушив", () => {
    const before = [run({ id: "a", is_approved: true, unit_price_model: 50, unit_price_print: 10 })];
    const after = [run({ id: "a", is_approved: true, unit_price_model: 40, unit_price_print: 20 })];
    expect(findApprovedRunPriceChanges(after, before)).toEqual([]);
  });

  it("мовчить, коли саме позначку щойно й поставили", () => {
    const before = [run({ id: "a", is_approved: false })];
    const after = [run({ id: "a", is_approved: true, unit_price_model: 80 })];
    expect(findApprovedRunPriceChanges(after, before)).toEqual([]);
  });

  it("не чіпає сусідні непогоджені тиражі", () => {
    const before = [run({ id: "a", is_approved: true }), run({ id: "b" })];
    const after = [run({ id: "a", is_approved: true }), run({ id: "b", unit_price_model: 90 })];
    expect(findApprovedRunPriceChanges(after, before)).toEqual([]);
  });

  it("копійчана похибка float не рахується за зміну", () => {
    const before = [run({ id: "a", is_approved: true, logistics_cost: 500 })];
    const after = [run({ id: "a", is_approved: true, logistics_cost: 500.000000001 })];
    expect(findApprovedRunPriceChanges(after, before)).toEqual([]);
  });

  it("новий тираж без id не плутається з погодженим", () => {
    const before = [run({ id: "a", is_approved: true })];
    const after = [run({ id: "a", is_approved: true }), { ...run({ id: "" }), id: undefined } as QuoteRun];
    expect(findApprovedRunPriceChanges(after, before)).toEqual([]);
  });
});

describe("revertApprovedRunPrices", () => {
  it("повертає погоджений тираж і лишає сусідній правленим", () => {
    const original = [run({ id: "a", is_approved: true }), run({ id: "b" })];
    const edited = [
      run({ id: "a", is_approved: true, unit_price_model: 80 }),
      run({ id: "b", unit_price_model: 90 }),
    ];
    const changes = findApprovedRunPriceChanges(edited, original);
    const reverted = revertApprovedRunPrices(edited, original, changes);
    expect(reverted[0].unit_price_model).toBe(50);
    expect(reverted[1].unit_price_model).toBe(90);
  });

  it("без змін віддає той самий масив", () => {
    const current = [run({ id: "a" })];
    expect(revertApprovedRunPrices(current, current, [])).toBe(current);
  });
});

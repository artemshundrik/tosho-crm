import { describe, expect, it } from "vitest";

import { describeRunChanges } from "./quoteRunChanges";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Стрічка справи має відповідати на «хто і коли опустив накрутку» — а це
 * залежить рівно від цієї функції. Тест тримає межу між «подія» і «шум»:
 * зайвий запис на кожне автозбереження засмітив би стрічку так само надійно,
 * як і відсутність записів робила її сліпою.
 */

const run = (overrides: Partial<QuoteRun> = {}): QuoteRun =>
  ({
    id: "r1",
    quantity: 100,
    unit_price_model: 172,
    unit_price_print: 38,
    logistics_cost: 0,
    markup_rate: 40,
    ...overrides,
  }) as QuoteRun;

describe("describeRunChanges", () => {
  it("нічого не змінилось — жодної події", () => {
    expect(describeRunChanges([run()], [run()])).toEqual([]);
  });

  it("собівартість внесли вперше", () => {
    const changes = describeRunChanges(
      [run({ unit_price_model: 0, unit_price_print: 0 })],
      [run()]
    );
    expect(changes).toEqual([
      { label: "Собівартість тиражу 100 шт", from: "не внесена", to: "172 + 38 грн/од" },
    ]);
  });

  it("логістика входить у той самий факт, а не окремою подією", () => {
    const changes = describeRunChanges([run()], [run({ logistics_cost: 500 })]);
    expect(changes).toHaveLength(1);
    expect(changes[0].to).toBe("172 + 38 грн/од · логістика 500");
  });

  it("накрутка — окрема подія зі своїм «було → стало»", () => {
    const changes = describeRunChanges([run()], [run({ markup_rate: 28 })]);
    expect(changes).toEqual([{ label: "Накрутка тиражу 100 шт", from: "40 %", to: "28 %" }]);
  });

  it("новий тираж не тягне за собою події про накрутку — її ніхто не ставив", () => {
    const changes = describeRunChanges([], [run({ id: "new" })]);
    expect(changes.map((change) => change.label)).toEqual(["Собівартість тиражу 100 шт"]);
  });

  it("порожній новий тираж не подія взагалі", () => {
    const changes = describeRunChanges(
      [],
      [run({ id: "new", unit_price_model: 0, unit_price_print: 0 })]
    );
    expect(changes).toEqual([]);
  });
});

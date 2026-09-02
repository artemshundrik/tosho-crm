import { describe, expect, it } from "vitest";

import { buildRunsAutosaveSignature, isBlankDraftRun } from "./quoteRunAutosave";
import type { QuoteRun } from "@/lib/toshoApi";

/**
 * Відкриття картки не має писати в базу (REQ-243).
 *
 * ЧОМУ ЦЕ ВАРТО ТЕСТУ. Заготовка, яку сторінка створює для товару без тиражу,
 * одразу розходилась зі збереженим станом — і автозбереження писало її в прод
 * через 900 мс після відкриття, без жодної дії людини. Зламати це назад можна
 * однією зміною фільтра, і жоден тип про це не скаже.
 */

const RATES = { markupFallback: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 };

const run = (overrides: Partial<QuoteRun> = {}): QuoteRun =>
  ({
    id: "draft-1",
    quantity: 12,
    unit_price_model: 0,
    unit_price_print: 0,
    logistics_cost: 0,
    desired_manager_income: 0,
    markup_rate: 40,
    manager_rate: 10,
    fixed_cost_rate: 30,
    vat_rate: 20,
    is_approved: false,
    ...overrides,
  }) as QuoteRun;

describe("buildRunsAutosaveSignature", () => {
  it("незаймана заготовка не рахується зміною — відкриття картки нічого не пише", () => {
    expect(buildRunsAutosaveSignature([run()], RATES, new Set())).toBe(
      buildRunsAutosaveSignature([], RATES, new Set())
    );
  });

  it("перше введене число робить заготовку справжньою зміною", () => {
    expect(buildRunsAutosaveSignature([run({ unit_price_model: 336.41 })], RATES, new Set())).not.toBe(
      buildRunsAutosaveSignature([], RATES, new Set())
    );
  });

  it("позначка «погодив клієнт» — теж намір, а не порожнеча", () => {
    expect(buildRunsAutosaveSignature([run({ is_approved: true })], RATES, new Set())).not.toBe(
      buildRunsAutosaveSignature([], RATES, new Set())
    );
  });

  it("порожній тираж, який УЖЕ в базі, з підпису не зникає — інакше його не видалити", () => {
    const saved = new Set(["draft-1"]);
    expect(buildRunsAutosaveSignature([run()], RATES, saved)).not.toBe(
      buildRunsAutosaveSignature([], RATES, saved)
    );
  });

  it("порожнеча рахується по грошах, а не по кількості", () => {
    expect(isBlankDraftRun(run({ quantity: 500 }))).toBe(true);
    expect(isBlankDraftRun(run({ logistics_cost: 500 }))).toBe(false);
  });
});

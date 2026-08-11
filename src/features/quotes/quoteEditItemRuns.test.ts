import { describe, expect, it } from "vitest";

import { resolveQuoteEditItemRuns } from "./quoteEditItemRuns";

/**
 * REQ-34: у прорахунку з кількох позицій редагувалась лише перша. Перемикання
 * позиції має підставляти тиражі САМЕ обраного товару — інакше людина
 * відредагує чужі числа й не помітить.
 */
// Числа з реального прорахунку TS-0826-0012: «Еко-сумка» має два тиражі,
// «Ручка» — один, і обидва починаються з 570. Саме тому підміна першою
// позицією виглядала правдоподібно: перше число збігалось, а зайвий тираж «1»
// приїжджав із чужого товару.
const runs = [
  { id: "r1", quote_item_id: "bag", quantity: 570 },
  { id: "r2", quote_item_id: "bag", quantity: 1 },
  { id: "r3", quote_item_id: "pen", quantity: 570 },
];

describe("resolveQuoteEditItemRuns", () => {
  it("бере тиражі обраної позиції, а не першої-ліпшої", () => {
    const bag = resolveQuoteEditItemRuns({ id: "bag", qty: 450 }, runs);
    const pen = resolveQuoteEditItemRuns({ id: "pen", qty: 450 }, runs);

    expect(bag.formRuns.map((run) => run.quantity)).toEqual([570, 1]);
    expect(pen.formRuns.map((run) => run.quantity)).toEqual([570]);
    expect(pen.primaryQuantity).toBe(570);
  });

  it("для позиції без рядків тиражу підставляє кількість із самої позиції", () => {
    const legacy = resolveQuoteEditItemRuns({ id: "old", qty: 100 }, runs);

    expect(legacy.originalRuns).toEqual([]);
    expect(legacy.formRuns).toEqual([{ id: undefined, quantity: 100 }]);
    expect(legacy.primaryQuantity).toBe(100);
  });

  it("нульові тиражі у форму не потрапляють", () => {
    const result = resolveQuoteEditItemRuns({ id: "x", qty: 0 }, [
      { id: "r", quote_item_id: "x", quantity: 0 },
    ]);

    expect(result.formRuns).toEqual([]);
    expect(result.primaryQuantity).toBeUndefined();
  });

  it("originalRuns лишає рядки як у базі — по них звіряють збереження", () => {
    const bag = resolveQuoteEditItemRuns({ id: "bag", qty: 570 }, runs);

    expect(bag.originalRuns.map((run) => run.id)).toEqual(["r1", "r2"]);
  });

  it("без позиції не вигадує тиражів", () => {
    expect(resolveQuoteEditItemRuns(null, runs).formRuns).toEqual([]);
  });
});

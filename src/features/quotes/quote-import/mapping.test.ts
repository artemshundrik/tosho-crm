import { describe, expect, it } from "vitest";

import {
  buildImportItemPayload,
  buildImportRunPayloads,
  sanitizeExternalUrl,
  toDraftItems,
} from "./mapping";
import type { QuoteImportItem } from "./types";

const item = (patch: Partial<QuoteImportItem> = {}): QuoteImportItem => ({
  sourceRows: [5],
  name: "Кухоль",
  comment: null,
  links: [],
  runs: [{ quantity: 300, unitPriceModel: 119.5, modelPriceIncludesVat: true, unitPricePrint: 12 }],
  flags: [],
  notes: null,
  ...patch,
});

const draft = (patch: Partial<ReturnType<typeof toDraftItems>[number]> = {}) => ({
  ...toDraftItems([item()])[0],
  ...patch,
});

describe("розшифровка → рядки прев'ю", () => {
  it("переносить тираж і НЕ переносить жодної ціни", () => {
    const [first] = toDraftItems([item()]);

    expect(first.name).toBe("Кухоль");
    expect(first.runs).toEqual([{ key: "0-0", quantity: 300 }]);
  });

  it("діапазон тиражу приходить двома рядками однієї позиції", () => {
    const [range] = toDraftItems([
      item({ runs: [{ quantity: 300 }, { quantity: 500 }], flags: ["quantity_range"] }),
    ]);

    expect(range.runs.map((run) => run.quantity)).toEqual([300, 500]);
    expect(range.flags).toEqual(["quantity_range"]);
  });

  it("позиція без тиражу все одно імпортується — з одним порожнім рядком", () => {
    const [empty] = toDraftItems([item({ runs: [], flags: ["price_missing"] })]);

    expect(empty.runs).toEqual([{ key: "0-0", quantity: 1 }]);
  });

  it("викидає позицію без назви й гасить сміттєві числа", () => {
    expect(toDraftItems([item({ name: "   " })])).toHaveLength(0);

    const [fixed] = toDraftItems([
      item({ runs: [{ quantity: -5, unitPriceModel: -100, unitPricePrint: Number.NaN }] }),
    ]);
    expect(fixed.runs).toEqual([{ key: "0-0", quantity: 1 }]);
  });

  it("лишає тільки http(s) посилання й прибирає дублі", () => {
    const [links] = toDraftItems([
      item({
        links: [
          "https://kmz.ua/mug",
          "https://kmz.ua/mug",
          "javascript:alert(1)",
          "не посилання",
          "http://kmz.ua/second",
        ],
      }),
    ]);

    expect(links.links).toEqual(["https://kmz.ua/mug", "http://kmz.ua/second"]);
  });

  it("sanitizeExternalUrl відхиляє все, крім http(s)", () => {
    expect(sanitizeExternalUrl("https://ok.ua/x")).toBe("https://ok.ua/x");
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeExternalUrl("data:text/html,<script>")).toBeNull();
    expect(sanitizeExternalUrl(42)).toBeNull();
  });
});

describe("рядки прев'ю → payload мутацій", () => {
  it("перше посилання йде в supplierUrl, усі — в importLinks", () => {
    const payload = buildImportItemPayload({
      draft: draft({ links: ["https://kmz.ua/a", "https://kmz.ua/b"] }),
      itemId: "item-1",
      teamId: "team-1",
      quoteId: "quote-1",
      position: 3,
      trace: { fileName: "kmz.xlsx", importedAt: "2026-09-01T10:00:00.000Z" },
    });

    expect(payload.metadata).toEqual({
      import: { fileName: "kmz.xlsx", importedAt: "2026-09-01T10:00:00.000Z", sourceRows: [5] },
      supplierUrl: "https://kmz.ua/a",
      importLinks: ["https://kmz.ua/a", "https://kmz.ua/b"],
    });
    expect(payload).toMatchObject({ position: 3, qty: 300 });
  });

  it("позиція приходить із тиражем, але без ціни й суми рядка", () => {
    const payload = buildImportItemPayload({
      draft: draft(),
      itemId: "item-1",
      teamId: "team-1",
      quoteId: "quote-1",
      position: 1,
      trace: { fileName: "kmz.xlsx", importedAt: "2026-09-01T10:00:00.000Z" },
    });

    // 119,5 з файлу лишається у файлі: unit_price — та сама собівартість збоку.
    expect(payload).toMatchObject({ qty: 300, unit_price: 0, line_total: 0 });
  });

  it("коментар замовника лягає в опис позиції", () => {
    const payload = buildImportItemPayload({
      draft: draft({ comment: "уточнити колір" }),
      itemId: "item-1",
      teamId: "team-1",
      quoteId: "quote-1",
      position: 1,
      trace: { fileName: "kmz.xlsx", importedAt: "2026-09-01T10:00:00.000Z" },
    });

    expect(payload.description).toBe("уточнити колір");
  });

  it("тираж бере ставки прорахунку, собівартість — нулі, погодження — ні", () => {
    const runs = buildImportRunPayloads({
      draft: draft(),
      quoteId: "quote-1",
      quoteItemId: "item-1",
      defaults: { markupRate: 55, managerRate: 10, fixedCostRate: 30, vatRate: 20 },
    });

    expect(runs).toEqual([
      {
        quote_id: "quote-1",
        quote_item_id: "item-1",
        quantity: 300,
        unit_price_model: 0,
        unit_price_model_vat: null,
        unit_price_print: 0,
        logistics_cost: 0,
        desired_manager_income: 0,
        markup_rate: 55,
        manager_rate: 10,
        fixed_cost_rate: 30,
        vat_rate: 20,
        is_approved: false,
      },
    ]);
  });

  it("ціна товару з файлу не тече в нанесення — там теж нуль (REQ-235)", () => {
    const [runFromFile] = buildImportRunPayloads({
      draft: draft(),
      quoteId: "quote-1",
      quoteItemId: "item-1",
      defaults: { markupRate: 40, managerRate: 10, fixedCostRate: 30, vatRate: 20 },
    });

    // У фікстурі 119,5 за товар і 12 за нанесення — жодне число не доїжджає.
    expect(runFromFile.unit_price_model).toBe(0);
    expect(runFromFile.unit_price_print).toBe(0);
    expect(runFromFile.logistics_cost).toBe(0);
  });
});

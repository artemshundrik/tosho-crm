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
  runs: [{ quantity: 300 }],
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
    const [empty] = toDraftItems([item({ runs: [] })]);

    expect(empty.runs).toEqual([{ key: "0-0", quantity: 1 }]);
  });

  it("рядок файлу приходить без артикула — його називає сторінка, а не таблиця", () => {
    const [first] = toDraftItems([item()]);

    expect(first.sku).toBeNull();
  });

  it("викидає позицію без назви й гасить сміттєві числа", () => {
    expect(toDraftItems([item({ name: "   " })])).toHaveLength(0);

    const [fixed] = toDraftItems([
      item({ runs: [{ quantity: -5 }] }),
    ]);
    expect(fixed.runs).toEqual([{ key: "0-0", quantity: 1 }]);
  });

  it("варіанти одного номера рахуються зв'язком, а поодинокі — ні", () => {
    const drafts = toDraftItems([
      item({ name: "Дзен сад 9 см", variantGroup: "30" }),
      item({ name: "Дзен сад 10 см", variantGroup: "30" }),
      item({ name: "Мультитул", variantGroup: null }),
      // Група з одного — це не вибір: підпис «варіант 1 з 1» лише шумів би.
      item({ name: "Ліхтар", variantGroup: "20" }),
    ]);

    expect(drafts.map((draft) => draft.variant)).toEqual([
      { index: 1, total: 2 },
      { index: 2, total: 2 },
      null,
      null,
    ]);
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

  it("позиція з каталогу несе catalog_*_id і пари «метод + місце» тим самим рядком, що картка", () => {
    const payload = buildImportItemPayload({
      draft: draft({
        catalog: {
          modelId: "m-1",
          kindId: "k-1",
          typeId: "t-1",
          kindName: "Худі",
          typeName: "Одяг",
          imageUrl: null,
        },
        imprints: [
          { key: "i-1", methodId: "method-dtf", positionId: "place-chest", positionLabel: "Груди" },
          // Місце вписали руками: рядка довідника ще немає, лишається підпис.
          { key: "i-2", methodId: "method-embroidery", positionId: null, positionLabel: "По центру спини" },
        ],
      }),
      itemId: "item-1",
      teamId: "team-1",
      quoteId: "quote-1",
      position: 1,
      trace: { fileName: "", importedAt: "2026-09-04T10:00:00.000Z" },
    });

    expect(payload).toMatchObject({ catalog_type_id: "t-1", catalog_kind_id: "k-1", catalog_model_id: "m-1" });
    expect(payload.methods).toEqual([
      {
        method_id: "method-dtf",
        count: 1,
        print_position_id: "place-chest",
        print_position_label: "Груди",
        print_width_mm: null,
        print_height_mm: null,
      },
      {
        method_id: "method-embroidery",
        count: 1,
        print_position_id: null,
        print_position_label: "По центру спини",
        print_width_mm: null,
        print_height_mm: null,
      },
    ]);
    // Колонка позиції — перше місце з довідника: нею користуються старі читачі,
    // які дивляться не в масив, а в саму позицію.
    expect(payload.print_position_id).toBe("place-chest");
  });

  it("без нанесення — methods: null, як і в решти шляхів створення", () => {
    const payload = buildImportItemPayload({
      draft: draft(),
      itemId: "item-1",
      teamId: "team-1",
      quoteId: "quote-1",
      position: 1,
      trace: { fileName: "kmz.xlsx", importedAt: "2026-09-01T10:00:00.000Z" },
    });
    expect(payload.methods).toBeNull();
    expect(payload.catalog_model_id).toBeNull();
  });

  it("артикул зі сторінки постачальника лягає в metadata.sku (REQ-247)", () => {
    const payload = buildImportItemPayload({
      draft: draft({ sku: "5003-03", links: ["https://totobi.com.ua/parasolya"] }),
      itemId: "item-sku",
      teamId: "team-1",
      quoteId: "quote-1",
      position: 1,
      trace: { fileName: "", importedAt: "2026-09-04T10:00:00.000Z" },
    });

    // Ключ саме `sku`: картка позиції й картка на дошці читають його вже
    // сьогодні, тож «Артикул: …» з'являється без правок у тих читачах.
    expect((payload.metadata as Record<string, unknown>).sku).toBe("5003-03");
  });

  it("сторінка не назвала артикула — ключа в metadata немає взагалі", () => {
    const payload = buildImportItemPayload({
      draft: draft({ sku: null }),
      itemId: "item-no-sku",
      teamId: "team-1",
      quoteId: "quote-1",
      position: 1,
      trace: { fileName: "kmz.xlsx", importedAt: "2026-09-04T10:00:00.000Z" },
    });

    expect((payload.metadata as Record<string, unknown>).sku).toBeUndefined();
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

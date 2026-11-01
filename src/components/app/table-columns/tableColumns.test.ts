import { describe, expect, it } from "vitest";

import { defineTableColumns, resolveTableColumnWidths, tableColumnBounds } from "./tableColumns";

const spec = defineTableColumns({
  ids: ["title", "customer", "status"] as const,
  columns: {
    title: { label: "Назва", def: 320, min: 200, max: 640 },
    customer: { label: "Замовник", def: 200, min: 140, max: 360 },
    status: { label: "Статус", def: 140, min: 100 },
  },
  fixedPx: 40,
  grow: "title",
  flexMinPx: 60,
  storageKey: "test",
  varPrefix: "t",
});

describe("tableColumnBounds", () => {
  it("на широкому екрані сусід назви росте її коштом", () => {
    const widths = resolveTableColumnWidths(spec, {}, 1700);
    expect(widths.title).toBeGreaterThan(640);
    const bounds = tableColumnBounds(spec, widths, {}, 1700, "customer");
    expect(bounds.max).toBe(360);
  });

  it("назва, яку тягнули руками, місця не віддає — лише вільний залишок", () => {
    const widths = resolveTableColumnWidths(spec, { title: 1200 }, 1700);
    const bounds = tableColumnBounds(spec, widths, { title: 1200 }, 1700, "customer");
    expect(bounds.max).toBe(260);
  });

  it("натягнута руками назва не обрізається стелею після перерахунку", () => {
    expect(resolveTableColumnWidths(spec, { title: 780 }, 1700).title).toBe(780);
  });
});

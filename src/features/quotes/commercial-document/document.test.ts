import { describe, expect, it } from "vitest";

import {
  buildCommercialExcelTsv,
  commercialSectionTotalRange,
  documentHasVariantGroup,
  renderCommercialDocumentHtml,
  type CommercialDocument,
  type CommercialItemRow,
  type CommercialQuoteSection,
} from "./document";

/**
 * Документ КП має чотири виходи, і три з них складаються тут: HTML для друку,
 * PDF (той самий HTML) і TSV. Четвертий — прев'ю в React — бере готові
 * `section.totalRange` / `doc.totalRange`, тобто те саме, що рахує
 * `commercialSectionTotalRange` нижче.
 */

/**
 * `Intl.NumberFormat("uk-UA")` розділяє тисячі нерозривним пробілом, а не
 * звичайним. У документі це правильно, у тексті тесту — нечитабельно, тож
 * порівнюємо на нормалізованому рядку.
 */
const norm = (value: string) => value.replaceAll(/[\u00a0\u202f]/g, " ");

function item(overrides: Partial<CommercialItemRow> & { id: string }): CommercialItemRow {
  return {
    position: 1,
    imageUrl: "",
    name: "Щоденник",
    catalogPath: "",
    description: "",
    methodsSummary: "",
    placementSummary: "",
    unit: "шт",
    isVariant: false,
    runs: [{ id: `${overrides.id}-run`, qty: 100, unitPrice: 100, lineTotal: 10_000 }],
    ...overrides,
  };
}

function section(items: CommercialItemRow[]): CommercialQuoteSection {
  return {
    quoteId: "q1",
    quoteNumber: "TS-0926-0022",
    status: "Новий",
    createdAt: "01.09.2026",
    visualizations: [],
    items,
    totalRange: commercialSectionTotalRange(items),
  };
}

function doc(sections: CommercialQuoteSection[]): CommercialDocument {
  return {
    title: "КП на щоденники",
    kindLabel: "КП",
    customerName: 'ТОВ "Ромашка"',
    createdAt: "01.09.2026",
    generatedAt: "01.09.2026, 10:00",
    currency: "грн",
    sections,
    totalRange: sections.reduce(
      (range, s) => ({ min: range.min + s.totalRange.min, max: range.max + s.totalRange.max }),
      { min: 0, max: 0 }
    ),
  };
}

const threeVariants = [
  item({ id: "a", name: "Щоденник у шкірзаміннику", isVariant: true }),
  item({
    id: "b",
    name: "Щоденник у папері з друком",
    isVariant: true,
    runs: [{ id: "b-run", qty: 100, unitPrice: 96.24, lineTotal: 9_624 }],
  }),
  item({
    id: "c",
    name: "Щоденник у дизайнерському папері",
    isVariant: true,
    runs: [{ id: "c-run", qty: 100, unitPrice: 210, lineTotal: 21_000 }],
  }),
];

const threeProducts = [
  item({ id: "a", name: "Щоденник" }),
  item({ id: "b", name: "Ручка", runs: [{ id: "b-run", qty: 100, unitPrice: 96.24, lineTotal: 9_624 }] }),
  item({ id: "c", name: "Пакет", runs: [{ id: "c-run", qty: 100, unitPrice: 210, lineTotal: 21_000 }] }),
];

describe("підсумок прорахунку в документі", () => {
  /** Гілка БЕЗ ролі: документ має показувати те саме, що й до REQ-267#p2. */
  it("три різні товари складаються", () => {
    expect(commercialSectionTotalRange(threeProducts)).toEqual({ min: 40_624, max: 40_624 });
  });

  it("три варіанти дають межі замість суми", () => {
    expect(commercialSectionTotalRange(threeVariants)).toEqual({ min: 9_624, max: 21_000 });
  });

  it("взаємовиключні тиражі всередині позиції лишаються межами позиції", () => {
    const withRuns = [
      item({
        id: "a",
        runs: [
          { id: "a-100", qty: 100, unitPrice: 100, lineTotal: 10_000 },
          { id: "a-200", qty: 200, unitPrice: 90, lineTotal: 18_000 },
        ],
      }),
    ];
    expect(commercialSectionTotalRange(withRuns)).toEqual({ min: 10_000, max: 18_000 });
  });

  it("документ без варіантів не вважається документом з групою", () => {
    expect(documentHasVariantGroup(doc([section(threeProducts)]))).toBe(false);
    expect(documentHasVariantGroup(doc([section(threeVariants)]))).toBe(true);
  });
});

describe("вихід 2/3 — HTML для друку й PDF", () => {
  it("без варіантів показує суму й не згадує варіантів", () => {
    const html = renderCommercialDocumentHtml(doc([section(threeProducts)]));
    expect(norm(html)).toContain("Разом: 40 624 грн");
    // Саме розмітка рядка: стиль `.variant-tag` у <style> лежить завжди.
    expect(norm(html)).not.toContain('<div class="variant-tag">');
    expect(norm(html)).not.toContain("Варіант");
    expect(norm(html)).not.toContain("залежно від обраного варіанта");
  });

  it("з варіантами показує межі, позначку в рядку й пояснення", () => {
    const html = renderCommercialDocumentHtml(doc([section(threeVariants)]));
    expect(norm(html)).toContain("від 9 624 грн до 21 000 грн");
    expect(norm(html)).not.toContain("Разом: 40 624 грн");
    // Позначка стоїть у кожному з трьох рядків.
    expect(norm(html).split('class="variant-tag"').length - 1).toBe(3);
    expect(norm(html)).toContain("залежно від обраного варіанта");
    expect(norm(html)).toContain("взаємовиключні");
  });

  it("варіанти й звичайна позиція в одному прорахунку", () => {
    const mixed = [...threeVariants, item({ id: "d", name: "Пакування", isVariant: false })];
    const html = renderCommercialDocumentHtml(doc([section(mixed)]));
    // 9 624 + 10 000 … 21 000 + 10 000
    expect(norm(html)).toContain("від 19 624 грн до 31 000 грн");
    expect(norm(html).split('class="variant-tag"').length - 1).toBe(3);
  });
});

describe("вихід 4 — TSV для Excel", () => {
  it("без варіантів колонка «Роль» порожня, а підсумок — сума", () => {
    const tsv = buildCommercialExcelTsv(doc([section(threeProducts)]));
    expect(norm(tsv)).toContain("Загальна сума\t40 624");
    expect(norm(tsv)).toContain("Фото URL\tРоль");
    expect(norm(tsv)).not.toContain("\tВаріант");
    expect(norm(tsv).split("\r\n").some((line) => line.endsWith("\tВаріант"))).toBe(false);
  });

  it("з варіантами позначає рядки, дає межі й дописує пояснення", () => {
    const tsv = buildCommercialExcelTsv(doc([section(threeVariants)]));
    const rows = norm(tsv).split("\r\n");
    expect(rows.filter((line) => line.endsWith("\tВаріант"))).toHaveLength(3);
    expect(norm(tsv)).toContain("Загальна сума\tвід 9 624 до 21 000");
    expect(norm(tsv)).toContain("Разом по прорахунку\tвід 9 624 до 21 000");
    expect(norm(tsv)).toContain("взаємовиключні");
  });

  /**
   * Колонки не зсуваються: «Сума» лишається десятою, «Фото URL» — одинадцятою,
   * «Роль» додана дванадцятою. Інакше чужі шаблони в Excel мовчки поїхали б.
   */
  it("нова колонка додана в кінець, а не вставлена в середину", () => {
    const tsv = buildCommercialExcelTsv(doc([section(threeVariants)]));
    const header = norm(tsv).split("\r\n").find((line) => line.startsWith("№\t")) ?? "";
    expect(header.split("\t")).toEqual([
      "№",
      "Товар",
      "Опис",
      "Категорія/модель",
      "Місце/розмір",
      "Нанесення",
      "К-сть",
      "Од.",
      "Ціна",
      "Сума",
      "Фото URL",
      "Роль",
    ]);
    const firstRow = norm(tsv).split("\r\n").find((line) => line.startsWith("1\t")) ?? "";
    expect(firstRow.split("\t")).toHaveLength(12);
    expect(firstRow.split("\t")[9]).toBe("10 000");
  });
});

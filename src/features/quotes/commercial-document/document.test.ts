import { describe, expect, it } from "vitest";

import {
  buildCommercialExcelTsv,
  commercialSectionTotalRange,
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
 *
 * ЩО ЗВІДСИ ПІШЛО. Роль позиції «варіант того самого виробу» (пігулка в рядку,
 * колонка «Роль» у TSV, пояснення під підсумком і попередження про варіант без
 * ціни) прибрана як невживана — див. `@/lib/moneyRange`. Замість тих тестів
 * нижче стоїть один, який стереже, щоб її сліди не повернулись у виходи
 * поодинці.
 */

/**
 * `Intl.NumberFormat("uk-UA")` розділяє тисячі нерозривним пробілом, а не
 * звичайним. У документі це правильно, у тексті тесту — нечитабельно, тож
 * порівнюємо на нормалізованому рядку.
 */
const norm = (value: string) => value.replaceAll(/[  ]/g, " ");

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

const threeProducts = [
  item({ id: "a", name: "Щоденник" }),
  item({ id: "b", name: "Ручка", runs: [{ id: "b-run", qty: 100, unitPrice: 96.24, lineTotal: 9_624 }] }),
  item({ id: "c", name: "Пакет", runs: [{ id: "c-run", qty: 100, unitPrice: 210, lineTotal: 21_000 }] }),
];

const withRunChoice = [
  item({
    id: "a",
    runs: [
      { id: "a-100", qty: 100, unitPrice: 100, lineTotal: 10_000 },
      { id: "a-200", qty: 200, unitPrice: 90, lineTotal: 18_000 },
    ],
  }),
];

describe("підсумок прорахунку в документі", () => {
  it("різні товари складаються", () => {
    expect(commercialSectionTotalRange(threeProducts)).toEqual({ min: 40_624, max: 40_624 });
  });

  it("взаємовиключні тиражі всередині позиції лишаються межами позиції", () => {
    expect(commercialSectionTotalRange(withRunChoice)).toEqual({ min: 10_000, max: 18_000 });
  });

  it("межі позицій складаються дном до дна, стелею до стелі", () => {
    expect(commercialSectionTotalRange([...threeProducts, ...withRunChoice])).toEqual({
      min: 50_624,
      max: 58_624,
    });
  });

  it("прорахунок без позицій — нуль, а не NaN", () => {
    expect(commercialSectionTotalRange([])).toEqual({ min: 0, max: 0 });
  });
});

describe("вихід 2/3 — HTML для друку й PDF", () => {
  it("один тираж у кожної позиції — звичайна сума без пам'яток", () => {
    const html = renderCommercialDocumentHtml(doc([section(threeProducts)]));
    expect(norm(html)).toContain("Разом: 40 624 грн");
    expect(norm(html)).not.toContain("залежно від обраного тиражу");
  });

  it("кілька тиражів — межі й пам'ятка про вибір тиражу", () => {
    const html = renderCommercialDocumentHtml(doc([section(withRunChoice)]));
    expect(norm(html)).toContain("від 10 000 грн до 18 000 грн");
    expect(norm(html)).toContain("залежно від обраного тиражу");
    expect(norm(html)).toContain("Тиражі взаємовиключні");
  });
});

describe("вихід 4 — TSV для Excel", () => {
  it("підсумок — сума, коли тираж у кожної позиції один", () => {
    const tsv = buildCommercialExcelTsv(doc([section(threeProducts)]));
    expect(norm(tsv)).toContain("Загальна сума\t40 624");
  });

  it("кілька тиражів — межі й пояснення в кінці", () => {
    const tsv = buildCommercialExcelTsv(doc([section(withRunChoice)]));
    expect(norm(tsv)).toContain("Загальна сума\tвід 10 000 до 18 000");
    expect(norm(tsv)).toContain("Разом по прорахунку\tвід 10 000 до 18 000");
    expect(norm(tsv)).toContain("взаємовиключні");
  });

  /**
   * Порядок колонок — це чужі шаблони й формули в Excel: вони рахують позиції
   * зліва, і зсув «Суми» мовчки зіпсував би їх усі. «Роль» була дванадцятою й
   * ОСТАННЬОЮ, тому її зникнення нічого не зсунуло.
   */
  it("колонки стоять на своїх місцях, «Сума» — десята", () => {
    const tsv = buildCommercialExcelTsv(doc([section(threeProducts)]));
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
    ]);
    const firstRow = norm(tsv).split("\r\n").find((line) => line.startsWith("1\t")) ?? "";
    expect(firstRow.split("\t")).toHaveLength(11);
    expect(firstRow.split("\t")[9]).toBe("10 000");
  });
});

/**
 * Роль «варіант» прибрана цілком. Слідів у неї було чотири в трьох різних
 * місцях коду, і повертались би вони поодинці — пігулку в рядку легко додати
 * назад, не згадавши про колонку в Excel. Один тест на всі виходи одразу.
 */
describe("роль «варіант» не лишила слідів", () => {
  it("жоден вихід не згадує варіантів", () => {
    const withEverything = doc([section([...threeProducts, ...withRunChoice])]);
    for (const output of [
      renderCommercialDocumentHtml(withEverything),
      buildCommercialExcelTsv(withEverything),
    ]) {
      expect(norm(output)).not.toContain("Варіант");
      expect(norm(output)).not.toContain("варіант");
    }
  });
});

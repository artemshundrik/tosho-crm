import { describe, expect, it } from "vitest";

import {
  buildCommercialSheetRows,
  COMMERCIAL_SHEET_COLUMNS,
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

/**
 * Підсумку в документі НЕМАЄ — ні числом, ні межами (REQ-296, дірка REQ-267#p2).
 * Позиції прорахунку замовник обирає, а документ складав їх додаванням: на
 * TS-0926-0029 це давало 80–120 тис. ₴ замість реальних 34–85 тис. Тести стоять
 * саме на відсутності: підсумок легко повернути одним рядком у шаблон.
 */
describe("вихід 2/3 — HTML для друку й PDF", () => {
  it("суми всіх позицій у документі немає", () => {
    const html = norm(renderCommercialDocumentHtml(doc([section(threeProducts)])));
    expect(html).not.toContain("Разом");
    expect(html).not.toContain("40 624");
    expect(html).toContain("Єдиної суми тут немає");
  });

  it("ціна кожного тиражу лишається — зникає лише спільний підсумок", () => {
    const html = norm(renderCommercialDocumentHtml(doc([section(withRunChoice)])));
    expect(html).toContain("10 000 грн");
    expect(html).toContain("18 000 грн");
    expect(html).not.toContain("від 10 000 грн до 18 000 грн");
    expect(html).toContain("Тиражі взаємовиключні");
  });

  it("позиція без фото отримує плитку з ініціалами, а не порожній квадрат", () => {
    const html = norm(renderCommercialDocumentHtml(doc([section(threeProducts)])));
    expect(html).toContain("photo-initials");
  });
});

const flat = (rows: ReturnType<typeof buildCommercialSheetRows>) =>
  rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")).join("\n");

describe("вихід 4 — аркуш для Excel", () => {
  it("рядків із підсумком немає — ні по прорахунку, ні загального", () => {
    const sheet = flat(buildCommercialSheetRows(doc([section(threeProducts)])));
    expect(sheet).not.toContain("Загальна сума");
    expect(sheet).not.toContain("Разом по прорахунку");
  });

  it("кілька тиражів — ціни на місці, пояснення в кінці", () => {
    const sheet = flat(buildCommercialSheetRows(doc([section(withRunChoice)])));
    expect(sheet).not.toContain("Загальна сума");
    expect(sheet).toContain("взаємовиключні");
  });

  /**
   * ЧИСЛО, А НЕ ТЕКСТ. Доки це був TSV, кількість і ціна їхали вже
   * відформатованими («17 276,1» з нерозривним пробілом), і Excel приймав їх за
   * текст: замовник не міг ні підсумувати, ні відсортувати стовпчик.
   */
  it("кількість, ціна й сума лишаються числами", () => {
    const rows = buildCommercialSheetRows(doc([section(threeProducts)]));
    const first = rows.find((row) => row[0] === 1) ?? [];
    expect(typeof first[6]).toBe("number");
    expect(typeof first[8]).toBe("number");
    expect(first[9]).toBe(10_000);
  });

  /**
   * Порядок колонок — це чужі шаблони й формули в Excel: вони рахують позиції
   * зліва, і зсув «Суми» мовчки зіпсував би їх усі. «Роль» була дванадцятою й
   * ОСТАННЬОЮ, тому її зникнення нічого не зсунуло.
   */
  it("колонки стоять на своїх місцях, «Сума» — десята", () => {
    expect([...COMMERCIAL_SHEET_COLUMNS]).toEqual([
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
    const rows = buildCommercialSheetRows(doc([section(threeProducts)]));
    const first = rows.find((row) => row[0] === 1) ?? [];
    expect(first).toHaveLength(11);
    expect(first[9]).toBe(10_000);
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
      flat(buildCommercialSheetRows(withEverything)),
    ]) {
      expect(norm(output)).not.toContain("Варіант");
      expect(norm(output)).not.toContain("варіант");
    }
  });
});

import { describe, expect, it } from "vitest";

import { planPoolQueries } from "./poolQueryPlan";

/**
 * Живий випадок 24.09.2026 (REQ-182#p27, `docs/QUOTE_IMPORT_DESIGN.md` §2б):
 * «Флісова жилетка» клієнта і «Жилет флісовий Mercury» пулу — той самий товар,
 * але жоден варіант цілої фрази не збігається з жодним варіантом назви пулу.
 * Тести нижче — про сам план запитів, без бази: `searchSupplierPool.test.ts`
 * перевіряє, що план справді звужує рядки.
 */
describe("planPoolQueries", () => {
  it("два слова: головне (останнє) слово першим терміном, інше — mustContain", () => {
    expect(planPoolQueries("Флісова жилетка")).toEqual([
      { term: "жиле", mustContain: ["фліс"] },
      { term: "фліс", mustContain: ["жиле"] },
    ]);
  });

  it("одне слово — один план без mustContain", () => {
    expect(planPoolQueries("Футболка")).toEqual([{ term: "футбо", mustContain: [] }]);
    expect(planPoolQueries("Термопляшка")).toEqual([{ term: "термопля", mustContain: [] }]);
    expect(planPoolQueries("Шопер")).toEqual([{ term: "шопе", mustContain: [] }]);
  });

  it("стеми обрізають до max(4, довжина - 3), у нижньому регістрі", () => {
    // «жилетка» (7) → 7-3=4 → «жиле»; верхній регістр не має лишати слід.
    const [plan] = planPoolQueries("ЖИЛЕТКА");
    expect(plan).toEqual({ term: "жиле", mustContain: [] });
  });

  it("числа, одиниці й прийменники випадають зі значущих слів", () => {
    // «500» — не літери взагалі, «для» і «мл» коротші за поріг: лишається
    // рівно два значущих слова, як і в парі «Флісова жилетка».
    expect(planPoolQueries("Термопляшка для спорту 500 мл")).toEqual([
      { term: "спор", mustContain: ["термопля"] },
      { term: "термопля", mustContain: ["спор"] },
    ]);
  });

  it("стоп-слово довше порогу («with») теж випадає", () => {
    expect(planPoolQueries("Vest with logo")).toEqual([
      { term: "logo", mustContain: ["vest"] },
      { term: "vest", mustContain: ["logo"] },
    ]);
  });

  it("чотири значущих слова — не більше трьох планів, але mustContain бачить УСІ інші стеми", () => {
    // «Кепка бейсболка спортивна унісекс»: головне слово («унісекс») першим,
    // далі «кепка», «бейсболка» — «спортивна» лишається лише в mustContain.
    expect(planPoolQueries("Кепка бейсболка спортивна унісекс")).toEqual([
      { term: "уніс", mustContain: ["кепк", "бейсбо", "спорти"] },
      { term: "кепк", mustContain: ["бейсбо", "спорти", "уніс"] },
      { term: "бейсбо", mustContain: ["кепк", "спорти", "уніс"] },
    ]);
  });

  it("самі стоп-слова й числа — порожній план: нема з чим іти в пул", () => {
    expect(planPoolQueries("500 шт")).toEqual([]);
    expect(planPoolQueries("")).toEqual([]);
  });
});

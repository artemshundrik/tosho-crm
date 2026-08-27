import { describe, expect, it } from "vitest";

import { isSimilarCompanyName, pickCompanyHints } from "./companyDuplicateHint";

/**
 * Пари взяті з РЕАЛЬНОЇ бази (замір 27.08.2026: 230 лідів, 134 замовники), а не
 * вигадані. Це важливо: вигадані приклади підтверджують правило, яке ти вже
 * придумав, а справжні показують, де воно ламається. Саме на цій вибірці стало
 * видно, що порівняння за підрядком непридатне.
 */
describe("isSimilarCompanyName — справжні збіги з бази", () => {
  it("випадок зі скарги: коротка назва при наявній довгій", () => {
    expect(isSimilarCompanyName("KMZ", "KMZ Industries - КМЗ")).toBe(true);
  });

  it("і навпаки — довга при наявній короткій", () => {
    // Влад вводив саме довгу. Одностороннє порівняння лишило б його без підказки.
    expect(isSimilarCompanyName("KMZ Industries - КМЗ", "KMZ")).toBe(true);
  });

  it("різні абетки в одній назві не заважають", () => {
    expect(isSimilarCompanyName("НіКС/ N-iX", "НІКС / NIX Solutions")).toBe(true);
  });

  it("назва з уточненням у дужках", () => {
    expect(isSimilarCompanyName("Vector", "ВЕКТОР ВС (Vector VS)")).toBe(true);
  });

  it("назва зі словом «компанія»", () => {
    expect(isSimilarCompanyName("землероб", "ЗЕМЛЕРОБ КОМПАНІЯ")).toBe(true);
  });
});

describe("isSimilarCompanyName — сміття, яке дав би підрядок", () => {
  it("«Ропа» всередині «Агро Панцир» — не збіг", () => {
    expect(isSimilarCompanyName("Ропа", "Агро Панцир")).toBe(false);
  });

  it("«Ропа» всередині «Вітагро Партнер» — не збіг", () => {
    expect(isSimilarCompanyName("Ропа", "Вітагро Партнер")).toBe(false);
  });

  it("«EDS» всередині «masseeds» — не збіг", () => {
    expect(isSimilarCompanyName("EDS", "masseeds")).toBe(false);
  });
});

describe("isSimilarCompanyName — межі", () => {
  it("порожнє не збігається ні з чим", () => {
    expect(isSimilarCompanyName("", "KMZ")).toBe(false);
    expect(isSimilarCompanyName("KMZ", "")).toBe(false);
  });

  it("слова, коротші за три літери, не рахуються — інакше в підказці пів бази", () => {
    expect(isSimilarCompanyName("КМ", "KMZ Industries")).toBe(false);
  });

  it("зовсім різні назви мовчать", () => {
    expect(isSimilarCompanyName("Нібулон", "Медікс Опіка")).toBe(false);
  });
});

describe("pickCompanyHints", () => {
  const lead = (id: string, name: string, manager: string) => ({ id, name, manager });

  it("замовники йдуть поперед лідів — із ними вже працюють", () => {
    const hints = pickCompanyHints(
      "KMZ",
      [lead("l1", "KMZ Industries - КМЗ", "Дмитро М.")],
      [lead("c1", "KMZ Group", "Дар'я М.")]
    );
    expect(hints.map((hint) => hint.kind)).toEqual(["замовник", "лід"]);
  });

  it("менеджер їде разом із назвою — щоб було видно, з ким не дублюватись", () => {
    const hints = pickCompanyHints("KMZ", [lead("l1", "KMZ Industries - КМЗ", "Дмитро М.")], []);
    expect(hints[0]).toMatchObject({ name: "KMZ Industries - КМЗ", manager: "Дмитро М.", kind: "лід" });
  });

  it("юридична назва — теж привід для збігу", () => {
    const hints = pickCompanyHints("Землероб", [], [{ id: "c1", name: "ТОВ Аграрій", legalName: "ЗЕМЛЕРОБ КОМПАНІЯ" }]);
    expect(hints).toHaveLength(1);
  });

  it("більше трьох не показуємо — підказка не має відсувати форму", () => {
    const many = Array.from({ length: 6 }, (_, i) => lead(`l${i}`, `KMZ ${i}`, "Хтось"));
    expect(pickCompanyHints("KMZ", many, [])).toHaveLength(3);
  });

  it("немає збігів — порожньо, а не «нічого не знайдено»", () => {
    expect(pickCompanyHints("Нібулон", [lead("l1", "Медікс Опіка", "Хтось")], [])).toEqual([]);
  });
});

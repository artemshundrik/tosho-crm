import { describe, expect, it } from "vitest";

import { buildCatalogKinds, buildCatalogSuggestions, guessKindFromTitle, rankCatalogSuggestions } from "./catalogSuggestions";

/**
 * Підказки з каталогу (REQ-182#p14): модель знає свій вид і тип, пошук іде
 * і за назвою, і за видом, збіг у назві — вище.
 */

const source = {
  typeRows: [
    { id: "t-cloth", name: "Одяг", quote_type: "merch" },
    { id: "t-paper", name: "Папір", quote_type: "print" },
  ],
  kindRows: [
    { id: "k-hoodie", type_id: "t-cloth", name: "Худі" },
    { id: "k-cap", type_id: "t-cloth", name: "Кепка" },
    { id: "k-notebook", type_id: "t-paper", name: "Блокнот" },
    { id: "k-orphan", type_id: "t-missing", name: "Без типу" },
  ],
  modelRows: [
    { id: "m-lenny", kind_id: "k-hoodie", name: "Реглан LENNY", image_url: "https://cdn/lenny.jpg" },
    { id: "m-hoodie-classic", kind_id: "k-hoodie", name: "Худі Classic оверсайз", image_url: null },
    { id: "m-cap", kind_id: "k-cap", name: "Кепка six-panel", image_url: null },
    { id: "m-a5", kind_id: "k-notebook", name: "Блокнот А5", image_url: null },
    { id: "m-orphan", kind_id: "k-orphan", name: "Сирота", image_url: null },
    { id: "m-lost", kind_id: "k-nowhere", name: "Загублена", image_url: null },
  ],
};

describe("buildCatalogSuggestions", () => {
  it("кожна модель несе вид, тип і тип прорахунку; без виду або типу — випадає", () => {
    const suggestions = buildCatalogSuggestions(source);
    expect(suggestions.map((s) => s.modelId)).toEqual(["m-lenny", "m-hoodie-classic", "m-cap", "m-a5"]);
    expect(suggestions[0]).toMatchObject({
      name: "Реглан LENNY",
      kindId: "k-hoodie",
      kindName: "Худі",
      typeId: "t-cloth",
      typeName: "Одяг",
      imageUrl: "https://cdn/lenny.jpg",
      quoteType: "merch",
    });
  });
});

describe("rankCatalogSuggestions", () => {
  const suggestions = buildCatalogSuggestions(source);

  it("порожній запит — порожні підказки", () => {
    expect(rankCatalogSuggestions(suggestions, "  ")).toEqual([]);
  });

  it("шукає за видом: «худі» знаходить реглан, у назві якого слова «худі» немає", () => {
    const names = rankCatalogSuggestions(suggestions, "худі").map((s) => s.name);
    expect(names).toContain("Реглан LENNY");
    expect(names).toContain("Худі Classic оверсайз");
    // Збіг у назві моделі стоїть вище за збіг лише у виді.
    expect(names[0]).toBe("Худі Classic оверсайз");
    expect(names).not.toContain("Кепка six-panel");
  });

  it("латиниця знаходить кирилицю", () => {
    expect(rankCatalogSuggestions(suggestions, "kepka").map((s) => s.name)).toEqual(["Кепка six-panel"]);
  });

  it("один-два символи — лише збіги з початку, а не весь каталог", () => {
    const names = rankCatalogSuggestions(suggestions, "бл").map((s) => s.name);
    expect(names).toEqual(["Блокнот А5"]);
  });

  it("шукає за типом: «папір» дає блокнот", () => {
    expect(rankCatalogSuggestions(suggestions, "папір").map((s) => s.name)).toEqual(["Блокнот А5"]);
  });

  it("обмежує кількість", () => {
    expect(rankCatalogSuggestions(suggestions, "одяг", 2)).toHaveLength(2);
  });
});

describe("guessKindFromTitle", () => {
  const kinds = buildCatalogKinds({
    ...source,
    kindRows: [...source.kindRows, { id: "k-book", type_id: "t-paper", name: "Записна книжка" }, { id: "k-pocket", type_id: "t-cloth", name: "Кишеня" }],
  });

  it("вид — слово з назви сторінки, відмінок не заважає", () => {
    expect(guessKindFromTitle(kinds, "Кепки 5-панельні бавовняні, чорні")?.kindName).toBe("Кепка");
    expect(guessKindFromTitle(kinds, "Худі оверсайз Classic — купити")?.kindName).toBe("Худі");
  });

  it("багатослівний вид збігається цілком, а з двох кандидатів перемагає той, що стоїть раніше", () => {
    expect(guessKindFromTitle(kinds, "Записна книжка А5 у клітинку")?.kindName).toBe("Записна книжка");
    expect(guessKindFromTitle(kinds, "Худі з кишенею кенгуру")?.kindName).toBe("Худі");
  });

  it("не вгадує без збігу й на порожній назві", () => {
    expect(guessKindFromTitle(kinds, "Реглан LENNY")).toBeNull();
    expect(guessKindFromTitle(kinds, null)).toBeNull();
    expect(guessKindFromTitle(kinds, "Без типу річ")).toBeNull();
  });
});

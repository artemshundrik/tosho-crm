import { describe, expect, it } from "vitest";

import {
  bestMatchingSku,
  buildCatalogKinds,
  buildCatalogSuggestions,
  guessKindFromTitle,
  looksLikeSku,
  rankCatalogSuggestions,
} from "./catalogSuggestions";

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
    { id: "m-lenny", kind_id: "k-hoodie", name: "Реглан LENNY", image_url: "https://cdn/lenny.jpg", sku: "U0102-Black" },
    { id: "m-hoodie-classic", kind_id: "k-hoodie", name: "Худі Classic оверсайз", image_url: null, sku: "U0102-White" },
    { id: "m-cap", kind_id: "k-cap", name: "Кепка six-panel", image_url: null, sku: "107" },
    { id: "m-a5", kind_id: "k-notebook", name: "Блокнот А5", image_url: null, sku: "50040138-01" },
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

describe("пошук за артикулом (REQ-178#p7)", () => {
  const suggestions = buildCatalogSuggestions(source);

  it("вставлений артикул знаходить рівно свою модель", () => {
    expect(rankCatalogSuggestions(suggestions, "50040138-01").map((s) => s.name)).toEqual(["Блокнот А5"]);
  });

  it("регістр і пробіли по краях не заважають", () => {
    expect(rankCatalogSuggestions(suggestions, "  u0102-black ").map((s) => s.name)).toEqual(["Реглан LENNY"]);
  });

  it("точний артикул виграє в моделі, у якої той самий код стоїть у НАЗВІ", () => {
    // Живий випадок: bergamo дописує артикул у назву товару («… - 50040138-01»),
    // тож той самий код трапляється і назвою, і артикулом іншої моделі.
    const mixed = buildCatalogSuggestions({
      ...source,
      modelRows: [
        { id: "m-named", kind_id: "k-notebook", name: "Блокнот Berganote - 50040138-01", image_url: null },
        { id: "m-coded", kind_id: "k-notebook", name: "Блокнот А5", image_url: null, sku: "50040138-01" },
      ],
    });

    expect(rankCatalogSuggestions(mixed, "50040138-01").map((s) => s.name)).toEqual([
      "Блокнот А5",
      "Блокнот Berganote - 50040138-01",
    ]);
  });

  it("частина артикула шукається від трьох символів", () => {
    expect(rankCatalogSuggestions(suggestions, "0102").map((s) => s.name).sort()).toEqual([
      "Реглан LENNY",
      "Худі Classic оверсайз",
    ]);
  });

  it("короткий номер НЕ вивалює каталог частковими збігами", () => {
    // «10» входить і в «107», і в «50040138-01» — підказкою це не є.
    expect(rankCatalogSuggestions(suggestions, "10")).toEqual([]);
  });

  it("але повний короткий артикул знаходиться", () => {
    expect(rankCatalogSuggestions(suggestions, "107").map((s) => s.name)).toEqual(["Кепка six-panel"]);
  });

  it("модель без артикула пошуку кодом не заважає", () => {
    const withoutSku = buildCatalogSuggestions({
      ...source,
      modelRows: [{ id: "m-cap", kind_id: "k-cap", name: "Кепка six-panel", image_url: null }],
    });
    expect(withoutSku[0].sku).toBeNull();
    expect(rankCatalogSuggestions(withoutSku, "50040138-01")).toEqual([]);
  });
});

describe("пошук за артикулом ВАРІАНТА (REQ-248)", () => {
  const suggestions = buildCatalogSuggestions(source);

  it("модель знаходиться за кодом кольору, якого в її власному артикулі немає", () => {
    // Живий випадок: модель підписана артикулом першого кольору («U0102-Black»),
    // а постачальник дав код іншого — його знає лише база.
    const found = rankCatalogSuggestions(suggestions, "U0102-Green", undefined, new Map([["m-lenny", "U0102-Green"]]));
    expect(found.map((s) => s.name)).toEqual(["Реглан LENNY"]);
  });

  it("у підказці стоїть ТОЙ артикул, який шукали, а не артикул моделі", () => {
    const found = rankCatalogSuggestions(suggestions, "U0102-Green", undefined, new Map([["m-lenny", "U0102-Green"]]));
    expect(found[0].sku).toBe("U0102-Black");
    expect(found[0].matchedSku).toBe("U0102-Green");
  });

  it("моделі, яких база не назвала, лишаються без позначки збігу", () => {
    const found = rankCatalogSuggestions(suggestions, "худі", undefined, new Map([["m-lenny", "U0102-Green"]]));
    expect(found.find((s) => s.name === "Худі Classic оверсайз")?.matchedSku).toBeUndefined();
  });

  it("без відповіді бази все працює як раніше", () => {
    expect(rankCatalogSuggestions(suggestions, "50040138-01").map((s) => s.name)).toEqual(["Блокнот А5"]);
  });
});

describe("looksLikeSku", () => {
  it("живі коди з каталогу проходять", () => {
    for (const sku of ["TSRA170-BK", "70030505-44", "ka413-BL", "U0102-Black", "107", "eco-sumka/grey"]) {
      expect(looksLikeSku(sku), sku).toBe(true);
    }
  });

  it("пробіли по краях не заважають", () => {
    expect(looksLikeSku("  tsra170-bk  ")).toBe(true);
  });

  it("назви в базу не ходять", () => {
    // Кирилиця, латинська назва без цифри й роздільника, два слова, коротке —
    // усе це шукається в браузері й миттєво.
    for (const query of ["худі", "hudi", "Кепка six", "six panel", "10", "лен"]) {
      expect(looksLikeSku(query), query).toBe(false);
    }
  });

  it("у шаблон не проходить нічого схожого на підстановку", () => {
    // Ці символи PostgREST або LIKE прочитали б як шаблон чи як кінець
    // значення фільтра — тому вони й не «схожі на артикул».
    for (const query of ["u01%2", "u01_2", "u01*2", "u01,2", "u01(2)"]) {
      expect(looksLikeSku(query), query).toBe(false);
    }
  });
});

describe("bestMatchingSku", () => {
  const skus = ["TSRA170-AS", "TSRA170-BK", "TSRA170-WH"];

  it("показує ТОЙ артикул, який шукали, а не перший у моделі", () => {
    expect(bestMatchingSku(skus, "TSRA170-BK")).toBe("TSRA170-BK");
  });

  it("регістр і пробіли по краях не заважають", () => {
    expect(bestMatchingSku(skus, "  tsra170-wh ")).toBe("TSRA170-WH");
  });

  it("часткова частина коду дає перший збіг, а не порожнечу", () => {
    expect(bestMatchingSku(["70030505-02", "70030505-44"], "70030505")).toBe("70030505-02");
  });

  it("нічого не збіглося — нічого й не показуємо", () => {
    expect(bestMatchingSku(skus, "ka413-BL")).toBeNull();
    expect(bestMatchingSku([], "TSRA170-BK")).toBeNull();
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

  it("дефіс розділяє слова, а близькі за початком слова не зливаються", () => {
    // Живий прогін 04.09.2026: prom.ua віддав «Кепка-тракер мультикам», і
    // вид вийшов «Мультитул» — дефіс не розділяв, а основи різались до пʼяти.
    const withTool = buildCatalogKinds({
      ...source,
      kindRows: [...source.kindRows, { id: "k-tool", type_id: "t-cloth", name: "Мультитул" }],
      modelRows: source.modelRows,
    });
    expect(guessKindFromTitle(withTool, "Кепка-тракер мультикам")?.kindName).toBe("Кепка");
    expect(guessKindFromTitle(withTool, "Ліхтарик мультикам тактичний")).toBeNull();
  });

  it("не вгадує без збігу й на порожній назві", () => {
    expect(guessKindFromTitle(kinds, "Реглан LENNY")).toBeNull();
    expect(guessKindFromTitle(kinds, null)).toBeNull();
    expect(guessKindFromTitle(kinds, "Без типу річ")).toBeNull();
  });
});

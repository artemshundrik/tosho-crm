import { describe, expect, it } from "vitest";

import { filterQuoteParties, type SearchableParty } from "./quotePartiesFilter";

/**
 * Пошук замовника тепер фільтрує список У БРАУЗЕРІ (REQ-302), і це тест саме
 * на те, що втрачається при такому переїзді.
 *
 * НАВІЩО. На сервері стояли ДВА сита: спершу `ILIKE %варіант%`, і лише потім
 * оцінка збігу для порядку видачі. Перший захід переніс тільки друге — і
 * «FANTOM» одразу витяг «FAYNA TEAM»: однаковий кістяк приголосних коштує в
 * оцінці 110 балів. Помилку видно лише на живих даних, тож вона мусить
 * лишитись видимою тут.
 */

const party = (name: string, extra: Partial<SearchableParty> = {}): SearchableParty => ({
  name,
  legal_name: null,
  ...extra,
});

const ROWS = [
  party("FAYNA TEAM"),
  party("Фантом Груп"),
  party("Тепличка"),
  party("Ковальські", { legal_name: "ТОВ КОВАЛЬСЬКІ ТА СИНИ" }),
];

const names = (rows: SearchableParty[]) => rows.map((row) => row.name);

describe("пошук замовника у вікні прорахунку", () => {
  it("схожий кістяк приголосних — НЕ збіг", () => {
    expect(names(filterQuoteParties(ROWS, "FANTOM"))).not.toContain("FAYNA TEAM");
  });

  it("латиницею знаходить кирилицю", () => {
    expect(names(filterQuoteParties(ROWS, "fantom"))).toContain("Фантом Груп");
  });

  it("шукає і по юрособі, не лише по торговій назві", () => {
    expect(names(filterQuoteParties(ROWS, "сини"))).toContain("Ковальські");
  });

  it("одна-дві літери — це префікс торгової назви, а не будь-де в рядку", () => {
    const found = names(filterQuoteParties(ROWS, "те"));
    expect(found).toContain("Тепличка");
    // «Фантом Груп» містить «т», але не починається з «те».
    expect(found).not.toContain("Фантом Груп");
  });

  it("порожній запит віддає список як є", () => {
    expect(filterQuoteParties(ROWS, "  ")).toHaveLength(ROWS.length);
  });
});

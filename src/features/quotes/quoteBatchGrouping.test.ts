import { describe, expect, it } from "vitest";

import { describeQuoteBatchGroups, groupProductsForQuotes } from "./quoteBatchGrouping";

/**
 * Головна поломка REQ-34: позиції «Інше» не обʼєднувались навіть між собою,
 * бо список груп будувався через map по товарах. Кожен олівець ставав окремим
 * прорахунком, а за кількома прорахунками автоматично йшло КП.
 */
const product = (quoteType: string, name: string) => ({ quoteType, name });

describe("groupProductsForQuotes", () => {
  it("обʼєднує кілька позицій «Інше» в ОДИН прорахунок", () => {
    const groups = groupProductsForQuotes([
      product("other", "Олівець"),
      product("other", "Гумка"),
      product("other", "Лінійка"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].quoteType).toBe("other");
    expect(groups[0].products).toHaveLength(3);
  });

  it("розводить різні типи по своїх прорахунках і зберігає порядок", () => {
    const groups = groupProductsForQuotes([
      product("other", "Олівець"),
      product("merch", "Футболка"),
      product("print", "Візитка"),
      product("merch", "Кепка"),
    ]);

    expect(groups.map((group) => group.quoteType)).toEqual(["merch", "print", "other"]);
    expect(groups[0].products.map((item) => item.name)).toEqual(["Футболка", "Кепка"]);
    expect(groups[2].products).toHaveLength(1);
  });

  it("однорідний набір лишається одним прорахунком, скільки б не було товарів", () => {
    const groups = groupProductsForQuotes(
      Array.from({ length: 7 }, (_, index) => product("merch", `Товар ${index}`))
    );

    expect(groups).toHaveLength(1);
  });

  it("порожні групи не створюються", () => {
    expect(groupProductsForQuotes([])).toEqual([]);
    expect(groupProductsForQuotes([product("print", "Флаєр")])).toHaveLength(1);
  });

  it("невідомий тип не зникає, а падає в мерч — товар не можна мовчки загубити", () => {
    const groups = groupProductsForQuotes([product("", "Без типу"), product("дичина", "Дивний")]);

    expect(groups).toHaveLength(1);
    expect(groups[0].quoteType).toBe("merch");
    expect(groups[0].products).toHaveLength(2);
  });
});

describe("describeQuoteBatchGroups", () => {
  it("описує розклад людською мовою з правильним відмінюванням", () => {
    const groups = groupProductsForQuotes([
      product("merch", "Футболка"),
      product("merch", "Кепка"),
      product("merch", "Худі"),
      product("print", "Візитка"),
    ]);

    expect(describeQuoteBatchGroups(groups)).toEqual(["Мерч · 3 товари", "Поліграфія · 1 товар"]);
  });
});

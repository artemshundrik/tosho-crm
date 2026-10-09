import { describe, expect, it } from "vitest";

import { cscartListingExtras, feedParams, horoshopCategoryPaths, unesc } from "./feedXml.mjs";

/**
 * Пропозиція — скорочений справжній рядок фіду Тотобі (07.10.2026): термопляшка
 * з параметром «Об&#039;єм», на якому `unesc` спотикається.
 */
const OFFER = `
  <is_new>Y</is_new>
  <textile>N</textile>
  <price_type>Базова ціна</price_type>
  <price>336.40</price>
  <name>Термопляшка Guard, ТМ Discover</name>
  <vendorCode>2635-04</vendorCode>
  <description>Термопляшка з подвійною стінкою &amp; софт-тач покриттям.</description>
  <param name="Колір">червоний</param>
  <param name="Матеріал">Нержавіюча сталь </param>
  <param name="Об&#039;єм">480 мл</param>
  <param name="Порожній"></param>
  <param name="ТМ">Discover</param>`;

describe("розбір фіду: спільні помічники", () => {
  it("unesc поводиться як і до переїзду в модуль", () => {
    expect(unesc("<![CDATA[Ручка «LEON»]]>")).toBe("Ручка «LEON»");
    expect(unesc("A &amp; B &#39;x&#39;")).toBe("A & B 'x'");
  });
});

describe("Тотобі: те, що потрібно чернетці картки сайту", () => {
  it("новинка, опис і всі параметри; числові сутності розібрано", () => {
    expect(cscartListingExtras(OFFER)).toEqual({
      isNew: true,
      description: "Термопляшка з подвійною стінкою & софт-тач покриттям.",
      params: { Колір: "червоний", Матеріал: "Нержавіюча сталь", "Об'єм": "480 мл", ТМ: "Discover" },
    });
  });

  it("«N» не пишемо зовсім: відсутній прапорець читається як «ні»", () => {
    const extras = cscartListingExtras("<is_new>N</is_new><textile>Y</textile><name>x</name>");
    expect(extras).toEqual({ textile: true });
  });

  it("очікуване надходження: кількість і київська дата (рядок «Повербанк Plato» 09.10.2026)", () => {
    expect(cscartListingExtras("<wait>2000</wait><date_delivery>1794693600</date_delivery><price>0.00</price>")).toEqual({
      awaited: 2000,
      awaitedAt: "2026-11-15",
    });
  });

  it("без кількості дату не пишемо, без дати — лише кількість", () => {
    expect(cscartListingExtras("<wait>0</wait><date_delivery>1794693600</date_delivery>")).toEqual({});
    expect(cscartListingExtras("<wait>3000</wait><date_delivery>0</date_delivery>")).toEqual({ awaited: 3000 });
  });

  it("параметри без значення відкидаються", () => {
    expect(feedParams('<param name="A"> </param><param name="B">1</param>')).toEqual({ B: "1" });
  });
});

describe("Хорошоп: повні шляхи розділів", () => {
  const XML = `
    <categories>
      <category id="1111">Поліграфічна продукція</category>
      <category id="1121" parentId="1111">Пакети</category>
      <category id="1191" parentId="1121">Паперові пакети</category>
      <category id="7" parentId="404">Сирота</category>
      <category id="8" parentId="9">Петля А</category>
      <category id="9" parentId="8">Петля Б</category>
    </categories>`;

  it("шлях від кореня через «/»", () => {
    const paths = horoshopCategoryPaths(XML);
    expect(paths.get("1191")).toBe("Поліграфічна продукція/Пакети/Паперові пакети");
    expect(paths.get("1111")).toBe("Поліграфічна продукція");
  });

  it("батька немає — лишається листок; петля не вішає розбір", () => {
    const paths = horoshopCategoryPaths(XML);
    expect(paths.get("7")).toBe("Сирота");
    expect(paths.get("8")).toMatch(/Петля/);
  });
});

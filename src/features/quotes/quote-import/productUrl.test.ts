import { describe, expect, it } from "vitest";

import { normalizeProductUrl } from "./productUrl";

describe("посилання на товар без рекламного хвоста", () => {
  it("зрізає хвіст Google Ads, лишаючи саму сторінку", () => {
    // Справжнє посилання з файлу KMZ — 260 символів, з яких товар описують 46.
    expect(
      normalizeProductUrl(
        "https://dok.ua/art-multimetr-yato-3772692265-60441724?utm_source=google&utm_medium=cpc" +
          "&utm_campaign=17754460071&utm_content=&utm_term=&utm_id=&gad_source=1" +
          "&gad_campaignid=17754467718&gbraid=0AAAAAC8xs&gclid=CjwKCAjwy5rUBhB5"
      )
    ).toBe("https://dok.ua/art-multimetr-yato-3772692265-60441724");
  });

  it("зрізає хвіст і в посиланні Розетки", () => {
    expect(
      normalizeProductUrl(
        "https://auto.rozetka.com.ua/ua/363562038/p363562038/?gad_source=1&gclid=CjwKCAjwy5rUBhB5"
      )
    ).toBe("https://auto.rozetka.com.ua/ua/363562038/p363562038/");
  });

  it("бере всю сімʼю utm_, а не перелічені поіменно", () => {
    expect(normalizeProductUrl("https://shop.ua/p?utm_totally_new=1&utm_source=x")).toBe(
      "https://shop.ua/p"
    );
  });

  it("НЕ чіпає параметр, у якому живе сам товар", () => {
    // Головний ризик жадібного різання: у старих магазинів це адреса сторінки,
    // а не облік реклами.
    expect(normalizeProductUrl("https://shop.ua/catalog?id=1234&gclid=abc")).toBe(
      "https://shop.ua/catalog?id=1234"
    );
  });

  it("лишає якір: за решіткою буває маршрут товару", () => {
    expect(normalizeProductUrl("https://dnipro-m.ua/ru/tovar/otvertka/#characteristics")).toBe(
      "https://dnipro-m.ua/ru/tovar/otvertka/#characteristics"
    );
  });

  it("повертає чисте посилання байт у байт, нічого не нормалізуючи", () => {
    // Різати не було чого — значить, і переписувати нема чого: `URL.toString()`
    // додав би скісну й перекодував кирилицю на рівному місці.
    const clean = "https://totobi.com.ua/parasol/parasolya-skladna-lido-tm-discover/";
    expect(normalizeProductUrl(clean)).toBe(clean);
    expect(normalizeProductUrl("https://shop.ua/каталог/кухоль")).toBe("https://shop.ua/каталог/кухоль");
  });

  it("не падає на тому, що взагалі не посилання", () => {
    expect(normalizeProductUrl("  не посилання  ")).toBe("не посилання");
    expect(normalizeProductUrl("")).toBe("");
  });
});

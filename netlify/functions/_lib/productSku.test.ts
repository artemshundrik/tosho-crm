import { describe, expect, it } from "vitest";

import { extractProductSku } from "./productSku";

const jsonLd = (payload: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;

describe("артикул із розмітки товару", () => {
  it("бере sku з JSON-LD (bergamo.ua)", () => {
    const html = jsonLd({ "@type": "Product", name: "Блокнот", sku: "50040138-01", mpn: "0" });

    expect(extractProductSku(html)).toEqual({ value: "50040138-01", source: "json-ld" });
  });

  it("бере sku з itemprop, коли JSON-LD немає (totobi.com.ua)", () => {
    const html = '<meta itemprop="sku" content="5003-03" />';

    expect(extractProductSku(html)).toEqual({ value: "5003-03", source: "itemprop" });
  });

  it("читає артикул із тексту елемента з itemprop", () => {
    const html = '<span itemprop="sku">U0102-Black</span>';

    expect(extractProductSku(html)).toEqual({ value: "U0102-Black", source: "itemprop" });
  });

  it("падає на товарні meta-теги", () => {
    const html = '<meta property="product:retailer_item_id" content="MO9962-22">';

    expect(extractProductSku(html)).toEqual({ value: "MO9962-22", source: "meta" });
  });

  it("знаходить артикул у графі JSON-LD, де Product лежить усередині", () => {
    const html = jsonLd({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "BreadcrumbList" }, { "@type": "Product", sku: "S0801-6" }],
    });

    expect(extractProductSku(html)).toEqual({ value: "S0801-6", source: "json-ld" });
  });

  it("бере mpn, коли sku в розмітці немає", () => {
    const html = jsonLd({ "@type": "Product", mpn: "U0102-Black" });

    expect(extractProductSku(html)).toEqual({ value: "U0102-Black", source: "json-ld" });
  });

  it("JSON-LD виграє в підпису у видимому тексті", () => {
    const html = `${jsonLd({ "@type": "Product", sku: "5003-03" })}<div>Артикул: 999</div>`;

    expect(extractProductSku(html)).toEqual({ value: "5003-03", source: "json-ld" });
  });
});

describe("артикул словами у видимому тексті", () => {
  it("читає «Артикул: X»", () => {
    expect(extractProductSku("<div>Артикул: U0102-Black</div>")).toEqual({
      value: "U0102-Black",
      source: "label",
    });
  });

  it("читає «Код товару» з розміткою між підписом і значенням", () => {
    const html = '<div><span class="label">Код товару:</span> <b>50040138-01</b></div>';

    expect(extractProductSku(html)).toEqual({ value: "50040138-01", source: "label" });
  });
});

describe("чого артикулом вважати НЕ можна", () => {
  it("не бере «sku» зі словника перекладів у скрипті (dnipro-m.ua)", () => {
    // Живий випадок: у JS-блобі сайту лежить `"sku":"Код товару:"` — підпис
    // інтерфейсу, а не артикул. Це не JSON-LD і не Product, тож повз.
    const html = '<script>window.i18n={"show.all.button":"Подивитись всі","sku":"Код товару:"}</script>';

    expect(extractProductSku(html)).toBeNull();
  });

  it("не бере значення з JSON-LD, який не про товар", () => {
    const html = jsonLd({ "@type": "WebPage", sku: "12345" });

    expect(extractProductSku(html)).toBeNull();
  });

  it("не бере заглушку замість артикула", () => {
    for (const placeholder of ["0", "-", "n/a", "немає", "null"]) {
      expect(extractProductSku(jsonLd({ "@type": "Product", sku: placeholder }))).toBeNull();
    }
  });

  it("не бере назву товару, яка потрапила в поле артикула", () => {
    const html = jsonLd({ "@type": "Product", sku: "Парасоля тростина Odessa TM Totobi" });

    expect(extractProductSku(html)).toBeNull();
  });

  it("не бере значення без жодної цифри", () => {
    expect(extractProductSku(jsonLd({ "@type": "Product", sku: "Black" }))).toBeNull();
  });

  it("не ловить «sku» всередині чужого слова", () => {
    // Перша проба саме на цьому й обпеклась: без меж слова підпис знаходився
    // посеред тексту й давав уламки на кшталт «vachi».
    expect(extractProductSku("<div>Baskunits 12345 у наявності</div>")).toBeNull();
  });

  it("порожня сторінка дає null, а не падіння", () => {
    expect(extractProductSku("")).toBeNull();
    expect(extractProductSku("<html><body>Сторінки вже немає</body></html>")).toBeNull();
  });

  it("не пускає в артикул лапки й кутові дужки", () => {
    expect(extractProductSku(jsonLd({ "@type": "Product", sku: '12<img src=x>' }))).toBeNull();
  });
});

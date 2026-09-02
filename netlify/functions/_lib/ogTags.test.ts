import { describe, expect, it } from "vitest";

import { extractOgTags } from "./ogTags";

const page = (head: string) => `<!doctype html><html><head>${head}</head><body>…</body></html>`;

describe("витяг og-тегів зі сторінки постачальника", () => {
  it("бере og:title та og:image", () => {
    const tags = extractOgTags(
      page(
        '<meta property="og:title" content="Кухоль керамічний 330 мл"><meta property="og:image" content="https://kmz.ua/img/mug.jpg">'
      ),
      "https://kmz.ua/product/mug"
    );

    expect(tags).toEqual({
      title: "Кухоль керамічний 330 мл",
      imageUrl: "https://kmz.ua/img/mug.jpg",
      imageSource: "og",
    });
  });

  it("добудовує відносний шлях картинки до адреси сторінки", () => {
    const tags = extractOgTags(page('<meta property="og:image" content="/img/mug.jpg">'), "https://kmz.ua/product/mug");

    expect(tags.imageUrl).toBe("https://kmz.ua/img/mug.jpg");
  });

  it("падає на twitter:image і <title>, коли og-тегів немає", () => {
    const tags = extractOgTags(
      page('<title>  Ручка  металева </title><meta name="twitter:image" content="https://kmz.ua/pen.png">'),
      "https://kmz.ua/pen"
    );

    expect(tags).toEqual({ title: "Ручка металева", imageUrl: "https://kmz.ua/pen.png", imageSource: "og" });
  });

  it("розкодовує сутності в назві", () => {
    const tags = extractOgTags(
      page('<meta property="og:title" content="Кухоль &quot;Ранок&quot; &amp; блюдце">'),
      "https://kmz.ua/x"
    );

    expect(tags.title).toBe('Кухоль "Ранок" & блюдце');
  });

  it("не пропускає картинку з непідтриманим протоколом", () => {
    const tags = extractOgTags(page('<meta property="og:image" content="javascript:alert(1)">'), "https://kmz.ua/x");

    expect(tags.imageUrl).toBeNull();
  });

  it("порожня сторінка дає порожні поля, а не падіння", () => {
    expect(extractOgTags("", "https://kmz.ua/x")).toEqual({ title: null, imageUrl: null, imageSource: null });
  });

  it("зрізає пошуковий хвіст магазину з назви (REQ-237#p11)", () => {
    const tags = extractOgTags(
      page('<meta property="og:title" content="USB-хаб 5 в1 Gear, ТМ TEG — купити в TOTOBI">'),
      "https://totobi.com.ua/p"
    );

    expect(tags.title).toBe("USB-хаб 5 в1 Gear, ТМ TEG");
  });

  it("назву з розмітки товару бере перед og:title", () => {
    const html = `<!doctype html><html><head><meta property="og:title" content="Кухоль — купити оптом"></head><body><script type="application/ld+json">{"@type":"Product","name":"Кухоль керамічний Bari 330 мл"}</script></body></html>`;
    expect(extractOgTags(html, "https://kmz.ua/x").title).toBe("Кухоль керамічний Bari 330 мл");
  });

  it("падає на <h1>, коли розмітки товару немає", () => {
    const html = `<!doctype html><html><head><meta property="og:title" content="Шопер | Інтернет-магазин"></head><body><h1>Шопер бавовна 38×42</h1></body></html>`;
    expect(extractOgTags(html, "https://kmz.ua/x").title).toBe("Шопер бавовна 38×42");
  });

  it("тире всередині назви не ріже", () => {
    const tags = extractOgTags(page('<meta property="og:title" content="Кухоль — 330 мл">'), "https://kmz.ua/x");
    expect(tags.title).toBe("Кухоль — 330 мл");
  });

  it("перший og:image виграє в дубля під інший розмір", () => {
    const tags = extractOgTags(
      page(
        '<meta property="og:image" content="https://kmz.ua/big.jpg"><meta property="og:image" content="https://kmz.ua/small.jpg">'
      ),
      "https://kmz.ua/x"
    );

    expect(tags.imageUrl).toBe("https://kmz.ua/big.jpg");
  });
});

/**
 * Запасні джерела картинки (REQ-236).
 *
 * ЗВІДКИ ЦІ ВИПАДКИ. Не вигадані: усі три взяті з файлу KMZ, на якому з двадцяти
 * семи позицій сім лишились без фото. Розмітка скорочена, але структура —
 * справжня, зі справжніх сторінок 01.09.2026.
 */

describe("картинка товару поза og-тегами", () => {
  it("бере фото зі звичайного <img>, коли og на сайті немає взагалі", () => {
    // flash-market.com.ua: сайт без Open Graph, фото товару підписане id.
    const html = `
      <html><head><title>USB флешка Твистер</title></head><body>
        <img src="/static/header-2.gif" />
        <img id="BigImage" src="/media/watermarked/abc/S0801-6_3.jpg" alt="USB флешка Твистер" />
      </body></html>`;

    const tags = extractOgTags(html, "https://www.flash-market.com.ua/flash/S0801-6");
    expect(tags.imageSource).toBe("img");
    expect(tags.imageUrl).toBe("https://www.flash-market.com.ua/media/watermarked/abc/S0801-6_3.jpg");
    expect(tags.title).toBe("USB флешка Твистер");
  });

  it("не бере заглушку «JavaScript is disabled» за фото товару", () => {
    // e-suvenir.com.ua без JS віддає рівно одну картинку — свою заглушку.
    const html = `
      <html><head><title>Ручка</title></head><body>
        <img class="fallback-closed" alt="JavaScript is disabled" src="/static/e-suvenirClosed.png">
      </body></html>`;

    const tags = extractOgTags(html, "https://e-suvenir.com.ua/ua/ruchka-metallicheskaja-11218");
    expect(tags.imageUrl).toBeNull();
    expect(tags.imageSource).toBeNull();
  });

  it("читає картинку з JSON-LD, коли решти розмітки немає", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {"@type":"Product","name":"Термокружка","image":["https://shop.ua/img/mug.jpg"]}
        </script>
      </head><body></body></html>`;

    const tags = extractOgTags(html, "https://shop.ua/mug");
    expect(tags.imageSource).toBe("json-ld");
    expect(tags.imageUrl).toBe("https://shop.ua/img/mug.jpg");
  });

  it("og лишається першим джерелом, коли він є", () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://shop.ua/og.jpg">
        <meta property="og:title" content="Плед">
      </head><body><img id="BigImage" src="/img/other.jpg"></body></html>`;

    const tags = extractOgTags(html, "https://shop.ua/pled");
    expect(tags.imageSource).toBe("og");
    expect(tags.imageUrl).toBe("https://shop.ua/og.jpg");
  });

  it("службову графіку за фото товару не бере", () => {
    const html = `<html><body><img src="/img/logo.png"><img src="/img/banner-top.jpg"></body></html>`;

    expect(extractOgTags(html, "https://shop.ua/x").imageUrl).toBeNull();
  });
});

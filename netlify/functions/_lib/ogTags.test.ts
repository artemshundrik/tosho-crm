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

    expect(tags).toEqual({ title: "Ручка металева", imageUrl: "https://kmz.ua/pen.png" });
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
    expect(extractOgTags("", "https://kmz.ua/x")).toEqual({ title: null, imageUrl: null });
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

import { describe, expect, it } from "vitest";

import { detectCommandFieldMode, parseCommandFieldLinks } from "./QuoteItemCommandField";

/** Поле позиції (REQ-182#p14): що воно вважає посиланням, а що — назвою. */

describe("detectCommandFieldMode", () => {
  it("адреса зі схемою, з www і домен зі шляхом — посилання", () => {
    expect(detectCommandFieldMode("https://prom.ua/p123")).toBe("link");
    expect(detectCommandFieldMode("www.rozetka.com.ua/x/p1")).toBe("link");
    expect(detectCommandFieldMode("totobi.com.ua/hoodie-lenny")).toBe("link");
  });

  it("назва, порожнє поле і голий домен без шляху — пошук у базі", () => {
    expect(detectCommandFieldMode("Худі оверсайз")).toBe("search");
    expect(detectCommandFieldMode("   ")).toBe("search");
    expect(detectCommandFieldMode("prom.ua")).toBe("search");
  });

  it("список, у якому є хоч одна адреса, — посилання: решту назве помилка", () => {
    expect(detectCommandFieldMode("https://a.example/1 щось")).toBe("link");
  });
});

describe("parseCommandFieldLinks", () => {
  it("розділяє пробілом, переносом і комою, дописує схему й зрізає рекламу", () => {
    const { urls, bad } = parseCommandFieldLinks(
      "https://a.example/1?utm_source=x\nwww.b.example/2, c.example/3/"
    );
    expect(bad).toBeNull();
    expect(urls).toEqual(["https://a.example/1", "https://www.b.example/2", "https://c.example/3/"]);
  });

  it("називає перший рядок, що не є адресою", () => {
    expect(parseCommandFieldLinks("https://a.example/1 кепка")).toEqual({
      urls: ["https://a.example/1"],
      bad: "кепка",
    });
  });
});

import { describe, expect, it } from "vitest";

import { colorsSentence, locativeNumeral } from "./colorsSentence";
import { siteListingPrice } from "./price";

describe("ціна на сайті = роздріб × 0,99 вниз до гривні", () => {
  it("рахує в цілих копійках: межа гривні не з'їдається двійковим дробом", () => {
    expect(1.15 * 100).not.toBe(115); // ціна з фіду — двійковий дріб
    expect(siteListingPrice(100)).toBe(99);
    expect(siteListingPrice(1.15)).toBe(1);
    expect(siteListingPrice(101.02)).toBe(100);
  });

  it("округлює вниз до цілої гривні", () => {
    expect(siteListingPrice(846.4)).toBe(837);
    expect(siteListingPrice(837.93)).toBe(829);
    expect(siteListingPrice(357.59)).toBe(354);
  });

  it("немає ціни — немає й нашої", () => {
    expect(siteListingPrice(null)).toBeNull();
    expect(siteListingPrice(undefined)).toBeNull();
    expect(siteListingPrice(0)).toBeNull();
    expect(siteListingPrice(Number.NaN)).toBeNull();
    expect(siteListingPrice(0.5)).toBeNull();
  });
});

describe("речення про кількість кольорів", () => {
  it("числівник у місцевому відмінку", () => {
    expect(locativeNumeral(2)).toBe("двох");
    expect(locativeNumeral(7)).toBe("семи");
    expect(locativeNumeral(14)).toBe("чотирнадцяти");
    expect(locativeNumeral(21)).toBe("двадцяти одному");
    expect(locativeNumeral(34)).toBe("тридцяти чотирьох");
    expect(locativeNumeral(100)).toBeNull();
  });

  it("числом словом, як затвердив власник", () => {
    expect(colorsSentence(7)).toBe("Поставляється в семи різних кольорах.");
    expect(colorsSentence(6)).toBe("Поставляється в шести різних кольорах.");
  });

  it("«у» перед «в»: у восьми, у вісімнадцяти", () => {
    expect(colorsSentence(8)).toBe("Поставляється у восьми різних кольорах.");
    expect(colorsSentence(18)).toBe("Поставляється у вісімнадцяти різних кольорах.");
  });

  it("після «одному» — однина", () => {
    expect(colorsSentence(21)).toBe("Поставляється в двадцяти одному різному кольорі.");
    expect(colorsSentence(11)).toBe("Поставляється в одинадцяти різних кольорах.");
  });

  it("один колір — речення немає; понад 99 — цифрами", () => {
    expect(colorsSentence(1)).toBeNull();
    expect(colorsSentence(0)).toBeNull();
    expect(colorsSentence(120)).toBe("Поставляється в 120 різних кольорах.");
  });
});

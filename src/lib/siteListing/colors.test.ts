import { describe, expect, it } from "vitest";

import { voteCategory } from "./category";
import { assignSiteColors, type BrandColorPair, type ColorVariantInput } from "./colors";

const variant = (article: string, color: string, extra: Partial<ColorVariantInput> = {}): ColorVariantInput => ({
  article,
  color,
  exactColor: color,
  group: null,
  ...extra,
});

describe("назви кольорів — із сусідньої моделі тієї ж марки", () => {
  // Справжні пари Roly з пулу (07.10.2026): той самий «royal blue» в одній
  // моделі став «Королівським синім», а в іншій — просто «Синім».
  const roly: BrandColorPair[] = [
    { model: "Футболка Stafford", color: "royal blue", siteColor: "Королівський синій" },
    { model: "Футболка Stafford", color: "navy blue", siteColor: "Темно-синій" },
    { model: "Футболка Stafford", color: "garnet", siteColor: "Гранат" },
    { model: "Вітровка Escocia 70", color: "royal blue", siteColor: "Синій" },
    { model: "Вітровка Escocia 70", color: "red", siteColor: "Червоний" },
  ];

  it("бере назви моделі з найбільшим перетином, решту — з наступної", () => {
    // Stafford перетинається трьома кольорами, Escocia — двома: «royal blue»
    // бере назву Stafford, а «red», якого в Stafford немає, — Escocia.
    const { colors, warnings } = assignSiteColors(
      [variant("1-05", "royal blue"), variant("1-55", "navy blue"), variant("1-57", "garnet"), variant("1-60", "red")],
      roly
    );
    expect(colors.map((c) => [c.color, c.source])).toEqual([
      ["Королівський синій", "neighbor"],
      ["Темно-синій", "neighbor"],
      ["Гранат", "neighbor"],
      ["Червоний", "neighbor"],
    ]);
    expect(warnings).toEqual([]);
  });

  it("дві модифікації не отримують однакову назву", () => {
    const pairs: BrandColorPair[] = [
      { model: "A", color: "royal blue", siteColor: "Синій" },
      { model: "A", color: "electric blue", siteColor: "Синій" },
    ];
    const { colors } = assignSiteColors(
      [
        variant("2-01", "royal blue"),
        variant("2-02", "electric blue", { group: "Синій" }),
      ],
      pairs
    );
    const names = colors.map((c) => c.color.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(colors[0].color).toBe("Синій");
  });

  it("без сусіда — точний колір кирилицею з великої, далі група", () => {
    const { colors } = assignSiteColors(
      [variant("3-01", "чорний"), variant("3-02", "heather grey", { group: "Сірий" })],
      []
    );
    expect(colors.map((c) => [c.color, c.source])).toEqual([
      ["Чорний", "exact"],
      ["Сірий", "group"],
    ]);
  });

  it("драбина скінчилась — унікальна назва з уточненням і попередження", () => {
    const { colors, warnings } = assignSiteColors(
      [
        variant("4-01", "light grey", { group: "Сірий" }),
        variant("4-02", "dark grey", { group: "Сірий" }),
      ],
      []
    );
    expect(colors[0].color).toBe("Сірий");
    expect(colors[1]).toEqual({ article: "4-02", color: "Сірий (dark grey)", source: "fallback" });
    expect(warnings).toHaveLength(1);
  });
});

describe("розділ сайту голосуванням пар", () => {
  it("одноосібний переможець — розділ визначено", () => {
    expect(voteCategory([{ path: "Одяг/Жилети", votes: 11 }])).toEqual({ category: "Одяг/Жилети", tied: [] });
  });

  it("нічия — код не вгадує, а дає рівних на вибір", () => {
    expect(
      voteCategory([
        { path: "Зарядні пристрої", votes: 3 },
        { path: "Аксесуари", votes: 3 },
        { path: "Електроніка", votes: 2 },
      ])
    ).toEqual({ category: null, tied: ["Аксесуари", "Зарядні пристрої"] });
  });

  it("голосів немає", () => {
    expect(voteCategory([])).toEqual({ category: null, tied: [] });
  });
});

import { describe, expect, it } from "vitest";

import {
  RAYMARKET_ARTICLES,
  RAYMARKET_PRICES,
  raymarketArticle,
  raymarketColorWord,
  raymarketPrice,
} from "./raymarketPrices.mjs";

/**
 * Усі `sku` тут — СПРАВЖНІ рядки зі сторінок ray-market.com.ua (обхід
 * 16.09.2026, 581 жива сторінка), а ціни — з двох PDF «ВЕЛИКИЙ ОПТ». Тобто тест
 * закріплює стик двох джерел: артикул, який пише сайт, і число, яке прислав
 * постачальник.
 */
describe("артикул Raymarket із sku сторінки", () => {
  it("Stedman: артикул і код кольору через риску", () => {
    expect(raymarketArticle("ST2000-WHI")).toEqual({ article: "ST2000", color: "WHI" });
    expect(raymarketArticle("ST2000-RGY")).toEqual({ article: "ST2000", color: "RGY" });
    expect(raymarketArticle("ST9060-BOD")).toEqual({ article: "ST9060", color: "BOD" });
  });

  it("RAY: літера статі в хвості артикула відкидається, колір записаний словом", () => {
    expect(raymarketArticle("U0401M-Black")).toEqual({ article: "U0401", color: "Black" });
    expect(raymarketArticle("U0401W-Dark Grey")).toEqual({ article: "U0401", color: "Dark Grey" });
    expect(raymarketArticle("U0102-White")).toEqual({ article: "U0102", color: "White" });
  });

  it("«L» у U0405L — частина артикула, а не стать", () => {
    expect(raymarketArticle("U0405L-Black")).toEqual({ article: "U0405L", color: "Black" });
  });

  /**
   * ГОЛОВНА ПАСТКА ЦЬОГО ДЖЕРЕЛА. `U0102P` — це модні кольори тієї самої
   * футболки, але ВЛАСНИЙ артикул, і в прайсі його немає. Розбір «починається з
   * U0102» дав би їм ціну базової моделі, і помітити це було б нічим: назва
   * схожа, фото на місці, число виглядає здоровим.
   */
  it("U0102P і U0104P не зводяться до U0102 та U0104", () => {
    expect(raymarketArticle("U0102P  Malyna")?.article).toBe("U0102P");
    expect(raymarketArticle("U0104P Biryuza")?.article).toBe("U0104P");
    expect(raymarketPrice("U0102P  Malyna")).toBeNull();
    expect(raymarketPrice("U0104P Biryuza")).toBeNull();
  });

  it("у полі sku буває не артикул — тоді ні артикула, ні ціни", () => {
    // Так підписані 37 товарів «під замовлення» (плюс один обірваний).
    expect(raymarketArticle("Під замовлення")).toBeNull();
    expect(raymarketArticle("Під замовленн")).toBeNull();
    expect(raymarketArticle("106-Sky Blue")).toBeNull();
    expect(raymarketArticle("")).toBeNull();
    expect(raymarketArticle(null)).toBeNull();
    expect(raymarketPrice("Під замовлення")).toBeNull();
  });
});

describe("ціна Raymarket за прайсом", () => {
  it("Stedman: білий дешевший за колір", () => {
    expect(raymarketPrice("ST2000-WHI")).toMatchObject({ kind: "white", price: 139.5, band: "XS-2XL" });
    expect(raymarketPrice("ST2000-RGY")).toMatchObject({ kind: "color", price: 168 });
    expect(raymarketPrice("ST2200-WHI")?.price).toBe(117);
    expect(raymarketPrice("ST2200-SPK")?.price).toBe(138);
  });

  it("моделі RAY: одна ціна на всі кольори", () => {
    expect(raymarketPrice("U0401M-Black")).toMatchObject({ kind: "any", price: 657 });
    expect(raymarketPrice("U0401W-Cream")?.price).toBe(657);
    expect(raymarketPrice("U0102-White")).toMatchObject({ kind: "any", price: 261 });
    expect(raymarketPrice("U0102-Black")?.price).toBe(261);
  });

  it("велика розмірна сітка дорожча, і драбина їде разом із ціною", () => {
    expect(raymarketPrice("U0401M-Black")?.bands).toEqual([
      { size: "XS-2XL", price: 657 },
      { size: "3XL-5XL", price: 819 },
    ]);
    // У пул іде саме базовий діапазон, а не найдорожчий і не середній.
    expect(raymarketPrice("U0409M-Dark Grey")?.price).toBe(984);
    expect(raymarketPrice("U0409M-Dark Grey")?.bands.at(-1)).toEqual({ size: "3XL", price: 1230 });
  });

  it("артикула, якого немає в прайсі, не вигадуємо", () => {
    // Stedman-моделі, які Raymarket возить, але в наших двох PDF їх немає.
    expect(raymarketPrice("ST2300-BLO")).toBeNull();
    expect(raymarketPrice("ST8000-GYH")).toBeNull();
    expect(raymarketPrice("U0105-Black")).toBeNull();
  });

  it("назва моделі без кольору — щоб кольори збиралися в одну картку", () => {
    // Усі кольори однієї моделі мусять дати ОДНАКОВУ назву: саме за нею
    // `groupSupplierPoolRows` збирає картку.
    expect(raymarketPrice("ST2000-WHI")?.name).toBe("Футболка чоловіча STEDMAN CLASSIC-T");
    expect(raymarketPrice("ST2000-RGY")?.name).toBe("Футболка чоловіча STEDMAN CLASSIC-T");
    expect(raymarketPrice("U0401M-Black")?.name).toBe(raymarketPrice("U0401W-Cream")?.name);
    // І в назві не має бути кольору жодною формою — інакше згортання розсиплеться.
    for (const row of RAYMARKET_PRICES) {
      expect(row.name, `${row.article}: у назві колір`).not.toMatch(
        /біл|чорн|сір|син|червон|зелен|жовт|рожев|бежев|коричнев/i
      );
    }
    // Бренд латиницею: у прайсі й на сайті в «STEDMАN» кирилична «А».
    for (const row of RAYMARKET_PRICES) {
      expect(row.name, `${row.article}: кирилична А в бренді`).not.toMatch(/STEDM[\u0410]N/);
    }
  });

  it("таблиця покриває 25 артикулів двох прайсів і не має дублів", () => {
    expect(RAYMARKET_ARTICLES).toHaveLength(25);
    const keys = RAYMARKET_PRICES.map((r) => `${r.article}:${r.kind}`);
    expect(new Set(keys).size).toBe(keys.length);
    // `any` і `white`/`color` — взаємовиключні: інакше один із них мовчки
    // перекрив би інший у `raymarketPrice`.
    for (const article of RAYMARKET_ARTICLES) {
      const kinds = RAYMARKET_PRICES.filter((r) => r.article === article).map((r) => r.kind);
      expect(kinds.includes("any") ? kinds.length : kinds.sort()).toEqual(
        kinds.includes("any") ? 1 : ["color", "white"]
      );
    }
    // Кожен рядок має хоч один діапазон, і базовий — найдешевший.
    for (const row of RAYMARKET_PRICES) {
      expect(row.bands.length).toBeGreaterThan(0);
      const prices = row.bands.map(([, p]) => p);
      expect(prices[0]).toBe(Math.min(...prices));
    }
  });
});

/**
 * Назви сторінок тут — справжні, з обходу 16.09.2026. Колір у них стоїть
 * УСЕРЕДИНІ назви й будь-якої форми, тож ловиться різницею з назвою моделі, а
 * не переліком відтінків.
 */
describe("колір словом із назви сторінки", () => {
  const model = "Футболка чоловіча STEDMAN CLASSIC-T";

  it("бере саме зайве слово, хай там яка його форма", () => {
    // Увага: у «STEDMАN» зі сторінки кирилична «А» — слово все одно має зійтись.
    expect(raymarketColorWord("Футболка чоловіча темно-сіра STEDMАN CLASSIC-T", model)).toBe("темно-сіра");
    expect(raymarketColorWord("Футболка чоловіча біла STEDMАN CLASSIC-T", model)).toBe("біла");
    expect(raymarketColorWord("Футболка чоловіча світлий сірий меланж STEDMАN CLASSIC-T", model)).toBe(
      "світлий сірий меланж"
    );
  });

  it("стать у колір не потрапляє, хоч у назві моделі її немає", () => {
    const hoodie = "Худі утеплене RAY BASIC з начесом";
    expect(raymarketColorWord("Худі чоловіче чорне утеплене RAY BASIC U0401", hoodie)).toBe("чорне");
    expect(raymarketColorWord("Худі жіноче бежеве утеплене RAY BASIC U0401", hoodie)).toBe("бежеве");
  });

  it("латинські хвости назви моделі — теж не колір", () => {
    // Сайт зве її LUX POLO, прайс — HARPER POLO; «LUX» не має їхати в колір.
    expect(raymarketColorWord("Поло чоловіча біла STEDMAN STEDMAN LUX POLO", "Поло чоловіча STEDMAN HARPER POLO")).toBe(
      "біла"
    );
    // Артикул у хвості теж не колір.
    expect(raymarketColorWord("Футболка оверсайз чоловіча чорна RAY OVERSIZE U0104 UNISEX", "Футболка оверсайз RAY OVERSIZE")).toBe(
      "чорна"
    );
  });

  it("немає різниці — немає й кольору: підпис візьме код з артикула", () => {
    expect(raymarketColorWord(model, model)).toBeNull();
    expect(raymarketColorWord(null, model)).toBeNull();
  });
});

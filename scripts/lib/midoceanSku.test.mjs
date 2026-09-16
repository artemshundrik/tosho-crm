import { describe, expect, it } from "vitest";

import { midoceanImageUrl, midoceanModel, midoceanSkuFromArticle } from "./midoceanSku.mjs";

/**
 * Усі артикули тут — СПРАВЖНІ рядки з «мов Д1_серпень 2026.xlsx», а очікувані
 * адреси знімків звірені живими HEAD-запитами 16.09.2026: `200` там, де тест
 * каже «є кадр», `403` (так S3 відповідає на неіснуючий ключ) там, де каже
 * «немає». Тобто тест закріплює те, що CDN справді віддає, а не те, як я собі
 * уявляю назви файлів.
 */
describe("артикул Д1 → SKU midocean", () => {
  it("звичайний артикул: M + модель + код кольору + X", () => {
    expect(midoceanSkuFromArticle("MMO320003X")).toBe("MO3200-03");
    expect(midoceanSkuFromArticle("MMO889348X")).toBe("MO8893-48");
    expect(midoceanSkuFromArticle("MKC105017X")).toBe("KC1050-17");
    expect(midoceanSkuFromArticle("MCX101305X")).toBe("CX1013-05");
    expect(midoceanSkuFromArticle("MIT097103X")).toBe("IT0971-03");
    expect(midoceanSkuFromArticle("MAR124916X")).toBe("AR1249-16");
  });

  it("сама ексельки це підтверджує: у частини назв SKU написаний словами", () => {
    // «Калькулятор сірий, AR1253-16» — постачальник сам лишив код у назві.
    expect(midoceanSkuFromArticle("MAR125316X")).toBe("AR1253-16");
    // «Зарядний пристрій 2200mAh, білий, MO5001-06» — і тут теж, при тому що
    // сам артикул на два розряди довший (див. наступний випадок).
    expect(midoceanSkuFromArticle("MMO50010622X")).toBe("MO5001-06");
  });

  /**
   * ДОВШИЙ АРТИКУЛ — НЕ ПОМИЛКА ФАЙЛУ, А ЇХНІЙ ВНУТРІШНІЙ ХВІСТ. Таких у
   * серпневому прайсі двоє з 5441, і обидва розкладаються за тим самим
   * правилом «перші чотири розряди — модель, наступні два — колір», а решта
   * відкидається. Перевірено адресою знімка: `mo2409-06` і `mo5001-06` віддали
   * `200`, тоді як «чесні» склейки `mo24090607` і `mo5001-0622` — `403`.
   */
  it("довший артикул: хвіст після коду кольору відкидається", () => {
    expect(midoceanSkuFromArticle("MMO24090607X")).toBe("MO2409-06");
    expect(midoceanSkuFromArticle("MMO50010622X")).toBe("MO5001-06");
  });

  /**
   * КОРОТШИЙ АРТИКУЛ — ТОВАР БЕЗ КОЛЬОРУ. Батарейка й двоє пляжних капців:
   * розрядів лише чотири, кольорового коду немає взагалі. Обрізати тут нічого,
   * SKU дорівнює моделі. Знімка в CDN у них немає (403 на всіх розмірах), і це
   * не привід вигадувати код кольору — товар живе в пулі без фото.
   */
  it("коротший артикул: модель без коду кольору", () => {
    expect(midoceanSkuFromArticle("MKC1803X")).toBe("KC1803");
    expect(midoceanSkuFromArticle("MMO6136X")).toBe("MO6136");
    expect(midoceanSkuFromArticle("MMO6137X")).toBe("MO6137");
  });

  it("регістр і пробіли не ламають розбір", () => {
    expect(midoceanSkuFromArticle("  mmo320003x  ")).toBe("MO3200-03");
  });

  it("чужий рядок — null, а не здогад", () => {
    for (const bad of ["", null, undefined, "MO3200-03", "XYZ", "M320003X", "MMO32000X3", 42]) {
      expect(midoceanSkuFromArticle(bad), String(bad)).toBeNull();
    }
  });
});

describe("модель із SKU", () => {
  it("відрізає код кольору", () => {
    expect(midoceanModel("MO3200-03")).toBe("MO3200");
    expect(midoceanModel("AR1249-16")).toBe("AR1249");
  });

  it("товар без кольору лишається собою", () => {
    expect(midoceanModel("KC1803")).toBe("KC1803");
  });
});

describe("адреса знімка", () => {
  it("будується з SKU в нижньому регістрі", () => {
    expect(midoceanImageUrl("MO3200-03")).toBe("https://cdn1.midocean.com/image/700X700/mo3200-03.jpg");
  });

  /**
   * Розмір — не довільне число: CDN віддає лише свій перелік. 16.09.2026
   * `700X700` і `original` віддали JPEG, а `1000X1000`, `1200X1200`,
   * `2000X2000` і `orig` — 403. Тому розміри тут перелічені, а не підставляються.
   */
  it("знає лише ті розміри, які CDN справді віддає", () => {
    expect(midoceanImageUrl("MO3200-03", "original")).toBe(
      "https://cdn1.midocean.com/image/original/mo3200-03.jpg"
    );
    expect(() => midoceanImageUrl("MO3200-03", "1000X1000")).toThrow(/розмір/i);
  });
});

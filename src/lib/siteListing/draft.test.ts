import { describe, expect, it } from "vitest";

import { normalizeMethods, renderDescriptionHtml, TEXTILE_NOTE } from "./description";
import { assembleDraft, DraftInputError, parseDraftModelOutput, prepareDraft } from "./draft";
import { buildImportRows, IMPORT_COLUMNS } from "./importFile";
import type { DraftContext, SiteListingDraft } from "./types";

const context = (patch: Partial<DraftContext> = {}): DraftContext => ({
  model: {
    name: "Термопляшка Guard, ТМ Discover",
    vendor: "Discover",
    category: "Термоси та термокружки",
    section: "Подорож та відпочинок",
    url: "https://totobi.com.ua/x/",
    description: "Термопляшка з подвійною стінкою.",
    params: { Матеріал: "Нержавіюча сталь" },
    methods: "Гравіювання, Шовкодрук",
    textile: false,
    sizes: [],
  },
  variants: [
    { article: "2635-04", color: "червоний", exactColor: "червоний", group: "Червоний", sitePrice: 336.4, images: ["https://t/1.jpg", "https://t/2.jpg", "http://t/3.jpg"] },
    { article: "2635-05", color: "синій", exactColor: "синій", group: "Синій", sitePrice: 336.4, images: ["https://t/4.jpg"] },
  ],
  brandColors: [],
  categoryVotes: [{ path: "Сувенірна продукція/Подорож та відпочинок/Термоси та термопляшки", votes: 9 }],
  examples: [],
  siteCategories: ["Сувенірна продукція/Подорож та відпочинок/Термоси та термопляшки", "Одяг під брендування/Поло"],
  ...patch,
});

const output = {
  title: "Термопляшка «GUARD», 480 мл",
  intro: ["Термопляшка з подвійною стінкою.", "Тримає температуру до 12 годин."],
  bullets: ["• матеріал: нержавіюча сталь", "об'єм: 480 мл"],
  methods: "лазерне гравіювання, шовкографія, УФ-друк",
  care: null,
  category: null,
};

describe("підготовка чернетки кодом", () => {
  it("ціни, кольори, фото й речення про кольори рахує код", () => {
    const prepared = prepareDraft(context());
    expect(prepared.variants).toEqual([
      { article: "2635-04", color: "Червоний", colorSource: "exact", price: 333, supplierPrice: 336.4, images: ["https://t/1.jpg", "https://t/2.jpg"] },
      { article: "2635-05", color: "Синій", colorSource: "exact", price: 333, supplierPrice: 336.4, images: ["https://t/4.jpg"] },
    ]);
    expect(prepared.colorsSentence).toBe("Поставляється в двох різних кольорах.");
    expect(prepared.category).toBe("Сувенірна продукція/Подорож та відпочинок/Термоси та термопляшки");
    expect(prepared.categoryChoices).toBeNull();
  });

  it("без ціни постачальника модель не йде", () => {
    const ctx = context();
    ctx.variants[1].sitePrice = null;
    expect(() => prepareDraft(ctx)).toThrow(DraftInputError);
  });

  it("розділ не визначено голосами — модель вибирає з переліку", () => {
    const prepared = prepareDraft(context({ categoryVotes: [] }));
    expect(prepared.category).toBeNull();
    expect(prepared.categoryChoices).toHaveLength(2);
  });

  it("опису постачальника немає — позначка в чернетці", () => {
    const ctx = context();
    if (ctx.model) ctx.model.description = null;
    expect(prepareDraft(ctx).noSupplierDescription).toBe(true);
  });
});

describe("відповідь мовної моделі", () => {
  it("знімає маркери пунктів і приймає розділ лише з переліку", () => {
    const parsed = parseDraftModelOutput({ ...output, category: "Вигаданий розділ" }, ["Одяг під брендування/Поло"]);
    expect(parsed.bullets).toEqual(["матеріал: нержавіюча сталь", "об'єм: 480 мл"]);
    expect(parsed.category).toBeNull();
    expect(parseDraftModelOutput({ ...output, category: "Одяг під брендування/Поло" }, ["Одяг під брендування/Поло"]).category).toBe(
      "Одяг під брендування/Поло"
    );
  });

  it("без назви чи опису — помилка для людини", () => {
    expect(() => parseDraftModelOutput({ ...output, title: "" }, null)).toThrow(DraftInputError);
    expect(() => parseDraftModelOutput("текст", null)).toThrow(DraftInputError);
  });
});

describe("«Тип нанесення»", () => {
  it("друк трафаретом — «шовкотрафарет»; абревіатури лишаються", () => {
    expect(normalizeMethods("Гравіювання, Шовкодрук, УФ-друк")).toBe("гравіювання, шовкотрафарет, УФ-друк");
    expect(normalizeMethods("шовкографія; шовкотрафарет")).toBe("шовкотрафарет");
  });
});

const draft = (patch: Partial<SiteListingDraft> = {}): SiteListingDraft => ({
  ...assembleDraft({
    prepared: prepareDraft(context()),
    output: parseDraftModelOutput(output, null),
    sizeTable: null,
    model: "gpt-test",
    now: new Date("2026-10-07T10:00:00Z"),
  }),
  ...patch,
});

describe("опис — розмітка ручних карток", () => {
  it("абзац на рядок, порожній рядок між блоками, «Тип нанесення» жирним", () => {
    expect(renderDescriptionHtml(draft())).toBe(
      [
        "<p>Термопляшка з подвійною стінкою.</p>",
        "<p>Тримає температуру до 12 годин.</p>",
        "<p>Поставляється в двох різних кольорах.</p>",
        "<p>&nbsp;</p>",
        "<p>• матеріал: нержавіюча сталь</p>",
        "<p>• об'єм: 480 мл</p>",
        "<p>&nbsp;</p>",
        "<p><b>Тип нанесення:</b> лазерне гравіювання, шовкотрафарет, УФ-друк</p>",
      ].join("\n")
    );
  });

  it("одяг: таблиця розмірів після пунктів, далі курсивом прання й допуск", () => {
    const html = renderDescriptionHtml(
      draft({
        textile: true,
        care: "Рекомендоване прання за температури води до 30 °C",
        sizeTable: { sizes: ["S", "M"], rows: [{ label: "Довжина / ширина, см", values: ["69/51", "71/56"] }] },
      })
    );
    expect(html).toContain(
      "<p><b>Таблиця розмірів</b></p>\n<table><tr><th>Розмір</th><th>S</th><th>M</th></tr><tr><td>Довжина / ширина, см</td><td>69/51</td><td>71/56</td></tr></table>\n<p><i>Рекомендоване прання за температури води до 30 °C</i></p>\n<p><i>" +
        TEXTILE_NOTE +
        "</i></p>"
    );
  });

  it("текст моделі екранується", () => {
    expect(renderDescriptionHtml(draft({ intro: ["<script>x</script> & ко"] }))).toContain(
      "<p>&lt;script&gt;x&lt;/script&gt; &amp; ко</p>"
    );
  });
});

describe("файл імпорту", () => {
  it("рядок на колір, головний першим, прихований, батьківський артикул у всіх", () => {
    const rows = buildImportRows([{ draft: draft(), category: "Сувенірна продукція/Термоси" }]);
    expect(rows[0]).toEqual([...IMPORT_COLUMNS]);
    expect(rows.slice(1).map((row) => [row[0], row[1], row[3], row[5], row[7], row[8], row[10], row[11]])).toEqual([
      ["2635-04", "2635-04", "Термопляшка «GUARD», 480 мл", 333, "Ні", "Червоний", "https://t/1.jpg", "https://t/2.jpg"],
      ["2635-05", "2635-04", "Термопляшка «GUARD», 480 мл", 333, "Ні", "Синій", "https://t/4.jpg", ""],
    ]);
    expect(rows[1][4]).toBe("Сувенірна продукція/Термоси");
    expect(rows[1][6]).toBe("В наявності");
    expect(String(rows[1][9])).toContain("<p><b>Тип нанесення:</b>");
  });
});

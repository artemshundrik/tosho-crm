import { describe, expect, it } from "vitest";

import {
  colorImageCandidates,
  commonPrefix,
  commonSuffix,
  dropSharedFrames,
  familyTag,
} from "./opencartColorImage.mjs";

/**
 * Усі випадки тут — СПРАВЖНІ родини з bergamo.ua, звірені живими запитами
 * 12.09.2026: кожна очікувана адреса віддавала `image/jpeg`, кожна відсутня —
 * 404. Тому тест не описує «як я собі уявляю назви файлів», а закріплює те, що
 * сайт справді віддає.
 */
const id = {
  parentImage: "https://bergamo.ua/image/cache/catalog_images/id/40634_navy_a-1200x1200.jpg",
  parentArticle: "40634790",
  parentColor: "темно-синій",
  model: "40634",
  tag: "",
};

describe("кандидати знімка кольору-сусіда", () => {
  it("замість коду стоїть СЛОВО — беремо слово сусіда (id, «Світшот дитячий ID Core»)", () => {
    expect(colorImageCandidates({ ...id, article: "40634900", color: "чорний" })).toContain(
      "https://bergamo.ua/image/catalog_images/id/40634_black_a.jpg"
    );
    expect(colorImageCandidates({ ...id, article: "40634570", color: "оливковий" })).toContain(
      "https://bergamo.ua/image/catalog_images/id/40634_olive_a.jpg"
    );
  });

  it("кандидати йдуть БЕЗ кешу: файл у кеші OpenCart існує лише для відвіданих сторінок", () => {
    for (const url of colorImageCandidates({ ...id, article: "40634900", color: "чорний" })) {
      expect(url).not.toContain("/image/cache/");
    }
  });

  it("невідомий колір кандидатів не дає — краще без фото, ніж чуже", () => {
    expect(colorImageCandidates({ ...id, article: "40634210", color: "мокко-фламінго" })).toEqual([]);
  });

  it("ім'я файлу — це артикул: міняємо артикул цілком (voyager, «USB хаб Fletcher»)", () => {
    expect(
      colorImageCandidates({
        parentImage: "https://bergamo.ua/image/cache/catalog_images/voyager/v3447_03_a-1100x1100.jpg",
        parentArticle: "V3447-03",
        parentColor: "чорний",
        article: "V3447-05",
        color: "червоний",
        model: "V3447-0",
        tag: "",
      })
    ).toContain("https://bergamo.ua/image/catalog_images/voyager/v3447_05_a.jpg");
  });

  it("код той самий, розділювач інший (cofee, «Шапка Primary band»)", () => {
    expect(
      colorImageCandidates({
        parentImage: "https://bergamo.ua/image/cache/catalog_images/cofee/3008_40_a-1100x1100.jpg",
        parentArticle: "CO3008.40",
        parentColor: "неоново-помаранчевий",
        article: "CO3008-5",
        color: "червоний",
        model: "CO3008",
        tag: "",
      })
    ).toContain("https://bergamo.ua/image/catalog_images/cofee/3008_5_a.jpg");
  });

  /*
    Найдорожчий випадок із усіх: перша редакція правила лишала в коді лише
    цифри, і всі п'ять кольорів цієї родини діставали ОДИН знімок — «6» у них
    спільна, різняться літерою. Тому скелет коду («6b») стоїть першим
    кандидатом, а голі цифри — другим.
  */
  it("кольори різняться ЛІТЕРОЮ в коді, а не цифрою (cofee, «Шапка Merlin»)", () => {
    const merlin = {
      parentImage: "https://bergamo.ua/image/cache/catalog_images/cofee/3044-3a_01-1100x1100.jpg",
      parentArticle: "3044-3A",
      parentColor: "чорний",
      model: "3044-",
      tag: "co",
    };
    expect(colorImageCandidates({ ...merlin, article: "3044-6B-CO", color: "сірий" })[0]).toBe(
      "https://bergamo.ua/image/catalog_images/cofee/3044-6b_01.jpg"
    );
    expect(colorImageCandidates({ ...merlin, article: "3044-6D-CO", color: "білий/червоний" })[0]).toBe(
      "https://bergamo.ua/image/catalog_images/cofee/3044-6d_01.jpg"
    );
  });

  it("у назві файлу номер завантаження — вивести не можна (james_harvest, «Худі Printer Overhead»)", () => {
    expect(
      colorImageCandidates({
        parentImage:
          "https://bergamo.ua/image/cache/catalog_images/james_harvest/2262052-197-246825256-1100x1100h.jpg",
        parentArticle: "2262052100",
        parentColor: "білий",
        article: "2262052900",
        color: "чорний",
        model: "2262052",
        tag: "",
      })
    ).toEqual([]);
  });

  it("адреса батька кандидатом не стає", () => {
    const urls = colorImageCandidates({ ...id, article: "40634790", color: "темно-синій" });
    expect(urls.some((u) => u.includes("40634_navy_a"))).toBe(false);
  });
});

describe("запобіжник проти спільного знімка", () => {
  it("знімок, що дістався двом кольорам, не лишається ні одному", () => {
    const parent = "https://bergamo.ua/image/cache/catalog_images/cofee/3044-3a_01-1100x1100.jpg";
    const found = [
      "https://bergamo.ua/image/catalog_images/cofee/3044-6a_01.jpg",
      "https://bergamo.ua/image/catalog_images/cofee/3044-6a_01.jpg",
      "https://bergamo.ua/image/catalog_images/cofee/3044-6c_01.jpg",
    ];
    expect(dropSharedFrames(found, parent)).toEqual([
      null,
      null,
      "https://bergamo.ua/image/catalog_images/cofee/3044-6c_01.jpg",
    ]);
  });

  it("батьківський кадр зайнятий, хоч його адреса й кешована", () => {
    expect(
      dropSharedFrames(
        ["https://bergamo.ua/image/catalog_images/id/40634_navy_a.jpg"],
        "https://bergamo.ua/image/cache/catalog_images/id/40634_navy_a-1200x1200.jpg"
      )
    ).toEqual([null]);
  });

  it("порожні місця лишаються порожніми й нічого не займають", () => {
    expect(dropSharedFrames([null, null], "https://x/image/cache/a/b_a-1x1.jpg")).toEqual([null, null]);
  });
});

describe("розбір родини артикулів", () => {
  it("спільний початок — це номер моделі", () => {
    expect(commonPrefix(["40634790", "40634900", "40634210", "40634570"])).toBe("40634");
  });

  it("спільне закінчення — хвіст постачальника", () => {
    expect(commonSuffix(["3044-6A-CO", "3044-6B-CO", "3044-6C-CO"])).toBe("-CO");
    expect(familyTag(["3044-6A-CO", "3044-6B-CO"])).toBe("co");
  });

  it("артикули без спільного хвоста хвоста й не дають", () => {
    expect(familyTag(["40634790", "40634900"])).toBe("");
  });
});

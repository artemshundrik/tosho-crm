import { describe, expect, it } from "vitest";

import {
  applySupplierVariant,
  baseProductName,
  groupSupplierPoolRows,
  normalizeArticle,
  supplierNameFromUrl,
  transliterateSearchTerm,
  supplierVariantUnit,
  type SupplierPoolRow,
} from "./supplierPoolRows";

/**
 * Згортання — єдине місце, де пул перетворюється на те, що бачить менеджер, і
 * воно тихе: помилка тут не падає, а показує на картці артикул чужого кольору.
 * Тому випадки взяті з живих фідів — berrytex (колір і розмір у назві, один
 * артикул на всі рядки) і totobi (колір у власному полі, свій код у кожного).
 */

const row = (over: Partial<SupplierPoolRow>): SupplierPoolRow => ({
  id: "id-1",
  supplier_slug: "totobi.com.ua",
  article: null,
  name: "Товар",
  vendor: null,
  category: null,
  price: null,
  currency: "UAH",
  price_kind: "retail",
  url: null,
  image_url: null,
  color: null,
  size: null,
  ...over,
});

describe("groupSupplierPoolRows", () => {
  it("не підставляє фото моделі колірному варіанту, але підставляє розмірному", () => {
    // Живий випадок 08.09.2026: Артем вибрав «чорний антрацит», а в позицію
    // лягло фото СИНЬОЇ футболки — у колірних рядків Бергамо свого фото тоді
    // не було, і картка віддавала батьківське.
    const rows = [
      row({ id: "c1", name: "Футболка Prime T", price: 618, color: "темно-синій", image_url: "https://cdn/navy.jpg" }),
      row({ id: "c2", name: "Футболка Prime T", price: 618, color: "чорний антрацит", image_url: null }),
    ];
    const [product] = groupSupplierPoolRows(rows, 40);
    const black = product.variants.find((variant) => variant.label === "чорний антрацит")!;
    expect(applySupplierVariant(product, black).imageUrl).toBeNull();

    // А там, де варіанти НЕ кольори, успадкування доречне: XL виглядає як S.
    const sized = [
      row({ id: "s1", name: "Худі Basic", price: 900, article: "H-S", image_url: "https://cdn/hoodie.jpg" }),
      row({ id: "s2", name: "Худі Basic", price: 900, article: "H-XL", image_url: null }),
    ];
    const [hoodie] = groupSupplierPoolRows(sized, 40);
    const xl = hoodie.variants.find((variant) => variant.article === "H-XL")!;
    expect(applySupplierVariant(hoodie, xl).imageUrl).toBe("https://cdn/hoodie.jpg");
  });

  it("коли ціна є в обох оптовиків, картка показує дешевшу — і обидва сайти", () => {
    // Живий випадок 10.09.2026: вісім артикулів Fruit of the Loom є і в Trele,
    // і в Е-Сувеніра. Правило «заповни порожнє» лишало першу ціну, і Е-Сувенір
    // із його −40% просто не показувався.
    const rows = [
      row({ id: "t1", supplier_slug: "trele.com.ua", name: "Футболка Valueweight", price: 161.7,
        article: "061036040S", color: "Білий", size: "S", price_kind: "wholesale",
        url: "https://trele.com.ua/valueweight/" }),
      row({ id: "e1", supplier_slug: "e-suvenir.com.ua", name: "Футболка 'Valueweight T'", price: 97.17,
        article: "061036040S", color: "Білий", price_kind: "wholesale",
        url: "https://e-suvenir.com.ua/ua/valueweight" }),
    ];
    const [product] = groupSupplierPoolRows(rows, 40);
    expect(product.variantCount).toBe(1);
    expect(product.priceMin).toBe(97.17);
    // Число їде в базу рядком того постачальника, у якого воно взяте.
    expect(product.priceRowId).toBe("e1");
    // Але обидва сайти лишаються на картці: річ справді є в обох.
    expect(product.sources.map((source) => source.supplierSlug).sort()).toEqual([
      "e-suvenir.com.ua",
      "trele.com.ua",
    ]);

    // Порядок карток на вході нічого не міняє.
    const [flipped] = groupSupplierPoolRows([rows[1], rows[0]], 40);
    expect(flipped.priceMin).toBe(97.17);
    expect(flipped.priceRowId).toBe("e1");
  });

  it("розмір іде в підпис варіанта, а лічильник перестає казати «кольори»", () => {
    // Живий випадок trele (10.09.2026): «Футболка Gildan Softstyle» — 74 рядки
    // на 11 кольорів, бо рядок це пара «колір + розмір». Без розміру в підписі
    // виходило шість однакових чипів «Яскраво-Синій (Royal RO)» поспіль, а
    // артикул за кожним свій — і 3XL там ще й дорожчий за решту.
    const rows = [
      row({ id: "t1", supplier_slug: "trele.com.ua", name: "Футболка Gildan Softstyle", price: 145.04,
        article: "GI64000ROL", color: "Яскраво-Синій (Royal RO)", size: "L" }),
      row({ id: "t2", supplier_slug: "trele.com.ua", name: "Футболка Gildan Softstyle", price: 231.77,
        article: "GI64000RO3XL", color: "Яскраво-Синій (Royal RO)", size: "3XL" }),
    ];
    const [product] = groupSupplierPoolRows(rows, 40);
    expect(product.variants.map((variant) => variant.label)).toEqual([
      "Яскраво-Синій (Royal RO), L",
      "Яскраво-Синій (Royal RO), 3XL",
    ]);
    expect(supplierVariantUnit(product)).toBe("вар.");

    // Фото при цьому лишається колірним: підставляти батьківське не можна.
    const big = product.variants.find((variant) => variant.article === "GI64000RO3XL")!;
    expect(applySupplierVariant(product, big).imageUrl).toBeNull();
    expect(applySupplierVariant(product, big).priceMin).toBe(231.77);

    // Джерело, де рядок — це колір, лічиться як раніше.
    const colorsOnly = [
      row({ id: "c1", name: "Кухоль Stage", price: 100, color: "білий" }),
      row({ id: "c2", name: "Кухоль Stage", price: 100, color: "чорний" }),
    ];
    expect(supplierVariantUnit(groupSupplierPoolRows(colorsOnly, 40)[0])).toBe("кольор.");
  });

  it("роздає місця по черзі між постачальниками, а не віддає всі одному", () => {
    // Живий випадок 08.09.2026: у бергамо назви на «Д» і «Ф» ішли за абеткою
    // першими серед тих, у кого є ціна, і забирали всі шість місць вікна
    // візарда — Тотобі знову не було видно.
    const rows = [
      row({ id: "b1", supplier_slug: "bergamo.ua", name: "Двоколірна футболка", price: 793 }),
      row({ id: "b2", supplier_slug: "bergamo.ua", name: "Дитяча футболка", price: 405 }),
      row({ id: "b3", supplier_slug: "bergamo.ua", name: "Ще одна футболка", price: 500 }),
      row({ id: "t1", supplier_slug: "totobi.com.ua", name: "Футболка Atomic150", price: 120 }),
      row({ id: "t2", supplier_slug: "totobi.com.ua", name: "Футболка Bahrain 135", price: 121 }),
      row({ id: "a1", supplier_slug: "avanprint.ua", name: "Футболка «BASIC»", price: null }),
    ];

    const slugs = groupSupplierPoolRows(rows, 4).map((product) => product.supplierSlug);

    // Чотири місця на три джерела: кожне мусить дістати щонайменше одне.
    expect(new Set(slugs).size).toBe(3);
    expect(slugs.filter((slug) => slug === "bergamo.ua").length).toBeLessThanOrEqual(2);
    // Джерело без цін лишається позаду тих, у кого ціна є, але не зникає.
    expect(slugs).toContain("avanprint.ua");
  });

  it("ставить попереду ті картки, де слово запиту стоїть раніше в назві", () => {
    // Живий випадок 08.09.2026: на запит «ручка» в e-suvenir перші картки були
    // «ЕКО блокнот ... + ручка» — бо «Е» стоїть перед «Р», — а сотня власне
    // ручок не показувалась. У випадайці шість місць, тож вибір робив алфавіт.
    const rows = [
      row({ id: "e1", supplier_slug: "e-suvenir.com.ua", name: "ЕКО блокнот 'Dickens' А5 бамбуковий + ручка", price: 261 }),
      row({ id: "e2", supplier_slug: "e-suvenir.com.ua", name: "ЕКО блокнот 'Emory' А6 + ручка", price: 47 }),
      row({ id: "e3", supplier_slug: "e-suvenir.com.ua", name: "Ручка пластикова 'Trey'", price: 3.81 }),
      row({ id: "e4", supplier_slug: "e-suvenir.com.ua", name: "ЕКО ручка 'Zian' з переробленого пластику", price: 9.13 }),
    ];

    const names = groupSupplierPoolRows(rows, 2, ["ручка"]).map((product) => product.name);

    // Обидва місця дістаються тим, де «ручка» — про сам товар, а не хвіст назви.
    expect(names).toEqual(["Ручка пластикова 'Trey'", "ЕКО ручка 'Zian' з переробленого пластику"]);
  });

  it("без слів запиту порядок лишається абетковим, як був", () => {
    const rows = [
      row({ id: "e3", supplier_slug: "e-suvenir.com.ua", name: "Ручка пластикова 'Trey'", price: 3.81 }),
      row({ id: "e1", supplier_slug: "e-suvenir.com.ua", name: "ЕКО блокнот 'Emory' А6 + ручка", price: 47 }),
    ];

    const names = groupSupplierPoolRows(rows, 2).map((product) => product.name);

    expect(names).toEqual(["ЕКО блокнот 'Emory' А6 + ручка", "Ручка пластикова 'Trey'"]);
  });

  it("згортає кольори totobi в одну картку й лишає артикул у варіантах", () => {
    const rows = [
      row({ id: "a", article: "18000-CG 3C", name: "Реглан Heavy Blend 271", price: 675.18, color: "ash grey" }),
      row({ id: "b", article: "18000-BK 3C", name: "Реглан Heavy Blend 271", price: 690, color: "чорний" }),
    ];

    const [product] = groupSupplierPoolRows(rows, 40);

    expect(product.name).toBe("Реглан Heavy Blend 271");
    expect(product.variantCount).toBe(2);
    // Артикули різні — на картці не показуємо жодного, інакше менеджер
    // скопіює код випадкового кольору.
    expect(product.article).toBeNull();
    expect(product.variants.map((v) => v.label)).toEqual(["ash grey", "чорний"]);
    expect(product.variants.map((v) => v.article)).toEqual(["18000-CG 3C", "18000-BK 3C"]);
    expect([product.priceMin, product.priceMax]).toEqual([675.18, 690]);
  });

  it("тримає артикул на картці, коли він у всіх варіантів однаковий (berrytex)", () => {
    const rows = [
      row({ id: "a", supplier_slug: "berrytex.com.ua", article: "JHK-PL", name: "JHK POLO (колір білий (WH), розмір 1/2)" }),
      row({ id: "b", supplier_slug: "berrytex.com.ua", article: "JHK-PL", name: "JHK POLO (колір чорний (BK), розмір 1/2)" }),
    ];

    const [product] = groupSupplierPoolRows(rows, 40);

    expect(product.name).toBe("JHK POLO");
    expect(product.article).toBe("JHK-PL");
    // Кольори НЕ схлопуються, хоч код у них один: злиття за артикулом працює
    // між картками, а не всередині однієї. Інакше 2098 рядків berrytex стали б
    // 74 однобарвними картками.
    expect(product.variantCount).toBe(2);
    // Підпис варіанта береться з дужкового хвоста — свого поля кольору тут немає.
    expect(product.variants.map((v) => v.label)).toEqual([
      "колір білий (WH), розмір 1/2",
      "колір чорний (BK), розмір 1/2",
    ]);
  });

  it("піднімає товари з відомою ціною над безцінними", () => {
    const rows = [
      row({ id: "a", name: "Аркуш" }),
      row({ id: "b", name: "Ящик", price: 10 }),
    ];

    expect(groupSupplierPoolRows(rows, 40).map((p) => p.name)).toEqual(["Ящик", "Аркуш"]);
  });

  it("не склеює однойменні товари різних постачальників", () => {
    const rows = [
      row({ id: "a", supplier_slug: "totobi.com.ua", name: "Ліхтар" }),
      row({ id: "b", supplier_slug: "bergamo.ua", name: "Ліхтар" }),
    ];

    expect(groupSupplierPoolRows(rows, 40)).toHaveLength(2);
  });

  it("добирає фото, виробника й категорію з наступних рядків групи", () => {
    const rows = [
      row({ id: "a", name: "Кепка" }),
      row({ id: "b", name: "Кепка", image_url: "https://example/1.jpg", vendor: "Totobi", category: "Головні убори" }),
    ];

    const [product] = groupSupplierPoolRows(rows, 40);

    expect(product.imageUrl).toBe("https://example/1.jpg");
    expect(product.vendor).toBe("Totobi");
    expect(product.category).toBe("Головні убори");
  });
});

describe("baseProductName", () => {
  it("ріже від першої дужки — у berrytex вони вкладені", () => {
    expect(baseProductName("JHK POLO (колір білий (WH), розмір 1/2)")).toBe("JHK POLO");
  });

  it("лишає назву як є, коли дужок немає", () => {
    expect(baseProductName("Термокружка Magnum, ТМ Discover")).toBe("Термокружка Magnum, ТМ Discover");
  });
});

describe("transliterateSearchTerm", () => {
  it("ловить латиничну назву за кириличним запитом", () => {
    expect(transliterateSearchTerm("поло")).toBe("polo");
  });
});

/**
 * Злиття карток за артикулом (правило Артема 08.09.2026). Аванпринт — наш
 * магазин; він перепродає товар оптовиків і лишає їхні коди, тож збіг артикула
 * означає ту саму річ на тому самому складі. Заміряно на проді: спільні коди є
 * ТІЛЬКИ між Аванпринтом і оптовиками, між оптовиками — жодного.
 */
describe("groupSupplierPoolRows — злиття за артикулом", () => {
  it("зливає картку магазину з карткою оптовика: назва наша, ціна його, посилання обидва", () => {
    const rows = [
      row({
        id: "t1", supplier_slug: "totobi.com.ua", article: "7045-01", name: "Реглан LENNY, TM Floyd",
        price: 675.18, price_kind: "wholesale", color: "чорний", vendor: "Floyd",
        url: "https://totobi/7045-01", image_url: "https://totobi/black.jpg",
      }),
      row({
        id: "a1", supplier_slug: "avanprint.ua", article: "7045-01", name: "Худі «LENNY»",
        price: null, price_kind: "retail", color: "Чорний",
        url: "https://avanprint/lenny/7045-01", image_url: "https://avanprint/black.jpg",
      }),
    ];

    const products = groupSupplierPoolRows(rows, 40);

    expect(products).toHaveLength(1);
    const [product] = products;
    // Назва — з нашого магазину, хоч знайшли товар за словом оптовика.
    expect(product.name).toBe("Худі «LENNY»");
    // Посилання на ОБИДВА сайти; першим той, чия ціна стоїть на картці.
    expect(product.sources.map((source) => source.supplierSlug)).toEqual([
      "totobi.com.ua",
      "avanprint.ua",
    ]);
    expect(product.sources.map((source) => source.url)).toEqual([
      "https://totobi/7045-01",
      "https://avanprint/lenny/7045-01",
    ]);
    // Чужу назву не викидаємо: без неї менеджер не впізнає знайдене.
    expect(product.sources[0].name).toBe("Реглан LENNY, TM Floyd");
    expect(product.url).toBe("https://totobi/7045-01");
    // ЦІНА ЇДЕ З ПІДПИСОМ. У Аванпринта price_kind = retail при порожній ціні,
    // і взявши підпис із картки-господаря, ми підписали б оптову ціну словом
    // «роздріб» — тобто збрехали б про гроші.
    expect(product.priceMin).toBe(675.18);
    expect(product.priceKind).toBe("wholesale");
    // Той самий артикул — той самий колір, а не два.
    expect(product.variantCount).toBe(1);
    expect(product.article).toBe("7045-01");
    // Фото й підпис кольору — наші; виробника Аванпринт не дає, беремо в оптовика.
    expect(product.imageUrl).toBe("https://avanprint/black.jpg");
    expect(product.variants[0].label).toBe("Чорний");
    expect(product.vendor).toBe("Floyd");
  });

  it("об'єднує кольори, а не перетинає їх", () => {
    // Застереження, з якого виросло правило: у «Stage» Тотобі має більше
    // кольорів, ніж наш магазин. Картка мусить показати ВСІ — інакше злиття
    // з'їдає кольори й виходить гірше за дві окремі картки.
    const rows = [
      row({ id: "t1", article: "812-01", name: "Футболка Stage 150", price: 120, color: "чорний" }),
      row({ id: "t2", article: "812-77", name: "Футболка Stage 150", price: 120, color: "sage" }),
      row({ id: "t3", article: "812-88", name: "Футболка Stage 150", price: 130, color: "orchid" }),
      row({
        id: "a1", supplier_slug: "avanprint.ua", article: "812-01", name: "Футболка «STAGE»",
        price: null, price_kind: "retail", color: "Чорний",
      }),
    ];

    const [product] = groupSupplierPoolRows(rows, 40);

    expect(product.name).toBe("Футболка «STAGE»");
    expect(product.variants.map((variant) => variant.article)).toEqual(["812-01", "812-77", "812-88"]);
    expect([product.priceMin, product.priceMax]).toEqual([120, 130]);
    // Артикул на картці лишається порожнім: кодів три.
    expect(product.article).toBeNull();
  });

  it("не зливає картки, у яких немає спільного артикула", () => {
    // По назві зливати не можна: «Рушник Nensi» і «Рушник Dora» обидва
    // тягнуться до «Рушник NARA». Спільного коду немає — лишаються двома.
    const rows = [
      row({ id: "t1", article: "5509-01", name: "Рушник NARA", price: 100 }),
      row({
        id: "a1", supplier_slug: "avanprint.ua", article: "9114-02", name: "Рушник «NENSI»",
        price: null, price_kind: "retail",
      }),
    ];

    expect(groupSupplierPoolRows(rows, 40)).toHaveLength(2);
  });

  it("склеює здвоєні через одрук картки магазину — через картку оптовика", () => {
    // Живі дані: «Парасолька складна «LIDO»» і «Парасолька скоадна «LIDO»» —
    // одна річ, розбита одруком на дві картки. Спільного коду між собою в них
    // немає, зате кожна ділить код із карткою оптовика, тож склеюються через неї.
    const rows = [
      row({
        id: "a1", supplier_slug: "avanprint.ua", article: "5006-01", name: "Парасолька складна «LIDO»",
        price: null, price_kind: "retail", color: "синій", image_url: "https://avanprint/lido.jpg",
      }),
      row({
        id: "a2", supplier_slug: "avanprint.ua", article: "5006-06", name: "Парасолька скоадна «LIDO»",
        price: null, price_kind: "retail", color: "жовтий",
      }),
      row({ id: "t1", article: "5006-01", name: "Парасоля складна Lido, TM Discover", price: 250, color: "синій" }),
      row({ id: "t2", article: "5006-06", name: "Парасоля складна Lido, TM Discover", price: 250, color: "жовтий" }),
    ];

    const products = groupSupplierPoolRows(rows, 40);

    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Парасолька складна «LIDO»");
    expect(products[0].variantCount).toBe(2);
    expect(products[0].priceMin).toBe(250);
    expect(products[0].sources.map((source) => source.supplierSlug)).toEqual([
      "totobi.com.ua",
      "avanprint.ua",
    ]);
  });

  it("назва кольору б'є код: підпис-артикул поступається слову з іншого джерела", () => {
    // Жива «Кепка «POLO»»: у Аванпринта чорний рядок без поля кольору, тож
    // підпис падав на артикул — і плитка стояла «7077-08» поміж «Синій» і
    // «Білий». У Тотобі той самий код названий словом.
    const rows = [
      row({ id: "a8", supplier_slug: "avanprint.ua", article: "7077-08", name: "Кепка «POLO»", price: null, price_kind: "retail", color: null }),
      row({ id: "a4", supplier_slug: "avanprint.ua", article: "7077-04", name: "Кепка «POLO»", price: null, price_kind: "retail", color: "Червоний" }),
      row({ id: "t8", article: "7077-08", name: "Кепка Polo, TM Floyd", price: 190.43, color: "чорний" }),
      row({ id: "t4", article: "7077-04", name: "Кепка Polo, TM Floyd", price: 190.43, color: "червоний" }),
    ];

    const [product] = groupSupplierPoolRows(rows, 40);

    expect(product.variants.map((variant) => variant.label)).toEqual(["чорний", "Червоний"]);
    // І картка знову знає, що її варіанти — кольори: один підпис-код більше
    // не гасить ознаку на всій картці.
    expect(product.variantsAreColors).toBe(true);
  });

  it("картка одного джерела теж має sources — щоб показ не мав двох гілок", () => {
    const [product] = groupSupplierPoolRows(
      [row({ id: "t1", article: "1-01", name: "Ліхтар", price: 90, url: "https://totobi/1-01" })],
      40
    );

    expect(product.sources).toEqual([
      { supplierSlug: "totobi.com.ua", name: "Ліхтар", url: "https://totobi/1-01" },
    ]);
  });
});

describe("normalizeArticle", () => {
  it("не зважає на регістр і краї, але береже дефіси й пробіли всередині коду", () => {
    expect(normalizeArticle("  18000-cg 3c ")).toBe("18000-CG 3C");
    expect(normalizeArticle("   ")).toBeNull();
    expect(normalizeArticle(null)).toBeNull();
  });
});

describe("supplierNameFromUrl", () => {
  it("називає знайоме джерело по-людськи, а незнайоме — доменом", () => {
    expect(supplierNameFromUrl("https://totobi.com.ua/kepka/")).toBe("Totobi");
    expect(supplierNameFromUrl("https://www.avanprint.ua/x")).toBe("Avanprint");
    expect(supplierNameFromUrl("https://some-shop.com/x")).toBe("Some-shop");
    expect(supplierNameFromUrl("https://berrytex.com.ua/x")).toBe("Berrytex");
    expect(supplierNameFromUrl("https://bergamo.ua/x")).toBe("Bergamo");
    // Двоскладова зона й піддомен: назва — те слово, що перед зоною.
    expect(supplierNameFromUrl("https://rozetka.com.ua/x")).toBe("Rozetka");
    expect(supplierNameFromUrl("https://shop.epicentrk.ua/x")).toBe("Epicentrk");
  });

  it("на порожньому й ламаному значенні повертає null, а не вигадує назву", () => {
    expect(supplierNameFromUrl(null)).toBeNull();
    expect(supplierNameFromUrl("  ")).toBeNull();
    expect(supplierNameFromUrl("не адреса")).toBeNull();
  });
});

describe("порядок карток за доречністю", () => {
  it("точний артикул стає першим, навіть коли за абеткою він останній", () => {
    // Живий випадок: «4031» дає 37 рядків, і той, чий код із нього
    // починається, стояв серед них випадково — доречність рахувалась лише
    // по назві, тож збіг за кодом важив нуль.
    const rows = [
      row({ id: "a", supplier_slug: "totobi.com.ua", article: "4031-10", name: "Аврора рюкзак", price: 900 }),
      row({ id: "b", supplier_slug: "totobi.com.ua", article: "4031-08", name: "Яскравий рюкзак", price: 1000 }),
    ];

    const names = groupSupplierPoolRows(rows, 2, ["4031-08"]).map((product) => product.name);

    expect(names[0]).toBe("Яскравий рюкзак");
  });
});

import { describe, expect, it } from "vitest";

import {
  buildCommercialSheetRows,
  cleanCustomerName,
  formatMoney,
  getCommercialDocFilename,
  getCommercialDocName,
  stripSupplierTag,
  COMMERCIAL_SHEET_COLUMNS,
  commercialSectionTotalRange,
  renderCommercialDocumentHtml,
  type CommercialDocument,
  type CommercialItemRow,
  type CommercialQuoteSection,
} from "./document";

/**
 * Документ КП має чотири виходи, і три з них складаються тут: HTML для друку,
 * PDF (той самий HTML) і TSV. Четвертий — прев'ю в React — бере готові
 * `section.totalRange` / `doc.totalRange`, тобто те саме, що рахує
 * `commercialSectionTotalRange` нижче.
 *
 * ЩО ЗВІДСИ ПІШЛО. Роль позиції «варіант того самого виробу» (пігулка в рядку,
 * колонка «Роль» у TSV, пояснення під підсумком і попередження про варіант без
 * ціни) прибрана як невживана — див. `@/lib/moneyRange`. Замість тих тестів
 * нижче стоїть один, який стереже, щоб її сліди не повернулись у виходи
 * поодинці.
 */

/**
 * `Intl.NumberFormat("uk-UA")` розділяє тисячі нерозривним пробілом, а не
 * звичайним. У документі це правильно, у тексті тесту — нечитабельно, тож
 * порівнюємо на нормалізованому рядку.
 */
const norm = (value: string) => value.replaceAll(/[  ]/g, " ");

function item(overrides: Partial<CommercialItemRow> & { id: string }): CommercialItemRow {
  return {
    position: 1,
    imageUrl: "",
    name: "Щоденник",
    catalogPath: "",
    description: "",
    methodsSummary: "",
    placementSummary: "",
    unit: "шт",
    runs: [{ id: `${overrides.id}-run`, qty: 100, unitPrice: 100, lineTotal: 10_000 }],
    ...overrides,
  };
}

function section(items: CommercialItemRow[]): CommercialQuoteSection {
  return {
    quoteId: "q1",
    quoteNumber: "TS-0926-0022",
    status: "Новий",
    createdAt: "01.09.2026",
    visualizations: [],
    items,
    totalRange: commercialSectionTotalRange(items),
  };
}

function doc(sections: CommercialQuoteSection[]): CommercialDocument {
  return {
    title: "КП на щоденники",
    customerName: "Ромашка",
    createdAt: "01.09.2026",
    generatedAt: "01.09.2026, 10:00",
    currency: "грн",
    sections,
    totalRange: sections.reduce(
      (range, s) => ({ min: range.min + s.totalRange.min, max: range.max + s.totalRange.max }),
      { min: 0, max: 0 }
    ),
  };
}

const threeProducts = [
  item({ id: "a", name: "Щоденник" }),
  item({ id: "b", name: "Ручка", runs: [{ id: "b-run", qty: 100, unitPrice: 96.24, lineTotal: 9_624 }] }),
  item({ id: "c", name: "Пакет", runs: [{ id: "c-run", qty: 100, unitPrice: 210, lineTotal: 21_000 }] }),
];

const withRunChoice = [
  item({
    id: "a",
    runs: [
      { id: "a-100", qty: 100, unitPrice: 100, lineTotal: 10_000 },
      { id: "a-200", qty: 200, unitPrice: 90, lineTotal: 18_000 },
    ],
  }),
];

describe("підсумок прорахунку в документі", () => {
  it("різні товари складаються", () => {
    expect(commercialSectionTotalRange(threeProducts)).toEqual({ min: 40_624, max: 40_624 });
  });

  it("взаємовиключні тиражі всередині позиції лишаються межами позиції", () => {
    expect(commercialSectionTotalRange(withRunChoice)).toEqual({ min: 10_000, max: 18_000 });
  });

  it("межі позицій складаються дном до дна, стелею до стелі", () => {
    expect(commercialSectionTotalRange([...threeProducts, ...withRunChoice])).toEqual({
      min: 50_624,
      max: 58_624,
    });
  });

  it("прорахунок без позицій — нуль, а не NaN", () => {
    expect(commercialSectionTotalRange([])).toEqual({ min: 0, max: 0 });
  });
});

/**
 * Підсумку в документі НЕМАЄ — ні числом, ні межами (REQ-296, дірка REQ-267#p2).
 * Позиції прорахунку замовник обирає, а документ складав їх додаванням: на
 * TS-0926-0029 це давало 80–120 тис. ₴ замість реальних 34–85 тис. Тести стоять
 * саме на відсутності: підсумок легко повернути одним рядком у шаблон.
 */
describe("вихід 2/3 — HTML для друку й PDF", () => {
  it("суми всіх позицій у документі немає", () => {
    const html = norm(renderCommercialDocumentHtml(doc([section(threeProducts)])));
    expect(html).not.toContain("Разом");
    expect(html).not.toContain("40 624");
    // Замість підсумку стоїть заклик назвати позиції. Пояснення «спільного
    // підсумку немає» лишилось у ноті про тиражі, а не в кінцівці: власник
    // 22.09.2026 просив у кінцівці рівно одне речення.
    expect(html).toContain("Рухаємося далі?");
    expect(html).toContain("які позиції вам сподобались");
  });

  it("ціна кожного тиражу лишається — зникає лише спільний підсумок", () => {
    const html = norm(renderCommercialDocumentHtml(doc([section(withRunChoice)])));
    expect(html).toContain("10 000 грн");
    expect(html).toContain("18 000 грн");
    expect(html).not.toContain("від 10 000 грн до 18 000 грн");
    expect(html).toContain("Тиражі взаємовиключні");
  });

  it("позиція без фото отримує плитку з ініціалами, а не порожній квадрат", () => {
    const html = norm(renderCommercialDocumentHtml(doc([section(threeProducts)])));
    expect(html).toContain("photo-initials");
  });
});

const flat = (rows: ReturnType<typeof buildCommercialSheetRows>) =>
  rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")).join("\n");

describe("вихід 4 — аркуш для Excel", () => {
  it("рядків із підсумком немає — ні по прорахунку, ні загального", () => {
    const sheet = flat(buildCommercialSheetRows(doc([section(threeProducts)])));
    expect(sheet).not.toContain("Загальна сума");
    expect(sheet).not.toContain("Разом по прорахунку");
  });

  it("кілька тиражів — ціни на місці, пояснення в кінці", () => {
    const sheet = flat(buildCommercialSheetRows(doc([section(withRunChoice)])));
    expect(sheet).not.toContain("Загальна сума");
    expect(sheet).toContain("взаємовиключні");
  });

  /**
   * ЧИСЛО, А НЕ ТЕКСТ. Доки це був TSV, кількість і ціна їхали вже
   * відформатованими («17 276,1» з нерозривним пробілом), і Excel приймав їх за
   * текст: замовник не міг ні підсумувати, ні відсортувати стовпчик.
   */
  it("кількість, ціна й сума лишаються числами", () => {
    const rows = buildCommercialSheetRows(doc([section(threeProducts)]));
    const first = rows.find((row) => row[0] === 1) ?? [];
    expect(typeof first[6]).toBe("number");
    expect(typeof first[8]).toBe("number");
    expect(first[9]).toBe(10_000);
  });

  /**
   * Порядок колонок — це чужі шаблони й формули в Excel: вони рахують позиції
   * зліва, і зсув «Суми» мовчки зіпсував би їх усі. «Роль» була дванадцятою й
   * ОСТАННЬОЮ, тому її зникнення нічого не зсунуло.
   */
  it("колонки стоять на своїх місцях, «Сума» — десята", () => {
    expect([...COMMERCIAL_SHEET_COLUMNS]).toEqual([
      "№",
      "Товар",
      "Опис",
      "Категорія/модель",
      "Місце/розмір",
      "Нанесення",
      "К-сть",
      "Од.",
      "Ціна",
      "Сума",
      "Фото URL",
    ]);
    const rows = buildCommercialSheetRows(doc([section(threeProducts)]));
    const first = rows.find((row) => row[0] === 1) ?? [];
    expect(first).toHaveLength(11);
    expect(first[9]).toBe(10_000);
  });
});

/**
 * Роль «варіант» прибрана цілком. Слідів у неї було чотири в трьох різних
 * місцях коду, і повертались би вони поодинці — пігулку в рядку легко додати
 * назад, не згадавши про колонку в Excel. Один тест на всі виходи одразу.
 */
describe("роль «варіант» не лишила слідів", () => {
  /**
   * Сторож стереже СЛІДИ РОЛІ, а не саме слово.
   *
   * До 22.09.2026 він забороняв у виходах будь-яке «варіант» — і спіткнувся об
   * вступний абзац пропозиції («підібрали варіанти під ваш запит»), де це
   * звичайне слово, а не позначка. Заборона на слово стерегла б і від нього, а
   * писати документ замовнику в обхід словника — надто дорога плата за тест.
   *
   * Тому нижче перелічені рівно ті рядки, якими роль себе показувала: пігулка
   * «Варіант» у рядку позиції, пояснення про цю позначку, підказка про обраний
   * варіант і остання колонка «Роль» в Excel.
   */
  const ROLE_TRACES = ["«Варіант»", "Позиції з позначкою", "обраного варіанта"];

  it("жоден вихід не згадує ролі", () => {
    const withEverything = doc([section([...threeProducts, ...withRunChoice])]);
    const html = norm(renderCommercialDocumentHtml(withEverything));
    const rows = buildCommercialSheetRows(withEverything);

    for (const output of [html, flat(rows)]) {
      for (const trace of ROLE_TRACES) expect(norm(output)).not.toContain(trace);
    }

    // Пігулка й колонка — не фрази, а окремі значення: у розмітці це підпис
    // елемента, в аркуші — ціла клітинка.
    expect(html).not.toContain(">Варіант<");
    expect(rows.some((row) => row.some((cell) => cell === "Варіант"))).toBe(false);
    expect(COMMERCIAL_SHEET_COLUMNS).not.toContain("Роль");
  });
});

/**
 * Мітка постачальника в назві — це наша внутрішня приписка, і замовнику вона
 * ні про що (власник, 21.09.2026). Тест стоїть на ОБОХ кінцях: що хвіст
 * зникає і що назва без хвоста лишається недоторканою — правило працює на
 * тексті, який бачить клієнт, і зіпсована назва дорожча за зайве слово.
 */
describe("мітка постачальника в назві", () => {
  it("хвіст «ТМ <бренд>» зникає — і кирилицею теж", () => {
    // `\b` у JS рахує лише латиницю, тож кириличне «ТМ» колись проходило повз.
    expect(stripSupplierTag("Ручка кулькова металева Simple, TM Totobi")).toBe(
      "Ручка кулькова металева Simple"
    );
    expect(stripSupplierTag("Горнятко керамічне Bonni, ТМ Discover")).toBe("Горнятко керамічне Bonni");
    expect(stripSupplierTag("Ніж Driver 3в1,TM Discover")).toBe("Ніж Driver 3в1");
    expect(stripSupplierTag("Записна книжка 'Туксон' А5 кольоровий зріз Mem'O! ТМ")).toBe(
      "Записна книжка 'Туксон' А5 кольоровий зріз Mem'O!"
    );
  });

  it("назву без мітки не чіпає", () => {
    for (const name of [
      "Бавовняний шопер з бузковими ручками для покупок",
      "Футболка ST7000 Lux for men & women",
      "Фліс ka911 FALCO - FULL ZIP MICROFLEECE JACKET",
      "KATRINA, Сублімаційне горнятко, 450 мл",
    ]) {
      expect(stripSupplierTag(name)).toBe(name);
    }
  });
});

/**
 * Гроші в документі для замовника: копійки або є обидві, або їх немає зовсім.
 * Одна цифра після коми читається як обрізана сума.
 */
describe("формат грошей", () => {
  it("ціле число — без копійок", () => {
    expect(norm(formatMoney(24_290))).toBe("24 290 грн");
  });

  it("дробове — рівно дві цифри, а не одна", () => {
    expect(norm(formatMoney(17_276.1))).toBe("17 276,10 грн");
  });

  it("двійковий хвіст не породжує «,00»", () => {
    expect(norm(formatMoney(50 * 309.04))).toBe("15 452 грн");
  });
});

/**
 * Назва клієнта в шапці й у назві файлу. Випадки — справжні назви з карток
 * клієнтів, на яких правило й складалось (REQ-178#p41).
 */
describe("назва клієнта для клієнта", () => {
  it.each([
    ['ПРАТ "НОВІ ІНЖИНІРИНГОВІ ТЕХНОЛОГІЇ" (HYATT)', "Hyatt"],
    ['ТОВ "ВИГІДНА ПОКУПКА" (АВРОРА)', "Аврора"],
    ['ТОВ "КЛЕВЕР СТОРС" (сімі сім)', "Клевер Сторс"],
    ["Золабікс (ветеринарна лабораторія) ФОП Чухвицька Соломія Олегівна", "Золабікс"],
    ['БЛАГОДІЙНА ОРГАНІЗАЦІЯ "ФОНД РІНАТА АХМЕТОВА"', "Фонд Ріната Ахметова"],
    ["ГО «ЕДЖ»/ NGO «EDGE»", "ЕДЖ"],
    ["ЧЕКБОКС /Checkbox", "Чекбокс"],
    ["ФК «ЛОКОМОТИВ Київ»", "ФК Локомотив Київ"],
    ["ТОВ ВКФ ВВ", "ВКФ ВВ"],
    ["ТОВ АРКАДА-ПЛАСТ", "Аркада-Пласт"],
    ["Алвіва (КиївХліб)", "Алвіва (КиївХліб)"],
    ["ДАХ-сервіс", "ДАХ-сервіс"],
    ["Шевченко Даниїл Костянтинович", "Шевченко Даниїл Костянтинович"],
    ["people force", "People force"],
    ["Сервіс 24/7", "Сервіс 24/7"],
  ])("«%s» → «%s»", (raw, expected) => {
    expect(cleanCustomerName(raw)).toBe(expected);
  });

  it("порожня або беззмістовна назва — порожній рядок", () => {
    for (const raw of ["", "  ", ".", "..", "А.Т.", null, undefined]) {
      expect(cleanCustomerName(raw)).toBe("");
    }
  });

  it("повторне чищення нічого не міняє", () => {
    for (const raw of ['ПРАТ "НОВІ ІНЖИНІРИНГОВІ ТЕХНОЛОГІЇ" (HYATT)', "ТОВ ВКФ ВВ", "ФК «ЛОКОМОТИВ Київ»"]) {
      const once = cleanCustomerName(raw);
      expect(cleanCustomerName(once)).toBe(once);
    }
  });
});

describe("назва файлу КП", () => {
  const forCustomer = (customerName: string) => ({ ...doc([section(threeProducts)]), customerName });

  it("ToSho, клієнт і номер прорахунку — у PDF і в Excel однаково", () => {
    expect(getCommercialDocFilename(forCustomer("Hyatt"), "pdf")).toBe("ToSho — КП для Hyatt · TS-0926-0022.pdf");
    expect(getCommercialDocFilename(forCustomer("Hyatt"), "xlsx")).toBe("ToSho — КП для Hyatt · TS-0926-0022.xlsx");
  });

  it("без клієнта — без «для»", () => {
    expect(getCommercialDocName(forCustomer(""))).toBe("ToSho — КП · TS-0926-0022");
  });

  it("кілька прорахунків — перший номер і скільки ще", () => {
    const pair = {
      ...doc([section(threeProducts), { ...section(threeProducts), quoteId: "q2", quoteNumber: "TS-0926-0023" }]),
      customerName: "Hyatt",
    };
    expect(getCommercialDocName(pair)).toBe("ToSho — КП для Hyatt · TS-0926-0022 +1");
  });

  it("довгий клієнт обрізається по слову", () => {
    expect(getCommercialDocName(forCustomer("PAH Polish Humanitarian Action Ukraine Mission Office"))).toBe(
      "ToSho — КП для PAH Polish Humanitarian Action Ukraine · TS-0926-0022"
    );
  });

  it("знаки, заборонені в назвах файлів, стають пробілами", () => {
    expect(getCommercialDocName(forCustomer('Сервіс 24/7: "Швидко"?'))).toBe(
      "ToSho — КП для Сервіс 24 7 Швидко · TS-0926-0022"
    );
  });

  it("та сама назва — у заголовку HTML, а без клієнта рядка «для …» немає", () => {
    expect(renderCommercialDocumentHtml(forCustomer("Hyatt"))).toContain(
      "<title>ToSho — КП для Hyatt · TS-0926-0022</title>"
    );
    expect(renderCommercialDocumentHtml(forCustomer("Hyatt"))).toContain(">для Hyatt</div>");
    expect(renderCommercialDocumentHtml(forCustomer(""))).not.toContain('class="lede-sub"');
    expect(buildCommercialSheetRows(forCustomer("")).some((row) => row[0] === "Замовник")).toBe(false);
  });
});

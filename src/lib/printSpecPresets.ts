import type { PrintSpecDefaultRule, PrintSpecPreset } from "@/lib/printSpec";

/**
 * Описи видів поліграфії — самі дані; механізм, що їх читає, у `printSpec.ts`.
 *
 * Розділені 01.10.2026 (REQ-323#p4): у файл переїхали пакет, блокнот і блоки для
 * записів зі старого конфігуратора, і разом із механізмом він переріс би 2 000
 * рядків. Опис виду міняється за словами тих, хто прораховує, а механізм — за
 * рішеннями про форму; правки одного тепер не губляться в іншому.
 */

// ---------------------------------------------------------------------------
// Квартальний календар
// ---------------------------------------------------------------------------

/**
 * Джерело — список Татьяни від 11.08, а не файл специфікацій.
 *
 * Файл і список розійшлися: у файлі розмір сітки був вибором із трьох готових
 * (297×140/160/180), колір пружини — списком із чотирьох, і були кашировка,
 * кількість блоків сітки, віконце-бігунок та індивідуальний пакет. У списку тих,
 * хто прораховує, розмір і колір — вільні поля, а решти пунктів немає. Правдиве
 * джерело — другий: файл писали для замовника, а заповнювати це людям.
 *
 * Матеріал і метод друку свідомо БЕЗ обмежень і без правила за тиражем: «цей пункт
 * треба лишити за меною і Оленою». Правило, яке нам давали раніше («до 100 шт
 * цифровий друк на крейді 350»), виявилось неможливим — цифра 350 не друкує.
 */
export const PRINT_SPEC_CALENDAR_QUARTERLY: PrintSpecPreset = {
  key: "print_calendar_quarterly",
  label: "Квартальний календар",
  sections: ["Основи", "Календарна сітка", "Матеріал і друк", "Кріплення"],
  columns: [
    { title: "Основи", sections: ["Основи", "Матеріал і друк"] },
    { title: "Календарна сітка", sections: ["Календарна сітка"] },
    { title: "Кріплення", sections: ["Кріплення"] },
  ],
  summary: ["baseSizes", "material", "printMethod", "mount"],
  fields: [
    {
      id: "baseSizes",
      label: "Розміри",
      type: "sizeRows",
      section: "Основи",
      rows: ["Основа 1", "Основа 2", "Основа 3", "Топер"],
      unit: "мм",
      hint: "Топер — верхня рекламна частина квартального календаря.",
    },
    {
      id: "basePrint",
      label: "Друк основ",
      type: "single",
      section: "Основи",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "pantone", label: "Пантони" },
      ],
      allowCustom: true,
    },
    {
      id: "basePantoneCount",
      label: "Кількість пантонів",
      type: "number",
      section: "Основи",
      unit: "шт",
      showIf: { field: "basePrint", equals: "pantone" },
    },
    {
      id: "baseFinishing",
      label: "Оздоблення основ",
      type: "multi",
      section: "Основи",
      options: [
        { value: "lamination", label: "Ламінація" },
        { value: "varnish", label: "Лак" },
      ],
      hint: "Можна обидва разом",
    },
    {
      id: "gridSize",
      label: "Розмір сітки",
      type: "sizeRows",
      section: "Календарна сітка",
      rows: ["Сітка"],
      unit: "мм",
    },
    {
      id: "gridPaperDensity",
      label: "Щільність паперу",
      type: "single",
      section: "Календарна сітка",
      options: [
        { value: "90", label: "90 г/м²" },
        { value: "115", label: "115 г/м²" },
        { value: "130", label: "130 г/м²" },
      ],
      allowCustom: true,
    },
    {
      id: "gridPrint",
      label: "Друк сітки",
      type: "single",
      section: "Календарна сітка",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "2_0", label: "2+0" },
        { value: "3_0", label: "3+0" },
        { value: "pantone", label: "Пантони" },
      ],
      allowCustom: true,
    },
    {
      id: "gridPantoneCount",
      label: "Кількість пантонів",
      type: "number",
      section: "Календарна сітка",
      unit: "шт",
      showIf: { field: "gridPrint", equals: "pantone" },
    },
    {
      id: "material",
      label: "Матеріал",
      type: "single",
      section: "Матеріал і друк",
      options: [
        { value: "coated_350", label: "Крейда 350 г" },
        { value: "cardboard_350", label: "Картон односторонній 350 г" },
      ],
      allowCustom: true,
      hint: "Вибір за тим, хто прораховує — обмежень немає",
    },
    {
      id: "printMethod",
      label: "Метод друку",
      type: "single",
      section: "Матеріал і друк",
      options: [
        { value: "offset", label: "Офсетний" },
        { value: "digital", label: "Цифровий" },
      ],
      allowCustom: true,
    },
    {
      id: "spring",
      label: "Колір пружини",
      type: "single",
      section: "Кріплення",
      options: [
        { value: "black", label: "Чорна" },
        { value: "white", label: "Біла" },
      ],
      allowCustom: true,
    },
    {
      id: "mount",
      label: "Кріплення",
      type: "single",
      section: "Кріплення",
      options: [
        { value: "eyelet", label: "Люверс" },
        { value: "plastic_bar", label: "Планка пластикова" },
      ],
    },
    {
      id: "eyeletColor",
      label: "Колір люверса",
      type: "text",
      section: "Кріплення",
      showIf: { field: "mount", equals: "eyelet" },
    },
  ],
};

// ---------------------------------------------------------------------------
// Перекидний календар
// ---------------------------------------------------------------------------

/**
 * Джерело — файл специфікацій CEO. Списку від тих, хто прораховує, ще немає:
 * Татьяна пообіцяла «решту зроблю інакше». Тому поля тут — те, що замовлено, а
 * не те, що звірене; після її правок цей опис зміниться, і саме тому він опис, а
 * не 260 рядків JSX.
 *
 * «Індивідуальний пакет» — галочка, а не окрема позиція прорахунку (CEO, 11.08).
 */
export const PRINT_SPEC_CALENDAR_FLIP: PrintSpecPreset = {
  key: "print_calendar_flip",
  label: "Перекидний календар",
  sections: ["Формат", "Обкладинка і підложка", "Блок", "Оздоблення", "Кріплення"],
  columns: [
    { title: "Обкладинка й підложка", sections: ["Формат", "Обкладинка і підложка"] },
    { title: "Блок", sections: ["Блок"] },
    { title: "Оздоблення й кріплення", sections: ["Оздоблення", "Кріплення"] },
  ],
  summary: ["format", "blockPages", "coverPaper", "blockPrint"],
  fields: [
    {
      id: "format",
      label: "Формат",
      type: "single",
      section: "Формат",
      options: [
        { value: "a2", label: "А2" },
        { value: "a3", label: "А3" },
        { value: "a4", label: "А4" },
      ],
      allowCustom: true,
    },
    {
      id: "orientation",
      label: "Орієнтація",
      type: "single",
      section: "Формат",
      options: [
        { value: "horizontal", label: "Горизонтальний" },
        { value: "vertical", label: "Вертикальний" },
      ],
    },
    {
      id: "coverPrint",
      label: "Друк обкладинки",
      type: "single",
      section: "Обкладинка і підложка",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
      ],
      allowCustom: true,
    },
    {
      id: "coverPaper",
      label: "Папір обкладинки",
      type: "single",
      section: "Обкладинка і підложка",
      options: [
        { value: "250", label: "250 г" },
        { value: "300", label: "300 г" },
        { value: "350", label: "350 г" },
      ],
      allowCustom: true,
    },
    {
      id: "backingPrint",
      label: "Друк підложки",
      type: "single",
      section: "Обкладинка і підложка",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
      ],
      allowCustom: true,
    },
    {
      id: "blockPages",
      label: "Сторінок у блоці",
      type: "single",
      section: "Блок",
      options: [
        { value: "12", label: "12 стор" },
        { value: "24", label: "24 стор" },
      ],
      allowCustom: true,
    },
    {
      id: "blockPrint",
      label: "Друк блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
      ],
      allowCustom: true,
    },
    { id: "blockPaper", label: "Папір блоку", type: "text", section: "Блок" },
    {
      id: "laminationType",
      label: "Ламінація",
      type: "single",
      section: "Оздоблення",
      options: [
        { value: "matte", label: "Мат" },
        { value: "gloss", label: "Глянець" },
        { value: "none", label: "Без ламінації" },
      ],
      allowCustom: true,
    },
    {
      id: "laminationWhere",
      label: "Де ламінація",
      type: "multi",
      section: "Оздоблення",
      options: [
        { value: "block", label: "Блок" },
        { value: "cover", label: "Обкладинка" },
      ],
      hint: "Можна обидва разом",
    },
    {
      id: "laminationSides",
      label: "Схема ламінації",
      type: "single",
      section: "Оздоблення",
      options: [
        { value: "1_0", label: "1+0" },
        { value: "1_1", label: "1+1" },
      ],
    },
    {
      id: "varnishType",
      label: "Лак",
      type: "single",
      section: "Оздоблення",
      options: [
        { value: "none", label: "Немає" },
        { value: "spot", label: "Вибірковий лак" },
        { value: "hybrid", label: "Гібрид" },
      ],
    },
    {
      id: "varnishSides",
      label: "Схема лаку",
      type: "single",
      section: "Оздоблення",
      options: [
        { value: "1_0", label: "1+0" },
        { value: "1_1", label: "1+1" },
      ],
      showIf: { field: "varnishType", equals: "spot" },
    },
    {
      id: "spring",
      label: "Колір пружини",
      type: "single",
      section: "Кріплення",
      options: [
        { value: "black", label: "Чорна" },
        { value: "white", label: "Біла" },
        { value: "metal", label: "Метал" },
        { value: "bronze", label: "Бронза (золото)" },
      ],
      allowCustom: true,
    },
    {
      id: "springSide",
      label: "Сторона пружини",
      type: "single",
      section: "Кріплення",
      options: [
        { value: "short", label: "По короткій стороні" },
        { value: "long", label: "По довгій стороні" },
      ],
    },
    {
      id: "individualBag",
      label: "Індивідуальний пакет",
      type: "multi",
      section: "Кріплення",
      options: [{ value: "yes", label: "Потрібен" }],
    },
  ],
};

// ---------------------------------------------------------------------------
// Календар-хатинка
// ---------------------------------------------------------------------------

/** Джерело — файл CEO, як і в перекидного. Розмір виробу фіксований: 210×150×70 мм. */
export const PRINT_SPEC_CALENDAR_HOUSE: PrintSpecPreset = {
  key: "print_calendar_house",
  label: "Календар-хатинка",
  sections: ["Основа", "Блок", "Кріплення"],
  columns: [
    { title: "Основа", sections: ["Основа"] },
    { title: "Блок", sections: ["Блок"] },
    { title: "Кріплення", sections: ["Кріплення"] },
  ],
  summary: ["gridSize", "sheets", "blockPaper", "blockPrint"],
  fields: [
    {
      id: "cashing",
      label: "Кашировка",
      type: "single",
      section: "Основа",
      options: [
        { value: "with", label: "З кашировкою" },
        { value: "without", label: "Без кашировки" },
      ],
      hint: "Обклеювання картонної основи надрукованим папером.",
    },
    {
      id: "basePrint",
      label: "Друк основи",
      type: "single",
      section: "Основа",
      options: [{ value: "4_0", label: "4+0" }],
      allowCustom: true,
    },
    {
      id: "baseLamination",
      label: "Ламінація основи",
      type: "single",
      section: "Основа",
      options: [
        { value: "none", label: "Відсутня" },
        { value: "matte", label: "Матова" },
        { value: "gloss", label: "Глянець" },
      ],
      allowCustom: true,
    },
    {
      id: "gridSize",
      label: "Розмір блоку",
      type: "sizeRows",
      section: "Блок",
      rows: ["Сітка"],
      unit: "мм",
      hint: "Типово 210 × 120",
      defaults: [{ value: [{ width: "210", height: "120" }] }],
    },
    {
      id: "blockPrint",
      label: "Друк блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
      ],
    },
    {
      id: "sheets",
      label: "Сторінок з обкладинкою",
      type: "single",
      section: "Блок",
      options: [
        { value: "7", label: "7 арк = 14 стор" },
        { value: "13", label: "13 арк = 26 стор" },
      ],
      allowCustom: true,
    },
    {
      id: "blockPaper",
      label: "Папір блоку",
      type: "single",
      section: "Блок",
      options: [{ value: "250", label: "250 г" }],
      allowCustom: true,
    },
    {
      id: "blockLamination",
      label: "Ламінація блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "none", label: "Відсутня" },
        { value: "matte", label: "Матова" },
        { value: "gloss", label: "Глянець" },
      ],
    },
    {
      id: "blockLaminationSides",
      label: "Схема ламінації блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "1_0", label: "1+0" },
        { value: "1_1", label: "1+1" },
      ],
    },
    {
      id: "spring",
      label: "Колір пружини",
      type: "single",
      section: "Кріплення",
      options: [
        { value: "black", label: "Чорна" },
        { value: "white", label: "Біла" },
        { value: "metal", label: "Метал" },
        { value: "bronze", label: "Бронза (золото)" },
      ],
      allowCustom: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Брошура
// ---------------------------------------------------------------------------

/** Джерело — файл CEO. Колір пружини питаємо лише тоді, коли скріплення пружиною. */
export const PRINT_SPEC_BROCHURE: PrintSpecPreset = {
  key: "print_brochure",
  label: "Брошура",
  sections: ["Обкладинка", "Блок", "Скріплення"],
  columns: [
    { title: "Обкладинка", sections: ["Обкладинка"] },
    { title: "Блок", sections: ["Блок"] },
    { title: "Скріплення", sections: ["Скріплення"] },
  ],
  summary: ["format", "pageCount", "coverPaper", "binding"],
  fields: [
    {
      id: "format",
      label: "Формат (Ш×В)",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "a6", label: "А6" },
        { value: "a5", label: "А5" },
        { value: "a4", label: "А4" },
      ],
      allowCustom: true,
    },
    {
      id: "pageCount",
      label: "Сторінок + обкладинка",
      type: "number",
      section: "Блок",
      unit: "стор",
      // Підказка, а не заборона: правило виробниче, і хто рахує — той його знає.
      // Жорстку перевірку сюди не ставимо з тієї ж причини, що й правило за
      // тиражем: рахують люди, і виняток буває раніше, ніж ми його передбачимо.
      hint: "Термобіндер, пур клей, пружина — кратно 2. Нитка — кратно 2 або 4. Дві скоби — тільки кратно 4. Обкладинка — це ще 4 стор.",
      warnings: [
        { when: { field: "binding", equals: "staples_2" }, multipleOf: 4, message: "Дві скоби — тільки кратно 4" },
        {
          when: { field: "binding", oneOf: ["thermo", "pur", "spring", "thread"] },
          multipleOf: 2,
          message: "Термобіндер, ПУР клей, пружина, нитка — кратно 2",
        },
      ],
    },
    {
      id: "coverPaper",
      label: "Папір обкладинки",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "coated_200", label: "Крейда 200 г/м²" },
        { value: "coated_250", label: "Крейда 250 г/м²" },
        { value: "coated_300", label: "Крейда 300 г/м²" },
        { value: "coated_350", label: "Крейда 350 г/м²" },
      ],
      allowCustom: true,
      hint: "Дизайнерський картон — «Інше» і вписати назву та щільність",
    },
    {
      id: "blockPaper",
      label: "Папір блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "coated_90", label: "Крейда 90 г/м²" },
        { value: "coated_115", label: "Крейда 115 г/м²" },
        { value: "coated_130", label: "Крейда 130 г/м²" },
        { value: "coated_150", label: "Крейда 150 г/м²" },
        { value: "coated_170", label: "Крейда 170 г/м²" },
        { value: "coated_200", label: "Крейда 200 г/м²" },
        { value: "offset_80", label: "Офсет 80 г/м²" },
        { value: "offset_90", label: "Офсет 90 г/м²" },
        { value: "offset_100", label: "Офсет 100 г/м²" },
        { value: "offset_110", label: "Офсет 110 г/м²" },
      ],
      allowCustom: true,
      hint: "Дизайнерський папір — «Інше» і вписати назву та щільність",
    },
    {
      id: "coverPrint",
      label: "Друк обкладинки",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
      ],
      allowCustom: true,
    },
    {
      id: "blockPrint",
      label: "Друк блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
      ],
      allowCustom: true,
    },
    {
      id: "lamination",
      label: "Ламінація",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "none", label: "Без ламінації" },
        { value: "matte", label: "Мат" },
        { value: "gloss", label: "Глянець" },
      ],
      allowCustom: true,
    },
    {
      id: "binding",
      label: "Метод скріплення",
      type: "single",
      section: "Скріплення",
      options: [
        { value: "staples_2", label: "2 скоби" },
        { value: "thermo", label: "Термобіндер" },
        { value: "thread", label: "Нитка" },
        { value: "pur", label: "ПУР клей" },
        { value: "spring", label: "Пружина металева" },
      ],
      allowCustom: true,
    },
    {
      id: "spring",
      label: "Колір пружини",
      type: "single",
      section: "Скріплення",
      options: [
        { value: "black", label: "Чорна" },
        { value: "white", label: "Біла" },
        { value: "metal", label: "Метал" },
        { value: "bronze", label: "Бронза (золото)" },
      ],
      allowCustom: true,
      showIf: { field: "binding", equals: "spring" },
    },
  ],
};

// ---------------------------------------------------------------------------
// Листівка
// ---------------------------------------------------------------------------

/**
 * Джерело — файл CEO, і він на цьому виді ОБРИВАЄТЬСЯ: після «Пакування по»
 * тексту немає. Артем 11.08: «листівки ще не до кінця, їх доповнюватимуть,
 * робимо з тим, що є». Тому пакування тут поки немає взагалі.
 *
 * «Ламінація від 170 г» лишається підказкою, а не правилом: рішення про матеріал
 * узгоджено віддати тим, хто прораховує.
 */
/** Ламінація від 170 г: на тоншому папері «Мат» і «Глянець» вимкнені. */
const FLYER_THIN_PAPER = {
  disabledWhen: { field: "paper", oneOf: ["90", "115", "130", "150"] },
  reason: "Доступна від 170 г",
};

export const PRINT_SPEC_FLYER: PrintSpecPreset = {
  key: "print_flyer",
  label: "Листівка",
  sections: ["Формат", "Папір"],
  columns: [
    { title: "Аркуш", sections: ["Формат", "Папір"] },
  ],
  summary: ["format", "paper", "lamination"],
  fields: [
    {
      id: "format",
      label: "Формат",
      type: "single",
      section: "Формат",
      options: [
        { value: "flyer", label: "Флаєр 99×210 мм" },
        { value: "a6", label: "А6 (105×148)" },
        { value: "a5", label: "А5 (148×210)" },
        { value: "a4", label: "А4 (210×297)" },
        { value: "a3", label: "А3 (297×420)" },
      ],
      allowCustom: true,
    },
    {
      id: "paper",
      label: "Папір (крейда)",
      type: "single",
      section: "Папір",
      options: [
        { value: "90", label: "90 г" },
        { value: "115", label: "115 г" },
        { value: "130", label: "130 г" },
        { value: "150", label: "150 г" },
        { value: "170", label: "170 г" },
        { value: "200", label: "200 г" },
        { value: "250", label: "250 г" },
        { value: "300", label: "300 г" },
        { value: "350", label: "350 г" },
      ],
      allowCustom: true,
    },
    {
      id: "lamination",
      label: "Ламінація",
      type: "single",
      section: "Папір",
      options: [
        { value: "none", label: "Без ламінації" },
        { value: "matte", label: "Мат", ...FLYER_THIN_PAPER },
        { value: "gloss", label: "Глянець", ...FLYER_THIN_PAPER },
      ],
      hint: "Доступна від 170 г",
    },
  ],
};

// ---------------------------------------------------------------------------
// Сертифікат
// ---------------------------------------------------------------------------

/**
 * Перенесення старого пресета `print_certificates` на опис полями.
 *
 * Значення й підписи взяті один-в-один із `printPackage.ts` і
 * `PrintPackageConfigurator.tsx` — нічого не вигадано. Сенс переносу: старий
 * механізм заповнюється ОДИН раз, при створенні прорахунку, і на картці лише
 * читається. Той, хто рахує, не міг ні дозаповнити, ні виправити — а саме він і
 * заповнює параметри. Опис дає сертифікату те саме, що календарям: поля у вікні
 * створення і правки на картці.
 *
 * Перенести було безпечно: за весь час сертифікатом не скористались ані разу
 * (0 позицій), тож збереженого формату, який треба тягнути, просто немає.
 *
 * Дві свідомі спрощення проти старого:
 * — кольоровість одним списком із восьми схем замість двох списків, залежних від
 *   методу друку: умова показу тут однорівнева, а ділити список означало б
 *   ховати від людини те, що вона може захотіти;
 * — «вибірковий лак / фольгування / висічка / біговка» стали одним полем із
 *   галочками замість чотирьох «так/ні»: у старому вигляді це чотири рядки,
 *   у яких три завжди «ні».
 */
export const PRINT_SPEC_CERTIFICATE: PrintSpecPreset = {
  key: "print_certificate",
  label: "Сертифікат",
  sections: ["Формат", "Матеріал", "Друк", "Оздоблення"],
  columns: [
    { title: "Аркуш", sections: ["Формат", "Матеріал"] },
    { title: "Друк", sections: ["Друк"] },
    { title: "Оздоблення", sections: ["Оздоблення"] },
  ],
  summary: ["formatType", "material", "printMethod", "embossing"],
  fields: [
    {
      id: "formatType",
      label: "Формат",
      type: "single",
      section: "Формат",
      options: [
        { value: "standard", label: "Стандартний" },
        { value: "custom", label: "Нестандартний" },
      ],
    },
    {
      id: "standardFormat",
      label: "Стандартний формат",
      type: "single",
      section: "Формат",
      options: [
        { value: "a4", label: "A4" },
        { value: "a5", label: "A5" },
        { value: "a6", label: "A6" },
      ],
      allowCustom: true,
      showIf: { field: "formatType", equals: "standard" },
    },
    {
      id: "customSize",
      label: "Розмір",
      type: "sizeRows",
      section: "Формат",
      rows: ["Сертифікат"],
      unit: "мм",
      showIf: { field: "formatType", equals: "custom" },
    },
    {
      id: "material",
      label: "Матеріал",
      type: "single",
      section: "Матеріал",
      options: [
        { value: "coated_paper", label: "Крейдований папір" },
        { value: "cardboard", label: "Картон" },
        { value: "designer_cardboard", label: "Дизайнерський картон" },
      ],
      allowCustom: true,
    },
    {
      id: "coatedDensity",
      label: "Щільність",
      type: "single",
      section: "Матеріал",
      options: [
        { value: "300", label: "300 г/м²" },
        { value: "350", label: "350 г/м²" },
      ],
      allowCustom: true,
      showIf: { field: "material", equals: "coated_paper" },
    },
    {
      id: "cardboardDensity",
      label: "Щільність картону",
      type: "number",
      section: "Матеріал",
      unit: "г/м²",
      showIf: { field: "material", equals: "cardboard" },
    },
    {
      id: "designerName",
      label: "Назва картону",
      type: "text",
      section: "Матеріал",
      showIf: { field: "material", equals: "designer_cardboard" },
    },
    {
      id: "designerDensity",
      label: "Щільність картону",
      type: "number",
      section: "Матеріал",
      unit: "г/м²",
      showIf: { field: "material", equals: "designer_cardboard" },
    },
    {
      id: "printMethod",
      label: "Метод друку",
      type: "single",
      section: "Друк",
      options: [
        { value: "digital", label: "Цифровий (CMYK)" },
        { value: "uv", label: "УФ друк" },
        { value: "screen", label: "Шовкодрук" },
      ],
      allowCustom: true,
    },
    {
      id: "printScheme",
      label: "Кольоровість",
      type: "single",
      section: "Друк",
      options: [
        { value: "1_0", label: "1+0" },
        { value: "1_1", label: "1+1" },
        { value: "2_0", label: "2+0" },
        { value: "2_2", label: "2+2" },
        { value: "3_0", label: "3+0" },
        { value: "3_3", label: "3+3" },
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
      ],
      allowCustom: true,
      hint: "У цифрі зазвичай 4+0 або 4+4",
    },
    {
      id: "embossing",
      label: "Тиснення",
      type: "single",
      section: "Оздоблення",
      options: [
        { value: "none", label: "Немає" },
        { value: "blind", label: "Сліпе тиснення" },
        { value: "foil", label: "Тиснення фольгою" },
      ],
    },
    {
      id: "embossingFoilColor",
      label: "Колір фольги",
      type: "text",
      section: "Оздоблення",
      showIf: { field: "embossing", equals: "foil" },
    },
    {
      id: "embossingSize",
      label: "Розмір тиснення",
      type: "sizeRows",
      section: "Оздоблення",
      rows: ["Тиснення"],
      unit: "мм",
      hint: "Якщо тиснення є",
    },
    {
      id: "finishing",
      label: "Додаткове оздоблення",
      type: "multi",
      section: "Оздоблення",
      options: [
        { value: "spot_uv", label: "Вибірковий лак" },
        { value: "foiling", label: "Фольгування" },
        { value: "die_cutting", label: "Висічка" },
        { value: "creasing", label: "Біговка" },
      ],
      hint: "Висічка — вирізання контуру штампом. Біговка — продавлена лінія для рівного згину. Можна кілька разом",
    },
    {
      id: "foilingColor",
      label: "Колір фольгування",
      type: "text",
      section: "Оздоблення",
      showIf: { field: "finishing", includes: "foiling" },
    },
    {
      id: "coverageSides",
      label: "Схема покриття",
      type: "single",
      section: "Оздоблення",
      options: [
        { value: "1_0", label: "1+0" },
        { value: "1_1", label: "1+1" },
      ],
      hint: "Для лаку чи фольгування",
    },
    {
      id: "coveragePercent",
      label: "Площа покриття",
      type: "single",
      section: "Оздоблення",
      options: [
        { value: "20", label: "До 20%" },
        { value: "40", label: "До 40%" },
      ],
      allowCustom: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Щоденник
// ---------------------------------------------------------------------------

/**
 * Джерело — фірмовий паперовий «Чеклист · Щоденники», який менеджери надсилають
 * замовникам, плюс відповіді Тані від 04.09, 07.09 і 11.09 (REQ-36#p14, #p22…#p34).
 *
 * ЧОМУ ЦЕЙ ВИД ПЕРШИЙ: у прорахунках 312 товарних позицій і лише 5 із них
 * поліграфія — не тому, що її не продають, а тому, що для щоденника в CRM немає
 * куди вписати тридцять питань чекліста. Уся розмова про нього йде повз систему.
 *
 * ТРИ МІСЦЯ, ДЕ ОПИС РОЗХОДИТЬСЯ З ПАПЕРОМ, і всі три — за словами Тані:
 *
 * 1. Датування й розліновка — ОДНЕ поле `layout`, а не два. На папері стояли
 *    «Датований / Не датований» і «Клітинка / Лінія» незалежними галочками, і з
 *    них складалась неможлива пара: лінія і клітинка — це блок БЕЗ інфоблоку
 *    («має вигляд як блокнот»), тоді як датований і недатований завжди з ним.
 * 2. Кольоровість стандартного блока не питається взагалі: вона виведена з
 *    макета (2+2 бордовий+сірий, напівдатований 2+2 сірий+синій, лінія і
 *    клітинка 1+1 сірий). Питаємо її лише для індивідуального блока.
 * 3. Форзац і нахзац — одне поле на три значення замість «Стандарт/
 *    Індивідуальний» плюс уточнення: за замовчуванням карти, у лінії, клітинки
 *    й Moleskine — чисті.
 *
 * «Папір з друком» тягне за собою обовʼязкові друк 4+0 і матову ламінацію 1+0:
 * це окреме поле з єдиним варіантом, і воно обирається само (щоб факт потрапив у
 * специфікацію, а не лишився знанням у голові). Поролонова обкладинка лишає тільки
 * резинку під ручку — інші положення вимкнені (`disabledWhen`, REQ-326#p4).
 */

/** Форзац і нахзац: за замовчуванням карти; у лінії, клітинки й Moleskine — чисті. */
const DIARY_ENDPAPER_DEFAULTS: PrintSpecDefaultRule[] = [
  { when: { field: "layout", oneOf: ["line", "grid"] }, value: "plain" },
  { when: { field: "format", equals: "moleskine" }, value: "plain" },
  { value: "maps" },
];

/** Поролонова обкладинка лишає тільки резинку під ручку. */
const ELASTIC_FOAM_LOCK = {
  disabledWhen: { field: "coverFoam", equals: "yes" },
  reason: "З поролоновою обкладинкою можлива лише резинка під ручку",
};
export const PRINT_SPEC_DIARY: PrintSpecPreset = {
  key: "print_diary",
  label: "Щоденник",
  sections: ["Обкладинка", "Блок", "Кути й торець", "Вставки", "Ляссе", "Резинка й шильда", "Решта"],
  columns: [
    { title: "Обкладинка", sections: ["Обкладинка"] },
    { title: "Блок", sections: ["Блок", "Кути й торець"] },
    { title: "Комплектуючі", sections: ["Вставки", "Ляссе", "Резинка й шильда", "Решта"] },
  ],
  summary: ["format", "coverMaterial", "blockPages", "layout"],
  fields: [
    {
      id: "format",
      label: "Формат",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "a5", label: "А5" },
        { value: "a4", label: "А4" },
        { value: "moleskine", label: "Moleskine 130 × 210 мм" },
      ],
      allowCustom: true,
      hint: "Нестандартний — «Інше» й розміри текстом",
    },
    {
      id: "designNeeded",
      label: "Дизайн",
      type: "single",
      section: "Решта",
      options: [
        { value: "by_us", label: "Розробляємо ми" },
        { value: "by_customer", label: "Макет від замовника" },
      ],
    },
    {
      id: "coverType",
      label: "Тип",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "flex", label: "Гнучка" },
        { value: "hard", label: "Тверда" },
        { value: "book", label: "Книжна" },
      ],
    },
    {
      id: "coverFoam",
      label: "Поролон",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "yes", label: "З поролоном" },
        { value: "no", label: "Без поролону" },
      ],
      hint: "М'який шар під обкладинкою.",
    },
    {
      id: "coverMaterial",
      label: "Матеріал",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "leatherette", label: "Шкірзамінник" },
        { value: "printed_paper", label: "Папір з друком" },
        { value: "designer_paper", label: "Дизайнерський папір" },
      ],
      allowCustom: true,
    },
    {
      id: "leatheretteName",
      label: "Шкірзамінник — який саме",
      type: "text",
      section: "Обкладинка",
      showIf: { field: "coverMaterial", equals: "leatherette" },
      hint: "Balacron Nappa, темно-синій",
    },
    {
      id: "leatheretteFinishing",
      label: "Нанесення",
      type: "multi",
      section: "Обкладинка",
      options: [
        { value: "varnish", label: "Лак" },
        { value: "uv_print", label: "УФ друк" },
        { value: "embossing", label: "Тиснення" },
        { value: "screen", label: "Шовкотрафарет" },
      ],
      showIf: { field: "coverMaterial", equals: "leatherette" },
    },
    {
      id: "printedPaperBase",
      label: "Друк і ламінація",
      type: "single",
      section: "Обкладинка",
      options: [{ value: "4_0_matt", label: "4+0 + матова ламінація 1+0" }],
      showIf: { field: "coverMaterial", equals: "printed_paper" },
      hint: "Для паперу з друком це обовʼязково, інших варіантів немає",
    },
    {
      id: "printedPaperFinishing",
      label: "Оздоблення",
      type: "multi",
      section: "Обкладинка",
      options: [
        { value: "foil", label: "Тиснення фольгою" },
        { value: "blind", label: "Сліпе тиснення" },
        { value: "spot_uv", label: "Вибірковий УФ-лак" },
      ],
      showIf: { field: "coverMaterial", equals: "printed_paper" },
    },
    {
      id: "designerPaperName",
      label: "Дизайнерський папір — назва",
      type: "text",
      section: "Обкладинка",
      showIf: { field: "coverMaterial", equals: "designer_paper" },
      hint: "Назву обовʼязково вказати менеджеру",
    },
    {
      id: "designerPaperFinishing",
      label: "Оздоблення",
      type: "multi",
      section: "Обкладинка",
      options: [
        { value: "foil", label: "Тиснення фольгою" },
        { value: "blind", label: "Сліпе тиснення" },
        { value: "uv_print", label: "УФ друк" },
      ],
      showIf: { field: "coverMaterial", equals: "designer_paper" },
      hint: "Дизайнерський папір — без ламінації",
    },
    {
      id: "blockKind",
      label: "Виконання блока",
      type: "single",
      section: "Блок",
      options: [
        { value: "standard", label: "Стандартний" },
        { value: "individual", label: "Індивідуальний" },
      ],
    },
    {
      id: "layout",
      label: "Макет",
      type: "single",
      section: "Блок",
      options: [
        { value: "dated", label: "Датований" },
        { value: "semi_dated", label: "Напівдатований" },
        { value: "undated", label: "Недатований" },
        { value: "line", label: "Лінія" },
        { value: "grid", label: "Клітинка" },
      ],
      hint: "Датований і недатований — 2+2 бордовий+сірий, напівдатований — 2+2 сірий+синій, лінія і клітинка — 1+1 сірий без інфоблоку",
    },
    {
      id: "blockPaperColor",
      label: "Колір паперу",
      type: "single",
      section: "Блок",
      options: [
        { value: "white", label: "Білий" },
        { value: "cream", label: "Кремовий" },
      ],
    },
    {
      id: "blockPages",
      label: "Кількість сторінок",
      type: "number",
      section: "Блок",
      unit: "стор",
      hint: "Стандартно 352, Moleskine — 224. Кратність індивідуального блока: 70 г — 32, 80/90/100 г — 24",
      presets: ["352", "224"],
      defaults: [{ when: { field: "format", equals: "moleskine" }, value: "224" }],
      warnings: [
        { when: { field: "blockKind", equals: "standard" }, multipleOf: 32, message: "70 г — кратно 32" },
        {
          when: [
            { field: "blockKind", equals: "individual" },
            { field: "blockDensity", oneOf: ["80", "90", "100"] },
          ],
          multipleOf: 24,
          message: "80/90/100 г — кратно 24",
        },
      ],
    },
    {
      id: "blockPaper",
      label: "Папір блока",
      type: "single",
      section: "Блок",
      options: [
        { value: "munken_cream", label: "Munken кремовий" },
        { value: "offset_white", label: "Офсет білий" },
      ],
      allowCustom: true,
      showIf: { field: "blockKind", equals: "individual" },
    },
    {
      id: "blockDensity",
      label: "Щільність паперу",
      type: "single",
      section: "Блок",
      options: [
        { value: "80", label: "80 г/м²" },
        { value: "90", label: "90 г/м²" },
        { value: "100", label: "100 г/м²" },
      ],
      allowCustom: true,
      showIf: { field: "blockKind", equals: "individual" },
      hint: "Стандартний блок — 70 г/м²",
    },
    {
      id: "blockPrint",
      label: "Кольоровість друку",
      type: "single",
      section: "Блок",
      options: [
        { value: "1_1", label: "1+1" },
        { value: "2_2", label: "2+2" },
        { value: "3_3", label: "3+3" },
        { value: "4_4", label: "4+4" },
      ],
      allowCustom: true,
      showIf: { field: "blockKind", equals: "individual" },
    },
    {
      id: "corners",
      label: "Кути",
      type: "single",
      section: "Кути й торець",
      options: [
        { value: "round", label: "Заокруглені" },
        { value: "straight", label: "Прямі" },
      ],
    },
    {
      id: "edge",
      label: "Торець",
      type: "single",
      section: "Кути й торець",
      options: [
        { value: "painted", label: "Фарбований" },
        { value: "plain", label: "Не фарбований" },
      ],
      hint: "Зріз блоку, тобто краї сторінок; фарбований — у колір по всьому зрізу.",
    },
    {
      id: "endpaper",
      label: "Форзац",
      type: "single",
      section: "Вставки",
      options: [
        { value: "maps", label: "Карти" },
        { value: "plain", label: "Чисті" },
        { value: "individual", label: "Індивідуальний друк" },
      ],
      allowCustom: true,
      defaults: DIARY_ENDPAPER_DEFAULTS,
      hint: "Аркуш, що скріплює блок із передньою кришкою обкладинки. За замовчуванням карти; у лінії, клітинки й Moleskine — чисті",
    },
    {
      id: "backpaper",
      label: "Нахзац",
      type: "single",
      section: "Вставки",
      options: [
        { value: "maps", label: "Карти" },
        { value: "plain", label: "Чисті" },
        { value: "individual", label: "Індивідуальний друк" },
      ],
      allowCustom: true,
      defaults: DIARY_ENDPAPER_DEFAULTS,
      hint: "Те саме, що форзац, але біля задньої кришки. Те саме правило, що й для форзаца",
    },
    {
      id: "adInserts",
      label: "Рекламні вставки",
      type: "number",
      section: "Вставки",
      unit: "шт",
      hint: "Кратне двом — вставка друкується з двох боків аркуша",
      step: 2,
      warnings: [{ multipleOf: 2, message: "Кратне двом" }],
    },
    {
      id: "ribbon",
      label: "Вид ляссе",
      type: "single",
      section: "Ляссе",
      options: [
        { value: "standard", label: "Стандартне" },
        { value: "individual", label: "Індивідуальне" },
        { value: "none", label: "Без ляссе" },
      ],
      hint: "Стрічка-закладка, вклеєна в корінець блоку.",
    },
    {
      id: "ribbonColorStandard",
      label: "Колір ляссе",
      type: "text",
      section: "Ляссе",
      showIf: { field: "ribbon", equals: "standard" },
      hint: "З наявних",
    },
    {
      id: "ribbonOptions",
      label: "Виконання",
      type: "multi",
      section: "Ляссе",
      options: [
        { value: "branding", label: "Брендування" },
        { value: "single", label: "Одинарне" },
        { value: "double", label: "Подвійне" },
      ],
      showIf: { field: "ribbon", equals: "individual" },
    },
    {
      id: "ribbonWidth",
      label: "Ширина ляссе",
      type: "number",
      section: "Ляссе",
      unit: "мм",
      showIf: { field: "ribbon", equals: "individual" },
    },
    {
      id: "ribbonColor",
      label: "Колір ляссе",
      type: "text",
      section: "Ляссе",
      showIf: { field: "ribbon", equals: "individual" },
      hint: "Pantone або опис",
    },
    {
      id: "elastic",
      label: "Резинка",
      type: "single",
      section: "Резинка й шильда",
      options: [
        { value: "yes", label: "Наявна" },
        { value: "no", label: "Відсутня" },
      ],
    },
    {
      id: "elasticPosition",
      label: "Розташування",
      type: "single",
      section: "Резинка й шильда",
      options: [
        { value: "vertical", label: "Вертикальна", ...ELASTIC_FOAM_LOCK },
        { value: "horizontal", label: "Горизонтальна", ...ELASTIC_FOAM_LOCK },
        { value: "pen_loop", label: "Під ручку" },
      ],
      showIf: { field: "elastic", equals: "yes" },
      hint: "З поролоновою обкладинкою можлива лише резинка під ручку",
    },
    {
      id: "elasticColor",
      label: "Колір резинки",
      type: "text",
      section: "Резинка й шильда",
      showIf: { field: "elastic", equals: "yes" },
    },
    {
      id: "badge",
      label: "Шильда",
      type: "single",
      section: "Резинка й шильда",
      options: [
        { value: "yes", label: "Наявна" },
        { value: "no", label: "Відсутня" },
      ],
      hint: "Металева чи пластикова табличка з логотипом на обкладинці.",
    },
    {
      id: "packing",
      label: "Спосіб пакування",
      type: "single",
      section: "Решта",
      options: [
        { value: "standard", label: "Стандартне" },
        { value: "split", label: "Сплітовка" },
      ],
      hint: "Сплітовка — окреме завдання логісту-пакувальнику",
    },
  ],
};

// ---------------------------------------------------------------------------
// Паперовий пакет
// ---------------------------------------------------------------------------

/**
 * Перенесення старого пресета `print_package` з конфігуратора (REQ-323#p4).
 *
 * Поля, значення й підписи — зі старого `PrintPackageConfigurator`, а п'ять
 * правил сумісності з `printPackageRules.ts` стали умовами в описі: щільність
 * 120 г буває лише в крафта, 205 г — лише в картону; паперові ручки — лише
 * крафтові; CMYK на готовий пакет не кладуть; люверси питають лише в
 * індивідуального пакета не з крафта. Ключ той самий, що й у старого пресета:
 * модель каталогу лише переносить його з `configuratorPreset` у `specPreset`.
 *
 * Стовпчики — за артбордом «Карта: вид → стовпчики» на канві REQ-323: друк
 * окремим стовпчиком, бо питань про нього половина. Кольору ручок не було й у
 * старому — це питання до тих, хто прораховує, а не до переносу.
 *
 * «Немає» в оздобленні й тисненні — справжній варіант, а не порожнеча: старий
 * конфігуратор ставив його за замовчуванням, і в збережених позиціях він стоїть.
 */
export const PRINT_SPEC_PACKAGE: PrintSpecPreset = {
  key: "print_package",
  label: "Паперовий пакет",
  sections: ["Корпус", "Друк і оздоблення", "Ручки й люверси"],
  columns: [
    { title: "Корпус", sections: ["Корпус"] },
    { title: "Друк і оздоблення", sections: ["Друк і оздоблення"] },
    { title: "Ручки й люверси", sections: ["Ручки й люверси"] },
  ],
  // Три клітинки, а не чотири: розмір у три виміри в чверть стрічки обрізався
  // до «290 × 340 × …». Тип пакета видно й так — розмір є лише в індивідуального.
  summary: ["size", "paperType", "printType"],
  fields: [
    {
      id: "packageType",
      label: "Тип пакета",
      type: "single",
      section: "Корпус",
      options: [
        { value: "ready", label: "Готовий" },
        { value: "custom", label: "Індивідуальний" },
      ],
    },
    {
      id: "supplierLink",
      label: "Посилання постачальника",
      type: "text",
      section: "Корпус",
      showIf: { field: "packageType", equals: "ready" },
      hint: "Звідки беремо готовий пакет",
    },
    {
      id: "size",
      label: "Розмір (Ш × В × Г)",
      type: "sizeRows",
      section: "Корпус",
      rows: ["Пакет"],
      withDepth: true,
      unit: "мм",
      showIf: { field: "packageType", equals: "custom" },
    },
    {
      id: "orientation",
      label: "Орієнтація",
      type: "single",
      section: "Корпус",
      options: [
        { value: "vertical", label: "Вертикальний" },
        { value: "horizontal", label: "Горизонтальний" },
      ],
    },
    {
      id: "paperType",
      label: "Матеріал",
      type: "single",
      section: "Корпус",
      options: [
        { value: "cardboard", label: "Картон" },
        { value: "paper", label: "Папір" },
        { value: "kraft", label: "Крафт" },
      ],
    },
    {
      id: "kraftColor",
      label: "Колір крафту",
      type: "single",
      section: "Корпус",
      options: [
        { value: "white", label: "Білий" },
        { value: "brown", label: "Бурий" },
      ],
      showIf: { field: "paperType", equals: "kraft" },
    },
    {
      id: "density",
      label: "Щільність",
      type: "single",
      section: "Корпус",
      options: [
        { value: "90", label: "90 г/м²" },
        { value: "110", label: "110 г/м²" },
        { value: "120", label: "120 г/м²", showIf: { field: "paperType", equals: "kraft" } },
        { value: "125", label: "125 г/м²" },
        { value: "200", label: "200 г/м²" },
        { value: "205", label: "205 г/м²", showIf: { field: "paperType", equals: "cardboard" } },
        { value: "250", label: "250 г/м²" },
      ],
    },
    {
      id: "printSides",
      label: "Кількість нанесень",
      type: "single",
      section: "Друк і оздоблення",
      options: [
        { value: "one_side", label: "З одної сторони" },
        { value: "two_sides", label: "З двох сторін" },
      ],
    },
    {
      id: "printType",
      label: "Тип нанесення",
      type: "single",
      section: "Друк і оздоблення",
      options: [
        { value: "cmyk", label: "CMYK", showIf: { field: "packageType", notEquals: "ready" } },
        { value: "pantone", label: "Pantone" },
        { value: "cmyk_pantone", label: "CMYK+Pantone" },
        { value: "uv_dtf", label: "УФ-DTF" },
        { value: "uv_print", label: "УФ-друк" },
        { value: "screen_print", label: "Трафарет" },
        { value: "sticker", label: "Наліпка/стікер" },
      ],
      hint: "CMYK на готовий пакет не кладуть",
    },
    {
      id: "pantoneCount",
      label: "Кількість пантонів",
      type: "number",
      section: "Друк і оздоблення",
      unit: "шт",
      showIf: { field: "printType", oneOf: ["pantone", "cmyk_pantone"] },
    },
    {
      id: "stickerSize",
      label: "Розмір стікера",
      type: "text",
      section: "Друк і оздоблення",
      showIf: { field: "printType", equals: "sticker" },
      hint: "Напр. 80 × 120 мм",
    },
    {
      id: "lamination",
      label: "Ламінація",
      type: "single",
      section: "Друк і оздоблення",
      options: [
        { value: "matte", label: "Матова" },
        { value: "gloss", label: "Глянцева" },
        { value: "no", label: "Без ламінації" },
      ],
      showIf: { field: "packageType", equals: "custom" },
    },
    {
      id: "extraFinishing",
      label: "Додаткове оздоблення",
      type: "single",
      section: "Друк і оздоблення",
      options: [
        { value: "none", label: "Немає" },
        { value: "spot_uv_25", label: "Вибірковий лак (до 25%)" },
        { value: "spot_uv_40", label: "Вибірковий лак (до 40%)" },
      ],
    },
    {
      id: "embossing",
      label: "Тиснення",
      type: "single",
      section: "Друк і оздоблення",
      options: [
        { value: "none", label: "Немає" },
        { value: "blind_1", label: "Конгрев (сліпе) з одної сторони" },
        { value: "blind_2", label: "Конгрев (сліпе) з двох сторін" },
        { value: "foil_1", label: "Фольга з одної сторони" },
        { value: "foil_2", label: "Фольга з двох сторін" },
      ],
    },
    {
      id: "handleType",
      label: "Ручки",
      type: "single",
      section: "Ручки й люверси",
      options: [
        { value: "ribbon", label: "Лента" },
        { value: "cord", label: "Шнурок" },
        { value: "twisted_paper", label: "Кручена паперова", showIf: { field: "paperType", equals: "kraft" } },
        { value: "flat_paper", label: "Плоска паперова", showIf: { field: "paperType", equals: "kraft" } },
      ],
      hint: "Паперові ручки бувають лише в крафта",
    },
    {
      id: "eyelets",
      label: "Люверси",
      type: "single",
      section: "Ручки й люверси",
      options: [
        { value: "yes", label: "Так" },
        { value: "no", label: "Ні" },
      ],
      showIf: [
        { field: "packageType", equals: "custom" },
        { field: "paperType", notEquals: "kraft" },
      ],
      hint: "Лише для індивідуального пакета не з крафта",
    },
  ],
};

// ---------------------------------------------------------------------------
// Блокнот
// ---------------------------------------------------------------------------

/**
 * Перенесення старого пресета `print_notebook` з конфігуратора (REQ-323#p4).
 *
 * Поля й значення — зі старого `PrintPackageConfigurator`; «Інше» з окремим
 * полем тексту стало «Інше…» поля з `allowCustom`. Підписи — з рядкового
 * зведення старого механізму («Друк обкладинки», а не «Друк»): у формі їх видно
 * під заголовком стовпчика, а в рядку списку й історії версій — ні, і два
 * однакові «Друк» там не розрізнити.
 *
 * Скріплення — власним стовпчиком, як на артборді «Карта: вид → стовпчики».
 * Кольору пружини не було й у старому, хоч у брошури й календарів він є, —
 * питання до тих, хто прораховує.
 *
 * Що спрощено проти старого: щільність обкладинки більше не залежить від
 * матеріалу. Там у крейди й картону було однаково «300 / 350 / інше», а в
 * «іншого» — лише «інше»; умова не відсікала жодного реального вибору.
 */
export const PRINT_SPEC_NOTEBOOK: PrintSpecPreset = {
  key: "print_notebook",
  label: "Блокнот",
  sections: ["Обкладинка", "Блок", "Скріплення"],
  columns: [
    { title: "Обкладинка", sections: ["Обкладинка"] },
    { title: "Блок", sections: ["Блок"] },
    { title: "Скріплення", sections: ["Скріплення"] },
  ],
  summary: ["format", "coverMaterial", "sheetCount", "binding"],
  fields: [
    {
      id: "format",
      label: "Формат",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "a4", label: "A4" },
        { value: "a5", label: "A5" },
        { value: "a6", label: "A6" },
      ],
      allowCustom: true,
      hint: "Нестандартний — «Інше…» і розмір текстом",
    },
    {
      id: "coverMaterial",
      label: "Матеріал обкладинки",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "coated_paper", label: "Крейдований папір" },
        { value: "carton", label: "Картон" },
      ],
      allowCustom: true,
    },
    {
      id: "coverStock",
      label: "Щільність обкладинки",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "300", label: "300 г/м²" },
        { value: "350", label: "350 г/м²" },
      ],
      allowCustom: true,
    },
    {
      id: "coverPrint",
      label: "Друк обкладинки",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
        { value: "pantone", label: "Pantone" },
      ],
    },
    {
      id: "coverPantoneCount",
      label: "Пантонів на обкладинці",
      type: "number",
      section: "Обкладинка",
      unit: "шт",
      showIf: { field: "coverPrint", equals: "pantone" },
    },
    {
      id: "lamination",
      label: "Ламінація",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "matte", label: "Мат" },
        { value: "gloss", label: "Глянець" },
      ],
    },
    {
      id: "laminationSides",
      label: "Сторони ламінації",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "1_0", label: "1+0" },
        { value: "1_1", label: "1+1" },
      ],
    },
    {
      id: "spotUv",
      label: "Вибірковий лак",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "yes", label: "Так" },
        { value: "no", label: "Ні" },
      ],
    },
    {
      id: "spotUvCoverage",
      label: "Покриття лаком",
      type: "single",
      section: "Обкладинка",
      options: [
        { value: "25", label: "До 25%" },
        { value: "40", label: "До 40%" },
      ],
      showIf: { field: "spotUv", equals: "yes" },
    },
    {
      id: "otherFinishing",
      label: "Інше оздоблення",
      type: "text",
      section: "Обкладинка",
      hint: "Напр. тиснення, висічка",
    },
    {
      id: "blockPaper",
      label: "Папір блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "offset", label: "Офсет" },
        { value: "design_paper", label: "Дизайнерський папір" },
      ],
    },
    {
      id: "blockDensity",
      label: "Щільність блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "80", label: "80 г/м²" },
        { value: "90", label: "90 г/м²" },
      ],
      allowCustom: true,
    },
    {
      id: "sheetCount",
      label: "Кількість аркушів",
      type: "single",
      section: "Блок",
      options: [
        { value: "25", label: "25 аркушів" },
        { value: "50", label: "50 аркушів" },
      ],
      allowCustom: true,
    },
    {
      id: "blockPrint",
      label: "Друк блоку",
      type: "single",
      section: "Блок",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_4", label: "4+4" },
        { value: "1_0", label: "1+0" },
        { value: "1_1", label: "1+1" },
        { value: "2_0", label: "2+0" },
        { value: "2_2", label: "2+2" },
        { value: "pantone", label: "Pantone" },
      ],
    },
    {
      id: "blockPantoneCount",
      label: "Пантонів на блоці",
      type: "number",
      section: "Блок",
      unit: "шт",
      showIf: { field: "blockPrint", equals: "pantone" },
    },
    {
      id: "binding",
      label: "Метод скріплення",
      type: "single",
      section: "Скріплення",
      options: [
        { value: "spring", label: "Пружина" },
        { value: "glue", label: "Клей" },
      ],
    },
    {
      id: "bindingSide",
      label: "Сторона скріплення",
      type: "single",
      section: "Скріплення",
      options: [
        { value: "short", label: "По короткій стороні" },
        { value: "long", label: "По довгій стороні" },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Блоки для записів
// ---------------------------------------------------------------------------

/**
 * Перенесення старого пресета `print_note_blocks` з конфігуратора (REQ-323#p4).
 *
 * Два стовпчики, а не три (артборд «Карта: вид → стовпчики»): сам блок і те, що
 * його тримає разом, — обкладинка та склейка. Вікно від цього вужче.
 */
export const PRINT_SPEC_NOTE_BLOCKS: PrintSpecPreset = {
  key: "print_note_blocks",
  label: "Блоки для записів",
  sections: ["Блок", "Обкладинка й склейка"],
  columns: [
    { title: "Блок", sections: ["Блок"] },
    { title: "Обкладинка й склейка", sections: ["Обкладинка й склейка"] },
  ],
  summary: ["format", "density", "sheetCount", "print"],
  fields: [
    {
      id: "format",
      label: "Формат",
      type: "single",
      section: "Блок",
      options: [
        { value: "85x85", label: "85×85" },
        { value: "95x95", label: "95×95" },
      ],
      allowCustom: true,
      hint: "Нестандартний — «Інше…» і розмір текстом",
    },
    {
      id: "paper",
      label: "Папір",
      type: "single",
      section: "Блок",
      options: [{ value: "offset", label: "Офсет" }],
      allowCustom: true,
    },
    {
      id: "density",
      label: "Щільність",
      type: "single",
      section: "Блок",
      options: [
        { value: "80", label: "80 г/м²" },
        { value: "90", label: "90 г/м²" },
      ],
      allowCustom: true,
    },
    {
      id: "sheetCount",
      label: "Кількість аркушів",
      type: "single",
      section: "Блок",
      options: [
        { value: "50", label: "50 аркушів" },
        { value: "100", label: "100 аркушів" },
        { value: "200", label: "200 аркушів" },
      ],
      allowCustom: true,
    },
    {
      id: "print",
      label: "Друк",
      type: "single",
      section: "Блок",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "pantone", label: "Pantone" },
      ],
    },
    {
      id: "pantoneCount",
      label: "Кількість пантонів",
      type: "number",
      section: "Блок",
      unit: "шт",
      showIf: { field: "print", equals: "pantone" },
    },
    {
      id: "hasCover",
      label: "Обкладинка",
      type: "single",
      section: "Обкладинка й склейка",
      options: [
        { value: "yes", label: "Так" },
        { value: "no", label: "Ні" },
      ],
    },
    {
      id: "glue",
      label: "Клей",
      type: "single",
      section: "Обкладинка й склейка",
      options: [
        { value: "yes", label: "Так" },
        { value: "no", label: "Ні" },
      ],
    },
    {
      id: "glueSide",
      label: "Сторона проклейки",
      type: "single",
      section: "Обкладинка й склейка",
      options: [
        { value: "top", label: "Зверху" },
        { value: "left", label: "Ліворуч" },
      ],
      showIf: { field: "glue", equals: "yes" },
    },
  ],
};

/** Реєстр описових пресетів. Новий вид додається сюди одним рядком. */
export const PRINT_SPEC_PRESETS: PrintSpecPreset[] = [
  PRINT_SPEC_CALENDAR_QUARTERLY,
  PRINT_SPEC_CALENDAR_FLIP,
  PRINT_SPEC_CALENDAR_HOUSE,
  PRINT_SPEC_BROCHURE,
  PRINT_SPEC_FLYER,
  PRINT_SPEC_CERTIFICATE,
  PRINT_SPEC_DIARY,
  PRINT_SPEC_PACKAGE,
  PRINT_SPEC_NOTEBOOK,
  PRINT_SPEC_NOTE_BLOCKS,
];

export const getPrintSpecPreset = (key: string | null | undefined): PrintSpecPreset | null =>
  PRINT_SPEC_PRESETS.find((preset) => preset.key === key) ?? null;

/**
 * Чи описовий це пресет. На старому механізмі (`printPackage.ts`) лишився тільки
 * сертифікат `print_certificates` — і жодна модель каталогу на нього не вказує.
 */
export const isPrintSpecPreset = (key: string | null | undefined): boolean =>
  getPrintSpecPreset(key) !== null;

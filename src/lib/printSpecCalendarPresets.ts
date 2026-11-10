import type { PrintSpecPreset } from "@/lib/printSpec";

/**
 * Календарі, що їх CRM робить сама: квартальний і хатинка. Винесені з
 * `printSpecPresets.ts` 10.11.2026 (REQ-358): той під ратчетом 2 000 рядків, а
 * для специфікації сюди додались поля, яких бракувало проти підписаної СП
 * (друк і кашування топера, ламінація основ, кількість сіток і пружин, формат
 * хатинки, сторона пружини, індивідуальний пакет). Відповіді на кожне поле дали
 * ті, хто прораховує, 10.11.2026: усе впливає на ціну.
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
      id: "baseLaminationType",
      label: "Ламінація основ",
      type: "single",
      section: "Основи",
      options: [
        { value: "matte", label: "Матова" },
        { value: "gloss", label: "Глянцева" },
      ],
      allowCustom: true,
      showIf: { field: "baseFinishing", includes: "lamination" },
    },
    {
      id: "baseLaminationSides",
      label: "Сторони ламінації основ",
      type: "single",
      section: "Основи",
      options: [
        { value: "1_0", label: "1+0" },
        { value: "1_1", label: "1+1" },
      ],
      showIf: { field: "baseFinishing", includes: "lamination" },
    },
    {
      id: "toperCashing",
      label: "Кашування топера",
      type: "single",
      section: "Основи",
      options: [
        { value: "with", label: "З кашуванням" },
        { value: "without", label: "Без кашування" },
      ],
    },
    {
      id: "toperPrint",
      label: "Друк топера",
      type: "single",
      section: "Основи",
      options: [
        { value: "4_0", label: "4+0" },
        { value: "4_1", label: "4+1" },
      ],
      allowCustom: true,
      hint: "Типово 4+0; 4+1 буває з кашуванням (1 — мітка).",
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
      id: "gridCount",
      label: "Кількість сіток",
      type: "number",
      section: "Календарна сітка",
      unit: "шт",
      presets: ["1", "3", "4"],
      hint: "Залежить від дизайну: буває 1, 3, 4.",
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
    {
      id: "springCount",
      label: "Кількість пружин",
      type: "number",
      section: "Кріплення",
      unit: "шт",
      presets: ["1", "3", "4"],
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

/** Джерело — файл CEO, як і в перекидного. Формат виробу типово 210×148, але буває інший (прорахунок, 10.11.2026). */
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
      id: "productSize",
      label: "Формат виробу",
      type: "sizeRows",
      section: "Основа",
      rows: ["Виріб"],
      unit: "мм",
      hint: "Типово 210 × 148; буває інший — за дизайном.",
    },
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
    {
      id: "springSide",
      label: "Сторона пружини",
      type: "single",
      section: "Кріплення",
      options: [
        { value: "width", label: "По ширині" },
        { value: "height", label: "По висоті" },
      ],
      allowCustom: true,
      hint: "Зазвичай по ширині (210 мм).",
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

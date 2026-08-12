/**
 * Описові специфікації нових видів поліграфії.
 *
 * Чому не так, як у `printPackage.ts`: там набір полів кожного виду захардкоджений
 * — плоский тип на 75 рядкових полів плюс окремий блок JSX на кожен вид (від 156
 * до 314 рядків). Список квартального календаря від тих, хто ним реально
 * прораховує, вимагає типів полів, яких у тій моделі немає жодного: багатовибір
 * («ламінація або лак, або і те і інше»), кілька розмірів в одній позиції («три
 * основи і один топер») і вільний текст замість списку («колір пружини — вписати
 * вручну»). Рядкове поле такого не виражає, а п'ять окремих блоків JSX означали б
 * п'ять власних реалізацій кожного типу.
 *
 * Тому новий вид тут — це ДАНІ: перелік полів із типом, опціями й залежностями.
 * Чотири наявні пресети (пакет, блокнот, блоки, сертифікат) свідомо лишаються на
 * старому механізмі: переписувати робоче заради однаковості означало б рискувати
 * збереженими позиціями прорахунків без жодної користі для замовника.
 */

/** Типи полів. Рівно ті, що потрібні описаним видам — не «на майбутнє». */
export type PrintSpecFieldType =
  /** Один зі списку. */
  | "single"
  /** Кілька зі списку одночасно — ламінація і лак можуть бути обидва. */
  | "multi"
  /** Вільний рядок: колір пружини, «інше». */
  | "text"
  /** Число з одиницею: кількість пантонів, кількість сторінок. */
  | "number"
  /** Кілька підписаних розмірів Ш×В в одному полі: три основи + топер. */
  | "sizeRows";

export type PrintSpecOption = { value: string; label: string };

/**
 * Умова показу поля.
 *
 * Свідомо однорівнева: «поле X дорівнює» або «поле X містить». Складніші умови
 * ще ні разу не знадобились, а кожен зайвий вид умови — це гілка в рендерері й у
 * валідації, яку доведеться тримати правильною назавжди.
 */
export type PrintSpecCondition = {
  field: string;
  /** Для `single`/`text`: точний збіг значення. */
  equals?: string;
  /** Для `multi`: значення є серед вибраних. */
  includes?: string;
};

export type PrintSpecField = {
  id: string;
  label: string;
  type: PrintSpecFieldType;
  /** Розділ картки, у якому поле показується. Має бути в `sections` пресету. */
  section: string;
  /** `single` і `multi`. */
  options?: PrintSpecOption[];
  /** `sizeRows`: підписи рядків. Кількість рядків задає саме він. */
  rows?: string[];
  /** Підпис одиниці: «мм», «г/м²», «шт». */
  unit?: string;
  /**
   * `single`: дозволити своє значення текстом.
   *
   * Це не косметика, а пряме прохання тих, хто прораховує: «не розумію, як це
   * сформулювати, щоб не заганять в рамки». Список без виходу назовні змушує
   * вибрати неправильне замість написати правильне.
   */
  allowCustom?: boolean;
  showIf?: PrintSpecCondition;
  hint?: string;
};

export type PrintSpecPreset = {
  key: string;
  label: string;
  /** Порядок розділів на картці. */
  sections: string[];
  fields: PrintSpecField[];
};

/** Один підписаний розмір у полі `sizeRows`. Рядки — бо поле може бути порожнім. */
export type PrintSpecSize = { width: string; height: string };

/**
 * Значення поля. `null` — поле не заповнене; порожній рядок і порожній масив
 * рівносильні `null` і зберігаються так само, щоб не було двох «пусто».
 */
export type PrintSpecValue = string | string[] | PrintSpecSize[] | null;

export type PrintSpecValues = Record<string, PrintSpecValue>;

/**
 * Як конфігурація лежить у `quote_items.metadata`.
 *
 * Окремим ключем від `printProduct`/`printPackage`: старі позиції читаються старим
 * кодом і далі, нові — цим. Один ключ на два формати означав би, що кожен читач
 * мусить розрізняти їх сам.
 */
export type PrintSpecMetadata = {
  presetKey: string;
  values: PrintSpecValues;
};

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
  fields: [
    {
      id: "baseSizes",
      label: "Розміри",
      type: "sizeRows",
      section: "Основи",
      rows: ["Основа 1", "Основа 2", "Основа 3", "Топер"],
      unit: "мм",
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
 * Джерело — файл специфікацій СЕО. Списку від тих, хто прораховує, ще немає:
 * Татьяна пообіцяла «решту зроблю інакше». Тому поля тут — те, що замовлено, а
 * не те, що звірене; після її правок цей опис зміниться, і саме тому він опис, а
 * не 260 рядків JSX.
 *
 * «Індивідуальний пакет» — галочка, а не окрема позиція прорахунку (СЕО, 11.08).
 */
export const PRINT_SPEC_CALENDAR_FLIP: PrintSpecPreset = {
  key: "print_calendar_flip",
  label: "Перекидний календар",
  sections: ["Формат", "Обкладинка і підложка", "Блок", "Оздоблення", "Кріплення"],
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

/** Джерело — файл СЕО, як і в перекидного. Розмір виробу фіксований: 210×150×70 мм. */
export const PRINT_SPEC_CALENDAR_HOUSE: PrintSpecPreset = {
  key: "print_calendar_house",
  label: "Календар-хатинка",
  sections: ["Основа", "Блок", "Кріплення"],
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

/** Джерело — файл СЕО. Колір пружини питаємо лише тоді, коли скріплення пружиною. */
export const PRINT_SPEC_BROCHURE: PrintSpecPreset = {
  key: "print_brochure",
  label: "Брошура",
  sections: ["Формат", "Папір", "Друк", "Скріплення"],
  fields: [
    {
      id: "format",
      label: "Формат (Ш×В)",
      type: "single",
      section: "Формат",
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
      section: "Формат",
      unit: "стор",
    },
    {
      id: "coverPaper",
      label: "Папір обкладинки",
      type: "single",
      section: "Папір",
      options: [
        { value: "coated_170", label: "Крейда 170" },
        { value: "coated_200", label: "Крейда 200" },
        { value: "coated_250", label: "Крейда 250" },
        { value: "coated_300", label: "Крейда 300" },
        { value: "coated_350", label: "Крейда 350" },
      ],
      allowCustom: true,
    },
    {
      id: "blockPaper",
      label: "Папір блоку",
      type: "single",
      section: "Папір",
      options: [
        { value: "offset_80", label: "Офсет 80" },
        { value: "offset_90", label: "Офсет 90" },
        { value: "offset_100", label: "Офсет 100" },
        { value: "offset_110", label: "Офсет 110" },
        { value: "coated_90", label: "Крейда 90" },
        { value: "coated_115", label: "Крейда 115" },
        { value: "coated_130", label: "Крейда 130" },
        { value: "coated_150", label: "Крейда 150" },
        { value: "coated_170", label: "Крейда 170" },
      ],
      allowCustom: true,
    },
    {
      id: "coverPrint",
      label: "Друк обкладинки",
      type: "single",
      section: "Друк",
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
      section: "Друк",
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
      section: "Друк",
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
 * Джерело — файл СЕО, і він на цьому виді ОБРИВАЄТЬСЯ: після «Пакування по»
 * тексту немає. Артем 11.08: «листівки ще не до кінця, їх доповнюватимуть,
 * робимо з тим, що є». Тому пакування тут поки немає взагалі.
 *
 * «Ламінація від 170 г» лишається підказкою, а не правилом: рішення про матеріал
 * узгоджено віддати тим, хто прораховує.
 */
export const PRINT_SPEC_FLYER: PrintSpecPreset = {
  key: "print_flyer",
  label: "Листівка",
  sections: ["Формат", "Папір"],
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
        { value: "a3", label: "А3 (297×320)" },
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
        { value: "matte", label: "Мат" },
        { value: "gloss", label: "Глянець" },
      ],
      hint: "Доступна від 170 г",
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
];

export const getPrintSpecPreset = (key: string | null | undefined): PrintSpecPreset | null =>
  PRINT_SPEC_PRESETS.find((preset) => preset.key === key) ?? null;

/** Чи описовий це пресет. Старі чотири лишаються на `printPackage.ts`. */
export const isPrintSpecPreset = (key: string | null | undefined): boolean =>
  getPrintSpecPreset(key) !== null;

// ---------------------------------------------------------------------------
// Значення
// ---------------------------------------------------------------------------

/** Ключ, під яким у значеннях лежить своє значення поля з `allowCustom`. */
export const customValueKey = (fieldId: string): string => `${fieldId}__custom`;

/** Значення `single`, яке означає «своє, текстом». */
export const CUSTOM_OPTION_VALUE = "__custom";

const asStringValue = (value: PrintSpecValue): string => (typeof value === "string" ? value : "");

const asListValue = (value: PrintSpecValue): string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string") ? (value as string[]) : [];

const asSizeRows = (value: PrintSpecValue): PrintSpecSize[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "object" && entry !== null)
    ? (value as PrintSpecSize[])
    : [];

export const createEmptyPrintSpecValues = (preset: PrintSpecPreset): PrintSpecValues => {
  const values: PrintSpecValues = {};
  for (const field of preset.fields) {
    if (field.type === "multi") values[field.id] = [];
    else if (field.type === "sizeRows") {
      values[field.id] = (field.rows ?? []).map(() => ({ width: "", height: "" }));
    } else values[field.id] = "";
    if (field.allowCustom) values[customValueKey(field.id)] = "";
  }
  return values;
};

/**
 * Чи показувати поле за поточними значеннями.
 *
 * Поле, яке не показується, у зведення теж не потрапляє: інакше в специфікації
 * лишалась би кількість пантонів після того, як друк перемкнули на 4+0.
 */
export function isPrintSpecFieldVisible(field: PrintSpecField, values: PrintSpecValues): boolean {
  const condition = field.showIf;
  if (!condition) return true;
  const source = values[condition.field] ?? null;
  if (condition.equals !== undefined) return asStringValue(source) === condition.equals;
  if (condition.includes !== undefined) return asListValue(source).includes(condition.includes);
  return true;
}

const optionLabel = (field: PrintSpecField, value: string): string =>
  field.options?.find((option) => option.value === value)?.label ?? value;

/**
 * Один рядок специфікації на поле — «Друк сітки: 4+0».
 *
 * Формат свідомо той самий «Підпис: значення», що віддає `formatPrintProductSummary`
 * для старих пресетів: картка прорахунку, список і дизайн-задача розбирають рядки
 * по «: », і другий формат означав би другий розбирач у кожному з трьох місць.
 */
export function formatPrintSpecSummary(preset: PrintSpecPreset, values: PrintSpecValues): string[] {
  const lines: string[] = [`Виріб: ${preset.label.toLowerCase()}`];

  for (const field of preset.fields) {
    if (!isPrintSpecFieldVisible(field, values)) continue;
    const raw = values[field.id] ?? null;
    const custom = asStringValue(values[customValueKey(field.id)] ?? null).trim();

    if (field.type === "sizeRows") {
      const rows = field.rows ?? [];
      const sizes = asSizeRows(raw);
      const parts = rows
        .map((rowLabel, index) => {
          const size = sizes[index];
          if (!size?.width.trim() || !size?.height.trim()) return null;
          const value = `${size.width.trim()} × ${size.height.trim()}${field.unit ? ` ${field.unit}` : ""}`;
          return rows.length === 1 ? value : `${rowLabel} ${value}`;
        })
        .filter(Boolean);
      if (parts.length > 0) lines.push(`${field.label}: ${parts.join(", ")}`);
      continue;
    }

    if (field.type === "multi") {
      const selected = asListValue(raw).map((value) => optionLabel(field, value));
      if (selected.length > 0) lines.push(`${field.label}: ${selected.join(" + ")}`);
      continue;
    }

    const value = asStringValue(raw).trim();
    if (field.type === "single" && value === CUSTOM_OPTION_VALUE) {
      if (custom) lines.push(`${field.label}: ${custom}`);
      continue;
    }
    if (!value) continue;
    const label = field.type === "single" ? optionLabel(field, value) : value;
    lines.push(`${field.label}: ${label}${field.unit && field.type === "number" ? ` ${field.unit}` : ""}`);
  }

  return lines;
}

/**
 * Чи є в конфігурації хоч одне заповнене поле.
 *
 * Потрібно, щоб картка прорахунку відрізняла «параметрів ще немає» від «параметри
 * є»: заповнює їх не той, хто створює прорахунок, а той, хто його рахує, тож
 * порожня конфігурація — нормальний стан, а не помилка.
 */
export function isPrintSpecFilled(preset: PrintSpecPreset, values: PrintSpecValues): boolean {
  return preset.fields.some((field) => {
    if (!isPrintSpecFieldVisible(field, values)) return false;
    const raw = values[field.id] ?? null;
    if (field.type === "multi") return asListValue(raw).length > 0;
    if (field.type === "sizeRows") {
      return asSizeRows(raw).some((size) => size.width.trim() !== "" || size.height.trim() !== "");
    }
    const value = asStringValue(raw).trim();
    if (value === CUSTOM_OPTION_VALUE) {
      return asStringValue(values[customValueKey(field.id)] ?? null).trim() !== "";
    }
    return value !== "";
  });
}

/**
 * Прочитати `metadata.printSpec` позиції прорахунку.
 *
 * Невідомий пресет — це `null`, а не помилка: якщо опис виду колись приберуть,
 * стара позиція мусить лишитись читабельною, а не валити картку прорахунку.
 */
export function parsePrintSpecMetadata(value: unknown): PrintSpecMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const presetKey = typeof record.presetKey === "string" ? record.presetKey : "";
  const preset = getPrintSpecPreset(presetKey);
  if (!preset) return null;
  return { presetKey, values: parsePrintSpecValues(preset, record.values) };
}

/**
 * Привести збережений JSON до значень пресету.
 *
 * Поля, якого в пресеті вже немає, відкидаємо, а нове дістає порожнє значення:
 * набір полів буде змінюватись за правками тих, хто прораховує, і збережена
 * позиція не повинна від цього ламатись.
 */
export function parsePrintSpecValues(preset: PrintSpecPreset, raw: unknown): PrintSpecValues {
  const values = createEmptyPrintSpecValues(preset);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return values;
  const source = raw as Record<string, unknown>;

  for (const field of preset.fields) {
    const stored = source[field.id];
    if (field.type === "multi") {
      if (Array.isArray(stored)) {
        values[field.id] = stored.filter((entry): entry is string => typeof entry === "string");
      }
    } else if (field.type === "sizeRows") {
      const rows = field.rows ?? [];
      const storedRows = Array.isArray(stored) ? stored : [];
      values[field.id] = rows.map((_, index) => {
        const entry = storedRows[index];
        if (!entry || typeof entry !== "object") return { width: "", height: "" };
        const record = entry as Record<string, unknown>;
        return {
          width: typeof record.width === "string" ? record.width : "",
          height: typeof record.height === "string" ? record.height : "",
        };
      });
    } else if (typeof stored === "string") {
      values[field.id] = stored;
    }

    if (field.allowCustom) {
      const storedCustom = source[customValueKey(field.id)];
      if (typeof storedCustom === "string") values[customValueKey(field.id)] = storedCustom;
    }
  }

  return values;
}

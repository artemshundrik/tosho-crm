/**
 * Описові специфікації видів поліграфії — механізм. Самі описи видів лежать у
 * `printSpecPresets.ts` і реекспортуються звідси.
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
 * Тому вид тут — це ДАНІ: перелік полів із типом, опціями й залежностями.
 *
 * Пакет, блокнот і блоки для записів переїхали сюди зі старого конфігуратора
 * 01.10.2026 (REQ-323#p4): на ньому параметри заповнювались лише раз, у вікні
 * створення, і не мали ні стовпчиків, ні підсвічення змін, ні версій. Старі
 * позиції з `metadata.printProduct` читаються через `printSpecLegacy.ts`.
 */

import { getPrintSpecPreset } from "@/lib/printSpecPresets";

export {
  PRINT_SPEC_BROCHURE,
  PRINT_SPEC_CALENDAR_FLIP,
  PRINT_SPEC_CALENDAR_HOUSE,
  PRINT_SPEC_CALENDAR_QUARTERLY,
  PRINT_SPEC_CERTIFICATE,
  PRINT_SPEC_DIARY,
  PRINT_SPEC_FLYER,
  PRINT_SPEC_NOTEBOOK,
  PRINT_SPEC_NOTE_BLOCKS,
  PRINT_SPEC_PACKAGE,
  PRINT_SPEC_PRESETS,
  getPrintSpecPreset,
  isPrintSpecPreset,
} from "@/lib/printSpecPresets";

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
  /** Кілька підписаних розмірів Ш×В (або Ш×В×Г) в одному полі: три основи + топер. */
  | "sizeRows";

/**
 * Варіант відповіді. `showIf` — коли варіант існує взагалі: у пакета щільність
 * 120 г буває лише в крафта, а CMYK на готовий пакет не кладуть. Неіснуючий
 * варіант не показується і стирається зі значень (`reconcilePrintSpecValues`).
 */
export type PrintSpecOption = {
  value: string;
  label: string;
  showIf?: PrintSpecShowIf;
  /**
   * Варіант існує, але за поточних значень неможливий: чип сірий і не
   * натискається, `reason` видно на наведенні. На відміну від `showIf` він не
   * зникає з форми — людина бачить, що варіант є і чому його зараз не можна.
   */
  disabledWhen?: PrintSpecCondition;
  reason?: string;
};

/**
 * Умова показу поля чи варіанта.
 *
 * Однорівнева: умова дивиться на одне поле. Складеної логіки «або» між полями
 * немає — її ще ні разу не треба було; «і» дає масив умов (`PrintSpecShowIf`).
 * Кожен зайвий вид умови — це гілка в рендерері й у перевірках, яку доведеться
 * тримати правильною назавжди, тому видів рівно стільки, скільки просять описи.
 */
export type PrintSpecCondition = {
  field: string;
  /** Для `single`/`text`: точний збіг значення. */
  equals?: string;
  /** Для `single`: значення — один зі списку (кількість пантонів і для Pantone, і для CMYK+Pantone). */
  oneOf?: string[];
  /** Для `single`: будь-що, крім цього, — і порожнє теж (люверси питають, доки не вибрали крафт). */
  notEquals?: string;
  /** Для `multi`: значення є серед вибраних. */
  includes?: string;
};

/** Одна умова або кілька, що мають виконуватись разом (люверси: індивідуальний пакет І не крафт). */
export type PrintSpecShowIf = PrintSpecCondition | PrintSpecCondition[];

/**
 * Значення за замовчуванням: перше правило, чия умова виконана (без `when` — завжди),
 * ставить значення, коли поле ПОРОЖНЄ й людина його ще не чіпала.
 */
export type PrintSpecDefaultRule = { value: PrintSpecValue; when?: PrintSpecShowIf };

/** Попередження під числовим полем: значення не кратне `multipleOf`. Не блокує збереження. */
export type PrintSpecWarning = { multipleOf: number; message: string; when?: PrintSpecShowIf };

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
  /** `sizeRows`: третій вимір, глибина — пакет має ширину, висоту й бокову складку. */
  withDepth?: boolean;
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
  showIf?: PrintSpecShowIf;
  hint?: string;
  /** `number`: швидкі значення чипами поруч із полем. */
  presets?: string[];
  /** `number`: крок лічильника «−/+». */
  step?: number;
  /** Значення за замовчуванням; без правил одне можливе значення `single` без «Інше…» ставиться само. */
  defaults?: PrintSpecDefaultRule[];
  /** `number`: попередження кратності. */
  warnings?: PrintSpecWarning[];
};

export type PrintSpecColumn = { title: string; sections: string[] };

export type PrintSpecPreset = {
  key: string;
  label: string;
  /** Порядок розділів на картці. */
  sections: string[];
  fields: PrintSpecField[];
  /**
   * Поля стрічки «головне» на картці прорахунку — 3–4 id у тому порядку, в
   * якому вони стоять у стрічці. Решта полів іде дрібною сіткою під рискою.
   *
   * ЧОМУ ЦЕ ЧАСТИНА ОПИСУ ВИДУ, А НЕ ПРАВИЛО «ПЕРШІ ЧОТИРИ»: головне — те,
   * від чого залежить ціна, а воно в кожному виді своє (у щоденника — формат,
   * матеріал обкладинки й сторінки; у квартального — розміри основ і метод
   * друку). Порядок полів у формі відповідає порядку заповнення, не важливості.
   *
   * Стартові набори (11.09.2026) вибрані за тим, що вливає на ціну; з тими,
   * хто прораховує, ще не звірені — правити тут, без коду.
   */
  summary?: string[];
  /**
   * Стовпчики вікна й картки: стовпчик — частина виробу, що складається з
   * одного чи кількох розділів. Без `columns` — один стовпчик з усіма розділами.
   */
  columns?: PrintSpecColumn[];
};

/** Один підписаний розмір у полі `sizeRows`. Рядки — бо поле може бути порожнім. Глибина — лише з `withDepth`. */
export type PrintSpecSize = { width: string; height: string; depth?: string };

/**
 * Значення поля. `null` — поле не заповнене; порожній рядок і порожній масив
 * рівносильні `null` і зберігаються так само, щоб не було двох «пусто».
 */
export type PrintSpecValue = string | string[] | PrintSpecSize[] | null;

export type PrintSpecValues = Record<string, PrintSpecValue>;

/**
 * Як конфігурація лежить у `quote_items.metadata`.
 *
 * Окремим ключем від `printProduct`/`printPackage`: старий формат у базі не
 * переписується, а перекладається сюди на читанні (`printSpecLegacy.ts`). Один
 * ключ на два формати означав би, що кожен читач мусить розрізняти їх сам.
 */
export type PrintSpecMetadata = {
  presetKey: string;
  values: PrintSpecValues;
  /** Знімки значень, які рахували, — по одному на кожну правку після ціни (REQ-323). */
  versions?: PrintSpecVersion[];
};

/**
 * Знімок значень на момент, коли їх вперше змінили після ціни: це версія, за
 * яку менеджер уже бачив ціну.
 */
export type PrintSpecVersion = {
  /** Коли зроблено знімок (перша правка після ціни), ISO. */
  at: string;
  /**
   * `lastPricedAt` на момент знімка — дата «Пораховано», за яку рахували цю
   * версію. `null` — невідомо (старі знімки, історії статусів не було).
   */
  pricedAt: string | null;
  values: PrintSpecValues;
};

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

/** Порожній рядок розміру: глибина є лише в полів, що її питають, — щоб «пусто» не мало двох форм. */
const emptySize = (field: PrintSpecField): PrintSpecSize =>
  field.withDepth ? { width: "", height: "", depth: "" } : { width: "", height: "" };

const emptyFieldValue = (field: PrintSpecField): PrintSpecValue => {
  if (field.type === "multi") return [];
  if (field.type === "sizeRows") return (field.rows ?? []).map(() => emptySize(field));
  return "";
};

export const createEmptyPrintSpecValues = (preset: PrintSpecPreset): PrintSpecValues => {
  const values: PrintSpecValues = {};
  for (const field of preset.fields) {
    values[field.id] = emptyFieldValue(field);
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
  return matchesPrintSpecShowIf(field.showIf, values);
}

/** Умови як список: одна умова — це список з одного. */
export const printSpecConditions = (showIf: PrintSpecShowIf | undefined): PrintSpecCondition[] =>
  showIf === undefined ? [] : Array.isArray(showIf) ? showIf : [showIf];

/**
 * Поле, під яке вкладається умовне поле у формі, — те, на яке дивиться ПЕРША
 * умова. У люверсів їх дві (тип пакета й матеріал), а вкластись можна лише під одне.
 */
export const printSpecParentFieldId = (field: PrintSpecField): string | null =>
  printSpecConditions(field.showIf)[0]?.field ?? null;

function matchesCondition(condition: PrintSpecCondition, values: PrintSpecValues): boolean {
  const source = values[condition.field] ?? null;
  if (condition.equals !== undefined) return asStringValue(source) === condition.equals;
  if (condition.oneOf !== undefined) return condition.oneOf.includes(asStringValue(source));
  if (condition.notEquals !== undefined) return asStringValue(source) !== condition.notEquals;
  if (condition.includes !== undefined) return asListValue(source).includes(condition.includes);
  return true;
}

function matchesPrintSpecShowIf(showIf: PrintSpecShowIf | undefined, values: PrintSpecValues): boolean {
  return printSpecConditions(showIf).every((condition) => matchesCondition(condition, values));
}

/** Варіанти поля, які існують за поточних значень (без «Інше…» — воно є завжди, де дозволене). */
export function listPrintSpecOptions(field: PrintSpecField, values: PrintSpecValues): PrintSpecOption[] {
  const options = field.options ?? [];
  return options.every((option) => !option.showIf)
    ? options
    : options.filter((option) => matchesPrintSpecShowIf(option.showIf, values));
}

/** Вибране значення — варіант, якого за поточних значень не існує. Невідоме опису значення не чіпаємо. */
const isUnavailableOption = (field: PrintSpecField, value: string, values: PrintSpecValues): boolean => {
  const option = field.options?.find((entry) => entry.value === value);
  return option !== undefined && !matchesPrintSpecShowIf(option.showIf, values);
};

/**
 * Прибирає вибір, якого за поточних значень не існує: крафт змінили на картон —
 * щільність 120 г стирається, бо картону 120 г не буває.
 *
 * Це звірка ПЕРЕД показом, а не ефект після нього: форма проганяє її на кожній
 * зміні, читання — на кожному розборі, тож проміжного кадру з неможливою
 * комбінацією не існує (саме ефекти-санітайзери давали «поле відкочується саме»,
 * REQ-245). Повертає ТОЙ САМИЙ об'єкт, коли міняти нічого.
 *
 * Сховане умовою ПОЛЕ лишається як є — це окреме правило: значення там
 * повертається, щойно поле знову з'явиться. А неіснуючий варіант повертатись
 * не має куди. Стирання може зробити неіснуючим ще щось, тому прохід повторюється.
 */
export function reconcilePrintSpecValues(preset: PrintSpecPreset, values: PrintSpecValues): PrintSpecValues {
  let current = values;
  for (let pass = 0; pass < preset.fields.length; pass += 1) {
    let next: PrintSpecValues | null = null;
    for (const field of preset.fields) {
      if (!field.options?.some((option) => option.showIf)) continue;
      const raw = current[field.id] ?? null;
      if (field.type === "multi") {
        const list = asListValue(raw);
        const kept = list.filter((value) => !isUnavailableOption(field, value, current));
        if (kept.length !== list.length) next = { ...(next ?? current), [field.id]: kept };
      } else if (field.type === "single") {
        const value = asStringValue(raw);
        if (value && isUnavailableOption(field, value, current)) next = { ...(next ?? current), [field.id]: "" };
      }
    }
    if (!next) return current;
    current = next;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Неможливі варіанти, значення за замовчуванням, кратність (REQ-326)
// ---------------------------------------------------------------------------

/** Варіант вимкнений: існує, але за поточних значень неможливий (`disabledWhen`). */
export const isPrintSpecOptionDisabled = (option: PrintSpecOption, values: PrintSpecValues): boolean =>
  option.disabledWhen !== undefined && matchesCondition(option.disabledWhen, values);

export type PrintSpecDropped = { fieldId: string; label: string; reason: string };

/**
 * Знімає вибір, який через нове значення став неможливим: поролон — і резинка
 * «Вертикальна» зникає. Що саме знято й чому — у `dropped`, щоб форма пояснила.
 * Повертає ТОЙ САМИЙ об'єкт, коли міняти нічого.
 */
export function dropDisabledPrintSpecChoices(
  preset: PrintSpecPreset,
  values: PrintSpecValues
): { values: PrintSpecValues; dropped: PrintSpecDropped[] } {
  let current = values;
  const dropped: PrintSpecDropped[] = [];
  for (const field of preset.fields) {
    if (!field.options?.some((option) => option.disabledWhen)) continue;
    const isDropped = (value: string): boolean => {
      const option = field.options?.find((entry) => entry.value === value);
      if (!option || !isPrintSpecOptionDisabled(option, current)) return false;
      dropped.push({ fieldId: field.id, label: option.label, reason: option.reason ?? "" });
      return true;
    };
    const raw = current[field.id] ?? null;
    if (field.type === "multi") {
      const kept = asListValue(raw).filter((value) => !isDropped(value));
      if (kept.length !== asListValue(raw).length) current = { ...current, [field.id]: kept };
    } else if (field.type === "single") {
      const value = asStringValue(raw);
      if (value && isDropped(value)) current = { ...current, [field.id]: "" };
    }
  }
  return { values: current, dropped };
}

/** Яке значення за замовчуванням має поле зараз; `undefined` — жодного. */
export function resolvePrintSpecDefault(field: PrintSpecField, values: PrintSpecValues): PrintSpecValue | undefined {
  if (field.defaults) {
    return field.defaults.find((rule) => matchesPrintSpecShowIf(rule.when, values))?.value;
  }
  if (field.type === "single" && !field.allowCustom) {
    const options = listPrintSpecOptions(field, values);
    if (options.length === 1 && !isPrintSpecOptionDisabled(options[0], values)) return options[0].value;
  }
  return undefined;
}

/**
 * Які поля людина вже чіпала (`touched`) і які тримають значення за замовчуванням,
 * ще не підтверджене нею (`auto`). Стан живе поруч із чернеткою вікна, а НЕ в
 * збережених даних: збережене значення завжди чиєсь рішення.
 */
export type PrintSpecDraftMeta = { auto: string[]; touched: string[] };

const sameValue = (a: PrintSpecValue, b: PrintSpecValue): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Ставить значення за замовчуванням у ПОРОЖНІ й нечіпані поля. Вибір людини не
 * перетирається ніколи: поле, у якому вона щось зробила (навіть стерла), у
 * `touched` і правил більше не чує. Значення, поставлене правилом, переживає
 * зміну умов — форзац «Карти» стає «Чисті», щойно макет став лінією, — доки
 * людина його не підтвердила чи не змінила. Той самий об'єкт, коли міняти нічого.
 */
export function applyPrintSpecDefaults(
  preset: PrintSpecPreset,
  values: PrintSpecValues,
  meta: PrintSpecDraftMeta
): { values: PrintSpecValues; auto: string[] } {
  let current = values;
  let auto = meta.auto;
  for (const field of preset.fields) {
    if (!isPrintSpecFieldVisible(field, current)) continue;
    const target = resolvePrintSpecDefault(field, current);
    if (auto.includes(field.id)) {
      if (target === undefined) {
        current = { ...current, [field.id]: emptyFieldValue(field) };
        auto = auto.filter((id) => id !== field.id);
      } else if (!sameValue(current[field.id] ?? null, target)) {
        current = { ...current, [field.id]: target };
      }
    } else if (
      target !== undefined &&
      !meta.touched.includes(field.id) &&
      !isPrintSpecFieldFilled(field, current)
    ) {
      current = { ...current, [field.id]: target };
      auto = [...auto, field.id];
    }
  }
  return { values: current, auto };
}

export type PrintSpecSettled = { values: PrintSpecValues; meta: PrintSpecDraftMeta; dropped: PrintSpecDropped[] };

/**
 * Приводить чернетку до цілісного стану: неіснуючі варіанти стерті, неможливі
 * зняті, порожнє заповнене значеннями за замовчуванням. Кілька проходів, бо одне
 * може зробити можливим чи неможливим інше; закінчується, коли нічого не змінилось.
 */
export function settlePrintSpecValues(
  preset: PrintSpecPreset,
  values: PrintSpecValues,
  meta: PrintSpecDraftMeta
): PrintSpecSettled {
  let current = values;
  let auto = meta.auto;
  const dropped: PrintSpecDropped[] = [];
  for (let pass = 0; pass < 4; pass += 1) {
    const before = current;
    const beforeAuto = auto;
    current = reconcilePrintSpecValues(preset, current);
    const drop = dropDisabledPrintSpecChoices(preset, current);
    current = drop.values;
    dropped.push(...drop.dropped);
    const defaults = applyPrintSpecDefaults(preset, current, { auto, touched: meta.touched });
    current = defaults.values;
    auto = defaults.auto;
    if (current === before && auto === beforeAuto) break;
  }
  return { values: current, meta: { auto, touched: meta.touched }, dropped };
}

/** Службовий ключ власного значення → поле, якого воно стосується. */
const ownerFieldId = (key: string): string => (key.endsWith("__custom") ? key.slice(0, -"__custom".length) : key);

/**
 * Правка людини: `patch` — нові значення полів. Поле, яке вона чіпала, більше не
 * «за замовчуванням» і далі не отримує правил; решта чернетки сходиться наново.
 */
export function editPrintSpecDraft(
  preset: PrintSpecPreset,
  values: PrintSpecValues,
  meta: PrintSpecDraftMeta,
  patch: PrintSpecValues
): PrintSpecSettled {
  const ids = Object.keys(patch).map(ownerFieldId);
  return settlePrintSpecValues(
    preset,
    { ...values, ...patch },
    {
      auto: meta.auto.filter((id) => !ids.includes(id)),
      touched: [...new Set([...meta.touched, ...ids])],
    }
  );
}

/** Людина підтвердила значення за замовчуванням, нічого не змінюючи. */
export const confirmPrintSpecDefault = (meta: PrintSpecDraftMeta, fieldId: string): PrintSpecDraftMeta => ({
  auto: meta.auto.filter((id) => id !== fieldId),
  touched: meta.touched.includes(fieldId) ? meta.touched : [...meta.touched, fieldId],
});

export type PrintSpecWarningHit = { fieldId: string; message: string };

/** Попередження кратності для видимих заповнених числових полів. Збереження не блокують. */
export function getPrintSpecWarnings(preset: PrintSpecPreset, values: PrintSpecValues): PrintSpecWarningHit[] {
  const hits: PrintSpecWarningHit[] = [];
  for (const field of preset.fields) {
    if (!field.warnings || !isPrintSpecFieldVisible(field, values)) continue;
    const raw = asStringValue(values[field.id] ?? null).trim();
    if (!/^\d+$/.test(raw)) continue;
    const count = Number(raw);
    for (const warning of field.warnings) {
      if (matchesPrintSpecShowIf(warning.when, values) && count % warning.multipleOf !== 0) {
        hits.push({ fieldId: field.id, message: warning.message });
      }
    }
  }
  return hits;
}

const optionLabel = (field: PrintSpecField, value: string): string =>
  field.options?.find((option) => option.value === value)?.label ?? value;

/** Одне заповнене поле специфікації — те, що показують і в картці, і в рядку. */
export type PrintSpecEntry = { id: string; label: string; value: string };

/**
 * Заповнені поля в порядку пресету — по одному запису на поле, лише видимі й
 * лише з відповіддю. Спільне джерело для картки прорахунку (стрічка й сітка)
 * та для рядкового зведення нижче: другий розбір «що вважати значенням»
 * розійшовся б із першим при першій же правці типу поля.
 */
export function formatPrintSpecEntries(preset: PrintSpecPreset, values: PrintSpecValues): PrintSpecEntry[] {
  const entries: PrintSpecEntry[] = [];
  for (const field of preset.fields) {
    if (!isPrintSpecFieldVisible(field, values)) continue;
    const value = formatPrintSpecFieldValue(field, values);
    if (value) entries.push({ id: field.id, label: field.label, value });
  }
  return entries;
}

/**
 * Значення одного поля текстом, як його бачить людина; порожній рядок — не
 * заповнено. Видимість НЕ перевіряється: це робить той, хто питає.
 */
export function formatPrintSpecFieldValue(field: PrintSpecField, values: PrintSpecValues): string {
  const raw = values[field.id] ?? null;

  if (field.type === "sizeRows") {
    const rows = field.rows ?? [];
    const sizes = asSizeRows(raw);
    return rows
      .map((rowLabel, index) => {
        const size = sizes[index];
        if (!size?.width.trim() || !size?.height.trim()) return null;
        const depth = field.withDepth ? size.depth?.trim() ?? "" : "";
        const dimensions = [size.width.trim(), size.height.trim(), depth].filter(Boolean).join(" × ");
        const value = `${dimensions}${field.unit ? ` ${field.unit}` : ""}`;
        return rows.length === 1 ? value : `${rowLabel} ${value}`;
      })
      .filter(Boolean)
      .join(", ");
  }

  if (field.type === "multi") {
    return asListValue(raw)
      .map((value) => optionLabel(field, value))
      .join(" + ");
  }

  const value = asStringValue(raw).trim();
  if (field.type === "single" && value === CUSTOM_OPTION_VALUE) {
    return asStringValue(values[customValueKey(field.id)] ?? null).trim();
  }
  if (!value) return "";
  const label = field.type === "single" ? optionLabel(field, value) : value;
  return `${label}${field.unit && field.type === "number" ? ` ${field.unit}` : ""}`;
}

/**
 * Один рядок специфікації на поле — «Друк сітки: 4+0».
 *
 * Формат свідомо той самий «Підпис: значення», що віддає `formatPrintProductSummary`
 * для старих пресетів: картка прорахунку, список і дизайн-задача розбирають рядки
 * по «: », і другий формат означав би другий розбирач у кожному з трьох місць.
 *
 * Назва виду йде як є, з великої (REQ-178#p18). Решта значень приходить із
 * підписів довідника — «Тверда», «Крейда 350 г», — тож «Виріб: щоденник» першим
 * рядком читався як одрук, а не як інший регістр.
 */
export function formatPrintSpecSummary(preset: PrintSpecPreset, values: PrintSpecValues): string[] {
  return [
    `Виріб: ${preset.label}`,
    ...formatPrintSpecEntries(preset, values).map((entry) => `${entry.label}: ${entry.value}`),
  ];
}

/**
 * Записи, поділені на стрічку «головне» й решту — так їх малює картка прорахунку.
 *
 * Стрічка йде в порядку `preset.summary`, а не в порядку форми: «головне» — це
 * те, що читають першим, і його порядок — рішення того, хто описував вид.
 * Порожнє головне поле у стрічку не потрапляє: стрічка з прочерком казала б
 * «не заповнено» голосніше за сам факт, а порожнє поле тут — робочий стан.
 */
export function splitPrintSpecEntries(
  preset: PrintSpecPreset,
  entries: PrintSpecEntry[]
): { hero: PrintSpecEntry[]; rest: PrintSpecEntry[] } {
  const wanted = preset.summary ?? [];
  const hero = wanted
    .map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is PrintSpecEntry => entry !== undefined);
  const rest = entries.filter((entry) => !wanted.includes(entry.id));
  return { hero, rest };
}

/**
 * Чи є в конфігурації хоч одне заповнене поле.
 *
 * Потрібно, щоб картка прорахунку відрізняла «параметрів ще немає» від «параметри
 * є»: заповнює їх не той, хто створює прорахунок, а той, хто його рахує, тож
 * порожня конфігурація — нормальний стан, а не помилка.
 */
export function isPrintSpecFilled(preset: PrintSpecPreset, values: PrintSpecValues): boolean {
  return preset.fields.some((field) => isPrintSpecFieldVisible(field, values) && isPrintSpecFieldFilled(field, values));
}

/**
 * Чи відповіли на це поле.
 *
 * Окремо від `isPrintSpecFilled` заради лічильників розділів: рейка питає те
 * саме поле за полем, і другий такий самий розбір «що вважати відповіддю»
 * розійшовся б із цим при першій же правці — надто що для `allowCustom`
 * відповідь лежить в іншому ключі, ніж сам вибір.
 *
 * Видимість тут НЕ перевіряється: у полі, схованого умовою, відповідь може
 * лишатись від попереднього вибору, і питати про неї має той, хто знає контекст.
 */
export function isPrintSpecFieldFilled(field: PrintSpecField, values: PrintSpecValues): boolean {
  const raw = values[field.id] ?? null;
  if (field.type === "multi") return asListValue(raw).length > 0;
  if (field.type === "sizeRows") {
    return asSizeRows(raw).some(
      (size) => size.width.trim() !== "" || size.height.trim() !== "" || (size.depth ?? "").trim() !== ""
    );
  }
  const value = asStringValue(raw).trim();
  if (value === CUSTOM_OPTION_VALUE) {
    return asStringValue(values[customValueKey(field.id)] ?? null).trim() !== "";
  }
  return value !== "";
}

export type PrintSpecSectionInfo = {
  title: string;
  fields: PrintSpecField[];
  /** На скільки полів розділу вже відповіли. */
  filled: number;
};

/**
 * Видимі розділи з лічильниками — одне джерело і для форми, і для картки.
 *
 * Розділ без жодного видимого поля не існує: у щоденнику «Ляссе» без вибраного
 * виду ляссе — це один порожній заголовок.
 */
export function getPrintSpecSections(preset: PrintSpecPreset, values: PrintSpecValues): PrintSpecSectionInfo[] {
  return preset.sections
    .map((title) => {
      const fields = preset.fields.filter(
        (field) => field.section === title && isPrintSpecFieldVisible(field, values)
      );
      return { title, fields, filled: fields.filter((field) => isPrintSpecFieldFilled(field, values)).length };
    })
    .filter((section) => section.fields.length > 0);
}

/** Видимі заповнені поля — знімок для «Лише незаповнені». */
export function getFilledPrintSpecFieldIds(preset: PrintSpecPreset, values: PrintSpecValues): Set<string> {
  return new Set(
    preset.fields
      .filter((field) => isPrintSpecFieldVisible(field, values) && isPrintSpecFieldFilled(field, values))
      .map((field) => field.id)
  );
}

/**
 * Чого бракує для ціни: видимі незаповнені поля зі стрічки «головне»
 * (`preset.summary` — те, від чого залежить ціна), у порядку стрічки.
 */
export function getPrintSpecMissingForPrice(preset: PrintSpecPreset, values: PrintSpecValues): PrintSpecField[] {
  return (preset.summary ?? [])
    .map((id) => preset.fields.find((field) => field.id === id))
    .filter(
      (field): field is PrintSpecField =>
        field !== undefined && isPrintSpecFieldVisible(field, values) && !isPrintSpecFieldFilled(field, values)
    );
}

export type PrintSpecColumnInfo = {
  title: string;
  sections: PrintSpecSectionInfo[];
  /** Видимих полів у стовпчику. */
  total: number;
  /** На скільки з них уже відповіли. */
  filled: number;
};

/**
 * Стовпчики вікна й картки — лише з видимими полями; стовпчик без жодного
 * видимого поля не існує. Без `columns` у пресеті — один стовпчик з усіма розділами.
 */
export function getPrintSpecColumns(preset: PrintSpecPreset, values: PrintSpecValues): PrintSpecColumnInfo[] {
  const sections = getPrintSpecSections(preset, values);
  const columns: PrintSpecColumn[] = preset.columns ?? [{ title: preset.label, sections: preset.sections }];
  return columns
    .map((column) => {
      const own = sections.filter((section) => column.sections.includes(section.title));
      return {
        title: column.title,
        sections: own,
        total: own.reduce((sum, section) => sum + section.fields.length, 0),
        filled: own.reduce((sum, section) => sum + section.filled, 0),
      };
    })
    .filter((column) => column.total > 0);
}

/** Незаповнені видимі поля стовпчика в порядку форми. */
export function getPrintSpecColumnMissing(column: PrintSpecColumnInfo, values: PrintSpecValues): PrintSpecField[] {
  return column.sections.flatMap((section) => section.fields).filter((field) => !isPrintSpecFieldFilled(field, values));
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
  const versions = parsePrintSpecVersions(preset, record.versions);
  return {
    presetKey,
    values: parsePrintSpecValues(preset, record.values),
    ...(versions.length > 0 ? { versions } : {}),
  };
}

/** Валідні знімки; зіпсований запис відкидаємо, а не валимо всю картку. */
function parsePrintSpecVersions(preset: PrintSpecPreset, raw: unknown): PrintSpecVersion[] {
  if (!Array.isArray(raw)) return [];
  const versions: PrintSpecVersion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.at !== "string" || Number.isNaN(Date.parse(record.at))) continue;
    if (!record.values || typeof record.values !== "object") continue;
    versions.push({
      at: record.at,
      pricedAt: typeof record.pricedAt === "string" ? record.pricedAt : null,
      values: parsePrintSpecValues(preset, record.values),
    });
  }
  return versions;
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
        if (!entry || typeof entry !== "object") return emptySize(field);
        const record = entry as Record<string, unknown>;
        const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
        return field.withDepth
          ? { width: text("width"), height: text("height"), depth: text("depth") }
          : { width: text("width"), height: text("height") };
      });
    } else if (typeof stored === "string") {
      values[field.id] = stored;
    }

    if (field.allowCustom) {
      const storedCustom = source[customValueKey(field.id)];
      if (typeof storedCustom === "string") values[customValueKey(field.id)] = storedCustom;
    }
  }

  // Збережене могли записати до правила, яке тепер робить варіант неіснуючим.
  return reconcilePrintSpecValues(preset, values);
}

// ---------------------------------------------------------------------------
// Зміни після ціни (REQ-323)
// ---------------------------------------------------------------------------

export type PrintSpecChange = { fieldId: string; label: string; section: string; from: string; to: string };

/** Статуси, у яких ціна вже є, але ще не затверджена: правка параметрів повертає на перерахунок. */
export const PRICED_QUOTE_STATUSES: ReadonlySet<string> = new Set(["estimated", "awaiting_approval"]);

/**
 * Значення поля, зведене до порівнянного вигляду: порожнє — завжди `""`, а
 * порядок вибору в «кількох зі списку» не важить. «Інше» порівнюється за
 * вписаним текстом, а не за службовим маркером.
 */
function normalizedFieldValue(field: PrintSpecField, values: PrintSpecValues): string {
  if (!isPrintSpecFieldVisible(field, values)) return "";
  const raw = values[field.id] ?? null;
  if (field.type === "multi") return [...asListValue(raw)].sort().join("|");
  if (field.type === "sizeRows") {
    const rows = (field.rows ?? []).map((_, index) => {
      const size = asSizeRows(raw)[index];
      const parts = [size?.width, size?.height, ...(field.withDepth ? [size?.depth] : [])];
      return parts.map((part) => (part ?? "").trim()).join("x");
    });
    return rows.every((row) => row.replaceAll("x", "") === "") ? "" : rows.join("|");
  }
  const value = asStringValue(raw).trim();
  if (field.type === "single" && value === CUSTOM_OPTION_VALUE) {
    const custom = asStringValue(values[customValueKey(field.id)] ?? null).trim();
    return custom ? `${CUSTOM_OPTION_VALUE}:${custom}` : "";
  }
  return value;
}

/**
 * Що змінилось між двома наборами значень — поля, видимі хоча б в одному з них.
 * Поле, яке стало невидимим, дає зміну «було X → порожньо».
 */
export function diffPrintSpec(
  preset: PrintSpecPreset,
  from: PrintSpecValues,
  to: PrintSpecValues
): PrintSpecChange[] {
  const changes: PrintSpecChange[] = [];
  for (const field of preset.fields) {
    if (normalizedFieldValue(field, from) === normalizedFieldValue(field, to)) continue;
    changes.push({
      fieldId: field.id,
      label: field.label,
      section: field.section,
      from: isPrintSpecFieldVisible(field, from) ? formatPrintSpecFieldValue(field, from) : "",
      to: isPrintSpecFieldVisible(field, to) ? formatPrintSpecFieldValue(field, to) : "",
    });
  }
  return changes;
}

type PriceSnapshotInput = { versions?: PrintSpecVersion[] | null; lastPricedAt?: string | null };

/**
 * Значення версії, яку рахували, — якщо вона ще актуальна.
 *
 * Знімок = версія, за яку менеджер бачив ціну. Щойно прорахунок порахували
 * знову (`lastPricedAt` пізніший за знімок), старий знімок застарів: ту ціну
 * вже замінила нова, і позначки «змінено після ціни» мусять зникнути.
 */
export function resolvePriceBaseline({ versions, lastPricedAt }: PriceSnapshotInput): PrintSpecValues | null {
  const last = versions?.[versions.length - 1];
  if (!last) return null;
  if (!lastPricedAt) return last.values;
  return Date.parse(last.at) > Date.parse(lastPricedAt) ? last.values : null;
}

/**
 * Чи треба зняти знімок перед збереженням правки: прорахунок уже рахували, а
 * знімка, зробленого після останнього «Пораховано», ще немає.
 */
export function needsPriceSnapshot(
  input: PriceSnapshotInput & { quoteStatus?: string | null }
): boolean {
  const priced =
    Boolean(input.lastPricedAt) ||
    PRICED_QUOTE_STATUSES.has(input.quoteStatus ?? "") ||
    input.quoteStatus === "approved";
  return priced && resolvePriceBaseline(input) === null;
}

/**
 * Нові метадані `printSpec` для запису. Наявні `versions` не губляться (раніше
 * запис перезаписував printSpec цілком), а знімок додається лише коли значення
 * справді змінились і прорахунок уже мав ціну.
 */
export function buildPrintSpecSave({
  preset,
  current,
  draft,
  quoteStatus,
  lastPricedAt,
  defaulted = [],
  now = new Date(),
}: {
  preset: PrintSpecPreset;
  /** Свіже `metadata.printSpec` з бази, не з пропса. */
  current: unknown;
  draft: PrintSpecValues;
  /**
   * Поля, у яких стоїть непідтверджене значення за замовчуванням. Вони пишуться
   * як усі, але правкою після ціни не рахуються — ні для статусу, ні для знімка.
   */
  defaulted?: string[];
  quoteStatus?: string | null;
  lastPricedAt?: string | null;
  now?: Date;
}): { printSpec: PrintSpecMetadata; changedAfterPrice: boolean } {
  const saved = parsePrintSpecMetadata(current);
  const savedValues = parsePrintSpecValues(preset, saved?.values ?? null);
  const versions = [...(saved?.versions ?? [])];
  // Перше заповнення — не зміна після ціни: прорахунок рахували без чекліста, і
  // знімок порожніх значень засвітив би жовтим усе, що людина вперше вписала.
  const firstFill = !isPrintSpecFilled(preset, savedValues);
  const changes = firstFill
    ? []
    : diffPrintSpec(preset, savedValues, draft).filter((change) => !defaulted.includes(change.fieldId));

  if (changes.length > 0 && needsPriceSnapshot({ versions, lastPricedAt, quoteStatus })) {
    // У знімок лягають і значення за замовчуванням: версія, яку рахували, їх «мала».
    const snapshot = { ...savedValues };
    for (const id of defaulted) snapshot[id] = draft[id] ?? null;
    versions.push({ at: now.toISOString(), pricedAt: lastPricedAt ?? null, values: snapshot });
  }

  return {
    printSpec: { presetKey: preset.key, values: draft, ...(versions.length > 0 ? { versions } : {}) },
    changedAfterPrice: changes.length > 0 && PRICED_QUOTE_STATUSES.has(quoteStatus ?? ""),
  };
}

/** Один підхід до параметрів: версія, яку рахували, або поточні значення. */
export type PrintSpecRound = {
  /** «В1», «В2», … або «Зараз». */
  label: string;
  /** Коли цю версію порахували; `null` — ще ні або невідомо. */
  pricedAt: string | null;
  /** Для «Зараз» — коли зроблено першу правку після ціни. */
  at: string | null;
  values: PrintSpecValues;
  /** Поточні значення, за які ще не бачили ціни. */
  unpriced: boolean;
  /** Відносно попереднього раунду; у першого порожньо. */
  changes: PrintSpecChange[];
};

/**
 * Раунди для перемикача версій на картці. Без жодного знімка історії немає —
 * параметри ще не мінялись після ціни.
 */
export function buildPrintSpecRounds(
  preset: PrintSpecPreset,
  versions: PrintSpecVersion[] | null | undefined,
  currentValues: PrintSpecValues,
  lastPricedAt: string | null | undefined
): PrintSpecRound[] {
  const list = versions ?? [];
  if (list.length === 0) return [];

  const rounds: Omit<PrintSpecRound, "changes">[] = list.map((version, index) => ({
    label: `В${index + 1}`,
    pricedAt: version.pricedAt,
    at: version.at,
    values: version.values,
    unpriced: false,
  }));

  const last = list[list.length - 1];
  if (resolvePriceBaseline({ versions: list, lastPricedAt }) !== null) {
    rounds.push({ label: "Зараз", pricedAt: null, at: last.at, values: currentValues, unpriced: true });
  } else if (diffPrintSpec(preset, last.values, currentValues).length > 0) {
    // Після останнього знімка прорахунок уже перерахували: поточні значення — ще одна порахована версія.
    rounds.push({
      label: `В${list.length + 1}`,
      pricedAt: lastPricedAt ?? null,
      at: null,
      values: currentValues,
      unpriced: false,
    });
  }

  return rounds.map((round, index) => ({
    ...round,
    changes: index === 0 ? [] : diffPrintSpec(preset, rounds[index - 1].values, round.values),
  }));
}

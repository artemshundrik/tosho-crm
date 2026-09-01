/**
 * Тип угоди прорахунку — від нього залежить підставлена накрутка й дно ціни.
 *
 * ЗВІДКИ ВЗЯЛИСЬ ЧИСЛА. Олена 01.09.2026 прислала шкалу з чотирьох рівнів,
 * задану ЦІЛЬОВОЮ МАРЖИНАЛЬНІСТЮ (30 / 35 / 40 / 45 %) і поруч — відповідною
 * накруткою (42,9 / 53,8 / 66,7 / 81,8 %). Рішення Артема того ж дня: поле в
 * картці лишається «Накрутка, %», бо саме так CRM говорить із 30.08.2026, а
 * шкала Олени впроваджується в тих одиницях.
 *
 * ЧОМУ ДЖЕРЕЛОМ ТУТ Є МАРЖА, А НЕ НАКРУТКА. 53,8 — це округлення 53,846…, і
 * якби в коді лежало округлене число, підставлена ціна давала б 34,98 % маржі
 * замість рівних 35. Тому в таблиці нижче стоять круглі числа, які Олена
 * справді вирішувала, а накрутка з них рахується. Показуємо її через
 * `formatRatePercent`, і тоді на екрані стоїть рівно те, що в її таблиці.
 *
 * ДНО ЛЕЖИТЬ ОКРЕМИМ ПОЛЕМ, хоч сьогодні й дорівнює цілі. Рішення Артема
 * 01.09.2026 — «дно залежить від типу», тобто будь-яка знижка від підставленого
 * числа вмикає погодження. Заміряно на 164 тиражах, де менеджер справді ставив
 * ціну: так на погодження піде 56-82 % угод замість сьогоднішніх 13 %. Якщо це
 * виявиться забагато, послаблення має бути правкою `floorMargin` у цій таблиці,
 * а не переписуванням читачів — тому поле окреме.
 *
 * ЧИТАЧІ. Дно й підстановку більше не можна брати константою: до 01.09.2026 це
 * були `MIN_MARKUP_RATE` і `DEFAULT_MARKUP_RATE` у `quoteRuns`, і будь-який
 * читач мовчки отримував число, однакове для всіх угод. Тепер вони приймають
 * тип угоди. Додаєш місце, яке показує дно або підставляє накрутку, — клич
 * звідси, а не пиши число.
 */

export type QuoteDealType = "tender" | "standard" | "design" | "custom";

/**
 * ШКАЛА ДІЄ ЛИШЕ НА ПОЛІГРАФІЇ (рішення Артема 01.09.2026).
 *
 * Спершу її ввімкнули на все — і мерч, якого в базі 211 прорахунків із 291,
 * поїхав із дна 20 % на 53,8 %. Артем зупинив: домовленість з Оленою виросла з
 * поліграфії, а всередині неї — зі щоденників, які Таня досі рахує в телеграмі.
 * Мерч ніхто про це не питав, і його ціни цією розмовою не керуються.
 *
 * ЧОМУ САМЕ ПОЛІГРАФІЯ, А НЕ ЩОДЕННИКИ. Щоденника як виробу в каталозі ще
 * немає — немає набору полів (папір, кольоровість, ляссе, тиснення), і саме
 * тому щоденники живуть поза CRM. Поки його не заведено, найвужче, що система
 * вміє розрізнити, — це `quotes.quote_type = 'print'`. Коли щоденник з'явиться,
 * звузити далі буде правкою одного цього місця.
 */
export const DEAL_TYPE_QUOTE_TYPE = "print";

/**
 * Стара шкала — для мерчу й «іншого». Це НЕ запасний варіант і не тимчасове
 * значення: для них це чинне правило, ухвалене СЕО 30.08.2026, і воно лишається.
 */
export const LEGACY_DEFAULT_MARKUP_RATE = 40;
export const LEGACY_MIN_MARKUP_RATE = 20;

/** Порядок у перемикачі — від найдешевшої угоди до найдорожчої. */
export const DEAL_TYPE_ORDER: readonly QuoteDealType[] = [
  "tender",
  "standard",
  "design",
  "custom",
] as const;

/**
 * Що стоїть, поки менеджер не обрав інше, і чим читається порожня колонка.
 *
 * 291 наявний прорахунок заведено до появи типу. Вони не «без типу» — вони
 * стандартні виробничі: інакше дно на них не порахувалось би взагалі.
 */
export const DEFAULT_DEAL_TYPE: QuoteDealType = "standard";

export type QuoteDealTypeRule = {
  key: QuoteDealType;
  label: string;
  /** Рядок під перемикачем — коли обирати саме цей тип. */
  hint: string;
  /** Ціль Олени: яку частку виручки лишає ця угода після прямої собівартості. */
  targetMargin: number;
  /** Нижче цієї маржі ціну погоджує СЕО або головний бухгалтер. */
  floorMargin: number;
};

export const QUOTE_DEAL_TYPES: Record<QuoteDealType, QuoteDealTypeRule> = {
  tender: {
    key: "tender",
    label: "Тендер",
    hint: "Великий або конкурентний тендер",
    targetMargin: 30,
    floorMargin: 30,
  },
  standard: {
    key: "standard",
    label: "Стандартний виробничий",
    hint: "Звичайне виробниче замовлення",
    targetMargin: 35,
    floorMargin: 35,
  },
  design: {
    key: "design",
    label: "З дизайном і координацією",
    hint: "Дизайн, координація та відповідальність на нас",
    targetMargin: 40,
    floorMargin: 40,
  },
  custom: {
    key: "custom",
    label: "Малий тираж / кастом",
    hint: "Малий тираж, складний кастом або терміновість",
    targetMargin: 45,
    floorMargin: 45,
  },
};

/**
 * Маржа → накрутка. Прибуток той самий, база різна: маржа ділиться на ціну,
 * накрутка — на собівартість.
 *
 * Маржа 100 % і вище означала б ціну без собівартості — арифметично це вже не
 * націнка, а ділення на нуль. Такого числа в шкалі немає й бути не може, але
 * функція публічна, тож віддаємо скінченне значення замість Infinity.
 */
export function markupFromMargin(marginPercent: number): number {
  const margin = Number(marginPercent) || 0;
  if (margin >= 100) return Number.MAX_SAFE_INTEGER;
  return (margin / (100 - margin)) * 100;
}

/** Накрутка → маржа. Зворотний хід тієї самої формули. */
export function marginFromMarkup(markupPercent: number): number {
  const markup = Number(markupPercent) || 0;
  if (markup <= -100) return 0;
  return (markup / (100 + markup)) * 100;
}

/**
 * Чи діє шкала на цьому прорахунку, і якщо так — який у нього тип.
 *
 * `null` означає не «типу не вказали», а «шкала сюди не поширюється»: мерч і
 * «інше» лишаються на старих 40 / 20. Саме тому решта функцій приймає `null` і
 * віддає на нього СТАРІ числа, а не підставляє «стандартний виробничий».
 */
export function resolveQuoteDealType(
  quoteType: string | null | undefined,
  dealType: string | null | undefined
): QuoteDealType | null {
  if ((quoteType ?? "").trim().toLowerCase() !== DEAL_TYPE_QUOTE_TYPE) return null;
  return normalizeQuoteDealType(dealType);
}

/** Чуже або порожнє значення читаємо як стандартний виробничий, а не як «немає». */
export function normalizeQuoteDealType(value: string | null | undefined): QuoteDealType {
  if (typeof value !== "string") return DEFAULT_DEAL_TYPE;
  const key = value.trim().toLowerCase();
  return (DEAL_TYPE_ORDER as readonly string[]).includes(key)
    ? (key as QuoteDealType)
    : DEFAULT_DEAL_TYPE;
}

/**
 * Накрутка, яку система підставляє на новий тираж цього прорахунку.
 *
 * `null` (не поліграфія) — стара підстановка 40 %, і це навмисно: мерч цією
 * шкалою не керується.
 */
export function defaultMarkupRateFor(type: QuoteDealType | null | undefined): number {
  if (!type) return LEGACY_DEFAULT_MARKUP_RATE;
  return markupFromMargin(QUOTE_DEAL_TYPES[type].targetMargin);
}

/** Накрутка, нижче якої вмикається погодження. `null` — старе дно 20 %. */
export function minMarkupRateFor(type: QuoteDealType | null | undefined): number {
  if (!type) return LEGACY_MIN_MARKUP_RATE;
  return markupFromMargin(QUOTE_DEAL_TYPES[type].floorMargin);
}

/**
 * Відсоток у вигляді, у якому його написала Олена: 53,8 — а не 53,85 і не 53,8.
 *
 * Один знак після коми й кома замість крапки — це мова інтерфейсу CRM, і саме
 * цим числом менеджер називає ціну вголос.
 */
export function formatRatePercent(rate: number): string {
  const value = Number(rate) || 0;
  return value
    .toLocaleString("uk-UA", { minimumFractionDigits: 0, maximumFractionDigits: 1 })
    .replace(/ /g, " ");
}

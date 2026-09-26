/**
 * Комерційна пропозиція (КП) — збірка документа й усі його виходи, крім прев'ю.
 *
 * ЧОТИРИ ВИХОДИ, і всі вони мусять показувати одні й ті самі числа:
 *   1. прев'ю на екрані — розмітка в `QuotesPage` (React), бере готовий `doc`;
 *   2. HTML для друку — `renderCommercialDocumentHtml`;
 *   3. PDF — той самий HTML, який браузер друкує в PDF;
 *   4. TSV для Excel — `buildCommercialExcelTsv`.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ. Усе це жило в `QuotesPage.tsx` замиканнями всередині
 * компонента — 380 рядків чистих функцій, які нічого не знали про React і не
 * мали як бути покритими тестами. Тепер документ збирається й перевіряється
 * без сторінки, а сторінка лишає собі те, що справді її: походи в базу
 * (`buildCommercialDocument`), друк через iframe і розмітка прев'ю.
 */

import { getAgencyLogo, getAgencyLockup } from "@/lib/agencyAssets";
import type { QuoteItemExportRow } from "@/lib/toshoApi";
import { moneyRangeOf, sumMoneyRanges, type MoneyRange } from "@/lib/moneyRange";

export type { MoneyRange };

/**
 * Пояснення про тиражі — один текст на всі чотири виходи.
 *
 * Текст переписано 21.09.2026 разом із рішенням прибрати «Разом»: раніше він
 * обіцяв підсумок межами («від найменшого тиражу до найбільшого»), а меж у
 * документі більше немає — поки замовник не обрав позиції й тираж, єдиної суми
 * не існує.
 */
/**
 * Логотип у шапці документа — той самий файл, що й у сайдбарі (`getAgencyLogo`),
 * а не друга копія й не слово «ToSho» текстом.
 *
 * ВАРІАНТ ЗАВЖДИ СВІТЛИЙ: сторінка документа біла в усіх виходах — і на екрані,
 * і в друці, і в PDF, — тож теми тут немає й вибирати нема з чого. Тёмний файл
 * на білому аркуші був би невидимий.
 *
 * Адреса, а не вбудований SVG: інакше байти лого жили б у двох місцях і
 * розійшлися б при першій же зміні бренду.
 */
export const OFFER_LOGO_URL = getAgencyLogo("light");

export const RUN_CHOICE_NOTE =
  "У пропозиції є позиції з кількома тиражами. Тиражі взаємовиключні — ви обираєте один, тому ціна наведена окремо для кожного тиражу, а спільного підсумку в документі немає.";

/**
 * Один тираж позиції: своя кількість, своя ціна за штуку, своя сума.
 *
 * Тиражі ВЗАЄМОВИКЛЮЧНІ — замовник обирає один із них, а не купує всі. Тому
 * складати їх між собою не можна ніде: ні кількості, ні суми. Раніше КП саме
 * це й робило — «100 + 150 + 200» перетворювалось на неіснуючий тираж 450 шт
 * із середньою ціною, і замовник бачив пропозицію, якої ми ніколи не давали.
 */
export type CommercialRunRow = {
  id: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type CommercialItemRow = {
  id: string;
  position: number;
  imageUrl: string;
  name: string;
  catalogPath: string;
  description: string;
  methodsSummary: string;
  placementSummary: string;
  unit: string;
  /**
   * Завжди щонайменше один запис, відсортовані за зростанням кількості.
   * Полів qty/unitPrice/lineTotal у позиції свідомо НЕМАЄ: поки тираж не
   * обрано, єдиної кількості й ціни в позиції не існує, і будь-яке таке поле
   * знову стало б середнім по взаємовиключних варіантах.
   */
  runs: CommercialRunRow[];
};

export type CommercialQuoteSection = {
  quoteId: string;
  quoteNumber: string;
  status: string;
  createdAt: string;
  visualizations: Array<{
    url: string;
    thumbUrl?: string;
    name: string;
  }>;
  items: CommercialItemRow[];
  totalRange: MoneyRange;
};

/**
 * Поля менеджера й терміну дії НЕОБОВ'ЯЗКОВІ й друкуються лише коли заповнені.
 * Плейсхолдерів на кшталт «[ТЕЛЕФОН]» у документі для замовника бути не може:
 * порожній рядок краще за видимий пропуск. З тієї ж причини в підвалі немає
 * ані терміну виготовлення, ані умов оплати й доставки — у базі їх немає, а
 * вигадувати їх у документі, який поїде клієнту, не можна (рішення Артема
 * 21.09.2026).
 *
 * НОМЕРА ПРОПОЗИЦІЇ ТЕЖ НЕМАЄ. Була спокуса завести власний «КП-MMYY-NNNN»,
 * щоб не світити внутрішній TS-, але це лічильник, якого ніхто не просив:
 * друкуємо номер прорахунку як є.
 */
export type CommercialDocument = {
  title: string;
  /**
   * Назва клієнта вже в тому вигляді, в якому її бачить клієнт
   * (`cleanCustomerName`). Порожня — клієнта не вказано, і рядка «для …» немає.
   */
  customerName: string;
  createdAt: string;
  generatedAt: string;
  currency: string;
  sections: CommercialQuoteSection[];
  /**
   * Сума всіх позицій. У документі НЕ друкується (позиції — варіанти на вибір),
   * лишається для внутрішніх екранів, які показують порядок величини.
   */
  totalRange: MoneyRange;
  validUntil?: string;
  manager?: {
    name: string;
    phone?: string;
    email?: string;
  };
};

/**
 * Підсумок одного прорахунку в документі — сума позицій, де кожна позиція
 * входить СВОЇМИ межами по взаємовиключних тиражах (`moneyRangeOf`).
 *
 * Позиції складаються: це різні товари. Другого рівня взаємовиключності —
 * між позиціями — у документі немає; роль «варіант», яка його давала,
 * прибрана як невживана (див. `@/lib/moneyRange`).
 */
export function commercialSectionTotalRange(items: readonly CommercialItemRow[]): MoneyRange {
  return sumMoneyRanges(items.map((item) => moneyRangeOf(item.runs.map((run) => run.lineTotal))));
}

/**
 * Копійки або є обидві, або їх немає зовсім.
 *
 * Було `min 0 / max 2`, і документ показував «17 276,1 грн» поруч із
 * «24 290 грн» та «575,87 грн» — три різні види числа на одній сторінці. Одна
 * цифра після коми читається як обрізана сума, а в документі про гроші це
 * найгірше, що можна зробити.
 */
/**
 * Рахуємо копійки, а не дивимось на `Number.isInteger`: 50 × 309,04 у двійковому
 * дробі дає 15452.000000000002, і документ показував «15 452,00 грн» поруч із
 * «24 290 грн».
 */
const moneyDigits = (value: number) => (Math.round(value * 100) % 100 === 0 ? 0 : 2);
export const formatMoney = (value: number) =>
  `${new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: moneyDigits(value),
    maximumFractionDigits: moneyDigits(value),
  }).format(value)} грн`;
export const formatMoneyPlain = (value: number) =>
  new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: moneyDigits(value),
    maximumFractionDigits: moneyDigits(value),
  }).format(value);
/**
 * Підсумок для взаємовиключних тиражів. Поки замовник не обрав тираж, точної
 * суми не існує — показуємо межі. Один тираж ⇒ межі збігаються ⇒ звичайне число,
 * тобто для звичайних КП вигляд не змінюється.
 */
export const formatMoneyRange = (range: MoneyRange) =>
  Math.abs(range.max - range.min) < 0.005
    ? formatMoney(range.min)
    : `від ${formatMoney(range.min)} до ${formatMoney(range.max)}`;
export const formatMoneyRangePlain = (range: MoneyRange) =>
  Math.abs(range.max - range.min) < 0.005
    ? formatMoneyPlain(range.min)
    : `від ${formatMoneyPlain(range.min)} до ${formatMoneyPlain(range.max)}`;
export const isMoneyRangeSpread = (range: MoneyRange) => Math.abs(range.max - range.min) >= 0.005;
export const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
/**
 * Назва методу береться з довідника за `method_id`, бо в самому записі її немає.
 *
 * Поля `method_name`/`name` лишились для старих записів і для імпорту, який
 * кладе назву поруч; новий прорахунок пише тільки id.
 */
export const parseMethodsSummary = (
  methods: QuoteItemExportRow["methods"],
  methodNameById?: ReadonlyMap<string, string>
) => {
  if (!Array.isArray(methods) || methods.length === 0) return "";
  const labels = methods
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const row = entry as Record<string, unknown>;
      const byId =
        typeof row.method_id === "string" ? methodNameById?.get(row.method_id) ?? "" : "";
      const methodName = String(row.method_name ?? row.methodName ?? row.name ?? byId).trim();
      const count = Number(row.count ?? 1) || 1;
      if (!methodName) return "";
      return count > 1 ? `${methodName} x${count}` : methodName;
    })
    .filter(Boolean);
  return labels.join(", ");
};
/** Розмір нанесення, який справді є: нуль і порожнє поле — це «не вказано». */
const toPositiveSize = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const parsePlacementSummary = (
  methods: QuoteItemExportRow["methods"],
  printPositionLabelById: Map<string, string>,
  fallbackPositionId?: string | null,
  fallbackWidthMm?: number | null,
  fallbackHeightMm?: number | null
) => {
  const parts: string[] = [];
  if (Array.isArray(methods)) {
    methods.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const row = entry as Record<string, unknown>;
      const posId = String(row.print_position_id ?? row.printPositionId ?? "").trim();
      const posLabelRaw = String(row.print_position_label ?? row.printPositionLabel ?? "").trim();
      const widthRaw = row.print_width_mm ?? row.printWidthMm ?? null;
      const heightRaw = row.print_height_mm ?? row.printHeightMm ?? null;
      const width = toPositiveSize(widthRaw);
      const height = toPositiveSize(heightRaw);
      const sizeLabel = width !== null && height !== null ? `${width}x${height} мм` : "";
      const posLabel = posLabelRaw || (posId ? printPositionLabelById.get(posId) ?? "" : "");
      const chunk = [posLabel, sizeLabel].filter(Boolean).join(" · ");
      if (chunk) parts.push(chunk);
    });
  }
  if (parts.length > 0) return parts.join(", ");
  const fallbackPositionLabel = fallbackPositionId ? printPositionLabelById.get(fallbackPositionId) ?? "" : "";
  /*
    ПОРОЖНЄ ПОЛЕ — НЕ НУЛЬ. `Number(null)` дає 0, і `Number.isFinite(0)` правда,
    тож позиція без розміру друкувалась замовнику як «0x0 мм». Гілка вище цю
    пастку вже обходила, а запасна — ні.
  */
  const fallbackWidth = toPositiveSize(fallbackWidthMm);
  const fallbackHeight = toPositiveSize(fallbackHeightMm);
  const fallbackSize =
    fallbackWidth !== null && fallbackHeight !== null ? `${fallbackWidth}x${fallbackHeight} мм` : "";
  return [fallbackPositionLabel, fallbackSize].filter(Boolean).join(" · ");
};

/**
 * Назва товару без хвоста постачальника.
 *
 * «Ручка кулькова металева Simple, ТМ Totobi» — у документі для замовника
 * останні два слова зайві: це мітка НАШОГО постачальника, а не властивість
 * товару (зауваження власника 21.09.2026).
 *
 * ПРАВИЛО НАВМИСНО ВУЗЬКЕ — рівно хвіст рядка: «, ТМ <бренд>», «ТМ <бренд>» або
 * самотнє «ТМ» у кінці. Бренд усередині назви («Записна книжка Mem'O! А5») не
 * чіпаємо: відрізнити його від назви моделі нічим, а зіпсована назва в
 * комерційній пропозиції дорожча за зайве слово.
 */
export const stripSupplierTag = (name: string) =>
  name
    // Межа слова тут РУЧНА: `\b` у JS рахує лише латиницю, тож кириличне «ТМ»
    // повз нього проходило — саме той випадок, заради якого все й робиться.
    .replace(/[\s,;·–—-]*(?<!\p{L})(?:ТМ|TM)(?!\p{L})\s*[«"']?[\p{L}\p{N}&.-]*[»"']?\s*$/u, "")
    .replace(/[\s,;·–—-]+$/u, "")
    .trim();

/**
 * Назва клієнта в тому вигляді, в якому її бачить сам клієнт: у шапці КП і в
 * назві файлу (REQ-178#p41).
 *
 * У картці клієнта пишуть як доведеться, і до 26.09.2026 це їхало в документ
 * як є: «для ПРАТ "НОВІ ІНЖИНІРИНГОВІ ТЕХНОЛОГІЇ" (HYATT)». Правила нижче зняті
 * з усіх 105 назв, що траплялись у прорахунках за вісім місяців; 70 із них не
 * змінюються взагалі.
 *
 * - «ЧЕКБОКС /Checkbox» — друга половина дублює першу, лишається перша.
 *   «24/7» не чіпаємо: між цифрами це не роздільник.
 * - Дужки з малої літери — примітка менеджера («(сімі сім)»), не для клієнта.
 * - Юридична назва з брендом у дужках віддає бренд: «ПРАТ "…" (HYATT)» → «Hyatt».
 *   Саме так цього клієнта знаємо ми й знає він сам.
 * - Юридична форма на початку («ТОВ», «ПрАТ», «Благодійна організація») і
 *   «ФОП …» у хвості («Золабікс ФОП Чухвицька…») прибираються, лапки теж.
 * - КАПС від чотирьох літер стає звичайними літерами. Коротші слова лишаються:
 *   це абревіатури («ВКФ», «PAH», «ТАС»).
 *
 * Порожній рядок означає, що клієнта немає: ні «для …» у шапці, ні в назві файлу.
 */
const LEGAL_FORMS = [
  "товариство з обмеженою відповідальністю",
  "приватне акціонерне товариство",
  "публічне акціонерне товариство",
  "акціонерне товариство",
  "приватне підприємство",
  "державне підприємство",
  "комунальне підприємство",
  "міжнародний благодійний фонд",
  "благодійна організація",
  "благодійний фонд",
  "громадська організація",
  "тзов",
  "тов",
  "прат",
  "пат",
  "ат",
  "пп",
  "дп",
  "кп",
  "фоп",
  "го",
  "бо",
  "бф",
  "мбф",
  "llc",
  "ltd",
  "ngo",
];
// Межа слова ручна з тієї ж причини, що в `stripSupplierTag`: `\b` бачить лише латиницю.
const LEADING_LEGAL_FORM = new RegExp(
  `^(?:${LEGAL_FORMS.map((form) => form.replaceAll(" ", "\\s+")).join("|")})(?!\\p{L})[\\s.,]*`,
  "iu"
);
const TRAILING_FOP = /\s(?:фоп|фізична\s+особа\s*-\s*підприємець)(?!\p{L}).*$/iu;
const NAME_QUOTES = /[«»"„“”‟″]/gu;

const isShouted = (word: string) => {
  const letters = word.replaceAll(/\P{L}/gu, "");
  return (
    letters.length >= 4 &&
    letters === letters.toLocaleUpperCase("uk") &&
    letters !== letters.toLocaleLowerCase("uk")
  );
};

export const cleanCustomerName = (raw: string | null | undefined) => {
  let name = (raw ?? "").split(/(?<!\d)\/|\/(?!\d)/u)[0] ?? "";
  name = name.replaceAll(/\s*\(\s*\p{Ll}[^)]*\)/gu, " ").replaceAll(NAME_QUOTES, " ").trim();
  const bracketBrand = name.match(/\(\s*([^)]*?)\s*\)$/u)?.[1];
  if (bracketBrand && LEADING_LEGAL_FORM.test(name)) name = bracketBrand;
  name = name
    .replace(LEADING_LEGAL_FORM, "")
    .replace(TRAILING_FOP, "")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/^[\s,;·–—-]+|[\s,;·–—-]+$/gu, "");
  if (!/\p{L}{2}/u.test(name)) return "";
  name = name
    .split(" ")
    .map((word) =>
      isShouted(word)
        ? word.replaceAll(/\p{L}+/gu, (run) => run.charAt(0) + run.slice(1).toLocaleLowerCase("uk"))
        : word
    )
    .join(" ");
  return name.charAt(0).toLocaleUpperCase("uk") + name.slice(1);
};

/**
 * Назва КП без розширення: «ToSho — КП для Hyatt · TS-0926-0050» (REQ-178#p41).
 *
 * Команда обрала цей варіант із чотирьох 26.09.2026. Досі файл називався
 * «кп_прат_нові_інжинірингові_технології_hyatt_25_09_2026.pdf», і з цього
 * виросли три рішення.
 *
 * ВІДПРАВНИК ПЕРШИМ. Клієнт збирає КП від кількох постачальників, і файл без
 * нашої назви в нього губиться.
 *
 * НОМЕР, А НЕ ДАТА. Одному клієнту за день іде кілька КП (у ДАХ-сервіс 14.08 —
 * п'ять), і з датою всі вони мали однакову назву; браузер лише дописував «_1».
 * Номер той самий, що в шапці документа, і за ним прорахунок знаходиться в
 * CRM. Тим паче дата була днем створення прорахунку, а не надсилання.
 *
 * ТА САМА НАЗВА ВСЮДИ: файл, властивості PDF і `<title>` HTML — друк у PDF
 * бере назву саме звідти.
 *
 * Клієнта довшого за 40 знаків обрізаємо по слову, щоб назва не розросталась.
 */
const FILE_NAME_CUSTOMER_MAX = 40;
const FORBIDDEN_IN_FILE_NAME = /[\\/:*?"<>|\p{Cc}]/gu;

const cutByWords = (text: string, max: number) => {
  if (text.length <= max) return text;
  let result = "";
  for (const word of text.split(" ")) {
    const next = result ? `${result} ${word}` : word;
    if (next.length > max) break;
    result = next;
  }
  return result || text.slice(0, max);
};

export const getCommercialDocName = (doc: CommercialDocument) => {
  const numbers = doc.sections.map((section) => section.quoteNumber).filter(Boolean);
  const number = numbers.length > 1 ? `${numbers[0]} +${numbers.length - 1}` : (numbers[0] ?? "");
  const customer = cutByWords(doc.customerName.trim(), FILE_NAME_CUSTOMER_MAX);
  return [customer ? `ToSho — КП для ${customer}` : "ToSho — КП", number]
    .filter(Boolean)
    .join(" · ")
    .replaceAll(FORBIDDEN_IN_FILE_NAME, " ")
    .replaceAll(/\s+/g, " ")
    .replace(/[\s.]+$/u, "");
};

export const getCommercialDocFilename = (
  doc: CommercialDocument,
  extension: "xlsx" | "pdf" | "html"
) => `${getCommercialDocName(doc)}.${extension}`;

/**
 * Ініціали для позиції без фото — те саме правило для HTML і для прев'ю.
 *
 * Фото є у 334 позицій із 378 (заміряно 21.09.2026). З 44 порожніх сім можна
 * підтягнути з пулу за артикулом, решта 37 не мають ні моделі, ні артикула —
 * саме їм потрібна плитка. Сірий квадрат з іконкою «зображення» тут не годиться:
 * у документі для замовника він прямо каже «фото немає», тоді як плитка з
 * літерами читається як оформлення.
 */
export const initialsFor = (name: string) => {
  const words = name
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "—";
  const letters = words.slice(0, 2).map((word) => word[0] ?? "");
  return letters.join("").toLocaleUpperCase("uk-UA");
};

/**
 * Наскільки дешевша штука на цьому тиражі проти найменшого. Факт, а не порада:
 * числа обидва свої, ми лише рахуємо різницю. Менше за 1 % не показуємо — такий
 * рядок нічого не додає, лише шумить.
 */
export const unitDiscountPercent = (runs: readonly CommercialRunRow[], index: number) => {
  if (index === 0) return 0;
  const base = runs[0]?.unitPrice ?? 0;
  const current = runs[index]?.unitPrice ?? 0;
  if (base <= 0 || current <= 0 || current >= base) return 0;
  return Math.round((1 - current / base) * 100);
};

const documentHasRunChoice = (doc: CommercialDocument) =>
  doc.sections.some((section) => section.items.some((item) => item.runs.length > 1));

const countItems = (doc: CommercialDocument) =>
  doc.sections.reduce((sum, section) => sum + section.items.length, 0);

/**
 * Абзац під шапкою — перше, що замовник читає перед товарами.
 *
 * Не той вступ, що прибирали 21.09.2026 (REQ-297#p1): там був технічний рядок
 * про кількість позицій і ПДВ, тобто переказ того, що й так видно нижче. Цей
 * пояснює, ЧОМУ позицій кілька — їх підібрали на вибір, а не виставили рахунок
 * на все одразу. Без нього документ починається таблицею, і кілька варіантів
 * читаються як кілька окремих покупок.
 */
/**
 * Шапка й підвал документа (REQ-307).
 *
 * ЗАГОЛОВОК ГОВОРИТЬ ПРО ЗАМОВНИКА, а не про себе. «Комерційна пропозиція»
 * пішла в дрібний надпис над номером: слово, яке нічого не додає, займало
 * найбільший кегль на сторінці. Тепер перший рядок називає, що саме всередині
 * і для кого.
 */
export const OFFER_DOC_LABEL = "Комерційна пропозиція";
export const OFFER_HEADLINE = "Брендовані рішення";
export const OFFER_MOTTO = "ІДЕЯ. ДИЗАЙН. ВИРОБНИЦТВО.";

/** Повний лок-ап у шапці, чистий вордмарк у підвалі — див. `getAgencyLockup`. */
export const OFFER_LOCKUP_URL = getAgencyLockup();

export const OFFER_INTRO_TEXT =
  "Підібрали варіанти під ваш запит, щоб ви могли порівняти рішення та обрати оптимальне за бюджетом і тиражем.";

/**
 * Блок після товарів. Текст власника (22.09.2026) — переписувати його своїми
 * словами не можна: це те, чим агенція себе продає, а не пояснення механіки.
 */
export const OFFER_PARTNER_TITLE = "Один партнер замість кількох підрядників";
export const OFFER_PARTNER_TEXT =
  "ToSho бере на себе весь процес: підбір, дизайн і макети, брендування, виробництво, пакування та логістику.";

/**
 * Кінцівка документа — РІВНО ОДНЕ РЕЧЕННЯ (власник, 22.09.2026).
 *
 * До цього тут стояло зшите: спершу пояснення, чому немає єдиної суми, потім
 * прохання назвати позиції. Два речення робили з заклику абзац, і він тягнувся
 * на всю ширину сторінки там, де в макеті був короткий рядок.
 *
 * ПОЯСНЕННЯ ПРО СУМУ НЕ ЗНИКЛО — воно в ноті над кінцівкою (`RUN_CHOICE_NOTE`),
 * яка прямо каже, що спільного підсумку в документі немає. Повторювати те саме
 * двічі різними словами й було помилкою.
 *
 * Підсумок прибрано свідомо (REQ-296, закриває дірку REQ-267#p2): позиції
 * прорахунку — це варіанти, які замовник обирає, а документ складав їх
 * додаванням. На живому прорахунку TS-0926-0029 це давало «від 80 162 до
 * 120 618 ₴» там, де реальна вилка 34 257 – 85 276 ₴.
 */
export const OFFER_NEXT_STEP_TITLE = "Рухаємося далі?";
export const OFFER_NEXT_STEP_TEXT =
  "Напишіть, які позиції вам сподобались, і ми підготуємо фінальний прорахунок, візуалізації та уточнимо терміни.";

/** Текст кінцівки один на всі виходи й не залежить від складу документа. */
export const offerSummaryText = (_doc: CommercialDocument) => OFFER_NEXT_STEP_TEXT;

const renderPhotoCell = (item: CommercialItemRow) =>
  item.imageUrl
    ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" class="photo" />`
    : `<div class="photo photo-initials">${escapeHtml(initialsFor(item.name))}</div>`;

/**
 * Тиражі — ТАБЛИЦЕЮ, а не плитками в рядок (REQ-307).
 *
 * Плитки стояли праворуч від назви й не переносились. На двох тиражах це
 * працювало, на чотирьох назва товару стискалась у нуль: у PDF прорахунку
 * TS-0926-0043 «IT1332-21 Anti stress SOLO» склалося в стовпчик по літері, а
 * перша плитка налізла на назву. Таблиця росте вниз і витримує скільки завгодно
 * тиражів.
 *
 * Колонка «Вигода» з'являється лише коли в документі є позиція з кількома
 * тиражами: на єдиному тиражі вона була б стовпчиком прочерків.
 */
const renderRunTable = (item: CommercialItemRow, showGain: boolean) => {
  const rows = item.runs
    .map((run, index) => {
      const discount = unitDiscountPercent(item.runs, index);
      const gain = showGain
        ? `<td class="gain right">${discount > 0 ? `−${discount}&nbsp;% за ${escapeHtml(item.unit)}` : "—"}</td>`
        : "";
      return `<tr>
              <td>${formatMoneyPlain(run.qty)} ${escapeHtml(item.unit)}</td>
              <td class="unit">${formatMoneyPlain(run.unitPrice)} грн</td>
              <td class="sum right">${formatMoney(run.lineTotal)}</td>
              ${gain}
            </tr>`;
    })
    .join("");
  return `<table class="runs">
          <thead>
            <tr>
              <th class="c1">Тираж</th>
              <th class="c2">Ціна за шт.</th>
              <th class="c3 right">Вартість</th>
              ${showGain ? `<th class="right">Вигода</th>` : ""}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
};

const renderItemCard = (item: CommercialItemRow, showGain: boolean) => {
  const specs = [
    item.description,
    [item.methodsSummary, item.placementSummary].filter(Boolean).join(" — "),
  ].filter(Boolean);
  return `
      <article class="item">
        ${renderPhotoCell(item)}
        <div class="item-body">
          <div class="item-num">${String(item.position).padStart(2, "0")}</div>
          <h2 class="item-name">${escapeHtml(stripSupplierTag(item.name))}</h2>
          ${specs.map((line) => `<div class="item-spec">${escapeHtml(line)}</div>`).join("")}
          ${renderRunTable(item, showGain)}
        </div>
      </article>`;
};

/**
 * Документ для ЗАМОВНИКА, не вигрузка для нас (оформлення REQ-307).
 *
 * НІ ОДНІЄЇ ЗАЛИВКИ — і це не смак, а друк. Браузер за замовчуванням не друкує
 * фонові кольори, тож будь-яка підкладка зникала б на роздруку, а в PDF, де вона
 * малюється по-справжньому, аркуш виходив би сірим із білим полем по периметру —
 * принтери не вміють друк під обріз. Усе тримають волосяні лінії: екран, друк і
 * PDF показують одне й те саме.
 *
 * ЗАОКРУГЛЕННЯ КОНЦЕНТРИЧНІ: фото 4 + відступ картки 12 = картка 16. Зовнішній
 * радіус завжди дорівнює внутрішньому плюс відступ, інакше кути фото й картки не
 * паралельні.
 *
 * КЕГЛЬ РАХОВАНИЙ ПІД ПАПІР: сторінка A4 має ширину 794 px, тобто один піксель =
 * 0,75 pt. Текст у 12 px — це 9 pt, дрібно для друку; основний тут 13 px (≈10 pt).
 */
export const renderCommercialDocumentHtml = (doc: CommercialDocument) => {
  const hasRunChoice = documentHasRunChoice(doc);
  const showSectionHeads = doc.sections.length > 1;

  const sectionsHtml = doc.sections
    .map((section, sectionIndex) => {
      const itemsHtml =
        section.items.length === 0
          ? `<div class="empty">У цьому прорахунку немає товарних позицій.</div>`
          : section.items.map((item) => renderItemCard(item, hasRunChoice)).join("");

      return `
      ${
        showSectionHeads
          ? `<div class="section-head">${sectionIndex + 1}. ${escapeHtml(section.quoteNumber)}</div>`
          : ""
      }
      ${
        section.visualizations.length > 0
          ? `<div class="visual-group">
               <div class="eyebrow">Візуалізації</div>
               <div class="visual-grid">
                 ${section.visualizations
                   .map(
                     (file) =>
                       `<img src="${escapeHtml(file.url)}" alt="${escapeHtml(file.name || section.quoteNumber)}" class="visual-thumb" />`
                   )
                   .join("")}
               </div>
             </div>`
          : ""
      }
      <div class="items">${itemsHtml}</div>`;
    })
    .join("");

  const quoteNumbers = doc.sections.map((section) => section.quoteNumber).filter(Boolean);
  const numberLine = [
    quoteNumbers.length > 0 ? `№ ${escapeHtml(quoteNumbers.join(", "))}` : "",
    escapeHtml(doc.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

  const contactLines = doc.manager
    ? [
        `${escapeHtml(doc.manager.name)}, менеджер`,
        doc.manager.phone ? escapeHtml(doc.manager.phone) : "",
        doc.manager.email ? escapeHtml(doc.manager.email) : "",
      ].filter(Boolean)
    : [];

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(getCommercialDocName(doc))}</title>
<style>
  :root { color-scheme: light; }
  /* Roboto першим — саме ним складається PDF, тож на машині зі шрифтом усі
     чотири виходи збігаються до літери. */
  body { margin: 0; font-family: "Roboto", "Inter", "Segoe UI", system-ui, sans-serif; color: #0e0e10; background: #ececed; }
  .page { max-width: 794px; min-height: 1123px; margin: 0 auto; padding: 36px 46px; background: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; }
  .head { display: flex; align-items: flex-start; gap: 24px; }
  .lockup { height: 42px; width: auto; display: block; }
  .head-right { margin-left: auto; text-align: right; }
  .eyebrow { font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6b6c72; }
  .doc-no { font-size: 13px; font-weight: 600; margin-top: 5px; }
  .valid-label { margin-top: 10px; }
  .valid-value { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .lede { margin-top: 20px; }
  .lede h1 { margin: 0; font-size: 23px; font-weight: 700; letter-spacing: 0.01em; line-height: 1.2; text-transform: uppercase; }
  .lede-sub { font-size: 16px; font-weight: 500; color: #6b6c72; margin-top: 2px; }
  .intro { margin: 10px 0 0 0; font-size: 13px; line-height: 1.6; color: #6b6c72; max-width: 62ch; }
  .section-head { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6c72; margin: 18px 0 0 0; }
  .visual-group { margin-top: 14px; }
  .visual-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
  .visual-thumb { width: 150px; height: 106px; object-fit: cover; border-radius: 4px; border: 1px solid #e6e6e1; }
  .items { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
  .item { display: flex; gap: 16px; align-items: flex-start; border: 1px solid #dcdcd6; border-radius: 16px; padding: 12px; }
  .photo { width: 134px; height: 134px; flex-shrink: 0; box-sizing: border-box; border: 1px solid #e6e6e1; border-radius: 4px; object-fit: cover; background: #ffffff; }
  .photo-initials { display: flex; align-items: center; justify-content: center; background: #f4f7fc; color: #234f80; font-size: 26px; font-weight: 600; }
  .item-body { flex-grow: 1; min-width: 0; }
  .item-num { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: #b0136b; }
  .item-name { margin: 4px 0 0 0; font-size: 15.5px; font-weight: 600; line-height: 1.3; }
  .item-spec { font-size: 12px; color: #6b6c72; margin-top: 3px; }
  .runs { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .runs th { text-align: left; padding: 0 0 5px 0; font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #6b6c72; }
  .runs th.c1 { width: 26%; }
  .runs th.c2 { width: 24%; }
  .runs th.c3 { width: 26%; }
  .runs td { padding: 8px 0; border-top: 1px solid #e4e4e7; font-size: 13px; }
  .runs td.unit { color: #6b6c72; }
  .runs td.sum { font-size: 15px; font-weight: 700; }
  .runs td.gain { font-size: 11px; color: #026a46; }
  .runs .right { text-align: right; }
  .note { margin: 10px 0 0 0; font-size: 11px; line-height: 1.55; color: #8b8c92; }
  .closing { margin-top: 16px; padding-top: 14px; border-top: 1px solid #dcdcd6; }
  .closing h2 { margin: 0; font-size: 15px; font-weight: 600; }
  .closing p { margin: 5px 0 0 0; font-size: 13px; line-height: 1.6; color: #6b6c72; max-width: 64ch; }
  .empty { font-size: 13px; color: #6b6c72; padding: 12px 0; }
  .foot { margin-top: auto; padding-top: 14px; border-top: 1px solid #dcdcd6; display: flex; align-items: flex-end; gap: 24px; }
  .mark { height: 15px; width: auto; display: block; }
  .motto { font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; margin-top: 8px; }
  .foot-text { margin: 3px 0 0 0; font-size: 10.5px; line-height: 1.5; color: #6b6c72; max-width: 54ch; }
  .foot-right { text-align: right; font-size: 10.5px; color: #6b6c72; line-height: 1.55; white-space: nowrap; }
  @media print {
    body { background: #fff; }
    .page { max-width: none; min-height: 0; padding: 0; }
    @page { size: A4 portrait; margin: 14mm; }
    .item, .closing { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<main class="page">
  <header class="head">
    <img src="${escapeHtml(OFFER_LOCKUP_URL)}" alt="ToSho — Brand Experience &amp; Production" class="lockup" />
    <div class="head-right">
      <div class="eyebrow">${escapeHtml(OFFER_DOC_LABEL)}</div>
      <div class="doc-no">${numberLine}</div>
      ${
        doc.validUntil
          ? `<div class="eyebrow valid-label">Пропозиція дійсна до</div>
             <div class="valid-value">${escapeHtml(doc.validUntil)}</div>`
          : ""
      }
    </div>
  </header>
  <div class="lede">
    <h1>${escapeHtml(OFFER_HEADLINE)}</h1>
    ${doc.customerName ? `<div class="lede-sub">для ${escapeHtml(doc.customerName)}</div>` : ""}
  </div>
  <p class="intro">${escapeHtml(OFFER_INTRO_TEXT)}</p>
  ${sectionsHtml}
  ${hasRunChoice ? `<p class="note">${escapeHtml(RUN_CHOICE_NOTE)}</p>` : ""}
  <section class="closing">
    <h2>${escapeHtml(OFFER_NEXT_STEP_TITLE)}</h2>
    <p>${escapeHtml(offerSummaryText(doc))}</p>
  </section>
  <footer class="foot">
    <div style="flex-grow: 1;">
      <img src="${escapeHtml(OFFER_LOGO_URL)}" alt="ToSho" class="mark" />
      <div class="motto">${escapeHtml(OFFER_MOTTO)}</div>
      <p class="foot-text">${escapeHtml(OFFER_PARTNER_TEXT)}</p>
    </div>
    <div class="foot-right">
      ${contactLines.map((line) => `<div>${line}</div>`).join("")}
    </div>
  </footer>
</main>
</body>
</html>`;
};

/**
 * Той самий документ таблицею — для тих, хто рахує в Excel.
 *
 * ЧИСЛА ЛИШАЮТЬСЯ ЧИСЛАМИ. До 21.09.2026 це був TSV, у якому кількість і ціна
 * їхали вже відформатованими рядками («17 276,1» з нерозривним пробілом), тож
 * в Excel вони ставали текстом: ні підсумувати, ні відсортувати. Тепер аркуш
 * збирається значеннями, а вигляд лишається за Excel.
 *
 * ПОРЯДОК КОЛОНОК — це чужі шаблони й формули: вони рахують позиції зліва, і
 * зсув «Суми» мовчки зіпсував би їх усі. Міняти його можна лише свідомо.
 *
 * Рядків «Разом по прорахунку» й «Загальна сума» тут НЕМАЄ з тієї ж причини,
 * що й у друкованому документі: позиції — те, з чого замовник обирає, і будь-яка
 * їх сума описує замовлення, якого ніхто не робив.
 */
export const COMMERCIAL_SHEET_COLUMNS = [
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
] as const;

export type CommercialSheetCell = string | number | null;

export const buildCommercialSheetRows = (doc: CommercialDocument): CommercialSheetCell[][] => {
  const rows: CommercialSheetCell[][] = [];
  rows.push([doc.title]);
  if (doc.customerName) rows.push(["Замовник", doc.customerName]);
  rows.push(["Номер", doc.sections.map((section) => section.quoteNumber).join(", ")]);
  rows.push(["Сформовано", doc.generatedAt]);
  if (doc.validUntil) rows.push(["Дійсна до", doc.validUntil]);
  rows.push(["Позицій", countItems(doc)]);
  rows.push([]);
  // Тексти документа стоять ПЕРЕД таблицею, хоч у пропозиції два з них ідуть
  // після товарів: під таблицею на сотню рядків їх не прочитає ніхто, а порядок
  // абзаців у аркуші нічого не означає — на відміну від порядку колонок.
  rows.push([OFFER_INTRO_TEXT]);
  rows.push([`${OFFER_PARTNER_TITLE}. ${OFFER_PARTNER_TEXT}`]);
  rows.push([offerSummaryText(doc)]);
  rows.push([]);

  doc.sections.forEach((section, index) => {
    if (doc.sections.length > 1) {
      rows.push([`${index + 1}. ${section.quoteNumber}`]);
    }
    if (section.visualizations.length > 0) {
      rows.push(["Візуалізації", section.visualizations.map((item) => item.url).join(" | ")]);
    }
    rows.push([...COMMERCIAL_SHEET_COLUMNS]);
    if (section.items.length === 0) {
      rows.push([null, "Немає товарних позицій"]);
    } else {
      section.items.forEach((item) => {
        // Один рядок на КОЖЕН тираж. Опис товару в продовженні не повторюємо —
        // порожні клітинки читаються як «те саме, інший тираж».
        item.runs.forEach((run, runIndex) => {
          const first = runIndex === 0;
          rows.push([
            first ? item.position : null,
            first ? stripSupplierTag(item.name) : null,
            first ? item.description || null : null,
            first ? item.catalogPath || null : null,
            first ? item.placementSummary || null : null,
            first ? item.methodsSummary || null : null,
            run.qty,
            item.unit,
            run.unitPrice,
            run.lineTotal,
            first ? item.imageUrl || null : null,
          ]);
        });
      });
    }
    rows.push([]);
  });

  if (documentHasRunChoice(doc)) {
    rows.push([RUN_CHOICE_NOTE]);
  }
  return rows;
};

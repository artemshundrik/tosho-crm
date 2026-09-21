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
  kindLabel: string;
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

export const formatMoney = (value: number) =>
  `${new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)} грн`;
export const formatMoneyPlain = (value: number) =>
  new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
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
export const normalizeTextCell = (value: string) =>
  value.replaceAll(/\s+/g, " ").replaceAll("\t", " ").trim();
export const parseMethodsSummary = (methods: QuoteItemExportRow["methods"]) => {
  if (!Array.isArray(methods) || methods.length === 0) return "";
  const labels = methods
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const row = entry as Record<string, unknown>;
      const methodName = String(row.method_name ?? row.methodName ?? row.name ?? "").trim();
      const count = Number(row.count ?? 1) || 1;
      if (!methodName) return "";
      return count > 1 ? `${methodName} x${count}` : methodName;
    })
    .filter(Boolean);
  return labels.join(", ");
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
      const width = widthRaw == null || widthRaw === "" ? null : Number(widthRaw);
      const height = heightRaw == null || heightRaw === "" ? null : Number(heightRaw);
      const sizeLabel =
        Number.isFinite(width) && Number.isFinite(height) ? `${width}x${height} мм` : "";
      const posLabel = posLabelRaw || (posId ? printPositionLabelById.get(posId) ?? "" : "");
      const chunk = [posLabel, sizeLabel].filter(Boolean).join(" · ");
      if (chunk) parts.push(chunk);
    });
  }
  if (parts.length > 0) return parts.join(", ");
  const fallbackPositionLabel = fallbackPositionId ? printPositionLabelById.get(fallbackPositionId) ?? "" : "";
  const fallbackSize =
    Number.isFinite(Number(fallbackWidthMm)) && Number.isFinite(Number(fallbackHeightMm))
      ? `${Number(fallbackWidthMm)}x${Number(fallbackHeightMm)} мм`
      : "";
  return [fallbackPositionLabel, fallbackSize].filter(Boolean).join(" · ");
};

export const getCommercialDocFilename = (doc: CommercialDocument, extension: "xls" | "html") => {
  const raw = `${doc.kindLabel}_${doc.customerName}_${doc.createdAt}`;
  const sanitized = raw
    .toLowerCase()
    .replaceAll(/[^a-zа-яіїєґ0-9]+/gi, "_")
    .replaceAll(/^_+|_+$/g, "")
    .slice(0, 96);
  return `${sanitized || "commercial_offer"}.${extension}`;
};

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
const unitDiscountPercent = (runs: readonly CommercialRunRow[], index: number) => {
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

const pluralPositions = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "позиція";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "позиції";
  return "позицій";
};

/** Вступний абзац: скільки позицій і як на них відповісти. */
export const buildOfferIntro = (doc: CommercialDocument) => {
  const count = countItems(doc);
  const head = `У пропозиції ${count} ${pluralPositions(count)}.`;
  return documentHasRunChoice(doc)
    ? `${head} Для частини з них прораховано кілька тиражів — ви обираєте один тираж, а не замовляєте всі. Напишіть номери позицій і потрібний тираж, і ми порахуємо підсумок та терміни.`
    : `${head} Напишіть, які з них вас цікавлять, і ми порахуємо підсумок та терміни.`;
};

/**
 * Те, що стоїть у документі ЗАМІСТЬ «Разом».
 *
 * Підсумок прибрано свідомо (REQ-296, закриває дірку REQ-267#p2): позиції
 * прорахунку — це варіанти, які замовник обирає, а документ складав їх
 * додаванням. На живому прорахунку TS-0926-0029 це давало «від 80 162 до
 * 120 618 ₴» там, де реальна вилка 34 257 – 85 276 ₴. Менше число замість
 * більшого нічого не полагодило б: поки вибору немає, ЖОДНА сума не правдива.
 */
export const OFFER_SUMMARY_TEXT_WITH_RUNS =
  "Єдиної суми тут немає навмисно: вона залежить від того, які позиції й який тираж ви оберете. Назвіть номери — порахуємо підсумок того ж дня.";
export const OFFER_SUMMARY_TEXT_SINGLE_RUN =
  "Єдиної суми тут немає навмисно: вона залежить від того, які позиції ви оберете. Назвіть номери — порахуємо підсумок того ж дня.";

export const offerSummaryText = (doc: CommercialDocument) =>
  documentHasRunChoice(doc) ? OFFER_SUMMARY_TEXT_WITH_RUNS : OFFER_SUMMARY_TEXT_SINGLE_RUN;

const renderPhotoCell = (item: CommercialItemRow) =>
  item.imageUrl
    ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" class="photo" />`
    : `<div class="photo photo-initials">${escapeHtml(initialsFor(item.name))}</div>`;

const renderRunTile = (item: CommercialItemRow, runIndex: number) => {
  const run = item.runs[runIndex];
  const discount = unitDiscountPercent(item.runs, runIndex);
  return `
    <div class="run">
      <div class="run-qty">${formatMoneyPlain(run.qty)} ${escapeHtml(item.unit)}</div>
      <div class="run-unit">${formatMoneyPlain(run.unitPrice)} грн/${escapeHtml(item.unit)}</div>
      <div class="run-total">${formatMoney(run.lineTotal)}</div>
      ${discount > 0 ? `<div class="run-hint">−${discount}&nbsp;% за ${escapeHtml(item.unit)}</div>` : ""}
    </div>
  `;
};

const renderItemCard = (item: CommercialItemRow) => {
  const lines = [
    item.methodsSummary ? `Нанесення: ${escapeHtml(item.methodsSummary)}` : "",
    item.placementSummary ? `Місце: ${escapeHtml(item.placementSummary)}` : "",
  ].filter(Boolean);
  return `
    <article class="item">
      <div class="item-num">${item.position}</div>
      ${renderPhotoCell(item)}
      <div class="item-body">
        <div class="item-name">${escapeHtml(item.name)}</div>
        ${lines.length > 0 ? `<div class="item-line">${lines.join(" · ")}</div>` : ""}
        ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ""}
      </div>
      <div class="runs">${item.runs.map((_, index) => renderRunTile(item, index)).join("")}</div>
    </article>
  `;
};

/**
 * Документ для ЗАМОВНИКА, не вигрузка для нас.
 *
 * До 21.09.2026 це була ландшафтна таблиця на десять колонок, у якій замовник
 * бачив наш внутрішній номер прорахунку, наш статус («На погодженні»), рядок
 * «Прорахунків у документі» й колонку «Категорія / модель». Тепер портретний A4
 * і картки позицій: великий номер, щоб на нього посилались у відповіді, фото,
 * нанесення й тиражі плитками — явне «або/або» замість двох рядків, які легко
 * прочитати як «додається».
 */
export const renderCommercialDocumentHtml = (doc: CommercialDocument) => {
  const hasRunChoice = documentHasRunChoice(doc);
  const showSectionHeads = doc.sections.length > 1;

  const sectionsHtml = doc.sections
    .map((section, sectionIndex) => {
      const itemsHtml =
        section.items.length === 0
          ? `<div class="empty">У цьому прорахунку немає товарних позицій.</div>`
          : section.items.map((item) => renderItemCard(item)).join("");

      return `
        <section class="quote-section">
          ${
            showSectionHeads
              ? `<div class="section-head">${sectionIndex + 1}. ${escapeHtml(section.quoteNumber)}</div>`
              : ""
          }
          ${
            section.visualizations.length > 0
              ? `<div class="visual-group">
                   <div class="visual-label">Візуалізації</div>
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
          ${itemsHtml}
        </section>
      `;
    })
    .join("");

  const managerHtml = doc.manager
    ? `<div class="manager">${[
        `${escapeHtml(doc.manager.name)}, менеджер`,
        doc.manager.phone ? escapeHtml(doc.manager.phone) : "",
        doc.manager.email ? escapeHtml(doc.manager.email) : "",
      ]
        .filter(Boolean)
        .join("<br />")}</div>`
    : "";

  const quoteNumbers = doc.sections.map((section) => section.quoteNumber).filter(Boolean);
  const numberLine = [
    quoteNumbers.length > 0 ? `№ ${escapeHtml(quoteNumbers.join(", "))}` : "",
    `від ${escapeHtml(doc.createdAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: "Inter", "Segoe UI", sans-serif; color: #111213; background: #f4f5f6; }
  .page { max-width: 794px; margin: 0 auto; padding: 44px 48px; background: #ffffff; box-sizing: border-box; }
  .head { display: flex; align-items: flex-start; gap: 24px; }
  .head-left { flex-grow: 1; }
  .title { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
  .meta { margin-top: 8px; font-size: 12px; color: #5b5c62; }
  .head-right { text-align: right; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
  .manager { margin-top: 6px; font-size: 11px; color: #5b5c62; line-height: 1.6; }
  .rule { height: 2px; background: #111213; margin: 22px 0; }
  .party { display: flex; align-items: center; gap: 16px; }
  .party-label { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #5b5c62; }
  .party-name { font-size: 17px; font-weight: 600; margin-top: 3px; }
  .valid { margin-left: auto; background: #f0f1f2; border-radius: 8px; padding: 8px 12px; text-align: right; }
  .valid-label { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: #5b5c62; }
  .valid-value { font-size: 14px; font-weight: 600; margin-top: 2px; }
  .intro { margin: 22px 0 0 0; font-size: 13px; line-height: 1.6; color: #3a3b40; }
  .quote-section { margin-top: 22px; }
  .section-head { font-size: 13px; font-weight: 600; color: #5b5c62; margin-bottom: 10px; }
  .visual-group { margin-bottom: 12px; }
  .visual-label { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: #5b5c62; margin-bottom: 6px; }
  .visual-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .visual-thumb { width: 150px; height: 106px; object-fit: cover; border-radius: 8px; border: 1px solid #dbdce1; }
  .item { display: flex; gap: 14px; align-items: flex-start; border: 1px solid #dbdce1; border-radius: 12px; padding: 14px; margin-bottom: 10px; }
  .item-num { width: 26px; height: 26px; flex-shrink: 0; background: #f0f1f2; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: #5b5c62; }
  .photo { width: 84px; height: 84px; flex-shrink: 0; border-radius: 8px; object-fit: cover; background: #f0f1f2; }
  .photo-initials { display: flex; align-items: center; justify-content: center; background: #e3eaf4; color: #2a5c94; font-size: 22px; font-weight: 600; }
  .item-body { flex-grow: 1; min-width: 0; }
  .item-name { font-size: 14px; font-weight: 500; line-height: 1.35; }
  .item-line { font-size: 12px; color: #5b5c62; margin-top: 5px; }
  .item-desc { font-size: 12px; color: #5b5c62; margin-top: 4px; }
  .runs { display: flex; gap: 8px; flex-shrink: 0; }
  .run { width: 124px; box-sizing: border-box; border: 1px solid #dbdce1; border-radius: 8px; padding: 8px 10px; }
  .run-qty { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: #5b5c62; }
  .run-unit { font-size: 12px; color: #3a3b40; margin-top: 4px; }
  .run-total { font-size: 15px; font-weight: 600; margin-top: 2px; }
  .run-hint { font-size: 10px; color: #037c52; margin-top: 3px; }
  .empty { font-size: 13px; color: #5b5c62; padding: 12px 0; }
  .summary { margin-top: 24px; background: #f0f1f2; border-radius: 12px; padding: 18px 20px; }
  .summary-title { font-size: 14px; font-weight: 600; }
  .summary-text { margin: 6px 0 0 0; font-size: 12px; line-height: 1.6; color: #3a3b40; }
  .summary-note { margin: 10px 0 0 0; font-size: 11px; line-height: 1.6; color: #5b5c62; }
  .foot { margin-top: 16px; font-size: 11px; color: #5b5c62; text-align: center; }
  @media print {
    body { background: #fff; }
    .page { max-width: none; padding: 0; }
    @page { size: A4 portrait; margin: 14mm; }
    .item, .summary { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<main class="page">
  <header class="head">
    <div class="head-left">
      <h1 class="title">Комерційна пропозиція</h1>
      <div class="meta">${numberLine}</div>
    </div>
    <div class="head-right">
      <div class="brand">ToSho</div>
      ${managerHtml}
    </div>
  </header>
  <div class="rule"></div>
  <div class="party">
    <div>
      <div class="party-label">Для</div>
      <div class="party-name">${escapeHtml(doc.customerName)}</div>
    </div>
    ${
      doc.validUntil
        ? `<div class="valid">
             <div class="valid-label">Пропозиція дійсна до</div>
             <div class="valid-value">${escapeHtml(doc.validUntil)}</div>
           </div>`
        : ""
    }
  </div>
  <p class="intro">${escapeHtml(buildOfferIntro(doc))}</p>
  ${sectionsHtml}
  <div class="summary">
    <div class="summary-title">Підсумок</div>
    <p class="summary-text">${escapeHtml(offerSummaryText(doc))}</p>
    ${hasRunChoice ? `<p class="summary-note">${escapeHtml(RUN_CHOICE_NOTE)}</p>` : ""}
  </div>
  <div class="foot">Ціни вказані з ПДВ.</div>
</main>
</body>
</html>`;
};

/**
 * Той самий документ таблицею — для тих, хто рахує в Excel.
 *
 * Рядків «Разом по прорахунку» й «Загальна сума» тут БІЛЬШЕ НЕМАЄ з тієї ж
 * причини, що й у друкованому документі: позиції — варіанти на вибір, і будь-яка
 * їх сума описує замовлення, якого ніхто не робив. Зведення замовник збере сам,
 * коли обере позиції.
 */
export const buildCommercialExcelTsv = (doc: CommercialDocument) => {
  const lines: string[] = [];
  lines.push(normalizeTextCell(doc.title));
  lines.push(`Тип:\t${normalizeTextCell(doc.kindLabel)}`);
  lines.push(`Замовник:\t${normalizeTextCell(doc.customerName)}`);
  lines.push(`Номер:\t${normalizeTextCell(doc.sections.map((section) => section.quoteNumber).join(", "))}`);
  lines.push(`Сформовано:\t${normalizeTextCell(doc.generatedAt)}`);
  if (doc.validUntil) lines.push(`Дійсна до:\t${normalizeTextCell(doc.validUntil)}`);
  lines.push(`Позицій:\t${countItems(doc)}`);
  lines.push("");
  lines.push(normalizeTextCell(offerSummaryText(doc)));
  lines.push("");
  doc.sections.forEach((section, index) => {
    if (doc.sections.length > 1) {
      lines.push(`${index + 1}. ${normalizeTextCell(section.quoteNumber)}`);
    }
    lines.push(
      `Візуалізації\t${normalizeTextCell(
        section.visualizations.length > 0 ? section.visualizations.map((item) => item.url).join(" | ") : "—"
      )}`
    );
    lines.push("№\tТовар\tОпис\tКатегорія/модель\tМісце/розмір\tНанесення\tК-сть\tОд.\tЦіна\tСума\tФото URL");
    if (section.items.length === 0) {
      lines.push("\tНемає товарних позицій");
    } else {
      section.items.forEach((item) => {
        // Один рядок таблиці на КОЖЕН тираж. Опис товару повторювати не треба —
        // порожні клітинки в продовженні читаються як «те саме, інший тираж».
        item.runs.forEach((run, runIndex) => {
          const isFirst = runIndex === 0;
          lines.push(
            [
              isFirst ? item.position : "",
              isFirst ? normalizeTextCell(item.name) : "",
              isFirst ? normalizeTextCell(item.description || "—") : "",
              isFirst ? normalizeTextCell(item.catalogPath || "—") : "",
              isFirst ? normalizeTextCell(item.placementSummary || "—") : "",
              isFirst ? normalizeTextCell(item.methodsSummary || "—") : "",
              formatMoneyPlain(run.qty),
              normalizeTextCell(item.unit),
              formatMoneyPlain(run.unitPrice),
              formatMoneyPlain(run.lineTotal),
              isFirst ? normalizeTextCell(item.imageUrl || "—") : "",
            ].join("\t")
          );
        });
      });
    }
    lines.push("");
  });
  if (documentHasRunChoice(doc)) {
    lines.push(normalizeTextCell(RUN_CHOICE_NOTE));
  }
  return lines.join("\r\n");
};

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
import {
  hasVariantGroup,
  moneyRangeOf,
  quoteItemsTotalRange,
  type MoneyRange,
  type QuoteItemRangeEntry,
} from "@/lib/quoteItemVariants";

export type { MoneyRange };

/** Підпис ролі «варіант» у рядку документа — однаковий у всіх чотирьох виходах. */
export const VARIANT_ROW_LABEL = "Варіант";

/** Пояснення про варіанти — один текст на всі чотири виходи. */
export const VARIANT_GROUP_NOTE =
  "Позиції з позначкою «Варіант» взаємовиключні: замовник бере один із них, тому підсумок показано межами — від найдешевшого варіанта до найдорожчого.";

/** Пояснення про тиражі — теж один текст на всі виходи. */
export const RUN_CHOICE_NOTE =
  "У документі є позиції з кількома тиражами. Тиражі взаємовиключні — замовник обирає один, тому підсумок показано межами: від найменшого тиражу до найбільшого.";

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
   * Роль «варіант» (REQ-267#p2): позиція входить не в суму документа, а в
   * групу взаємовиключних. Джерело — `quote_items.metadata.isVariant`, читач
   * один на застосунок: `isVariantQuoteItem` із `@/lib/quoteItemVariants`.
   */
  isVariant: boolean;
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

export type CommercialDocument = {
  title: string;
  kindLabel: string;
  customerName: string;
  createdAt: string;
  generatedAt: string;
  currency: string;
  sections: CommercialQuoteSection[];
  totalRange: MoneyRange;
};

/**
 * Підсумок одного прорахунку в документі.
 *
 * Два рівні взаємовиключності, і плутати їх не можна:
 *   ТИРАЖІ всередині позиції — межі самої позиції (`moneyRangeOf`);
 *   ВАРІАНТИ між позиціями — межі групи замість доданків (`quoteItemsTotalRange`).
 *
 * Коли ролі «варіант» ні на кому немає, друга дія вироджується в звичайну суму
 * — тобто підсумок збігається з тим, що документ показував до REQ-267#p2.
 */
export function commercialSectionTotalRange(items: readonly CommercialItemRow[]): MoneyRange {
  return quoteItemsTotalRange(
    items.map(
      (item): QuoteItemRangeEntry => ({
        isVariant: item.isVariant,
        range: moneyRangeOf(item.runs.map((run) => run.lineTotal)),
      })
    )
  );
}

/** Чи є в документі група варіантів — від цього залежить пояснення під підсумком. */
export const documentHasVariantGroup = (doc: CommercialDocument) =>
  doc.sections.some((section) => hasVariantGroup(section.items));

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

export const renderCommercialDocumentHtml = (doc: CommercialDocument) => {
  const docHasRunChoice = doc.sections.some((section) =>
    section.items.some((item) => item.runs.length > 1)
  );
  const docHasVariants = documentHasVariantGroup(doc);
  const sectionsHtml = doc.sections
    .map((section, sectionIndex) => {
      const rowsHtml =
        section.items.length === 0
          ? `<tr><td colspan="10" class="empty">У цьому прорахунку немає товарних позицій.</td></tr>`
          : section.items
              .map(
                (item) => `
                  <tr>
                    <td>${item.position}</td>
                    <td>${
                      item.imageUrl
                        ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" class="thumb" />`
                        : `<div class="thumb placeholder">—</div>`
                    }</td>
                    <td>${
                      item.isVariant
                        ? `<div class="variant-tag">${escapeHtml(VARIANT_ROW_LABEL)}</div>`
                        : ""
                    }${escapeHtml(item.name)}${
                      item.description ? `<div class="cell-muted">${escapeHtml(item.description)}</div>` : ""
                    }</td>
                    <td>${escapeHtml(item.catalogPath || "—")}</td>
                    <td>${escapeHtml(item.placementSummary || "—")}</td>
                    <td>${escapeHtml(item.methodsSummary || "—")}</td>
                    <td class="num">${item.runs
                      .map((run) => `<div class="run-line">${formatMoneyPlain(run.qty)}</div>`)
                      .join("")}</td>
                    <td>${item.runs
                      .map(() => `<div class="run-line">${escapeHtml(item.unit)}</div>`)
                      .join("")}</td>
                    <td class="num">${item.runs
                      .map((run) => `<div class="run-line">${formatMoneyPlain(run.unitPrice)}</div>`)
                      .join("")}</td>
                    <td class="num">${item.runs
                      .map((run) => `<div class="run-line">${formatMoneyPlain(run.lineTotal)}</div>`)
                      .join("")}</td>
                  </tr>
                `
              )
              .join("");
      const sectionHasRunChoice = section.items.some((item) => item.runs.length > 1);
      const sectionHasVariants = hasVariantGroup(section.items);

      return `
        <section class="quote-section">
          <div class="section-head">
            <div class="section-title">${sectionIndex + 1}. ${escapeHtml(section.quoteNumber)}</div>
            <div class="section-meta">${escapeHtml(section.status)} · ${escapeHtml(section.createdAt)}</div>
          </div>
          ${
            section.visualizations.length > 0
              ? `<div class="visual-group">
                   <div class="visual-label">Візуалізації (${section.visualizations.length})</div>
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
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Фото</th>
                <th>Товар</th>
                <th>Категорія / модель</th>
                <th>Місце / розмір</th>
                <th>Нанесення</th>
                <th>К-сть</th>
                <th>Од.</th>
                <th>Ціна</th>
                <th>Сума</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="section-total">Разом по ${escapeHtml(section.quoteNumber)}: <b>${formatMoneyRange(
            section.totalRange
          )}</b>${
            sectionHasVariants
              ? `<span class="run-hint">залежно від обраного варіанта${
                  sectionHasRunChoice ? " і тиражу" : ""
                }</span>`
              : sectionHasRunChoice
                ? `<span class="run-hint">залежно від обраного тиражу</span>`
                : ""
          }</div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: "Inter", "Segoe UI", sans-serif; color: #0f172a; background: #ffffff; }
  .page { max-width: 1120px; margin: 0 auto; padding: 24px; }
  .head { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
  .title { font-size: 28px; font-weight: 700; margin: 0 0 6px; }
  .muted { color: #475569; font-size: 13px; }
  .summary { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; margin: 14px 0 22px; }
  .summary strong { font-size: 18px; }
  .quote-section { margin-bottom: 18px; }
  .section-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .section-title { font-size: 17px; font-weight: 700; }
  .section-meta { color: #334155; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; font-size: 13px; vertical-align: top; }
  th { background: #f8fafc; text-align: left; font-weight: 600; }
  td.num { text-align: right; white-space: nowrap; }
  td.empty { text-align: center; color: #475569; padding: 16px; }
  .thumb { width: 56px; height: 56px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; display: block; }
  .thumb.placeholder { display: inline-flex; align-items: center; justify-content: center; color: #64748b; font-size: 12px; }
  .cell-muted { margin-top: 4px; color: #475569; font-size: 12px; }
  .visual-group { margin: 0 0 10px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .visual-label { font-size: 12px; color: #334155; }
  .visual-grid { display: flex; gap: 8px; flex-wrap: wrap; }
  .visual-thumb { width: 180px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; }
  .section-total { display: flex; justify-content: flex-end; align-items: baseline; gap: 8px; margin-top: 8px; font-size: 14px; }
  .run-line { padding: 2px 0; }
  .run-line + .run-line { border-top: 1px dashed #e2e8f0; }
  .run-hint { color: #475569; font-size: 12px; }
  /* block + fit-content: назва товару має починатись із нового рядка, інакше
     довга назва обтікає пігулку й ламається навпіл. */
  .variant-tag { display: block; width: fit-content; margin-bottom: 4px; padding: 1px 6px; border: 1px solid #cbd5e1; border-radius: 999px; font-size: 11px; color: #334155; background: #f8fafc; }
  .total { margin-top: 20px; padding-top: 10px; border-top: 2px solid #0f172a; display: flex; justify-content: flex-end; font-size: 20px; font-weight: 700; }
  @media print {
    body { background: #fff; }
    .page { max-width: none; padding: 0; }
    @page { size: A4 landscape; margin: 10mm; }
    tr, td, th { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<main class="page">
  <header class="head">
    <div>
      <h1 class="title">${escapeHtml(doc.title)}</h1>
      <div class="muted">${escapeHtml(doc.kindLabel)} · Замовник: ${escapeHtml(doc.customerName)}</div>
      <div class="muted">Дата формування: ${escapeHtml(doc.generatedAt)}</div>
    </div>
  </header>
  <section class="summary">
    <div><b>Прорахунків у документі:</b> ${doc.sections.length}</div>
    <div><b>Номери:</b> ${escapeHtml(doc.sections.map((s) => s.quoteNumber).join(", "))}</div>
    <div><b>Підсумок "Разом":</b> <strong>${formatMoneyRange(doc.totalRange)}</strong></div>
    ${
      docHasVariants ? `<div class="muted">${escapeHtml(VARIANT_GROUP_NOTE)}</div>` : ""
    }
    ${
      docHasRunChoice ? `<div class="muted">${escapeHtml(RUN_CHOICE_NOTE)}</div>` : ""
    }
  </section>
  ${sectionsHtml}
  <div class="total">Разом: ${formatMoneyRange(doc.totalRange)}</div>
</main>
</body>
</html>`;
};

export const buildCommercialExcelTsv = (doc: CommercialDocument) => {
  const lines: string[] = [];
  lines.push(normalizeTextCell(doc.title));
  lines.push(`Тип:\t${normalizeTextCell(doc.kindLabel)}`);
  lines.push(`Замовник:\t${normalizeTextCell(doc.customerName)}`);
  lines.push(`Сформовано:\t${normalizeTextCell(doc.generatedAt)}`);
  lines.push(`Прорахунків:\t${doc.sections.length}`);
  lines.push(`Разом:\t${formatMoneyRangePlain(doc.totalRange)}`);
  lines.push("");
  doc.sections.forEach((section, index) => {
    lines.push(`${index + 1}. ${normalizeTextCell(section.quoteNumber)}\t${normalizeTextCell(section.status)}\t${normalizeTextCell(section.createdAt)}`);
    lines.push(
      `Візуалізації\t${normalizeTextCell(
        section.visualizations.length > 0 ? section.visualizations.map((item) => item.url).join(" | ") : "—"
      )}`
    );
    // Колонка «Роль» — ОСТАННЯ і додана, а не вставлена в середину: чужі
    // шаблони й формули в Excel рахують колонки зліва, і зсув «Суми» на одну
    // позицію мовчки зіпсував би їх усі.
    lines.push(
      "№\tТовар\tОпис\tКатегорія/модель\tМісце/розмір\tНанесення\tК-сть\tОд.\tЦіна\tСума\tФото URL\tРоль"
    );
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
              isFirst && item.isVariant ? VARIANT_ROW_LABEL : "",
            ].join("\t")
          );
        });
      });
    }
    lines.push(
      `\t\t\t\t\t\t\t\tРазом по прорахунку\t${formatMoneyRangePlain(section.totalRange)}`
    );
    lines.push("");
  });
  lines.push(`Загальна сума\t${formatMoneyRangePlain(doc.totalRange)}`);
  if (documentHasVariantGroup(doc)) {
    lines.push(normalizeTextCell(VARIANT_GROUP_NOTE));
  }
  if (doc.sections.some((section) => section.items.some((item) => item.runs.length > 1))) {
    lines.push(
      "Тиражі взаємовиключні: замовник обирає один варіант, тому підсумок показано межами."
    );
  }
  return lines.join("\r\n");
};

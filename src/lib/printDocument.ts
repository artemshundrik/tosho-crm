/**
 * Спільний «хром» друкованих документів, які відкриваються в окремій вкладці:
 * договір / специфікація / рахунок-акт (OrdersProductionDetailsPage) та
 * фінансові документи (features/finances/documentHtml).
 *
 * До виділення цей CSS жив ЧОТИРМА копіями (три <style>-блоки в одному файлі
 * замовлення + своя в documentHtml) і вже встиг розійтись у дрібницях
 * (line-height, паддінги, backdrop-filter). Тут — канонічна версія.
 *
 * НЕ для всіх друкованих документів: КП (QuotesPage) і прямий друк СП
 * (OrdersProductionPage) — інші родини без цієї шапки-тулбара, їх сюди не тягнути.
 *
 * Хардкод кольорів тут виправданий: це standalone-документи поза CSS
 * застосунку, вони мусять виглядати однаково незалежно від теми CRM.
 */

const escapePrintHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

/** Базовий хром: полотно, шапка з кнопками, аркуш, прибирання шапки при друці. */
const PRINT_CHROME_STYLES = (pageMaxWidth: number) => `
  body { font-family: Arial, sans-serif; color: #111827; margin: 0; line-height: 1.45; background: #f3f4f6; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 24px; background: rgba(255,255,255,0.96); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(8px); }
  .toolbar-title { font-size: 14px; color: #4b5563; }
  .toolbar-actions { display: flex; gap: 12px; }
  .toolbar-button { border: 1px solid #d1d5db; background: #ffffff; color: #111827; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .toolbar-button.primary { background: #111827; border-color: #111827; color: #ffffff; }
  .page { max-width: ${pageMaxWidth}px; margin: 24px auto; background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); padding: 36px; }
  @media print {
    body { background: #ffffff; }
    .toolbar { display: none; }
    .page { max-width: none; margin: 0; box-shadow: none; padding: 0; }
  }
`;

export type PrintDocumentParams = {
  /** <title> вкладки браузера. */
  title: string;
  /** Підпис у шапці поруч із кнопками «Закрити» / «Друк». */
  toolbarTitle: string;
  /** CSS конкретного документа — додається ПІСЛЯ хрому (може перекривати). */
  styles?: string;
  /** Розмітка всередині .page. Викликач сам відповідає за екранування даних. */
  bodyHtml: string;
  /** Ширина аркуша: 960 — документи замовлення, 900 — фінансові. */
  pageMaxWidth?: number;
};

export function renderPrintDocument({
  title,
  toolbarTitle,
  styles = "",
  bodyHtml,
  pageMaxWidth = 960,
}: PrintDocumentParams): string {
  return `<!doctype html>
    <html lang="uk">
      <head>
        <meta charset="utf-8" />
        <title>${escapePrintHtml(title)}</title>
        <style>
          ${PRINT_CHROME_STYLES(pageMaxWidth)}
          ${styles}
        </style>
      </head>
      <body>
        <div class="toolbar">
          <div class="toolbar-title">${escapePrintHtml(toolbarTitle)}</div>
          <div class="toolbar-actions">
            <button class="toolbar-button" type="button" onclick="window.close()">Закрити</button>
            <button class="toolbar-button primary" type="button" onclick="window.print()">Зберегти PDF / Друк</button>
          </div>
        </div>
        <div class="page">${bodyHtml}</div>
      </body>
    </html>`;
}

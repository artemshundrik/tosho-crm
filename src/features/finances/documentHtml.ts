// Document generation for the finance module: рахунки + акти звірки.
// Reuses the repo's HTML→popup→window.print() approach (no PDF library);
// Excel via an HTML-table blob with the ms-excel mime type. See
// src/pages/OrdersProductionDetailsPage.tsx (buildOrderDocumentHtml).

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const moneyFmt = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtMoney = (value: number): string => `${moneyFmt.format(value || 0)} грн`;

export const fmtDate = (value?: string | null): string => {
  if (!value) return "—";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("uk-UA");
  } catch {
    return value;
  }
};

const DOCUMENT_STYLES = `
  body { font-family: Arial, sans-serif; color: #111827; margin: 0; line-height: 1.45; background: #f3f4f6; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 24px; background: rgba(255,255,255,0.96); border-bottom: 1px solid #e5e7eb; }
  .toolbar-title { font-size: 14px; color: #4b5563; }
  .toolbar-actions { display: flex; gap: 12px; }
  .toolbar-button { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .toolbar-button.primary { background: #111827; border-color: #111827; color: #fff; }
  .page { max-width: 900px; margin: 24px auto; background: #fff; box-shadow: 0 10px 30px rgba(15,23,42,0.08); padding: 36px; }
  h1 { font-size: 22px; text-align: center; margin: 0 0 4px; }
  h2 { font-size: 14px; text-align: center; margin: 0 0 20px; font-weight: 600; color: #4b5563; }
  p { margin: 0 0 8px; font-size: 14px; }
  .muted { color: #6b7280; }
  .block { margin: 14px 0; font-size: 14px; }
  .block .label { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
  th { background: #f9fafb; font-weight: 700; }
  td.num, th.num { text-align: right; }
  .totals { margin-top: 12px; font-size: 14px; }
  .totals .row { display: flex; justify-content: flex-end; gap: 16px; }
  .totals .row .v { min-width: 160px; text-align: right; font-weight: 700; }
  .signature { margin-top: 36px; display: flex; justify-content: space-between; gap: 28px; font-size: 14px; }
  @media print { body { background: #fff; } .toolbar { display: none; } .page { max-width: none; margin: 0; box-shadow: none; padding: 0; } }
`;

const wrapDocument = (title: string, toolbarTitle: string, body: string): string => `<!doctype html>
<html lang="uk"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>${DOCUMENT_STYLES}</style></head>
<body>
  <div class="toolbar">
    <div class="toolbar-title">${escapeHtml(toolbarTitle)}</div>
    <div class="toolbar-actions">
      <button class="toolbar-button" type="button" onclick="window.close()">Закрити</button>
      <button class="toolbar-button primary" type="button" onclick="window.print()">Зберегти PDF / Друк</button>
    </div>
  </div>
  <div class="page">${body}</div>
</body></html>`;

/** Open an HTML document in a new tab with a print button (→ Save as PDF). */
export const openPrintableDocument = (html: string): boolean => {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    return true;
  } catch {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    popup.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }
};

/** Download an HTML table as an .xls file (opens in Excel). */
export const downloadHtmlAsExcel = (filename: string, bodyHtml: string): void => {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8" /></head><body>${bodyHtml}</body></html>`;
  const blob = new Blob(["﻿", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// --- Invoice (рахунок) ------------------------------------------------------

export type InvoiceDocParams = {
  number: string;
  issueDate: string | null;
  sellerName: string;
  sellerEdrpou?: string | null;
  sellerIpn?: string | null;
  sellerIban?: string | null;
  buyerName: string;
  orderNumber?: string | null;
  description: string;
  amount: number;
  vatRate?: number | null;
  vatAmount: number;
};

export const buildInvoiceHtml = (p: InvoiceDocParams): string => {
  const net = p.amount - (p.vatAmount || 0);
  const sellerLines = [
    p.sellerEdrpou ? `ЄДРПОУ: ${escapeHtml(p.sellerEdrpou)}` : "",
    p.sellerIpn ? `ІПН: ${escapeHtml(p.sellerIpn)}` : "",
    p.sellerIban ? `IBAN: ${escapeHtml(p.sellerIban)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const body = `
    <h1>РАХУНОК № ${escapeHtml(p.number || "—")}</h1>
    <h2>від ${escapeHtml(fmtDate(p.issueDate))}</h2>
    <div class="block"><span class="label">Постачальник:</span> <b>${escapeHtml(p.sellerName)}</b>${
      sellerLines ? `<br /><span class="muted">${sellerLines}</span>` : ""
    }</div>
    <div class="block"><span class="label">Платник:</span> <b>${escapeHtml(p.buyerName)}</b></div>
    <table>
      <thead><tr><th>№</th><th>Найменування</th><th class="num">Сума, грн</th></tr></thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>${escapeHtml(p.description)}${p.orderNumber ? ` (замовлення ${escapeHtml(p.orderNumber)})` : ""}</td>
          <td class="num">${escapeHtml(moneyFmt.format(net))}</td>
        </tr>
      </tbody>
    </table>
    <div class="totals">
      ${
        p.vatRate
          ? `<div class="row"><span>Без ПДВ:</span><span class="v">${escapeHtml(fmtMoney(net))}</span></div>
             <div class="row"><span>ПДВ ${escapeHtml(String(p.vatRate))}%:</span><span class="v">${escapeHtml(fmtMoney(p.vatAmount))}</span></div>`
          : `<div class="row"><span class="muted">Без ПДВ</span></div>`
      }
      <div class="row"><span><b>Разом до сплати:</b></span><span class="v">${escapeHtml(fmtMoney(p.amount))}</span></div>
    </div>
    ${p.sellerIban ? `<p class="muted">Оплата на IBAN: ${escapeHtml(p.sellerIban)}</p>` : ""}
    <div class="signature">
      <div>Виписав(ла): _______________________</div>
      <div>М.П.</div>
    </div>
  `;
  return wrapDocument(`Рахунок ${p.number}`, `Рахунок № ${p.number}`, body);
};

// --- Reconciliation (акт звірки) -------------------------------------------

export type ReconOperation = {
  date: string;
  doc: string;
  charged: number; // нараховано (рахунок)
  paid: number; // оплачено
};

export type ReconDocParams = {
  sellerName: string;
  buyerName: string;
  periodLabel: string;
  operations: ReconOperation[];
  openingBalance: number;
  closingBalance: number;
};

const reconRows = (ops: ReconOperation[]): string =>
  ops
    .map(
      (op) => `<tr>
        <td>${escapeHtml(fmtDate(op.date))}</td>
        <td>${escapeHtml(op.doc)}</td>
        <td class="num">${op.charged ? escapeHtml(moneyFmt.format(op.charged)) : ""}</td>
        <td class="num">${op.paid ? escapeHtml(moneyFmt.format(op.paid)) : ""}</td>
      </tr>`
    )
    .join("");

export const buildReconciliationHtml = (p: ReconDocParams): string => {
  const totalCharged = p.operations.reduce((s, o) => s + o.charged, 0);
  const totalPaid = p.operations.reduce((s, o) => s + o.paid, 0);
  const balanceWord =
    p.closingBalance > 0
      ? `Заборгованість на користь «${p.sellerName}»`
      : p.closingBalance < 0
        ? `Переплата замовника`
        : "Взаєморозрахунки урівноважені";
  const body = `
    <h1>АКТ ЗВІРКИ</h1>
    <h2>взаєморозрахунків за ${escapeHtml(p.periodLabel)}</h2>
    <div class="block"><span class="label">Постачальник:</span> <b>${escapeHtml(p.sellerName)}</b></div>
    <div class="block"><span class="label">Замовник:</span> <b>${escapeHtml(p.buyerName)}</b></div>
    <table>
      <thead><tr><th>Дата</th><th>Документ</th><th class="num">Нараховано</th><th class="num">Оплачено</th></tr></thead>
      <tbody>
        <tr><td></td><td>Сальдо на початок</td><td class="num"></td><td class="num">${escapeHtml(moneyFmt.format(p.openingBalance))}</td></tr>
        ${reconRows(p.operations)}
        <tr><th></th><th>Разом за період</th><th class="num">${escapeHtml(moneyFmt.format(totalCharged))}</th><th class="num">${escapeHtml(moneyFmt.format(totalPaid))}</th></tr>
      </tbody>
    </table>
    <div class="totals">
      <div class="row"><span><b>Сальдо на кінець:</b></span><span class="v">${escapeHtml(fmtMoney(Math.abs(p.closingBalance)))}</span></div>
    </div>
    <p>${escapeHtml(balanceWord)}.</p>
    <div class="signature">
      <div>Від постачальника: _______________ М.П.</div>
      <div>Від замовника: _______________ М.П.</div>
    </div>
  `;
  return wrapDocument(`Акт звірки ${p.buyerName}`, `Акт звірки — ${p.buyerName}`, body);
};

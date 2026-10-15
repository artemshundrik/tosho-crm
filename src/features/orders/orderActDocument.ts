import { executorCodesInline, splitVat } from "./orderExecutor";
import type { DerivedOrderRecord } from "./orderRecords";
import { amountInWords } from "@/lib/amountInWords";
import { renderPrintDocument } from "@/lib/printDocument";
import { toSignatureInitials } from "@/lib/signatureFormat";

/**
 * Акт здачі-прийняття робіт (надання послуг) — закривальний документ для послуг
 * (REQ-322#p3), за шаблоном бухгалтерії «Шаблон Акту для ФОП (2026)». Номер акта
 * веде BAS, тож у CRM він лишається порожнім «№ ___», як номер рахунку до виписки.
 */
type ActRecord = Pick<
  DerivedOrderRecord,
  | "executor"
  | "items"
  | "total"
  | "currency"
  | "quoteNumber"
  | "customerName"
  | "legalEntityLabel"
  | "customerSignatoryName"
  | "customerSignatoryPosition"
  | "customerTaxId"
  | "customerVatId"
  | "customerLegalAddress"
  | "invoiceNumber"
  | "invoiceDate"
>;

const escapeHtml = (value?: string | number | null) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const money = (value: number) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

// «18 вересня 2026 р.» — місяць у родовому дає лише повний формат дати.
const longDate = (date: Date) => {
  const label = date.toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
  return /р\.$/.test(label) ? label : `${label} р.`;
};

const shortDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export const buildOrderActHtml = (record: ActRecord, options: { date?: Date } = {}) => {
  const executor = record.executor;
  const date = longDate(options.date ?? new Date());
  const currencyLabel = record.currency === "USD" ? "дол. США" : record.currency === "EUR" ? "євро" : "грн";
  const wordsCurrency = record.currency === "USD" || record.currency === "EUR" ? record.currency : "UAH";
  const total = Number(record.total || 0);
  const { vat } = splitVat(total, executor.vatPayer);
  const customerTitle = record.legalEntityLabel || record.customerName;
  const customerSigner = record.customerSignatoryName?.trim() || "";
  const customerPosition = record.customerSignatoryPosition?.trim() || "Уповноважена особа";
  const customerInitials = toSignatureInitials(customerSigner) || customerSigner;
  const invoiceReference = record.invoiceNumber?.trim()
    ? ` по рахунку № ${record.invoiceNumber.trim()}${record.invoiceDate ? ` від ${shortDate(record.invoiceDate)}` : ""}`
    : "";
  const rows = record.items
    .map(
      (item) => `
        <tr>
          <td>- ${escapeHtml(item.name)}</td>
          <td class="qty">- ${escapeHtml(Number(item.qty || 0).toLocaleString("uk-UA"))} ${escapeHtml(item.unit || "посл.")}</td>
          <td class="num">${escapeHtml(money(Number(item.lineTotal || 0)))} ${escapeHtml(currencyLabel)}</td>
        </tr>`
    )
    .join("");
  const executorRequisites = [
    executor.companyName,
    executorCodesInline(executor),
    executor.iban ? `Р/р ${executor.iban}${executor.bank ? ` в ${executor.bank}` : ""}` : "",
    executor.taxStatus,
    executor.address ? `Адреса ${executor.address}` : "",
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");
  const customerRequisites = [
    customerTitle,
    record.customerTaxId?.trim() ? `ЄДРПОУ ${record.customerTaxId.trim()}` : "",
    record.customerVatId?.trim() ? `ІПН ${record.customerVatId.trim()}` : "",
    record.customerLegalAddress?.trim() ? `Адреса ${record.customerLegalAddress.trim()}` : "",
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  return renderPrintDocument({
    title: `Акт ${record.quoteNumber}`,
    toolbarTitle: `Акт ${record.quoteNumber}`,
    styles: `
      .approve { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; font-size: 14px; margin-bottom: 48px; }
      .approve .line { border-bottom: 1px solid #111827; width: 180px; height: 28px; margin: 14px 0 6px; }
      h1 { font-size: 17px; text-align: center; margin: 0; }
      h2 { font-size: 17px; text-align: center; margin: 2px 0 28px; }
      p { font-size: 14px; margin: 0 0 10px; }
      .items { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px; }
      .items td { padding: 3px 0; vertical-align: top; }
      .items .qty { width: 110px; white-space: nowrap; }
      .items .num { width: 140px; text-align: right; white-space: nowrap; }
      .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; font-size: 13px; margin-top: 36px; }
      .parties .line { border-bottom: 1px solid #111827; width: 200px; height: 28px; margin: 10px 0 4px; }
      .parties .note { font-size: 12px; margin: 4px 0 12px; }
      .parties .date { margin: 10px 0 6px; }
    `,
    bodyHtml: `
      <div class="approve">
        <div>
          <div>ЗАТВЕРДЖУЮ</div>
          <div style="margin-top:16px">${escapeHtml(executor.signatoryPositionDisplay)}</div>
          <div>${escapeHtml(executor.shortName)}</div>
          <div class="line"></div>
          <div>${escapeHtml(executor.signatureLabel)}</div>
        </div>
        <div>
          <div>ЗАТВЕРДЖУЮ</div>
          <div style="margin-top:16px">${escapeHtml(customerPosition)}</div>
          <div>${escapeHtml(customerTitle)}</div>
          <div class="line"></div>
          <div>${escapeHtml(customerInitials)}</div>
        </div>
      </div>

      <h1>АКТ № ________ від ${escapeHtml(date)}</h1>
      <h2>здачі-прийняття робіт (надання послуг)</h2>

      <p>Ми, представники Замовника ${escapeHtml(customerTitle)}${customerSigner ? ` ${escapeHtml(customerSigner)}` : ""}, з одного боку, та представник Виконавця ${escapeHtml(executor.shortName)} ${escapeHtml(executor.signatureLabel)}, з іншого боку, склали цей акт про те, що Виконавцем були проведені такі роботи (надані такі послуги)${escapeHtml(invoiceReference)}:</p>

      <table class="items"><tbody>${rows}</tbody></table>

      <p>Загальна вартість робіт (послуг) ${escapeHtml(money(total))} ${escapeHtml(currencyLabel)} (${escapeHtml(amountInWords(total, wordsCurrency))})${
        executor.vatPayer ? `, у т.ч. ПДВ ${escapeHtml(money(vat))} ${escapeHtml(currencyLabel)}` : ", без ПДВ"
      }.</p>
      <p>Сторони претензій одна до одної не мають.</p>

      <p style="margin-top:36px">Місце складання: м. Київ</p>
      <div class="parties">
        <div>
          <div>Від Виконавця*:</div>
          <div class="line"></div>
          <div>${escapeHtml(executor.signatureLabel)}</div>
          <div class="note">* Відповідальний за здійснення господарської операції і правильність її оформлення</div>
          <div class="date">${escapeHtml(date)}</div>
          ${executorRequisites}
        </div>
        <div>
          <div>Від Замовника:</div>
          <div class="line"></div>
          <div>${escapeHtml(`${customerPosition} ${customerSigner}`.trim())}</div>
          <div class="date">${escapeHtml(date)}</div>
          ${customerRequisites}
        </div>
      </div>
    `,
  });
};

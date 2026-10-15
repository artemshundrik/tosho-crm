import { ORDER_PAYMENT_TERMS_OPTIONS } from "@/features/orders/config";
import { executorPreamble, executorRequisiteLines, splitVat, VAT_RATE } from "@/features/orders/orderExecutor";
import {
  isCashlessPaymentMethod,
  markOrderDocumentCreated,
  type DerivedOrderRecord,
} from "@/features/orders/orderRecords";
import { declineToGenitive } from "@/lib/nameDeclension";
import { toSignatureInitials } from "@/lib/signatureFormat";

/**
 * «Одна СП на обрані»: кілька замовлень одного замовника в одній специфікації.
 * Перенесено зі сторінки списку замовлень без змін поведінки (REQ-322#p12).
 */
const normalizeText = (value?: string | null) => (value ?? "").trim().toLowerCase();


const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatPlainMoney = (value: number) =>
  new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatSpecDate = (value = new Date()) =>
  new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);

export const getSpecificationRecordBlocker = (record: DerivedOrderRecord) => {
  if (record.source !== "stored") return "СП можна додавати тільки зі створених замовлень.";
  if (record.items.length === 0) return "У замовленні немає позицій.";
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) return "СП створюється тільки для безготівки.";
  if (!record.contractCreatedAt) return "Спочатку потрібно створити договір.";
  if (!record.docs.specification) return "У замовленні ще не виконані умови для СП.";
  return null;
};

const getSpecificationCustomerKey = (record: DerivedOrderRecord) =>
  [
    record.customerId || "",
    normalizeText(record.legalEntityLabel || record.customerName),
    normalizeText(record.customerTaxId),
  ].join("|");

export const getSpecificationGroupBlocker = (records: DerivedOrderRecord[]) => {
  if (records.length === 0) return "Обери хоча б одне замовлення для СП.";
  const first = records[0];
  const firstKey = getSpecificationCustomerKey(first);
  for (const record of records) {
    const blocker = getSpecificationRecordBlocker(record);
    if (blocker) return `${record.quoteNumber}: ${blocker}`;
    if (getSpecificationCustomerKey(record) !== firstKey) return "В одну СП можна додати тільки замовлення одного Замовника.";
    if ((record.ourLegalEntityId ?? "") !== (first.ourLegalEntityId ?? "")) {
      return "В одну СП можна додати тільки замовлення від однієї нашої юрособи.";
    }
    if (record.paymentTerms !== first.paymentTerms) return "Для групової СП обери замовлення з однаковими умовами оплати.";
    if (record.incotermsCode !== first.incotermsCode || (record.incotermsPlace ?? "") !== (first.incotermsPlace ?? "")) {
      return "Для групової СП обери замовлення з однаковими умовами Incoterms.";
    }
  }
  return null;
};

type BuildGroupedSpecOptions = {
  /** Підписант замовника у родовому відмінку (Кого?). */
  customerSignatoryNameGenitive?: string;
  /** Посада підписанта у родовому відмінку (Кого?). */
  customerSignatoryRoleGenitive?: string;
};

export const buildGroupedSpecificationHtml = (records: DerivedOrderRecord[], options: BuildGroupedSpecOptions = {}) => {
  const first = records[0];
  const rows = records.flatMap((record) =>
    record.items.map((item) => ({
      orderNumber: record.quoteNumber,
      item,
    }))
  );
  const totalWithVat = rows.reduce((sum, row) => sum + Number(row.item.lineTotal || 0), 0);
  // Від кого СП: ТОВ (з ПДВ) чи ФОП (без ПДВ) — REQ-322#p1–p2.
  const executor = first.executor;
  const vatPayer = executor.vatPayer;
  const totalWithoutVat = splitVat(totalWithVat, vatPayer).net;
  const vatAmount = totalWithVat - totalWithoutVat;
  const terms =
    ORDER_PAYMENT_TERMS_OPTIONS.find((item) => item.id === first.paymentTerms) ?? ORDER_PAYMENT_TERMS_OPTIONS[1];
  const advanceAmount = totalWithVat * (terms.advance / 100);
  const balanceAmount = totalWithVat - advanceAmount;
  const deliveryTerms = `${first.incotermsCode || "FCA"} (Incoterms 2020)${
    first.incotermsPlace ? `, ${first.incotermsPlace}` : ""
  }`;
  const dateLabel = formatSpecDate();
  const numberLabel = records.map((record) => record.quoteNumber).join(", ");
  const customerTitle = first.legalEntityLabel || first.customerName;
  const customerSignatoryRole = first.customerSignatoryPosition || "уповноваженої особи";
  // Для тіла документа ("в особі ...") — посада у родовому відмінку, з малої літери.
  const customerSignatoryRoleGenitive = options.customerSignatoryRoleGenitive?.trim() || customerSignatoryRole;
  const customerSignatoryRoleBody = customerSignatoryRoleGenitive
    ? customerSignatoryRoleGenitive.charAt(0).toLocaleLowerCase("uk-UA") + customerSignatoryRoleGenitive.slice(1)
    : customerSignatoryRoleGenitive;
  const customerSignatoryName = first.customerSignatoryName || "Не вказано";
  // Підпис унизу СП — формат "І.П. Прізвище".
  const customerSignatureLabel = toSignatureInitials(first.customerSignatoryName) || customerSignatoryName;
  // Genitive form for body text; fallback to nominative if not supplied.
  const customerSignatoryNameBody = options.customerSignatoryNameGenitive?.trim() || customerSignatoryName;
  const customerAuthority = first.customerSignatoryAuthority || "Не вказано";
  // Статус ПДВ замовника — береться зі ставки в карті клієнта (як у договорі/details-spec).
  const buildVatStatusLabel = (rate?: string | null) => {
    const normalized = (rate ?? "").trim();
    if (!normalized || normalized === "none") return "Не є платником ПДВ.";
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric) || numeric < 0) return "Не є платником ПДВ.";
    if (numeric === 20) return "Є платником ПДВ на загальних підставах.";
    if (numeric === 0) return "Є платником ПДВ за нульовою ставкою.";
    return `Є платником ПДВ за ставкою ${numeric}%.`;
  };
  const customerVatStatus = buildVatStatusLabel(first.customerVatRate);
  const itemRows = rows
    .map(({ orderNumber, item }, index) => {
      const unitPriceWithVat = Number(item.unitPrice || 0);
      const unitPriceWithoutVat = splitVat(unitPriceWithVat, vatPayer).net;
      const imageUrl = item.thumbUrl || item.imageUrl || "";
      const details = [
        item.description ? `<div class="muted small">${escapeHtml(item.description)}</div>` : "",
        item.methodsSummary ? `<div class="muted small">Нанесення: ${escapeHtml(item.methodsSummary)}</div>` : "",
        item.catalogSourceUrl ? `<div class="muted tiny">${escapeHtml(item.catalogSourceUrl)}</div>` : "",
      ].join("");
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(orderNumber)}</td>
          <td>${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" />` : ""}<strong>${escapeHtml(item.name)}</strong>${details}</td>
          <td class="num">${escapeHtml(item.qty.toLocaleString("uk-UA"))}</td>
          <td class="num">${escapeHtml(formatPlainMoney(unitPriceWithVat))}</td>
          ${vatPayer ? `<td class="num">${escapeHtml(formatPlainMoney(unitPriceWithoutVat))}</td>` : ""}
          <td class="num">${escapeHtml(formatPlainMoney(item.lineTotal))}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
  <html lang="uk">
    <head>
      <meta charset="utf-8" />
      <title>СП ${escapeHtml(numberLabel)}</title>
      <style>
        @page { size: A4; margin: 16mm; }
        body { font-family: Arial, sans-serif; color: #111827; font-size: 12px; line-height: 1.42; }
        h1, h2 { margin: 0; text-align: center; }
        h1 { font-size: 18px; letter-spacing: .04em; }
        h2 { margin-top: 6px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th, td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; }
        th { background: #f3f4f6; text-align: left; }
        img { display: block; width: 52px; height: 52px; object-fit: cover; border-radius: 6px; border: 1px solid #d1d5db; margin-bottom: 6px; }
        .topline { display: flex; justify-content: space-between; gap: 16px; margin: 18px 0 12px; }
        .section { margin-top: 16px; font-weight: 700; text-transform: uppercase; }
        .muted { color: #4b5563; }
        .small { margin-top: 4px; font-size: 11px; }
        .tiny { margin-top: 4px; font-size: 10px; }
        .num { text-align: right; white-space: nowrap; }
        .totals { margin-left: auto; width: 280px; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 18px; }
        .party { border: 1px solid #d1d5db; padding: 10px; min-height: 150px; }
        .signature { margin-top: 32px; border-top: 1px solid #111827; padding-top: 4px; }
      </style>
    </head>
    <body>
      <h1>СПЕЦИФІКАЦІЯ НА ВИГОТОВЛЕННЯ</h1>
      <h2>до замовлень ${escapeHtml(numberLabel)}</h2>
      <div class="topline">
        <div>Дата: ${escapeHtml(dateLabel)}</div>
        <div>Замовник: <strong>${escapeHtml(customerTitle)}</strong></div>
      </div>
      <p>${escapeHtml(executorPreamble(executor))}, з однієї сторони, та ${escapeHtml(customerTitle)} (надалі Замовник), в особі ${escapeHtml(customerSignatoryRoleBody)} ${escapeHtml(customerSignatoryNameBody)}, що діє на підставі ${escapeHtml(customerAuthority)}, з іншої сторони, підписали цю Специфікацію щодо наступної продукції:</p>
      <table>
        <thead>
          <tr>
            <th style="width:34px;">№</th>
            <th style="width:92px;">Замовлення</th>
            <th>Назва продукції</th>
            <th style="width:70px;">К-сть</th>
            <th style="width:92px;">${vatPayer ? "Ціна з ПДВ" : "Ціна"}</th>
            ${vatPayer ? `<th style="width:92px;">Ціна без ПДВ</th>` : ""}
            <th style="width:100px;">${vatPayer ? "Сума з ПДВ" : "Сума"}</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table class="totals">
        ${
          vatPayer
            ? `<tr><td>Разом без ПДВ</td><td class="num">${escapeHtml(formatPlainMoney(totalWithoutVat))} грн</td></tr>
        <tr><td>ПДВ ${VAT_RATE}%</td><td class="num">${escapeHtml(formatPlainMoney(vatAmount))} грн</td></tr>
        <tr><td><strong>Разом з ПДВ</strong></td><td class="num"><strong>${escapeHtml(formatPlainMoney(totalWithVat))} грн</strong></td></tr>`
            : `<tr><td><strong>Разом, без ПДВ</strong></td><td class="num"><strong>${escapeHtml(formatPlainMoney(totalWithVat))} грн</strong></td></tr>`
        }
      </table>
      <div class="section">Порядок оплати</div>
      <p>Оплата: ${escapeHtml(terms.label)}. Перед запуском: ${terms.advance}% (${escapeHtml(formatPlainMoney(advanceAmount))} грн${vatPayer ? " з ПДВ" : ""}). Після готовності: ${terms.balance}% (${escapeHtml(formatPlainMoney(balanceAmount))} грн${vatPayer ? " з ПДВ" : ""}). Спосіб оплати: ${escapeHtml(first.paymentRail)}.</p>
      <div class="section">Доставка</div>
      <p>Доставка продукції здійснюється на умовах ${escapeHtml(deliveryTerms)}.</p>
      <div class="parties">
        <div class="party">
          <strong>ВИКОНАВЕЦЬ</strong>
          ${executorRequisiteLines(executor, { addressLabel: "Юридична адреса: " })
            .map((line) => `<p>${escapeHtml(line)}</p>`)
            .join("")}
          <p class="signature">${escapeHtml(executor.signatoryPositionDisplay)} ${escapeHtml(executor.signatureLabel)}</p>
        </div>
        <div class="party">
          <strong>ЗАМОВНИК</strong>
          <p>${escapeHtml(customerTitle)}</p>
          <p>Юридична адреса: ${escapeHtml(first.customerLegalAddress || "Не вказано")}</p>
          <p>Код ЄДРПОУ: ${escapeHtml(first.customerTaxId || "Не вказано")}</p>
          <p>ІПН: ${escapeHtml(first.customerVatId || "Не вказано")}</p>
          <p>IBAN: ${escapeHtml(first.customerBankDetails || first.customerIban || "Не вказано")}</p>
          <p>${escapeHtml(customerVatStatus)}</p>
          <p class="signature">${escapeHtml(customerSignatoryRole)} ${escapeHtml(customerSignatureLabel)}</p>
        </div>
      </div>
    </body>
  </html>`;
};

/**
 * Відкриває групову СП у новій вкладці й ставить позначку створення на кожне
 * замовлення. Повертає дату позначки за id; помилку кидає з людським текстом.
 */
export async function openGroupedSpecification(
  teamId: string,
  selectedRecords: DerivedOrderRecord[]
): Promise<Map<string, string>> {
  const blocker = getSpecificationGroupBlocker(selectedRecords);
  if (blocker) throw new Error(blocker);

  // Відмінюємо ПІБ і посаду підписанта замовника у родовий відмінок (паралельно, з кешем + fallback).
  const first = selectedRecords[0];
  const [customerSignatoryNameGenitive, customerSignatoryRoleGenitive] = await Promise.all([
    first?.customerSignatoryName ? declineToGenitive(first.customerSignatoryName) : Promise.resolve(""),
    first?.customerSignatoryPosition ? declineToGenitive(first.customerSignatoryPosition) : Promise.resolve(""),
  ]);
  const html = buildGroupedSpecificationHtml(selectedRecords, {
    customerSignatoryNameGenitive,
    customerSignatoryRoleGenitive,
  });
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Браузер заблокував відкриття документа. Дозволь popup для цього сайту.");

  let wroteDocument = false;
  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    wroteDocument = true;
  } catch {
    // Fallback for browsers/extensions that prevent document.write into a popup.
  }

  if (!wroteDocument) {
    const objectUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    popup.location.href = objectUrl;
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  try {
    const markedAt = await Promise.all(
      selectedRecords.map((record) =>
        markOrderDocumentCreated({ teamId, orderId: record.id, documentKind: "specification" })
      )
    );
    return new Map(selectedRecords.map((record, index) => [record.id, markedAt[index] ?? new Date().toISOString()]));
  } catch (markError: unknown) {
    throw new Error(
      markError instanceof Error ? markError.message : "СП відкрито, але не вдалося зберегти позначку створення.",
      { cause: markError }
    );
  }
}

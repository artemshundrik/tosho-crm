import { ORDER_PAYMENT_TERMS_OPTIONS } from "@/features/orders/config";
import { expandOrganizationForm } from "@/features/orders/invoicePartyName";
import { executorPreamble, executorRequisiteLines, splitVat, VAT_RATE } from "@/features/orders/orderExecutor";
import type { DerivedOrderItem, DerivedOrderRecord } from "@/features/orders/orderRecords";
import { formatBalanceDaysTerm } from "@/features/orders/paymentRules";
import { amountInWords, type AmountCurrency } from "@/lib/amountInWords";
import { splitSignatoryFullName } from "@/lib/customerLegalEntities";
import { renderPrintDocument } from "@/lib/printDocument";
import { toSignatureInitials } from "@/lib/signatureFormat";

/**
 * Специфікація (Додаток до договору) за шаблоном № 31 — REQ-322#p21.
 *
 * Одна збірка на обидва входи: СП одного замовлення (сторінка замовлення) і
 * групову СП на кілька замовлень одного замовника (список замовлень). Досі це
 * були два різні документи з різною таблицею, різним порядком оплати й різними
 * реквізитами, і групова розходилась із шаблоном ще дужче за одиночну.
 *
 * Рішення по кожному рядку — docs/superpowers/specs/2026-10-19-specification-template-decisions.md.
 * Чиста функція: без запитів, тексти позицій і картинки приходять готовими.
 */

/** Строк виробництва, коли його ще не задавали в договорі. Збігається з дефолтом поля в модалі. */
export const DEFAULT_PRODUCTION_WORK_DAYS = 50;
export const DEFAULT_INCOTERMS = "FCA";

const escapeHtml = (value?: string | number | null) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatPlainMoney = (value: number) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);

const toDate = (value?: string | null) => {
  const source = value ? new Date(value) : new Date();
  return Number.isNaN(source.getTime()) ? new Date() : source;
};

/** «19.10.2026» — дата договору в шапці й преамбулі. */
const formatDotDate = (value?: string | null) => toDate(value).toLocaleDateString("uk-UA");

/** «"19" жовтня 2026 р.» — дата самої СП. Родовий місяця дає лише формат із днем. */
const formatLongDate = (value?: string | null) => {
  const date = toDate(value);
  const month =
    new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" })
      .formatToParts(date)
      .find((part) => part.type === "month")?.value ?? "";
  return `«${String(date.getDate()).padStart(2, "0")}» ${month} ${date.getFullYear()} р.`;
};

/**
 * Підстава підпису йде після «діє на підставі …» — родовий. Закритий набір
 * (Статут/Довіреність) відмінюємо самі; довільне значення лишаємо як є.
 */
export const toAuthorityGenitive = (value?: string | null) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (normalized === "статут" || normalized === "статуту") return "Статуту";
  if (normalized === "довіреність" || normalized === "довіреності") return "Довіреності";
  return trimmed;
};

const looksLikeIban = (value: string) => /^UA\d{2}/i.test(value.replace(/\s+/g, ""));

/**
 * «UA21… в АТ КБ «ПриватБанк»» — IBAN замовника з банком (REQ-322#p25). До
 * p25 у customer_bank_details старих замовлень писали сам IBAN, тож значення,
 * схоже на IBAN, банком не вважаємо, а беремо за IBAN, якщо іншого немає.
 */
export const customerIbanWithBank = (record: Pick<DerivedOrderRecord, "customerIban" | "customerBankDetails">) => {
  const details = record.customerBankDetails?.trim() ?? "";
  const legacyIban = details && looksLikeIban(details) ? details : "";
  const iban = record.customerIban?.trim() || legacyIban;
  const bank = legacyIban ? "" : details;
  if (!iban) return "Не вказано";
  return bank ? `${iban} в ${bank}` : iban;
};

/** Статус ПДВ замовника зі ставки в його картці. */
export const customerVatStatusLabel = (rate?: string | null) => {
  const normalized = (rate ?? "").trim();
  const numeric = Number(normalized);
  if (!normalized || normalized === "none" || !Number.isFinite(numeric) || numeric < 0) return "Не є платником ПДВ.";
  if (numeric === 20) return "Є платником ПДВ на загальних підставах.";
  if (numeric === 0) return "Є платником ПДВ за нульовою ставкою.";
  return `Є платником ПДВ за ставкою ${numeric}%.`;
};

/**
 * «який діє» / «яка діє» — за по батькові підписанта. Без по батькові (або
 * нерозпізнане) — нейтральне «що діє»: краще так, ніж помилитися родом.
 */
export const signatoryActsPhrase = (fullName?: string | null) => {
  const { middle } = splitSignatoryFullName(fullName ?? "");
  if (/(івна|ївна|овна|евна)$/i.test(middle)) return "яка діє";
  if (/(ович|евич|ьович|йович)$/i.test(middle)) return "який діє";
  return "що діє";
};

export type DefaultSpecItemTextSource = {
  name: string;
  /** Технічні характеристики цього замовлення: опис менеджера, колір, параметри виробу. */
  characteristics: string[];
  /** «ДТФ, груди» — метод і місце кожного нанесення. */
  imprints: string[];
};

/**
 * Типовий текст позиції в СП (рішення 6): назва, «Технічні характеристики: …»
 * цього замовлення і «<метод>, <місце> — згідно затвердженого макету».
 * Маркетингового опису з каталогу тут немає свідомо — його відсіює той, хто
 * збирає `characteristics`. Перший рядок — назва, у таблиці вона жирна.
 */
export const buildDefaultSpecItemText = ({ name, characteristics, imprints }: DefaultSpecItemTextSource) => {
  const traits = characteristics.map((entry) => entry.replace(/\s+/g, " ").trim().replace(/[.;]+$/, "")).filter(Boolean);
  const places = imprints.map((entry) => entry.trim()).filter(Boolean);
  return [
    name.trim(),
    traits.length > 0 ? `Технічні характеристики: ${traits.join("; ")}.` : "",
    places.length > 0 ? `${places.join("; ")} — згідно затвердженого макету` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const renderItemText = (text: string) => {
  const [title = "", ...rest] = text.split("\n").map((line) => line.trim());
  return [
    `<div class="item-name">${escapeHtml(title)}</div>`,
    ...rest.filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`),
  ].join("");
};

type PaymentStages = { advance: number; balance: number };

const resolvePaymentStages = (record: DerivedOrderRecord): PaymentStages => {
  if (typeof record.prepaymentPct === "number" && typeof record.balancePct === "number") {
    return { advance: record.prepaymentPct, balance: record.balancePct };
  }
  const option =
    ORDER_PAYMENT_TERMS_OPTIONS.find((item) => item.id === record.paymentTerms) ?? ORDER_PAYMENT_TERMS_OPTIONS[1];
  return { advance: option.advance, balance: option.balance };
};

/**
 * П. 3.1 (рішення 13): текст шаблону — два етапи, рахунок-фактура, доплата від
 * дати видаткової накладної (REQ-322#p5); суми в гривнях лишаються в дужках.
 */
export const buildSpecPaymentClause = (params: {
  stages: PaymentStages;
  total: number;
  vatPayer: boolean;
  balanceTiming: "before_shipment" | "after_shipment" | null;
  balanceDaysTerm: string;
}) => {
  const { stages, total, vatPayer, balanceTiming, balanceDaysTerm } = params;
  const money = (amount: number) => `${formatPlainMoney(amount)} грн${vatPayer ? " з ПДВ" : ""}`;
  const onInvoice = "на підставі підписаного додатку до Договору та виставленого Виконавцем рахунку-фактури";
  const balanceWhen =
    balanceTiming === "after_shipment"
      ? `з моменту виписки видаткової накладної протягом ${balanceDaysTerm}`
      : "після готовності Продукції, до її відвантаження";
  if (stages.advance > 0 && stages.balance > 0) {
    const advanceAmount = total * (stages.advance / 100);
    return `3.1. Оплата Продукції здійснюється Замовником в 2 етапи: передоплата здійснюється у розмірі ${stages.advance}% загальної вартості продукції (${money(advanceAmount)}) ${onInvoice}; остаточний розрахунок у розмірі ${stages.balance}% (${money(total - advanceAmount)}) ${balanceWhen}.`;
  }
  const when = stages.balance > 0 ? balanceWhen : onInvoice;
  return `3.1. Оплата Продукції здійснюється Замовником у розмірі 100% загальної вартості продукції (${money(total)}) ${when}.`;
};

export type SpecificationDocumentParams = {
  /** Одне замовлення або кілька замовлень одного замовника від однієї нашої юрособи. */
  records: DerivedOrderRecord[];
  /** № СП у межах договору; без нього (стара СП) — номер замовлення, як її колись підписали. */
  specificationNumber: number | null;
  /** id позиції → її текст у СП (поправлений менеджером або типовий). */
  itemTexts?: ReadonlyMap<string, string>;
  visualizationImageUrls?: string[];
  customerSignatoryNameGenitive?: string;
  customerSignatoryRoleGenitive?: string;
};

const fallbackItemText = (item: DerivedOrderItem) =>
  buildDefaultSpecItemText({ name: item.name, characteristics: [], imprints: item.methodsSummary ? [item.methodsSummary] : [] });

export function buildSpecificationHtml(params: SpecificationDocumentParams) {
  const { records } = params;
  const first = records[0];
  const executor = first.executor;
  const vatPayer = executor.vatPayer;
  const items = records.flatMap((record) => record.items);
  const totalWithVat = records.reduce((sum, record) => sum + (Number(record.total) || 0), 0);
  const { net: totalWithoutVat, vat: vatAmount } = splitVat(totalWithVat, vatPayer);
  const wordsCurrency: AmountCurrency = first.currency === "USD" || first.currency === "EUR" ? first.currency : "UAH";
  const totalInWords = amountInWords(totalWithVat, wordsCurrency);

  const numberLabel =
    params.specificationNumber !== null
      ? String(params.specificationNumber)
      : records.map((record) => record.quoteNumber).join(", ");
  const contractNumber = first.contractNumber?.trim() || first.quoteNumber;
  const contractDate = formatDotDate(first.contractDate || first.contractCreatedAt);
  const contractTitle = "Договору на виготовлення та поставку рекламно-сувенірної продукції";

  const customerShortTitle = first.legalEntityLabel || first.customerName;
  const customerFullTitle = expandOrganizationForm(customerShortTitle);
  const signatoryName = first.customerSignatoryName?.trim() || "Не вказано";
  const signatoryNameBody = params.customerSignatoryNameGenitive?.trim() || signatoryName;
  const signatoryRole = first.customerSignatoryPosition?.trim() || "уповноваженої особи";
  const roleGenitive = params.customerSignatoryRoleGenitive?.trim() || signatoryRole;
  const roleBody = roleGenitive.charAt(0).toLocaleLowerCase("uk-UA") + roleGenitive.slice(1);
  const authority = toAuthorityGenitive(first.customerSignatoryAuthority) || "Не вказано";

  const productionDays = Math.max(
    ...records.map((record) =>
      typeof record.contractProductionDays === "number" && record.contractProductionDays > 0
        ? Math.round(record.contractProductionDays)
        : DEFAULT_PRODUCTION_WORK_DAYS
    )
  );
  const stages = resolvePaymentStages(first);
  const paymentClause = buildSpecPaymentClause({
    stages,
    total: totalWithVat,
    vatPayer,
    balanceTiming: first.balanceTiming,
    balanceDaysTerm: formatBalanceDaysTerm(first.balanceDaysAfterShipment ?? 3, first.balanceDaysKind),
  });
  const incoterms = `${first.incotermsCode?.trim() || DEFAULT_INCOTERMS} (Incoterms 2020)${
    first.incotermsPlace?.trim() ? `, ${first.incotermsPlace.trim()}` : ""
  }`;

  const rows = items
    .map((item, index) => {
      const text = params.itemTexts?.get(item.id)?.trim() || fallbackItemText(item);
      const unit = item.unit && item.unit !== "шт." ? ` ${item.unit}` : "";
      return `
        <tr>
          <td>${index + 1}.</td>
          <td>${renderItemText(text)}</td>
          <td class="num">${escapeHtml(item.qty.toLocaleString("uk-UA"))}${escapeHtml(unit)}</td>
          <td class="num">${escapeHtml(formatPlainMoney(splitVat(Number(item.unitPrice) || 0, vatPayer).net))}</td>
          <td class="num">${escapeHtml(formatPlainMoney(splitVat(Number(item.lineTotal) || 0, vatPayer).net))}</td>
        </tr>`;
    })
    .join("");
  const totalLabel = vatPayer
    ? `Загальна вартість з ПДВ: ${formatPlainMoney(totalWithVat)} грн. (в тому числі ПДВ — ${formatPlainMoney(vatAmount)} грн.)`
    : `Загальна вартість: ${formatPlainMoney(totalWithVat)} грн. (без ПДВ)`;
  const visualizations = params.visualizationImageUrls ?? [];
  const wordsInline = totalInWords.charAt(0).toLocaleLowerCase("uk-UA") + totalInWords.slice(1);

  return renderPrintDocument({
    title: `Специфікація № ${numberLabel}`,
    toolbarTitle: `СП № ${numberLabel}`,
    styles: `
        p { margin: 0 0 8px; font-size: 14px; text-align: justify; }
        .center { text-align: center; }
        .heading { margin: 20px 0 10px; font-size: 14px; font-weight: 700; text-align: center; }
        .topline { display: flex; justify-content: space-between; gap: 24px; margin: 16px 0 16px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th, td { border: 1px solid #111827; padding: 6px 8px; vertical-align: top; font-size: 13px; }
        th { background: #f4f4f2; font-weight: 700; text-align: left; }
        .num { text-align: right; white-space: nowrap; }
        .item-name { font-weight: 700; }
        .total-row td { font-weight: 700; }
        .visual-title { margin: 18px 0 8px; font-weight: 700; font-size: 14px; }
        .visualization { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
        .visualization img { max-width: 100%; max-height: 320px; object-fit: contain; border: 1px solid #d1d5db; border-radius: 4px; background: #ffffff; }
        .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 8px; font-size: 13px; }
        .signature-grid p { margin: 0 0 3px; font-size: 13px; text-align: left; }
        .party-title { font-weight: 700; margin-bottom: 4px; }
        .signature-line { margin-top: 18px !important; }
        @media print {
          .visualization { page-break-inside: avoid; }
          .visualization img { max-height: 260px; }
        }
    `,
    bodyHtml: `
        <div class="center">Додаток (Специфікація) № ${escapeHtml(numberLabel)} до</div>
        <div class="center">${escapeHtml(contractTitle)}</div>
        <div class="center">№ ${escapeHtml(contractNumber)} від ${escapeHtml(contractDate)} р.</div>

        <div class="topline">
          <div>м. Київ</div>
          <div>${escapeHtml(formatLongDate(first.specificationCreatedAt))}</div>
        </div>

        <p>${escapeHtml(executorPreamble(executor))}, з однієї сторони, та ${escapeHtml(customerFullTitle)} (надалі – Замовник), в особі ${escapeHtml(roleBody)} ${escapeHtml(signatoryNameBody)}, ${escapeHtml(signatoryActsPhrase(first.customerSignatoryName))} на підставі ${escapeHtml(authority)}, з іншої сторони, разом – Сторони, підписали цей Додаток до ${escapeHtml(contractTitle)} № ${escapeHtml(contractNumber)} від ${escapeHtml(contractDate)} р. про наступне:</p>

        <div class="heading">1. СПЕЦИФІКАЦІЯ НА ВИГОТОВЛЕННЯ</div>
        <table>
          <thead>
            <tr>
              <th style="width:36px;">№</th>
              <th>Назва продукції та характеристики</th>
              <th style="width:96px;">Кількість продукції, шт.</th>
              <th style="width:104px;">${vatPayer ? "Ціна без ПДВ, грн." : "Ціна, грн."}</th>
              <th style="width:118px;">${vatPayer ? "Вартість без ПДВ, грн." : "Вартість, грн."}</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="4" class="num">${escapeHtml(totalLabel)}</td>
              <td class="num">${escapeHtml(formatPlainMoney(totalWithVat))}</td>
            </tr>
          </tbody>
        </table>

        ${
          visualizations.length > 0
            ? `<div class="visual-title">Візуальний вигляд продукції:</div>
        <div class="visualization">${visualizations
          .map((src) => `<img src="${escapeHtml(src)}" alt="Візуальний вигляд продукції" />`)
          .join("")}</div>`
            : ""
        }

        <div class="heading">2. ВАРТІСТЬ РОБІТ ТА СТРОКИ ВИГОТОВЛЕННЯ ПРОДУКЦІЇ</div>
        <p>${
          vatPayer
            ? `2.1. Загальна вартість робіт з виготовлення Продукції складає ${escapeHtml(formatPlainMoney(totalWithVat))} (${escapeHtml(wordsInline)}), враховуючи ПДВ ${VAT_RATE}%. Вартість робіт без ПДВ складає ${escapeHtml(formatPlainMoney(totalWithoutVat))} грн.`
            : `2.1. Загальна вартість робіт з виготовлення Продукції складає ${escapeHtml(formatPlainMoney(totalWithVat))} (${escapeHtml(wordsInline)}), без ПДВ.`
        }</p>
        <p>2.2. Термін виготовлення Продукції, з поставкою на склад, складає до ${escapeHtml(formatBalanceDaysTerm(productionDays, "working"))} з дати затвердження макету до друку${
          stages.advance > 0 ? ", отримання передоплати згідно пункту 3.1., та" : " та"
        } підписання даної Специфікації.</p>
        <p>2.3. Сторони погодили, що всі дизайн-макети та візуалізації, що підлягають погодженню Замовником до початку виготовлення Продукції, можуть направлятися та погоджуватися засобами електронної пошти та месенджерів (Telegram, Viber).</p>

        <div class="heading">3. ПОРЯДОК ОПЛАТИ ТА ДОСТАВКИ</div>
        <p>${escapeHtml(paymentClause)}</p>
        <p>3.2. Поставка Продукції здійснюється на умовах ${escapeHtml(incoterms)}.</p>

        <div class="heading">АДРЕСИ І РЕКВІЗИТИ СТОРІН:</div>
        <div class="signature-grid">
          <div>
            <div class="party-title">ВИКОНАВЕЦЬ:</div>
            ${executorRequisiteLines(executor, { addressLabel: "Юридична адреса: " })
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join("")}
            <p class="signature-line">${escapeHtml(executor.signatoryPositionDisplay)}</p>
            <p>__________________________ ${escapeHtml(executor.signatureLabel)}</p>
          </div>
          <div>
            <div class="party-title">ЗАМОВНИК:</div>
            <p>${escapeHtml(customerShortTitle)}</p>
            <p>Юридична адреса: ${escapeHtml(first.customerLegalAddress || "Не вказано")}</p>
            <p>Код ЄДРПОУ: ${escapeHtml(first.customerTaxId || "Не вказано")}</p>
            <p>ІПН: ${escapeHtml(first.customerVatId || "Не вказано")}</p>
            <p>IBAN: ${escapeHtml(customerIbanWithBank(first))}</p>
            <p>${escapeHtml(customerVatStatusLabel(first.customerVatRate))}</p>
            <p class="signature-line">${escapeHtml(signatoryRole)}</p>
            <p>__________________________ ${escapeHtml(toSignatureInitials(first.customerSignatoryName) || signatoryName)}</p>
          </div>
        </div>
    `,
  });
}

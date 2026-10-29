import type { CustomerContract } from "@/features/orders/customerContracts";
import { SIGNATURE_VIA_LABELS, type SignatureVia } from "@/features/orders/orderApprovals";
import { getClosingDocumentRef, PREPAYMENT_RECEIVED, SHIPPED_ORDER_STATUSES } from "@/features/orders/orderLaunchPath";
import { getOrderNextStep } from "@/features/orders/orderListStages";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { isCashlessPaymentMethod } from "@/features/orders/paymentRules";
import type { Tone } from "@/lib/statusTones";

/**
 * Реєстр розділу «Документи» (картка 15, пункт d16; макет E). Перший крок
 * збирається з того, що вже лежить на замовленнях і в договорах поза CRM, без
 * окремої таблиці: тож «надіслано» й «чернетка» тут не існують, а стан — лише
 * той, що відомо з полів (підпис, оплата, термін дії).
 */
export type DocumentKind = "contract" | "specification" | "invoice" | "waybill" | "act";
export type DocumentSection = "legal" | "accounting";
export type DocumentFlag = "unsigned" | "noClosing" | "expiring";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  contract: "Договір",
  specification: "СП",
  invoice: "Рахунок",
  waybill: "Видаткова",
  act: "Акт",
};

/** Тони типів з макета: договір фіолетовий, СП синя, рахунок бурштиновий, ВН бірюзова, акт зелений. */
export const DOCUMENT_KIND_TONE: Record<DocumentKind, Tone> = {
  contract: "accent",
  specification: "info",
  invoice: "warning",
  waybill: "teal",
  act: "success",
};

export const DOCUMENT_KIND_SECTION: Record<DocumentKind, DocumentSection> = {
  contract: "legal",
  specification: "legal",
  invoice: "accounting",
  waybill: "accounting",
  act: "accounting",
};

export type DocumentStep = { label: string; done: boolean; note: string | null };
export type DocumentEvent = { at: string; precise: boolean; text: string; userId: string | null };

export type RegistryDocument = {
  id: string;
  kind: DocumentKind;
  section: DocumentSection;
  number: string;
  /** Дата самого документа, yyyy-MM-dd. */
  documentDate: string | null;
  /** Коли документ з'явився в CRM — ключ сортування. */
  createdAt: string;
  /** false — у бази лише дата без часу (ВН і акт з BAS). */
  createdAtPrecise: boolean;
  orderId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string;
  customerLogoUrl: string | null;
  managerUserId: string | null;
  managerLabel: string;
  managerAvatarUrl: string | null;
  accountantUserId: string | null;
  legalEntityLabel: string;
  basis: string;
  total: number | null;
  currency: string;
  status: { tone: Tone; label: string; detail: string | null };
  /** Три кроки життя документа для смужок у рядку й перегляді. */
  steps: DocumentStep[];
  flag: DocumentFlag | null;
  alert: { tone: Tone; text: string } | null;
  events: DocumentEvent[];
  filePath: string | null;
};

const DAY_MS = 86_400_000;
const EXPIRING_WINDOW_DAYS = 90;
const LONG_WAIT_DAYS = 5;

/** «2026-10-14» або ISO → «14.10.2026». */
export const formatDocumentDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}.${month}.${year}` : "—";
};

const kyivDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kiev" });

/** Київський календарний день: позначка часу 23:30 UTC — це вже наступна дата. */
export const kyivIsoDay = (value: string) => {
  if (value.length <= 10) return value;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value.slice(0, 10) : kyivDayFormat.format(new Date(time));
};
const isoDay = kyivIsoDay;

const daysBetween = (fromIso: string, toIso: string) =>
  Math.max(0, Math.round((Date.parse(isoDay(toIso)) - Date.parse(isoDay(fromIso))) / DAY_MS));

const waitedDetail = (days: number) => (days === 0 ? "з сьогодні" : `${days} дн.`);

const waitStatus = (label: string, sinceIso: string, todayIso: string) => {
  const days = daysBetween(sinceIso, todayIso);
  return {
    tone: (days >= LONG_WAIT_DAYS ? "danger" : "warning") as Tone,
    label,
    detail: waitedDetail(days),
    days,
  };
};

const signedNote = (at: string, via: SignatureVia | null) =>
  `${formatDocumentDate(at)}${via ? ` · ${SIGNATURE_VIA_LABELS[via]}` : ""}`;

type OrderContext = {
  record: DerivedOrderRecord;
  active: boolean;
  cancelled: boolean;
  todayIso: string;
};

const baseFromOrder = ({ record }: OrderContext) => ({
  orderId: record.id,
  orderNumber: record.quoteNumber || null,
  customerId: record.customerId,
  customerName: record.customerName.trim() || "Без замовника",
  customerLogoUrl: record.customerLogoUrl,
  managerUserId: record.managerUserId,
  managerLabel: record.managerLabel.trim(),
  managerAvatarUrl: record.managerAvatarUrl,
  legalEntityLabel: record.executor.shortName,
  currency: record.currency || "UAH",
  filePath: null,
});

function signableDocument(
  ctx: OrderContext,
  kind: "contract" | "specification",
  input: { number: string; createdAt: string; date: string | null; signedAt: string | null; via: SignatureVia | null; basis: string }
): RegistryDocument {
  const { record, todayIso, active } = ctx;
  const signed = Boolean(input.signedAt);
  const flag: DocumentFlag | null = !signed && active ? "unsigned" : null;
  const wait = waitStatus("Не підписано", input.createdAt, todayIso);
  const status = signed
    ? { tone: "success" as Tone, label: "Підписано", detail: signedNote(input.signedAt!, input.via) }
    : ctx.cancelled
      ? { tone: "neutral" as Tone, label: "Замовлення скасовано", detail: null }
      : { tone: wait.tone, label: wait.label, detail: wait.detail };
  const events: DocumentEvent[] = [
    { at: input.createdAt, precise: true, text: kind === "contract" ? "створено договір" : "створено СП", userId: null },
  ];
  if (input.signedAt) {
    events.push({ at: input.signedAt, precise: true, text: `підписано ${input.via ? SIGNATURE_VIA_LABELS[input.via] : ""}`.trim(), userId: null });
  }
  return {
    ...baseFromOrder(ctx),
    id: `${kind}:${record.id}`,
    kind,
    section: "legal",
    number: input.number,
    documentDate: input.date ? isoDay(input.date) : null,
    createdAt: input.createdAt,
    createdAtPrecise: true,
    accountantUserId: null,
    basis: input.basis,
    total: kind === "specification" ? record.total : null,
    status,
    steps: [
      { label: "Створено", done: true, note: formatDocumentDate(input.createdAt) },
      { label: "Надіслано", done: signed, note: signed ? null : "поки не відстежуємо" },
      { label: "Підписано", done: signed, note: signed ? signedNote(input.signedAt!, input.via) : null },
    ],
    flag,
    alert:
      flag === "unsigned" && wait.days >= LONG_WAIT_DAYS
        ? { tone: "danger", text: `Без підпису ${wait.days} дн. від створення. Чи надіслано замовнику, CRM поки не знає.` }
        : null,
    events,
  };
}

function invoiceDocument(ctx: OrderContext): RegistryDocument | null {
  const { record, todayIso } = ctx;
  if (!record.invoiceNumber) return null;
  const createdAt = record.invoiceCreatedAt ?? record.invoiceDate;
  if (!createdAt) return null;
  const paid = record.paymentStatus === "fully_paid";
  const partial = !paid && PREPAYMENT_RECEIVED.has(record.paymentStatus);
  const closing = getClosingDocumentRef(record);
  const shipped = SHIPPED_ORDER_STATUSES.has(record.orderStatus) || record.deliveryStatus === "shipped";
  const noClosing =
    !ctx.cancelled &&
    !closing.number &&
    (paid || shipped) &&
    isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail);
  const status = paid
    ? { tone: "success" as Tone, label: "Оплачено", detail: null }
    : partial
      ? { tone: "info" as Tone, label: "Оплачено частково", detail: null }
      : ctx.cancelled
        ? { tone: "neutral" as Tone, label: "Замовлення скасовано", detail: null }
        : { tone: "neutral" as Tone, label: "Чекає оплату", detail: waitedDetail(daysBetween(createdAt, todayIso)) };
  const events: DocumentEvent[] = [];
  if (record.invoiceRequestedAt) {
    events.push({ at: record.invoiceRequestedAt, precise: true, text: "попросили рахунок", userId: record.invoiceRequestedBy });
  }
  events.push({ at: createdAt, precise: Boolean(record.invoiceCreatedAt), text: `внесено номер ${record.invoiceNumber} з BAS`, userId: record.invoiceIssuedBy ?? null });
  return {
    ...baseFromOrder(ctx),
    id: `invoice:${record.id}`,
    kind: "invoice",
    section: "accounting",
    number: record.invoiceNumber,
    documentDate: record.invoiceDate ? isoDay(record.invoiceDate) : isoDay(createdAt),
    createdAt,
    createdAtPrecise: Boolean(record.invoiceCreatedAt),
    accountantUserId: record.invoiceIssuedBy ?? null,
    basis: `Замовлення ${record.quoteNumber}`,
    total: record.total,
    status,
    steps: [
      { label: "Виписано", done: true, note: formatDocumentDate(record.invoiceDate ?? createdAt) },
      { label: "Надіслано", done: paid || partial, note: paid || partial ? null : "поки не відстежуємо" },
      { label: "Оплачено", done: paid, note: paid ? "повністю" : partial ? "частково" : null },
    ],
    flag: noClosing ? "noClosing" : null,
    alert: noClosing
      ? { tone: "danger", text: `${paid ? "Оплачено" : "Відвантажено"}, а ${closing.kind === "act" ? "акта" : "видаткової накладної"} ще немає.` }
      : null,
    events,
  };
}

function closingDocument(ctx: OrderContext, kind: "waybill" | "act"): RegistryDocument | null {
  const { record } = ctx;
  const number = kind === "act" ? record.actNumber : record.waybillNumber;
  const date = kind === "act" ? record.actDate : record.waybillDate;
  if (!number || !date) return null;
  return {
    ...baseFromOrder(ctx),
    id: `${kind}:${record.id}`,
    kind,
    section: "accounting",
    number,
    documentDate: isoDay(date),
    createdAt: date,
    createdAtPrecise: false,
    accountantUserId: null,
    basis: record.invoiceNumber ? `Рахунок ${record.invoiceNumber}` : `Замовлення ${record.quoteNumber}`,
    total: record.total,
    status: { tone: "neutral", label: "Внесено з BAS", detail: null },
    steps: [
      { label: "Внесено", done: true, note: formatDocumentDate(date) },
      { label: "Передано", done: false, note: "поки не відстежуємо" },
      { label: "Підписано", done: false, note: null },
    ],
    flag: null,
    alert: null,
    events: [{ at: date, precise: false, text: `внесено номер ${number} з BAS`, userId: null }],
  };
}

function externalContractDocument(
  contract: CustomerContract,
  owner: DerivedOrderRecord | undefined,
  todayIso: string
): RegistryDocument {
  const daysLeft = contract.validUntil ? daysBetween(todayIso, contract.validUntil) : null;
  const expired = Boolean(contract.validUntil && contract.validUntil < todayIso && !contract.autoProlongation);
  const expiring =
    !expired && !contract.autoProlongation && daysLeft !== null && daysLeft <= EXPIRING_WINDOW_DAYS;
  const status = expired
    ? { tone: "neutral" as Tone, label: "Закінчився", detail: formatDocumentDate(contract.validUntil) }
    : expiring
      ? { tone: "accent" as Tone, label: "Закінчується", detail: `до ${formatDocumentDate(contract.validUntil)}` }
      : contract.autoProlongation
        ? { tone: "success" as Tone, label: "Діє", detail: "з пролонгацією" }
        : contract.validUntil
          ? { tone: "success" as Tone, label: "Діє", detail: `до ${formatDocumentDate(contract.validUntil)}` }
          : { tone: "success" as Tone, label: "Діє", detail: "безстроковий" };
  return {
    id: `customer-contract:${contract.id}`,
    kind: "contract",
    section: "legal",
    number: contract.number,
    documentDate: contract.date,
    createdAt: contract.createdAt,
    createdAtPrecise: true,
    orderId: null,
    orderNumber: null,
    customerId: contract.customerId,
    customerName: owner?.customerName.trim() || "Без замовника",
    customerLogoUrl: owner?.customerLogoUrl ?? null,
    managerUserId: owner?.managerUserId ?? null,
    managerLabel: owner?.managerLabel.trim() ?? "",
    managerAvatarUrl: owner?.managerAvatarUrl ?? null,
    accountantUserId: null,
    legalEntityLabel: owner?.executor.shortName ?? "—",
    basis: `Внесено файлом · ${SIGNATURE_VIA_LABELS[contract.signedVia]}`,
    total: null,
    currency: "UAH",
    status,
    steps: [
      { label: "Підписано", done: true, note: `${formatDocumentDate(contract.date)} · ${SIGNATURE_VIA_LABELS[contract.signedVia]}` },
      { label: "Внесено", done: true, note: formatDocumentDate(contract.createdAt) },
      { label: "Діє", done: !expired, note: status.detail },
    ],
    flag: expiring ? "expiring" : null,
    alert: expiring
      ? { tone: "accent", text: `Діє до ${formatDocumentDate(contract.validUntil)}, лишилось ${daysLeft} дн., пролонгації немає.` }
      : null,
    events: [{ at: contract.createdAt, precise: true, text: "внесено файл підписаного договору", userId: null }],
    filePath: contract.filePath,
  };
}

/**
 * Усі документи команди, свіжі першими за часом появи в CRM. Договір, який
 * замовлення успадкувало від попереднього, тут не дублюється: він рахується
 * один раз — на замовленні, де його створили, або як договір поза CRM.
 */
export function buildDocumentRegistry(
  records: DerivedOrderRecord[],
  contracts: CustomerContract[],
  todayIso: string
): RegistryDocument[] {
  const documents: RegistryDocument[] = [];
  const latestOrderByCustomer = new Map<string, DerivedOrderRecord>();

  for (const record of records) {
    if (record.source !== "stored") continue;
    if (record.customerId) {
      const current = latestOrderByCustomer.get(record.customerId);
      if (!current || (record.createdAt ?? "") > (current.createdAt ?? "")) latestOrderByCustomer.set(record.customerId, record);
    }
    const stage = getOrderNextStep(record, todayIso).stage;
    const ctx: OrderContext = { record, todayIso, cancelled: stage === "cancelled", active: stage !== "done" && stage !== "cancelled" };

    if (record.contractCreatedAt && !record.inheritedContractOrderId && !record.externalContract) {
      documents.push(
        signableDocument(ctx, "contract", {
          number: record.contractNumber || record.quoteNumber,
          createdAt: record.contractCreatedAt,
          date: record.contractDate ?? record.contractCreatedAt,
          signedAt: record.contractSignedAt,
          via: record.contractSignedVia,
          basis: `Замовлення ${record.quoteNumber}`,
        })
      );
    }
    if (record.specificationCreatedAt) {
      const contractRef = record.externalContract?.number ?? record.contractNumber;
      documents.push(
        signableDocument(ctx, "specification", {
          number: record.specificationNumber ? `СП № ${record.specificationNumber}` : "СП",
          createdAt: record.specificationCreatedAt,
          date: record.specificationCreatedAt,
          signedAt: record.specificationSignedAt,
          via: record.specificationSignedVia,
          basis: contractRef ? `До договору ${contractRef}` : `Замовлення ${record.quoteNumber}`,
        })
      );
    }
    const invoice = invoiceDocument(ctx);
    if (invoice) documents.push(invoice);
    const waybill = closingDocument(ctx, "waybill");
    if (waybill) documents.push(waybill);
    const act = closingDocument(ctx, "act");
    if (act) documents.push(act);
  }

  for (const contract of contracts) {
    documents.push(externalContractDocument(contract, latestOrderByCustomer.get(contract.customerId), todayIso));
  }

  return documents.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}

export type DocumentFilters = {
  section: DocumentSection | "all";
  /** yyyy-MM; null — за весь час. */
  month: string | null;
  kind: DocumentKind | null;
  managerUserId: string | null;
  customerName: string | null;
  flag: DocumentFlag | null;
  search: string;
};

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** Пошук і плитка діють за весь час: шукаючи номер, не треба вгадувати місяць. */
export function filterDocuments(documents: RegistryDocument[], filters: DocumentFilters) {
  const query = normalize(filters.search);
  const useMonth = Boolean(filters.month) && !query && !filters.flag;
  return documents.filter((doc) => {
    if (filters.section !== "all" && doc.section !== filters.section) return false;
    if (filters.kind && doc.kind !== filters.kind) return false;
    if (filters.managerUserId && doc.managerUserId !== filters.managerUserId) return false;
    if (filters.customerName && doc.customerName !== filters.customerName) return false;
    if (filters.flag && doc.flag !== filters.flag) return false;
    if (useMonth && (doc.documentDate ?? isoDay(doc.createdAt)).slice(0, 7) !== filters.month) return false;
    if (!query) return true;
    return [doc.number, doc.orderNumber, doc.customerName, doc.basis].some((value) => normalize(value).includes(query));
  });
}

export const countFlags = (documents: RegistryDocument[]) => {
  const counts: Record<DocumentFlag, number> = { unsigned: 0, noClosing: 0, expiring: 0 };
  for (const doc of documents) if (doc.flag) counts[doc.flag] += 1;
  return counts;
};

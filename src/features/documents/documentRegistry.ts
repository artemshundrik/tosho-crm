import type { CustomerContract } from "@/features/orders/customerContracts";
import { SIGNATURE_VIA_LABELS, type SignatureVia } from "@/features/orders/orderApprovals";
import {
  DISPATCH_CHANNEL_LABELS,
  formatDispatchDay,
  getDocumentDispatchState,
  getInvoiceDue,
  workingDaysBetween,
  type DispatchDocument,
  type DocumentDispatchState,
} from "@/features/orders/orderDocumentDispatch";
import {
  getClosingDocumentRef,
  PREPAYMENT_RECEIVED,
  resolveBreakdown,
  SHIPPED_ORDER_STATUSES,
} from "@/features/orders/orderLaunchPath";
import { getOrderNextStep } from "@/features/orders/orderListStages";
import type { DerivedOrderRecord } from "@/features/orders/orderRecords";
import { isCashlessPaymentMethod } from "@/features/orders/paymentRules";
import { customerFilterNames, normalizeCustomerName, type CustomerFilterValue } from "@/lib/customerFilter";
import type { Tone } from "@/lib/statusTones";

/**
 * Реєстр розділу «Документи» (картка 15, пункт d16; макет E). Збирається з
 * того, що вже лежить на замовленнях і в договорах поза CRM: підпис, оплата,
 * термін дії, а з REQ-343 — ще й журнал надсилань замовнику.
 */
export type DocumentKind = "contract" | "specification" | "invoice" | "waybill" | "act";
export type DocumentSection = "legal" | "accounting";
/** unsent — хід наш (не надіслано, повернули з правками); unsigned — надіслано, чекаємо замовника. */
export type DocumentFlag = "unsent" | "unsigned" | "noClosing" | "expiring";

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
/** Щойно створений договір чи СП ще ніхто не встиг підписати — це не «увага». */
const UNSIGNED_FLAG_AFTER_DAYS = 1;

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

const waitedDetail = (days: number) => (days === 0 ? "сьогодні" : `${days} дн.`);

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

const sentNote = (dispatch: Extract<DocumentDispatchState, { state: "sent" | "returned" }>) =>
  `${formatDispatchDay(dispatch.sent.createdAt)} · ${DISPATCH_CHANNEL_LABELS[dispatch.sent.channel ?? "other"]}`;

/** Крок «Надіслано» і події журналу (REQ-343#p7). */
const dispatchStep = (dispatch: DocumentDispatchState, settled: boolean): DocumentStep => {
  if (dispatch.state === "sent" || dispatch.state === "returned") return { label: "Надіслано", done: true, note: sentNote(dispatch) };
  if (dispatch.state === "unsent") return { label: "Надіслано", done: false, note: "ще ні" };
  if (dispatch.state === "notReady") return { label: "Надіслано", done: false, note: "ще не погоджено" };
  return { label: "Надіслано", done: settled, note: settled ? null : "не відстежено" };
};

const DISPATCH_EVENT_TEXT = { sent: "надіслано", reminded: "нагадали", customer_returned: "замовник повернув з правками" } as const;

const dispatchEvents = (record: DerivedOrderRecord, document: DispatchDocument): DocumentEvent[] =>
  (record.documentDispatches ?? [])
    .filter((item) => item.document === document)
    .map((item) => ({
      at: item.createdAt,
      precise: true,
      text: `${DISPATCH_EVENT_TEXT[item.event]}${item.channel ? ` ${DISPATCH_CHANNEL_LABELS[item.channel]}` : ""}${item.note ? `: ${item.note}` : ""}`,
      userId: item.createdBy,
    }));

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
  const dispatch = getDocumentDispatchState(record, kind);
  // «Не підписано» рахуємо від надсилання (p8): до нього чекали не замовника, а себе.
  // Без журналу (документ не потребує погодження) — як і раніше, від створення.
  let wait = waitStatus("Не підписано", input.createdAt, todayIso);
  let flag: DocumentFlag | null = !signed && active && wait.days >= UNSIGNED_FLAG_AFTER_DAYS ? "unsigned" : null;
  let alert: RegistryDocument["alert"] =
    flag === "unsigned" && wait.days >= LONG_WAIT_DAYS
      ? { tone: "danger", text: `Без підпису ${wait.days} дн. від створення. Чи надіслано замовнику, CRM не знає.` }
      : null;
  if (!signed && dispatch.state === "sent") {
    const days = workingDaysBetween(isoDay(dispatch.sent.createdAt), todayIso);
    wait = { ...wait, tone: days >= LONG_WAIT_DAYS ? "danger" : "warning", detail: days === 0 ? "надіслано сьогодні" : `${days} р.д. від надсилання`, days };
    flag = active && days >= UNSIGNED_FLAG_AFTER_DAYS ? "unsigned" : null;
    alert = flag && days >= LONG_WAIT_DAYS ? { tone: "danger", text: `Без підпису ${days} р.д. від надсилання ${sentNote(dispatch)}.` } : null;
  } else if (!signed && (dispatch.state === "unsent" || dispatch.state === "notReady" || dispatch.state === "returned")) {
    wait = {
      ...wait,
      tone: "warning",
      label: dispatch.state === "returned" ? "Повернули з правками" : "Не надіслано",
      detail: dispatch.state === "returned" ? (dispatch.returned.note ?? "без коментаря") : dispatch.state === "notReady" ? "ще не погоджено" : wait.detail,
    };
    flag = active ? "unsent" : null;
    alert =
      dispatch.state === "returned"
        ? { tone: "warning", text: `Замовник повернув з правками ${formatDispatchDay(dispatch.returned.createdAt)}: ${dispatch.returned.note ?? "без коментаря"}` }
        : null;
  }
  const status = signed
    ? { tone: "success" as Tone, label: "Підписано", detail: signedNote(input.signedAt!, input.via) }
    : ctx.cancelled
      ? { tone: "neutral" as Tone, label: "Замовлення скасовано", detail: null }
      : { tone: wait.tone, label: wait.label, detail: wait.detail };
  const events: DocumentEvent[] = [
    { at: input.createdAt, precise: true, text: kind === "contract" ? "створено договір" : "створено СП", userId: null },
    ...dispatchEvents(record, kind),
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
      dispatchStep(dispatch, signed),
      { label: "Підписано", done: signed, note: signed ? signedNote(input.signedAt!, input.via) : null },
    ],
    flag: ctx.cancelled ? null : flag,
    alert: ctx.cancelled ? null : alert,
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
  // ВН чи акт виписують при відвантаженні: оплачене, але ще не відвантажене — звичайний стан, не тривога.
  const noClosing =
    !ctx.cancelled && !closing.number && shipped && isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail);
  const waitedDays = daysBetween(createdAt, todayIso);
  const dispatch = getDocumentDispatchState(record, "invoice");
  // Рахунок дійсний 5 робочих днів з дати рахунку (p13–p14): жовтий за день до кінця, далі червоний.
  // На відтермінуванні (доплата після ВН) строку рахунку немає — тоді сірий.
  const due = getInvoiceDue(
    {
      invoiceNumber: record.invoiceNumber,
      invoiceDate: record.invoiceDate,
      invoiceCreatedAt: record.invoiceCreatedAt,
      prepaymentPct: resolveBreakdown(record)?.prepayment ?? null,
      balanceTiming: record.balanceTiming,
      paymentStatus: record.paymentStatus,
    },
    todayIso
  );
  const waiting = !paid && !partial && !ctx.cancelled;
  const unsent = waiting && (dispatch.state === "unsent" || dispatch.state === "returned");
  const waitingTone: Tone = due?.overdue ? "danger" : due?.warning || unsent ? "warning" : "neutral";
  const waitingDetail = due ? `${due.overdue ? "прострочено, був" : "дійсний"} до ${formatDispatchDay(due.dueDate)}` : waitedDetail(waitedDays);
  const status = paid
    ? { tone: "success" as Tone, label: "Оплачено", detail: null }
    : partial
      ? { tone: "info" as Tone, label: "Оплачено частково", detail: null }
      : ctx.cancelled
        ? { tone: "neutral" as Tone, label: "Замовлення скасовано", detail: null }
        : {
            tone: waitingTone,
            label: dispatch.state === "returned" ? "Повернули з правками" : unsent ? "Не надіслано" : "Чекає оплату",
            detail: waitingDetail,
          };
  const overdue = waiting && Boolean(due?.overdue);
  const noSum = !(record.total > 0);
  const events: DocumentEvent[] = [];
  if (record.invoiceRequestedAt) {
    events.push({ at: record.invoiceRequestedAt, precise: true, text: "попросили рахунок", userId: record.invoiceRequestedBy });
  }
  events.push({ at: createdAt, precise: Boolean(record.invoiceCreatedAt), text: `внесено номер ${record.invoiceNumber} з BAS`, userId: record.invoiceIssuedBy ?? null });
  events.push(...dispatchEvents(record, "invoice"));
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
      dispatchStep(dispatch, paid || partial),
      { label: "Оплачено", done: paid, note: paid ? "повністю" : partial ? "частково" : null },
    ],
    flag: noClosing ? "noClosing" : unsent && ctx.active ? "unsent" : null,
    alert: noClosing
      ? { tone: "danger", text: `Відвантажено, а ${closing.kind === "act" ? "акта" : "видаткової накладної"} ще немає.` }
      : noSum
        ? { tone: "warning", text: "У замовленні немає суми — рахунок показує 0 грн. Перевірте позиції замовлення." }
        : overdue && due
          ? { tone: "danger", text: `Рахунок прострочено: був дійсний до ${formatDispatchDay(due.dueDate)} (5 робочих днів).` }
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
  /** Той самий вибір, що в прорахунках: за id замовника або за його назвою. */
  customer: CustomerFilterValue | null;
  flag: DocumentFlag | null;
  search: string;
};

const matchesCustomer = (doc: RegistryDocument, value: CustomerFilterValue) =>
  doc.customerId === value.id ||
  customerFilterNames(value).some((name) => normalizeCustomerName(name) === normalizeCustomerName(doc.customerName));

const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** Пошук і плитка діють за весь час: шукаючи номер, не треба вгадувати місяць. */
export function filterDocuments(documents: RegistryDocument[], filters: DocumentFilters) {
  const query = normalize(filters.search);
  const useMonth = Boolean(filters.month) && !query && !filters.flag;
  return documents.filter((doc) => {
    if (filters.section !== "all" && doc.section !== filters.section) return false;
    if (filters.kind && doc.kind !== filters.kind) return false;
    if (filters.managerUserId && doc.managerUserId !== filters.managerUserId) return false;
    if (filters.customer && !matchesCustomer(doc, filters.customer)) return false;
    if (filters.flag && doc.flag !== filters.flag) return false;
    if (useMonth && (doc.documentDate ?? isoDay(doc.createdAt)).slice(0, 7) !== filters.month) return false;
    if (!query) return true;
    return [doc.number, doc.orderNumber, doc.customerName, doc.basis].some((value) => normalize(value).includes(query));
  });
}

export const countFlags = (documents: RegistryDocument[]) => {
  const counts: Record<DocumentFlag, number> = { unsent: 0, unsigned: 0, noClosing: 0, expiring: 0 };
  for (const doc of documents) if (doc.flag) counts[doc.flag] += 1;
  return counts;
};

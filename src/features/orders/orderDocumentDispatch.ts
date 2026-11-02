import { documentStamp, getDocumentApprovalState, isDocumentCleared, isDocumentSigned, type ApprovalRecord } from "./orderApprovals";
import type { DerivedOrderRecord } from "./orderRecords";
import { addBalanceDays, isCashlessPaymentMethod } from "./paymentRules";

/**
 * Надсилання документів замовнику (REQ-343; СЕО, 30.10–02.11.2026).
 *
 * «Надіслано» — факт із датою, каналом і відбитком документа, а не ручний
 * статус: змінили документ після надсилання — відбиток інший, і позначка вже не
 * про нього. Підписали одразу на папері — крок пропускається. Нічого не
 * блокує: ворота запуску ті самі, змінюється лише чий хід і що нагадувати.
 *
 * Модуль чистий і без аліасів імпорту: його читає й крон ранкового зведення
 * (netlify/functions/order-document-reminders.ts).
 */
export type DispatchDocument = "contract" | "specification" | "invoice";
export type DispatchChannel = "email" | "telegram" | "viber" | "whatsapp" | "other" | "vchasno";
export type DispatchEvent = "sent" | "reminded" | "customer_returned";

export type OrderDocumentDispatch = {
  id: string;
  orderId: string;
  document: DispatchDocument;
  event: DispatchEvent;
  channel: DispatchChannel | null;
  documentStamp: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export const DISPATCH_DOCUMENT_TITLES: Record<DispatchDocument, string> = {
  contract: "договір",
  specification: "СП",
  invoice: "рахунок",
};

export const DISPATCH_CHANNEL_LABELS: Record<DispatchChannel, string> = {
  email: "поштою",
  telegram: "у Telegram",
  viber: "у Viber",
  whatsapp: "у WhatsApp",
  other: "іншим шляхом",
  vchasno: "у Вчасно",
};

/** Рахунок дійсний 5 робочих днів з дати рахунку — так і в шаблоні BAS (Влад, 02.11). */
export const INVOICE_VALID_WORKING_DAYS = 5;
/** Погоджене чи виписане, але не надіслане з попереднього робочого дня — нагадати менеджеру. */
export const UNSENT_REMIND_AFTER_WORKING_DAYS = 1;
/** Надіслане й не підписане 2 робочі дні — нагадати менеджеру. */
export const UNSIGNED_REMIND_AFTER_WORKING_DAYS = 2;
/** 5 робочих днів без руху — у зведення керівнику. */
export const ESCALATE_AFTER_WORKING_DAYS = 5;

/** Відбиток рахунку: номер і дата з BAS. Перевиписали з іншим номером — надсилати наново. */
export const invoiceStamp = (record: Pick<DerivedOrderRecord, "invoiceNumber" | "invoiceDate">) =>
  ["invoice", record.invoiceNumber ?? "", record.invoiceDate ?? ""].join("|");

// --- Робочі дні: пн–пт, як у addBalanceDays (за воєнного стану свят немає). ---

const isoToUtc = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const DAY_MS = 86_400_000;
const isWeekend = (ms: number) => {
  const weekday = new Date(ms).getUTCDay();
  return weekday === 0 || weekday === 6;
};

/** Скільки робочих днів минуло: дні після `fromIso` до `toIso` включно (0 — той самий день). */
export const workingDaysBetween = (fromIso: string, toIso: string): number => {
  const from = isoToUtc(fromIso);
  const to = isoToUtc(toIso);
  let count = 0;
  for (let cursor = from + DAY_MS; cursor <= to; cursor += DAY_MS) if (!isWeekend(cursor)) count += 1;
  return count;
};

/** Попередній робочий день — «за день до кінця строку». */
export const previousWorkingDay = (iso: string): string => {
  let cursor = isoToUtc(iso) - DAY_MS;
  while (isWeekend(cursor)) cursor -= DAY_MS;
  return new Date(cursor).toISOString().slice(0, 10);
};

const kyivDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kiev" });
/** Київська дата позначки часу: надіслане о 23:30 UTC — уже наступний день. */
export const kyivDayOf = (value: string) => {
  if (value.length <= 10) return value;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value.slice(0, 10) : kyivDayFormat.format(new Date(time));
};

/** «02.11» */
export const formatDispatchDay = (value: string) => {
  const day = kyivDayOf(value);
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
};

// --- Строк оплати рахунку ---

export type InvoiceDueInput = {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceCreatedAt: string | null;
  /** Відсоток наперед; null — умов немає (старі замовлення), рахуємо як передоплату. */
  prepaymentPct: number | null;
  balanceTiming: string | null;
  paymentStatus: string;
};

export type InvoiceDue = {
  dueDate: string;
  /** З цього дня — «за день до кінця»: жовтий і нагадування менеджеру. */
  warnFrom: string;
  overdue: boolean;
  warning: boolean;
};

/** Оплата, що вже прийшла (хоч частково): рахунок своє відпрацював. */
const PAYMENT_STARTED = new Set(["partially_paid", "fully_paid", "awaiting_balance"]);

/**
 * Строк оплати рахунку: 5 робочих днів з дати рахунку. Лише там, де рахунок
 * справді треба оплатити наперед: на відтермінуванні (0% до відвантаження,
 * доплата після ВН) строк рахує дата ВН чи акта — це getBalanceDue.
 */
export const getInvoiceDue = (input: InvoiceDueInput, todayIso: string): InvoiceDue | null => {
  if (!input.invoiceNumber || PAYMENT_STARTED.has(input.paymentStatus)) return null;
  if (input.prepaymentPct === 0 && input.balanceTiming === "after_shipment") return null;
  const from = input.invoiceDate ?? (input.invoiceCreatedAt ? kyivDayOf(input.invoiceCreatedAt) : null);
  if (!from) return null;
  const dueDate = addBalanceDays(from, INVOICE_VALID_WORKING_DAYS, "working");
  const warnFrom = previousWorkingDay(dueDate);
  const overdue = todayIso > dueDate;
  return { dueDate, warnFrom, overdue, warning: !overdue && todayIso >= warnFrom };
};

// --- Стан надсилання документа на замовленні ---

export type DispatchRecord = ApprovalRecord &
  Pick<DerivedOrderRecord, "invoiceNumber" | "paymentStatus"> &
  Partial<Pick<DerivedOrderRecord, "invoiceCreatedAt" | "invoiceDate" | "documentDispatches" | "externalContract">>;

/**
 *  - none — надсилати нічого: готівка, успадкований чи внесений файлом договір,
 *    документ підписано, рахунок оплачено;
 *  - notReady — ще не можна: не погоджено або рахунок без номера;
 *  - unsent — можна й треба надіслати; `since` — відколи готове;
 *  - sent — надіслано, чекаємо замовника;
 *  - returned — замовник повернув з правками: хід знову наш.
 */
export type DocumentDispatchState =
  | { state: "none" }
  | { state: "notReady" }
  | { state: "unsent"; since: string | null }
  | { state: "sent"; sent: OrderDocumentDispatch; reminded: OrderDocumentDispatch | null }
  | { state: "returned"; sent: OrderDocumentDispatch; returned: OrderDocumentDispatch };

export const dispatchStamp = (record: DispatchRecord, document: DispatchDocument) =>
  document === "invoice"
    ? invoiceStamp({ invoiceNumber: record.invoiceNumber, invoiceDate: record.invoiceDate ?? null })
    : documentStamp(record, document);

/**
 * Останнє чинне «надіслано» і що було після нього. Відбиток порожній лише в
 * записах інтеграції (Вчасно) — такі вважаємо чинними: їх пише сама система
 * про той документ, що лежить у ній.
 */
export const resolveDispatchTrail = (
  dispatches: OrderDocumentDispatch[] | undefined,
  document: DispatchDocument,
  stamp: string
) => {
  const own = (dispatches ?? [])
    .filter((item) => item.document === document)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const sent = own.find((item) => item.event === "sent" && (!item.documentStamp || item.documentStamp === stamp)) ?? null;
  if (!sent) return { sent: null, reminded: null, returned: null };
  const after = own.filter((item) => item.createdAt > sent.createdAt);
  return {
    sent,
    reminded: after.find((item) => item.event === "reminded") ?? null,
    returned: after.find((item) => item.event === "customer_returned") ?? null,
  };
};

export const getDocumentDispatchState = (record: DispatchRecord, document: DispatchDocument): DocumentDispatchState => {
  if (!isCashlessPaymentMethod(record.paymentMethodId, record.paymentRail)) return { state: "none" };
  let since: string | null;
  if (document === "invoice") {
    if (PAYMENT_STARTED.has(record.paymentStatus)) return { state: "none" };
    if (!record.invoiceNumber) return { state: "notReady" };
    since = record.invoiceCreatedAt ?? record.invoiceDate ?? null;
  } else {
    // Успадкований договір надсилали з першим замовленням; внесений файлом — уже підписаний.
    if (document === "contract" && (record.inheritedContractOrderNumber || record.externalContract)) return { state: "none" };
    if (isDocumentSigned(record, document)) return { state: "none" };
    const { state, approval } = getDocumentApprovalState(record, document);
    if (state === "missing" || !isDocumentCleared(state)) return { state: "notReady" };
    if (state === "notRequired") return { state: "none" };
    since = approval?.decidedAt ?? null;
  }
  const trail = resolveDispatchTrail(record.documentDispatches, document, dispatchStamp(record, document));
  if (!trail.sent) return { state: "unsent", since };
  if (trail.returned) return { state: "returned", sent: trail.sent, returned: trail.returned };
  return { state: "sent", sent: trail.sent, reminded: trail.reminded };
};

export const DISPATCH_DOCUMENTS: DispatchDocument[] = ["contract", "specification", "invoice"];

/** Що можна надіслати зараз — для питання «Позначити надісланими?». */
export const getSendableDocuments = (record: DispatchRecord) =>
  DISPATCH_DOCUMENTS.map((document) => ({ document, dispatch: getDocumentDispatchState(record, document) })).filter(
    (item) => item.dispatch.state === "unsent" || item.dispatch.state === "sent" || item.dispatch.state === "returned"
  );

/** «договір і СП», «договір, СП і рахунок» */
export const joinDocumentTitles = (documents: DispatchDocument[]) => {
  const titles = documents.map((document) => DISPATCH_DOCUMENT_TITLES[document]);
  return titles.length <= 1 ? (titles[0] ?? "") : `${titles.slice(0, -1).join(", ")} і ${titles[titles.length - 1]}`;
};

/** «надіслано 02.11 · 3 дн. без відповіді · нагадали 04.11» */
export const formatSentNote = (
  dispatch: Extract<DocumentDispatchState, { state: "sent" }>,
  todayIso: string,
  { lead = "надіслано", waiting = "без відповіді" }: { lead?: string; waiting?: string } = {}
) => {
  const days = Math.max(0, workingDaysBetween(kyivDayOf(dispatch.sent.createdAt), todayIso));
  const parts = [`${lead} ${formatDispatchDay(dispatch.sent.createdAt)}`];
  if (days > 0) parts.push(`${days} р.д. ${waiting}`);
  if (dispatch.reminded) parts.push(`нагадали ${formatDispatchDay(dispatch.reminded.createdAt)}`);
  return parts.join(" · ");
};

// --- Тексти «Нагадати замовнику» (p11): менеджер відправляє сам, зі свого месенджера ---

export const buildSignatureReminderText = (params: {
  orderNumber: string;
  documents: DispatchDocument[];
  sentAt: string | null;
}) => {
  const what = joinDocumentTitles(params.documents);
  const sent = params.sentAt ? ` Надсилали ${formatDispatchDay(params.sentAt)}.` : "";
  return `Добрий день! Нагадую про підпис: ${what} по замовленню ${params.orderNumber}.${sent} Якщо є правки чи питання — напишіть, будь ласка.`;
};

export const buildPaymentReminderText = (params: {
  invoiceNumber: string;
  invoiceDate: string | null;
  amount: string;
  dueDate: string | null;
}) => {
  const date = params.invoiceDate ? ` від ${formatDispatchDay(params.invoiceDate)}` : "";
  const due = params.dueDate ? ` Рахунок дійсний до ${formatDispatchDay(params.dueDate)}.` : "";
  return `Добрий день! Нагадую про оплату рахунку № ${params.invoiceNumber}${date} на суму ${params.amount}.${due} Якщо оплату вже відправили — дякую, просто дайте знати.`;
};

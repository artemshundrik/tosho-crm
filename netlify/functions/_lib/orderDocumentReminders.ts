import {
  addCalendarDays,
  addWorkingDays,
  ESCALATE_AFTER_WORKING_DAYS,
  formatDispatchDay,
  getInvoiceDue,
  kyivDayOf,
  PAYMENT_STARTED_STATUSES,
  previousWorkingDay,
  UNSENT_REMIND_AFTER_WORKING_DAYS,
  UNSIGNED_REMIND_AFTER_WORKING_DAYS,
  workingDaysBetween,
} from "../../../src/lib/orderDocumentDeadlines";
import { kyivDateKey } from "./quoteMarkupReminder";
import { QUIET_HOURS_TIME_ZONE, kyivHour } from "./quietHours";

/**
 * Ранкове зведення документів замовникам (REQ-343#p6, p10, p12, p13).
 *
 * ЗВІДКИ. Після погодження договір і СП могли днями лежати в менеджера, а
 * надіслані — днями чекати підпису: CRM про це мовчала, поки замовник не
 * питав, де документи. Рішення СЕО (30.10–02.11.2026): раз на день, о 10:00
 * за Києвом, менеджеру — ОДНЕ повідомлення про всі свої замовлення; керівнику
 * (власник, СЕО) — лише те, що висить 5 робочих днів і довше, чи прострочена
 * оплата.
 *
 * ЩО ЛОВИМО:
 *  - не надіслано: договір і СП погоджені, рахунок виписаний, а «надіслано»
 *    немає з попереднього робочого дня;
 *  - повернули з правками: хід знову менеджера;
 *  - не підписано: надіслано 2 робочі дні тому й раніше;
 *  - рахунок: за день до кінця 5 р.д. і прострочений;
 *  - доплата після ВН чи акта: за день до строку й прострочена.
 *
 * Модуль чистий: на вході — рядки з бази, на виході — що й кому сказати. Хто
 * кличе — netlify/functions/order-document-reminders.ts.
 *
 * ВІДОМЕ ОБМЕЖЕННЯ. Відбиток договору й СП тут береться з погодження, а не
 * рахується з полів замовлення, як в інтерфейсі: документ, змінений після
 * погодження без нового погодження, крон ще вважає погодженим. Інтерфейс у
 * такому разі показує «змінився — погодити ще раз», тож менеджер побачить
 * правду, щойно відкриє замовлення.
 */

export type ReminderOrderRow = {
  id: string;
  team_id: string;
  quote_number: string | null;
  customer_name: string | null;
  manager_user_id: string | null;
  payment_method_id: string | null;
  payment_method_label: string | null;
  order_status: string | null;
  payment_status: string | null;
  contract_created_at: string | null;
  specification_created_at: string | null;
  contract_signed_at: string | null;
  specification_signed_at: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_created_at: string | null;
  prepayment_pct: number | string | null;
  balance_timing: string | null;
  balance_days_after_shipment: number | string | null;
  balance_days_kind: string | null;
  closing_document: string | null;
  act_date: string | null;
  waybill_date: string | null;
};

export type ReminderApprovalRow = {
  order_id: string;
  kind: string;
  status: string;
  document_stamp: string | null;
  requested_at: string;
  decided_at: string | null;
};

export type ReminderDispatchRow = {
  order_id: string;
  document: string;
  event: string;
  document_stamp: string | null;
  created_at: string;
};

export const ORDER_REMINDER_COLUMNS =
  "id,team_id,quote_number,customer_name,manager_user_id,payment_method_id,payment_method_label,order_status,payment_status,contract_created_at,specification_created_at,contract_signed_at,specification_signed_at,invoice_number,invoice_date,invoice_created_at,prepayment_pct,balance_timing,balance_days_after_shipment,balance_days_kind,closing_document,act_date,waybill_date";

/** Закриті замовлення документів уже не чекають. */
export const CLOSED_ORDER_STATUSES = ["cancelled", "completed"];

export type ReminderDocument = "contract" | "specification" | "invoice" | "balance";
export type ReminderSection = "unsent" | "returned" | "unsigned" | "unpaid";

export type DocumentReminderItem = {
  orderId: string;
  teamId: string;
  orderNumber: string | null;
  customerName: string | null;
  managerUserId: string | null;
  document: ReminderDocument;
  section: ReminderSection;
  /** Коротко, що з документом: «2 р.д.», «до 05.11», «прострочено з 03.11». */
  detail: string;
  /** У зведення керівнику: 5 р.д. без руху або прострочена оплата. */
  escalate: boolean;
};

const DOCUMENT_TITLES: Record<ReminderDocument, string> = {
  contract: "договір",
  specification: "СП",
  invoice: "рахунок",
  balance: "доплата",
};

/** Дзеркало isCashlessPaymentMethod (paymentRules.ts тягне `@/`, функціям недоступний). */
export const isCashlessOrder = (row: Pick<ReminderOrderRow, "payment_method_id" | "payment_method_label">) => {
  const id = (row.payment_method_id ?? "").trim().toLowerCase();
  if (id === "bank_uah" || id === "bank_fx") return true;
  return (row.payment_method_label ?? "").trim().toLowerCase().includes("безготів");
};

const toNumber = (value: number | string | null) => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Останнє не відкликане погодження виду — як latestApproval в orderApprovals.ts. */
const latestApproval = (approvals: ReminderApprovalRow[], kind: string) => {
  let latest: ReminderApprovalRow | null = null;
  for (const approval of approvals) {
    if (approval.kind !== kind || approval.status === "withdrawn") continue;
    if (!latest || approval.requested_at > latest.requested_at) latest = approval;
  }
  return latest;
};

/**
 * Останнє чинне «надіслано» й «повернули» після нього — як resolveDispatchTrail.
 * Порожній відбиток пише лише інтеграція (Вчасно) — такий вважаємо чинним.
 */
const resolveTrail = (dispatches: ReminderDispatchRow[], document: string, stamp: string | null) => {
  const own = dispatches
    .filter((item) => item.document === document)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const sent =
    own.find((item) => item.event === "sent" && (!item.document_stamp || item.document_stamp === stamp)) ?? null;
  if (!sent) return { sent: null, returned: null };
  const returned = own.find((item) => item.event === "customer_returned" && item.created_at > sent.created_at) ?? null;
  return { sent, returned };
};

const daysLabel = (days: number) => `${days} р.д.`;

/** Що з документом, який можна й треба надіслати: не надіслано / повернули / не підписано. */
const dispatchItem = (
  base: Omit<DocumentReminderItem, "document" | "section" | "detail" | "escalate">,
  document: ReminderDocument,
  trail: ReturnType<typeof resolveTrail>,
  readySince: string | null,
  today: string,
  signable: boolean
): DocumentReminderItem | null => {
  if (!trail.sent) {
    if (!readySince) return null;
    const days = workingDaysBetween(kyivDayOf(readySince), today);
    if (days < UNSENT_REMIND_AFTER_WORKING_DAYS) return null;
    return { ...base, document, section: "unsent", detail: daysLabel(days), escalate: days >= ESCALATE_AFTER_WORKING_DAYS };
  }
  if (trail.returned) {
    const days = workingDaysBetween(kyivDayOf(trail.returned.created_at), today);
    return {
      ...base,
      document,
      section: "returned",
      detail: `з ${formatDispatchDay(trail.returned.created_at)}`,
      escalate: days >= ESCALATE_AFTER_WORKING_DAYS,
    };
  }
  if (!signable) return null;
  const days = workingDaysBetween(kyivDayOf(trail.sent.created_at), today);
  if (days < UNSIGNED_REMIND_AFTER_WORKING_DAYS) return null;
  return { ...base, document, section: "unsigned", detail: daysLabel(days), escalate: days >= ESCALATE_AFTER_WORKING_DAYS };
};

/** Строк: за день до кінця — менеджеру, прострочено — менеджеру й керівнику. */
const dueItem = (
  base: Omit<DocumentReminderItem, "document" | "section" | "detail" | "escalate">,
  document: ReminderDocument,
  dueDate: string,
  today: string
): DocumentReminderItem | null => {
  if (today > dueDate) {
    return { ...base, document, section: "unpaid", detail: `строк минув ${formatDispatchDay(dueDate)}`, escalate: true };
  }
  if (today >= previousWorkingDay(dueDate)) {
    return { ...base, document, section: "unpaid", detail: `до ${formatDispatchDay(dueDate)}`, escalate: false };
  }
  return null;
};

/** Усе, що на сьогодні вимагає дії по замовленню. */
export function collectOrderReminders(
  order: ReminderOrderRow,
  approvals: ReminderApprovalRow[],
  dispatches: ReminderDispatchRow[],
  today: string
): DocumentReminderItem[] {
  if (CLOSED_ORDER_STATUSES.includes(order.order_status ?? "")) return [];
  const base = {
    orderId: order.id,
    teamId: order.team_id,
    orderNumber: order.quote_number,
    customerName: order.customer_name,
    managerUserId: order.manager_user_id,
  };
  const items: DocumentReminderItem[] = [];
  const paymentStatus = order.payment_status ?? "";

  if (isCashlessOrder(order)) {
    for (const kind of ["contract", "specification"] as const) {
      const created = kind === "contract" ? order.contract_created_at : order.specification_created_at;
      const signed = kind === "contract" ? order.contract_signed_at : order.specification_signed_at;
      // Успадкований договір погоджували на першому замовленні — тут погодження
      // немає, і нагадувати нема про що.
      if (!created || signed) continue;
      const approval = latestApproval(approvals, kind);
      if (approval?.status !== "approved") continue;
      const trail = resolveTrail(dispatches, kind, approval.document_stamp);
      const item = dispatchItem(base, kind, trail, approval.decided_at, today, true);
      if (item) items.push(item);
    }

    if (order.invoice_number && !PAYMENT_STARTED_STATUSES.has(paymentStatus)) {
      const stamp = ["invoice", order.invoice_number, order.invoice_date ?? ""].join("|");
      const trail = resolveTrail(dispatches, "invoice", stamp);
      const flagged = dispatchItem(
        base,
        "invoice",
        trail,
        order.invoice_created_at ?? order.invoice_date,
        today,
        false
      );
      if (flagged) items.push(flagged);
      else if (trail.sent && !trail.returned) {
        const due = getInvoiceDue(
          {
            invoiceNumber: order.invoice_number,
            invoiceDate: order.invoice_date,
            invoiceCreatedAt: order.invoice_created_at,
            prepaymentPct: toNumber(order.prepayment_pct),
            balanceTiming: order.balance_timing,
            paymentStatus,
          },
          today
        );
        const item = due ? dueItem(base, "invoice", due.dueDate, today) : null;
        if (item) items.push(item);
      }
    }
  }

  // Доплата після відвантаження рахується від дати ВН чи акта (p10).
  if (order.balance_timing === "after_shipment" && paymentStatus !== "fully_paid") {
    const from = order.closing_document === "act" ? order.act_date : order.waybill_date;
    if (from) {
      const days = toNumber(order.balance_days_after_shipment) ?? 3;
      const dueDate =
        order.balance_days_kind === "calendar" ? addCalendarDays(from, days) : addWorkingDays(from, days);
      const item = dueItem(base, "balance", dueDate, today);
      if (item) items.push(item);
    }
  }

  return items;
}

// --- Коли слати ---

/** О 10:00 за Києвом: після ранкової пошти, до обіду (рішення СЕО). */
export const ORDER_DOCS_DIGEST_HOUR = 10;

/**
 * Чому зараз зведення не слати — або `null`, якщо саме час. Диспетчер будить
 * кожні п'ять хвилин; решта тіків закінчується тут, без жодного запиту.
 * Вихідні — тиша: документи чекають робочого дня, як і замовник.
 */
export function orderDocsDigestPause(now: Date): "not-digest-hour" | "weekend" | null {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: QUIET_HOURS_TIME_ZONE, weekday: "short" }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return "weekend";
  if (kyivHour(now) !== ORDER_DOCS_DIGEST_HOUR) return "not-digest-hour";
  return null;
}

/** Сьогоднішня київська дата — від неї рахуються робочі дні. */
export const kyivToday = (now: Date) => kyivDateKey(now);

// --- Тексти й кнопки ---

export const ORDER_DOCS_KEY_PREFIX = "order-docs";
export const ORDER_DOCS_HEAD_KEY_PREFIX = "order-docs-head";

/** `reminder=` з датою — без нього дедуплікація в deliverNotifications мовчить. */
export const managerDigestHref = (userId: string, today: string) =>
  `/orders/production?reminder=${encodeURIComponent(`${ORDER_DOCS_KEY_PREFIX}:${userId}:${today}`)}`;
export const headDigestHref = (userId: string, today: string) =>
  `/documents?reminder=${encodeURIComponent(`${ORDER_DOCS_HEAD_KEY_PREFIX}:${userId}:${today}`)}`;

const SECTION_TITLES: Record<ReminderSection, string> = {
  unsent: "Не надіслано",
  returned: "Повернули з правками",
  unsigned: "Не підписано",
  unpaid: "Не оплачено",
};
const SECTION_ORDER: ReminderSection[] = ["unsent", "returned", "unsigned", "unpaid"];

/** Більше Telegram не вміщує без прокрутки, а людина не дочитує. */
const MAX_LINES_PER_SECTION = 10;
const MAX_BUTTONS = 8;

const orderRef = (item: DocumentReminderItem) => (item.orderNumber?.trim() ? item.orderNumber.trim() : "замовлення");

const itemLine = (item: DocumentReminderItem) => {
  const customer = item.customerName?.trim() ? ` ${item.customerName.trim()}` : "";
  return `• ${orderRef(item)}${customer} — ${DOCUMENT_TITLES[item.document]}, ${item.detail}`;
};

const sectionBlocks = (items: DocumentReminderItem[]) =>
  SECTION_ORDER.flatMap((section) => {
    const own = items.filter((item) => item.section === section);
    if (own.length === 0) return [];
    const lines = own.slice(0, MAX_LINES_PER_SECTION).map(itemLine);
    if (own.length > MAX_LINES_PER_SECTION) lines.push(`…і ще ${own.length - MAX_LINES_PER_SECTION}`);
    return [`${SECTION_TITLES[section]}:\n${lines.join("\n")}`];
  });

/** Кнопка на кожен документ (p12): одразу на замовлення, без пошуку в списку. */
export const buildDigestLinks = (items: DocumentReminderItem[]) =>
  items.slice(0, MAX_BUTTONS).map((item) => ({
    text: `${orderRef(item)} · ${DOCUMENT_TITLES[item.document]}`,
    href: `/orders/production/${item.orderId}`,
  }));

export function buildManagerDigest(items: DocumentReminderItem[]): { title: string; body: string } {
  return {
    title: `Документи замовникам: ${items.length} потребують дії`,
    body: sectionBlocks(items).join("\n\n"),
  };
}

/**
 * Керівнику — лише затримки, згруповані за менеджером: видно не «що не так з
 * документом», а в кого застрягло.
 */
export function buildHeadDigest(
  items: DocumentReminderItem[],
  managerName: (userId: string | null) => string
): { title: string; body: string } {
  const byManager = new Map<string, DocumentReminderItem[]>();
  for (const item of items) {
    const name = managerName(item.managerUserId);
    byManager.set(name, [...(byManager.get(name) ?? []), item]);
  }
  const blocks = Array.from(byManager.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, own]) => {
      const lines = own
        .slice(0, MAX_LINES_PER_SECTION)
        .map((item) => `${itemLine(item)} (${SECTION_TITLES[item.section].toLowerCase()})`);
      if (own.length > MAX_LINES_PER_SECTION) lines.push(`…і ще ${own.length - MAX_LINES_PER_SECTION}`);
      return `${name} — ${own.length}:\n${lines.join("\n")}`;
    });
  return {
    title: `Затримки з документами: ${items.length}`,
    body: blocks.join("\n\n"),
  };
}

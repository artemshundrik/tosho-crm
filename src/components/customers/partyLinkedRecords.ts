import { supabase } from "@/lib/supabaseClient";
import { normalizePartyMatch } from "@/lib/partyNameMatch";
import { loadDerivedOrders } from "@/features/orders/orderRecords";
import { computeQuoteListTotal } from "@/features/quotes/quotes-page/quoteListTotal";
import { listQuoteItemPreviewsForQuotes, listQuoteRunPreviewsForQuotes } from "@/lib/toshoApi";
import { aggregateCustomerLtv, buildSegmentMap, type CustomerLtvEntry, type RfmSegment } from "@/lib/customerLtv";
import type { CustomerLinkedItem } from "./partyFormTypes";

/**
 * Прорахунки, замовлення й дизайн-задачі замовника або ліда — нижня частина
 * картки. Одне джерело для сторінки «Замовники» і для картки, яку відкривають
 * клацанням по замовнику з прорахунку, задачі чи замовлення (REQ-348).
 *
 * Прорахунки віддаються ОКРЕМО й раніше (`onCalculations`): вони приходять
 * за один-два запити, а замовлення тягнуть похідні записи всієї команди, тож
 * чекати на них, щоб показати прорахунки, нема чого.
 *
 * Лід тримається в прорахунку лише текстом `customer_name` (REQ-193), тому
 * для ліда все зіставляється за назвою, а для замовника — ще й за id.
 */

export type PartyLinkedTarget =
  | { kind: "customer"; id: string; names: Array<string | null | undefined> }
  | { kind: "lead"; names: Array<string | null | undefined> };

/**
 * Рядок списку плюс те, з чого панель картки виводить підказки
 * (`partyContextHints`): коли прорахунок востаннє рухався, чи відвантажене й
 * оплачене замовлення.
 */
export type PartyLinkedItem = CustomerLinkedItem & {
  updated_at?: string | null;
  delivery_status?: string | null;
  payment_status?: string | null;
};

export type PartyLinkedRecords = {
  calculations: PartyLinkedItem[];
  orders: PartyLinkedItem[];
  designTasks: CustomerLinkedItem[];
  /** Лише для замовника: LTV рахується з тих самих замовлень, що й список. */
  ltvEntry: CustomerLtvEntry | null;
  ltvSegment?: RfmSegment;
};

type NamedQuoteRow = PartyLinkedItem & {
  customer_id?: string | null;
  customer_name?: string | null;
  title?: string | null;
};

type DesignTaskLogRow = {
  id: string;
  title?: string | null;
  created_at?: string | null;
  status?: string | null;
  design_task_number?: string | null;
  design_task_type?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  quote_id?: string | null;
  entity_id?: string | null;
};

const QUOTE_COLUMNS = "id,number,status,total,created_at,updated_at,customer_id,customer_name,title";

const toLinkedQuote = ({ id, number, status, total, created_at, updated_at }: NamedQuoteRow): PartyLinkedItem => ({
  id,
  number,
  status,
  total,
  created_at,
  updated_at,
});

async function loadCalculations(
  teamId: string,
  target: PartyLinkedTarget,
  candidateNames: string[],
  normalizedNames: Set<string>
): Promise<PartyLinkedItem[]> {
  if (target.kind === "lead") {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quotes")
      .select(QUOTE_COLUMNS)
      .eq("team_id", teamId)
      .is("customer_id", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return ((data ?? []) as unknown as NamedQuoteRow[])
      .filter((row) => normalizedNames.has(normalizePartyMatch(row.customer_name ?? row.title ?? null)))
      .map(toLinkedQuote);
  }

  const byNameQuery = (column: "customer_name" | "title") =>
    candidateNames.length > 0
      ? supabase
          .schema("tosho")
          .from("quotes")
          .select(QUOTE_COLUMNS)
          .eq("team_id", teamId)
          .in(column, candidateNames)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null });
  const [quotesById, quotesByName, quotesByTitle] = await Promise.allSettled([
    supabase
      .schema("tosho")
      .from("quotes")
      .select(QUOTE_COLUMNS)
      .eq("team_id", teamId)
      .eq("customer_id", target.id)
      .order("created_at", { ascending: false })
      .limit(100),
    byNameQuery("customer_name"),
    byNameQuery("title"),
  ]);
  const quoteMap = new Map<string, PartyLinkedItem>();
  if (quotesById.status === "fulfilled") {
    for (const row of (quotesById.value.data ?? []) as unknown as NamedQuoteRow[]) quoteMap.set(row.id, toLinkedQuote(row));
  }
  for (const result of [quotesByName, quotesByTitle]) {
    if (result.status !== "fulfilled") continue;
    ((result.value.data ?? []) as unknown as NamedQuoteRow[]).forEach((row) => {
      if (row.customer_id === target.id || normalizedNames.has(normalizePartyMatch(row.customer_name ?? row.title ?? null))) {
        quoteMap.set(row.id, toLinkedQuote(row));
      }
    });
  }
  return Array.from(quoteMap.values()).sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
}

/**
 * Сума продажу прорахунків — з тиражів, як у таблиці прорахунків
 * (`computeQuoteListTotal`). `quotes.total` у свіжих прорахунках лишається
 * нулем: з ним панель казала «погоджено, але сума 0 ₴» про прорахунок на
 * 13 тис. Не вийшло дочитати тиражі — лишаємо `quotes.total`, як було.
 */
async function loadQuoteSaleTotals(teamId: string, quoteIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (quoteIds.length === 0) return totals;
  const [items, runs] = await Promise.all([
    listQuoteItemPreviewsForQuotes({ teamId, quoteIds }),
    listQuoteRunPreviewsForQuotes({ quoteIds }),
  ]);
  for (const quoteId of quoteIds) {
    const quoteItems = items.filter((item) => item.quote_id === quoteId);
    if (quoteItems.length === 0) continue;
    const total = computeQuoteListTotal(quoteItems, runs.filter((run) => run.quote_id === quoteId));
    if (total) totals.set(quoteId, total.amount);
  }
  return totals;
}

export async function loadPartyLinkedRecords(params: {
  teamId: string;
  userId?: string | null;
  target: PartyLinkedTarget;
  onCalculations?: (rows: PartyLinkedItem[]) => void;
}): Promise<PartyLinkedRecords> {
  const { teamId, userId, target, onCalculations } = params;
  const customerId = target.kind === "customer" ? target.id : null;
  const candidateNames = Array.from(
    new Set(target.names.map((value) => (value ?? "").trim()).filter(Boolean))
  );
  const normalizedNames = new Set(candidateNames.map((value) => normalizePartyMatch(value)));

  const quotedCalculations = await loadCalculations(teamId, target, candidateNames, normalizedNames);
  // Суми тут ще сирі (`quotes.total`, у свіжих — 0): віддаємо «не пораховано»,
  // інакше підказка «погоджено, але сума 0 ₴» блимає, поки рахуються тиражі.
  onCalculations?.(quotedCalculations.map((row) => ({ ...row, total: null })));
  const quoteIds = new Set(quotedCalculations.map((row) => row.id).filter(Boolean));

  const [ordersResult, designTasksResult, totalsResult] = await Promise.allSettled([
    loadDerivedOrders(teamId, userId),
    supabase
      .from("activity_log")
      .select(
        "id,title,created_at,status:metadata->>status,design_task_number:metadata->>design_task_number,design_task_type:metadata->>design_task_type,entity_id,customer_id:metadata->>customer_id,customer_name:metadata->>customer_name,quote_id:metadata->>quote_id"
      )
      .eq("team_id", teamId)
      .eq("action", "design_task")
      .order("created_at", { ascending: false })
      .limit(500),
    loadQuoteSaleTotals(teamId, Array.from(quoteIds)),
  ]);

  let calculations = quotedCalculations;
  if (totalsResult.status === "fulfilled") {
    const totals = totalsResult.value;
    calculations = quotedCalculations.map((row) => (totals.has(row.id) ? { ...row, total: totals.get(row.id) } : row));
  } else {
    console.warn("Failed to load quote sale totals", totalsResult.reason);
  }

  let orders: PartyLinkedItem[] = [];
  let ltvEntry: CustomerLtvEntry | null = null;
  let ltvSegment: RfmSegment | undefined;
  if (ordersResult.status === "fulfilled") {
    orders = ordersResult.value
      .filter(
        (row) =>
          (customerId !== null && row.customerId === customerId) ||
          quoteIds.has(row.quoteId) ||
          normalizedNames.has(normalizePartyMatch(row.customerName))
      )
      .map((row) => ({
        id: row.id,
        number: row.quoteNumber,
        status: row.orderStatus,
        total: row.total,
        created_at: row.createdAt,
        delivery_status: row.deliveryStatus,
        payment_status: row.paymentStatus,
      }));
    if (customerId) {
      // Сегмент відносний (квінтиль серед усіх замовників), тому рахуємо по всіх.
      const ltvMap = aggregateCustomerLtv(ordersResult.value);
      ltvEntry = ltvMap.get(customerId) ?? null;
      ltvSegment = buildSegmentMap(ltvMap).get(customerId);
    }
  } else {
    console.warn("Failed to load related party orders", ordersResult.reason);
  }

  let designTasks: CustomerLinkedItem[] = [];
  if (designTasksResult.status === "fulfilled") {
    designTasks = ((designTasksResult.value.data ?? []) as unknown as DesignTaskLogRow[])
      .filter((row) => {
        const linkedQuoteId = row.quote_id ?? row.entity_id ?? null;
        return (
          (customerId !== null && row.customer_id === customerId) ||
          (linkedQuoteId ? quoteIds.has(linkedQuoteId) : false) ||
          normalizedNames.has(normalizePartyMatch(row.customer_name ?? null))
        );
      })
      .map((row) => ({
        id: row.id,
        number: row.design_task_number ?? null,
        title: row.title ?? "Дизайн-задача",
        status: row.status ?? "new",
        subtitle: row.design_task_type ? `Тип: ${row.design_task_type}` : null,
        created_at: row.created_at ?? null,
      }));
  } else {
    console.warn("Failed to load related party design tasks", designTasksResult.reason);
  }

  return { calculations, orders, designTasks, ltvEntry, ltvSegment };
}

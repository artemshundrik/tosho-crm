import { supabase } from "@/lib/supabaseClient";
import { listCustomerQuotes } from "@/lib/toshoApi";
import { normalizePartyMatch } from "@/lib/partyNameMatch";
import { loadDerivedOrders } from "@/features/orders/orderRecords";
import { aggregateCustomerLtv, buildSegmentMap, type CustomerLtvEntry, type RfmSegment } from "@/lib/customerLtv";
import type { CustomerLinkedItem } from "./CustomerDialog";

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

export type PartyLinkedRecords = {
  calculations: CustomerLinkedItem[];
  orders: CustomerLinkedItem[];
  designTasks: CustomerLinkedItem[];
  /** Лише для замовника: LTV рахується з тих самих замовлень, що й список. */
  ltvEntry: CustomerLtvEntry | null;
  ltvSegment?: RfmSegment;
};

type NamedQuoteRow = CustomerLinkedItem & {
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

const QUOTE_COLUMNS = "id,number,status,total,created_at,customer_id,customer_name,title";

const toLinkedQuote = ({ id, number, status, total, created_at }: NamedQuoteRow): CustomerLinkedItem => ({
  id,
  number,
  status,
  total,
  created_at,
});

async function loadCalculations(
  teamId: string,
  target: PartyLinkedTarget,
  candidateNames: string[],
  normalizedNames: Set<string>
): Promise<CustomerLinkedItem[]> {
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
    listCustomerQuotes({ teamId, customerId: target.id, limit: 100 }),
    byNameQuery("customer_name"),
    byNameQuery("title"),
  ]);
  const quoteMap = new Map<string, CustomerLinkedItem>();
  if (quotesById.status === "fulfilled") {
    for (const row of quotesById.value as NamedQuoteRow[]) quoteMap.set(row.id, toLinkedQuote(row));
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

export async function loadPartyLinkedRecords(params: {
  teamId: string;
  userId?: string | null;
  target: PartyLinkedTarget;
  onCalculations?: (rows: CustomerLinkedItem[]) => void;
}): Promise<PartyLinkedRecords> {
  const { teamId, userId, target, onCalculations } = params;
  const customerId = target.kind === "customer" ? target.id : null;
  const candidateNames = Array.from(
    new Set(target.names.map((value) => (value ?? "").trim()).filter(Boolean))
  );
  const normalizedNames = new Set(candidateNames.map((value) => normalizePartyMatch(value)));

  const calculations = await loadCalculations(teamId, target, candidateNames, normalizedNames);
  onCalculations?.(calculations);
  const quoteIds = new Set(calculations.map((row) => row.id).filter(Boolean));

  const [ordersResult, designTasksResult] = await Promise.allSettled([
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
  ]);

  let orders: CustomerLinkedItem[] = [];
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

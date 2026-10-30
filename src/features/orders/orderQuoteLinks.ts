import { supabase } from "@/lib/supabaseClient";
import { listQuoteItemsForQuotes, listQuoteRunsForQuotes, type QuoteItemExportRow, type QuoteRun } from "@/lib/toshoApi";
import { LAUNCHED_ORDER_STATUSES } from "./orderLaunchPath";
import type { DerivedOrderItem } from "./orderRecords";

/**
 * Зв'язок замовлення з прорахунками ПО ПОЗИЦІЯХ (REQ-344, погоджено власником 30.10.2026).
 *
 * Замовлення може зібрати позиції з кількох прорахунків одного замовника, а з
 * прорахунку можна взяти частину позицій зараз і решту пізніше. Хто з якого
 * прорахунку — каже order_items.quote_item_id; orders.quote_id лишається
 * прорахунком, з якого замовлення почали. Одна позиція прорахунку — щонайбільше
 * в одному замовленні (order_items_quote_item_uniq, scripts/orders-multi-quote.sql).
 */

/** Замовлення, куди ще можна докласти позиції прорахунку. */
export type OrderAppendTarget = {
  id: string;
  orderNumber: string;
  total: number;
  itemCount: number;
};

/** Скасоване або запущене замовлення нових позицій не приймає (те саме в SQL-функції й тригері). */
const CLOSED_FOR_APPEND = ["cancelled", ...LAUNCHED_ORDER_STATUSES];

const isUuid = (value?: string | null) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));

/** Які з позицій прорахунку вже лежать у замовленнях — і в яких (quote_item_id → номер). */
export async function loadOrderedQuoteItemNumbers(
  teamId: string,
  quoteItemIds: string[]
): Promise<Record<string, string>> {
  const ids = quoteItemIds.filter(isUuid);
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .schema("tosho")
    .from("order_items")
    .select("quote_item_id, order:orders!inner(quote_number)")
    .eq("team_id", teamId)
    .in("quote_item_id", ids);
  if (error) throw error;
  const result: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{
    quote_item_id?: string | null;
    order?: { quote_number?: string | null } | Array<{ quote_number?: string | null }> | null;
  }>) {
    const order = Array.isArray(row.order) ? row.order[0] : row.order;
    if (row.quote_item_id) result[row.quote_item_id] = order?.quote_number?.trim() || "замовлення";
  }
  return result;
}

/**
 * Замовлення, куди ще можна докласти позиції: той самий замовник і валюта, не скасоване й не запущене,
 * рахунок не запитано й не виписано, СП не підписана. Ті самі правила стереже
 * tosho.append_quote_items_to_order — тут лише щоб не показувати безнадійні варіанти.
 */
export async function loadOrderAppendTargets(
  teamId: string,
  customerId: string | null,
  currency: string
): Promise<OrderAppendTarget[]> {
  if (!customerId) return [];
  const { data, error } = await supabase
    .schema("tosho")
    .from("orders")
    .select("id, quote_number, total, currency, order_items(count)")
    .eq("team_id", teamId)
    .eq("customer_id", customerId)
    .is("invoice_number", null)
    .is("invoice_requested_at", null)
    .is("specification_signed_at", null)
    .not("order_status", "in", `(${CLOSED_FOR_APPEND.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const wantedCurrency = (currency || "UAH").toUpperCase();
  return ((data ?? []) as Array<{
    id: string;
    quote_number?: string | null;
    total?: number | string | null;
    currency?: string | null;
    order_items?: Array<{ count?: number | null }> | null;
  }>)
    .filter((row) => (row.currency?.trim() || "UAH").toUpperCase() === wantedCurrency)
    .map((row) => ({
      id: row.id,
      orderNumber: row.quote_number?.trim() || row.id.slice(0, 8),
      total: Number(row.total ?? 0) || 0,
      itemCount: Number(row.order_items?.[0]?.count ?? 0) || 0,
    }));
}

/** Рядок order_items із позиції прорахунку — і для нового замовлення, і для докладання. */
export const toOrderItemPayload = (item: DerivedOrderItem) => ({
  quote_item_id: item.quoteItemId ?? item.id,
  name: item.name,
  description: item.description ?? null,
  qty: item.qty,
  unit: item.unit,
  unit_price: item.unitPrice,
  line_total: item.lineTotal,
  methods: item.methodsSummary ? [{ label: item.methodsSummary }] : null,
  catalog_model_id: item.catalogModelId ?? null,
  image_url: item.imageUrl ?? null,
  thumb_url: item.thumbUrl ?? null,
});

/** Помилка бази «позиція вже в замовленні» — людською мовою; інша помилка → null. */
export const describeOrderItemConflict = (error: { code?: string; message?: string }) =>
  error.code === "23505" && /order_items_quote_item_uniq|уже в іншому замовленні/.test(error.message ?? "")
    ? new Error("Частину позицій уже додали в інше замовлення. Оновіть сторінку й оберіть решту.")
    : null;

/**
 * Позиції нового замовлення не лягли (хтось встиг забрати їх в інше замовлення, мережа) —
 * порожнє замовлення не лишаємо: інакше прорахунок закрився б на замовлення без жодного рядка.
 */
export async function discardEmptyOrder(teamId: string, orderId: string, orderNumber: string) {
  const { error } = await supabase.schema("tosho").from("orders").delete().eq("team_id", teamId).eq("id", orderId);
  if (error) {
    throw new Error(`Позиції не збереглися, а порожнє замовлення ${orderNumber} прибрати не вдалося — видаліть його вручну.`);
  }
}

/**
 * Прорахунки, з яких у замовлення доклали позиції, але які не є orders.quote_id жодного
 * замовлення. Їхні позиції, тиражі й дизайн-задачі добираються другим заходом — і лише
 * коли такі позиції справді є, тож на звичайних замовленнях запитів не додається.
 */
export async function loadForeignOrderQuotes(params: {
  teamId: string;
  orderQuoteItemIds: Array<string | null | undefined>;
  knownQuoteItemIds: Set<string>;
  knownQuoteIds: string[];
}) {
  const empty = {
    quoteIds: [] as string[],
    quoteItems: [] as QuoteItemExportRow[],
    quoteRuns: [] as Array<{ quoteId: string; runs: QuoteRun[] }>,
    designTaskRows: [] as unknown[],
  };
  const foreignItemIds = Array.from(
    new Set(params.orderQuoteItemIds.filter((id): id is string => isUuid(id) && !params.knownQuoteItemIds.has(id ?? "")))
  );
  if (foreignItemIds.length === 0) return empty;

  const { data, error } = await supabase.schema("tosho").from("quote_items").select("quote_id").in("id", foreignItemIds);
  if (error) throw error;
  const known = new Set(params.knownQuoteIds);
  const quoteIds = Array.from(
    new Set(((data ?? []) as Array<{ quote_id?: string | null }>).map((row) => row.quote_id ?? ""))
  ).filter((id) => id && !known.has(id));
  if (quoteIds.length === 0) return empty;

  const [quoteItems, runsByQuote, designTasks] = await Promise.all([
    listQuoteItemsForQuotes({ teamId: params.teamId, quoteIds }),
    listQuoteRunsForQuotes({ quoteIds }),
    supabase
      .from("activity_log")
      .select("entity_id,metadata")
      .eq("team_id", params.teamId)
      .eq("action", "design_task")
      .in("entity_id", quoteIds)
      .order("created_at", { ascending: false }),
  ]);
  if (designTasks.error) throw designTasks.error;
  return {
    quoteIds,
    quoteItems,
    quoteRuns: quoteIds.map((quoteId) => ({ quoteId, runs: runsByQuote.get(quoteId) ?? [] })),
    designTaskRows: (designTasks.data ?? []) as unknown[],
  };
}

/**
 * Замовлення, куди пішли позиції прорахунку, коли той не є його orders.quote_id —
 * тобто позиції доклали в замовлення з іншого прорахунку.
 */
export async function findOrderByQuoteItems(
  teamId: string,
  quoteId: string
): Promise<{ id: string; quote_number: string | null } | null> {
  const { data: quoteItems, error: quoteItemsError } = await supabase
    .schema("tosho")
    .from("quote_items")
    .select("id")
    .eq("quote_id", quoteId);
  if (quoteItemsError) throw quoteItemsError;
  const quoteItemIds = ((quoteItems ?? []) as Array<{ id: string }>).map((item) => item.id);
  if (quoteItemIds.length === 0) return null;
  const { data, error } = await supabase
    .schema("tosho")
    .from("order_items")
    .select("order:orders!inner(id, quote_number)")
    .eq("team_id", teamId)
    .in("quote_item_id", quoteItemIds)
    .limit(1);
  if (error) throw error;
  const row = ((data ?? []) as Array<{
    order?: { id: string; quote_number: string | null } | Array<{ id: string; quote_number: string | null }> | null;
  }>)[0];
  const order = Array.isArray(row?.order) ? row?.order[0] : row?.order;
  return order ?? null;
}

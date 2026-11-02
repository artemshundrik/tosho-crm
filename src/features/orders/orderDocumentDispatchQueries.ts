import type {
  DispatchChannel,
  DispatchDocument,
  DispatchEvent,
  OrderDocumentDispatch,
} from "./orderDocumentDispatch";
import { supabase } from "@/lib/supabaseClient";

export type { OrderDocumentDispatch };

/**
 * Журнал надсилань (REQ-343): таблиця tosho.order_document_dispatches,
 * scripts/order-document-dispatches.sql. Автора й час пише тригер; тексти його
 * помилок уже людські — показуємо як є.
 */
type DispatchRow = {
  id: string;
  order_id: string;
  document: DispatchDocument;
  event: DispatchEvent;
  channel: DispatchChannel | null;
  document_stamp: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

const COLUMNS = "id,order_id,document,event,channel,document_stamp,note,created_by,created_at";

const toDispatch = (row: DispatchRow): OrderDocumentDispatch => ({
  id: row.id,
  orderId: row.order_id,
  document: row.document,
  event: row.event,
  channel: row.channel,
  documentStamp: row.document_stamp,
  note: row.note,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

const MISSING_TABLE = /order_document_dispatches|does not exist|schema cache/i;

/**
 * Усі позначки команди одним читанням — їх одиниці на замовлення. Таблиці ще
 * немає (міграцію не застосовано) — порожньо: список замовлень не падає, а
 * документи виглядають ненадісланими, як і було до цього.
 */
export async function loadOrderDispatchesByOrderId(teamId: string): Promise<Map<string, OrderDocumentDispatch[]>> {
  const byOrderId = new Map<string, OrderDocumentDispatch[]>();
  const { data, error } = await supabase
    .schema("tosho")
    .from("order_document_dispatches")
    .select(COLUMNS)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  if (error) {
    if (MISSING_TABLE.test(error.message)) return byOrderId;
    throw new Error(error.message, { cause: error });
  }
  for (const row of (data as DispatchRow[] | null) ?? []) {
    const list = byOrderId.get(row.order_id) ?? [];
    list.push(toDispatch(row));
    byOrderId.set(row.order_id, list);
  }
  return byOrderId;
}

export async function recordOrderDispatches(params: {
  teamId: string;
  orderId: string;
  event: DispatchEvent;
  channel: DispatchChannel | null;
  documents: Array<{ document: DispatchDocument; stamp: string }>;
  note?: string | null;
}): Promise<OrderDocumentDispatch[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("order_document_dispatches")
    .insert(
      params.documents.map((item) => ({
        team_id: params.teamId,
        order_id: params.orderId,
        document: item.document,
        event: params.event,
        channel: params.channel,
        document_stamp: item.stamp,
        note: params.note?.trim() || null,
      }))
    )
    .select(COLUMNS);
  if (error) {
    if (MISSING_TABLE.test(error.message)) {
      throw new Error("Позначки надсилання ще не ввімкнено в базі — скажіть адміністратору.", { cause: error });
    }
    throw new Error(error.message || "Не вдалося зберегти позначку.", { cause: error });
  }
  return ((data as DispatchRow[] | null) ?? []).map(toDispatch);
}

/** Прибрати свої помилкові позначки (політика пускає лише автора). */
export async function deleteOrderDispatches(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .schema("tosho")
    .from("order_document_dispatches")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) throw new Error(error.message || "Не вдалося прибрати позначку.", { cause: error });
  return (data ?? []).length;
}

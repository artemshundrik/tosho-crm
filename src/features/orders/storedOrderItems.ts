import { supabase } from "@/lib/supabaseClient";

import { isMissingOrdersColumnMessage, isMissingOrdersRelationMessage } from "./ordersSchemaErrors";

export type StoredOrderItemRow = {
  id: string;
  order_id?: string | null;
  quote_item_id?: string | null;
  position?: number | null;
  name?: string | null;
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
  methods?: unknown[] | null;
  catalog_model_id?: string | null;
  image_url?: string | null;
  thumb_url?: string | null;
  item_kind?: string | null;
  document_name?: string | null;
  metadata?: unknown;
};

export async function listStoredOrderItems(teamId: string, orderIds: string[]): Promise<StoredOrderItemRow[]> {
  const uniqueOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueOrderIds.length === 0) return [];

  const baseColumns = "id,order_id,quote_item_id,position,name,qty,unit,unit_price,line_total";
  const previousColumns = `${baseColumns},description,methods,catalog_model_id,image_url,thumb_url,item_kind,document_name`;
  const extendedColumns = `${previousColumns},metadata`;
  const readRows = async (columns: string) =>
    await supabase
      .schema("tosho")
      .from("order_items")
      .select(columns)
      .eq("team_id", teamId)
      .in("order_id", uniqueOrderIds)
      .order("order_id", { ascending: true })
      .order("position", { ascending: true });

  let { data, error } = await readRows(extendedColumns);
  // Поки поля `metadata` немає в базі, позиції не мають втрачати фото й опис.
  if (error && isMissingOrdersColumnMessage(error.message)) {
    ({ data, error } = await readRows(previousColumns));
  }
  if (error && isMissingOrdersColumnMessage(error.message)) {
    ({ data, error } = await readRows(baseColumns));
  }
  if (error) {
    if (isMissingOrdersRelationMessage(error.message)) return [];
    throw error;
  }

  return ((data ?? []) as unknown) as StoredOrderItemRow[];
}

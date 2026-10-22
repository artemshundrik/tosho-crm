/**
 * Закупки замовлення («Економіка») — лише через RPC зі scripts/order-purchases.sql.
 * Права й перевірки живуть у базі; тут — виклики й мапінг snake → camel.
 * Суми, приховані від ролі без доступу до грошей, лишаються null.
 */
import type { OrderPurchase, PurchaseVatMode } from "./orderPurchases";
import { supabase } from "@/lib/supabaseClient";

export type SavePurchaseInput = {
  id: string | null;
  orderId: string;
  orderItemId: string | null;
  description: string;
  supplierName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  qty: number | null;
  unit: string | null;
  amount: number;
  vatMode: PurchaseVatMode;
};

export type PendingReceipts = {
  pending: Array<{
    purchaseId: string;
    orderId: string;
    orderNumber: string;
    description: string;
    supplierName: string;
    supplierInvoiceNumber: string | null;
    supplierInvoiceDate: string;
  }>;
  noneOrders: Array<{ orderId: string; orderNumber: string; markedAt: string; markedByName: string | null }>;
};

type Raw = Record<string, unknown>;

const toNum = (value: unknown): number | null => (value == null ? null : Number(value));
const toStr = (value: unknown): string | null => (value == null ? null : String(value));

/** Права (42501) і дані (22023) база пояснює сама — текст показуємо як є. */
const toPurchaseError = (error: unknown): Error => {
  const value = error as { code?: string; message?: string } | null;
  if (value && (value.code === "42501" || value.code === "22023") && value.message) {
    return new Error(value.message, { cause: error });
  }
  if (error instanceof Error && !("code" in error)) return error;
  return new Error("Не вдалося виконати дію із закупкою. Спробуйте ще раз.", { cause: error });
};

const mapPurchase = (row: Raw): OrderPurchase => {
  const vat = row.vat_mode;
  const kind = row.received_doc_kind;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    orderItemId: toStr(row.order_item_id),
    description: String(row.description ?? ""),
    supplierName: String(row.supplier_name ?? ""),
    supplierInvoiceNumber: toStr(row.supplier_invoice_number),
    supplierInvoiceDate: String(row.supplier_invoice_date ?? ""),
    qty: toNum(row.qty),
    unit: toStr(row.unit),
    amount: toNum(row.amount),
    vatMode: vat === "with_vat" || vat === "no_vat" ? vat : null,
    costWithVat: toNum(row.cost_with_vat),
    receivedOn: toStr(row.received_on),
    receivedQty: toNum(row.received_qty),
    receivedDocKind: kind === "waybill" || kind === "act" ? kind : null,
    receivedDocNumber: toStr(row.received_doc_number),
    receivedByName: toStr(row.received_by_name),
    expenseId: toStr(row.expense_id),
    paidOn: toStr(row.paid_on),
  };
};

export async function listOrderPurchases(orderId: string): Promise<OrderPurchase[]> {
  const { data, error } = await supabase.schema("tosho").rpc("list_order_purchases", { p_order_id: orderId });
  if (error) throw toPurchaseError(error);
  return ((data ?? []) as unknown as Raw[]).map(mapPurchase);
}

export async function saveOrderPurchase(input: SavePurchaseInput): Promise<string> {
  const { data, error } = await supabase.schema("tosho").rpc("save_order_purchase", {
    p_id: input.id,
    p_order_id: input.orderId,
    p_order_item_id: input.orderItemId,
    p_description: input.description,
    p_supplier_name: input.supplierName,
    p_invoice_number: input.invoiceNumber,
    p_invoice_date: input.invoiceDate,
    p_qty: input.qty,
    p_unit: input.unit,
    p_amount: input.amount,
    p_vat_mode: input.vatMode,
  });
  if (error) throw toPurchaseError(error);
  return String(data);
}

export async function deleteOrderPurchase(id: string): Promise<void> {
  const { error } = await supabase.schema("tosho").rpc("delete_order_purchase", { p_id: id });
  if (error) throw toPurchaseError(error);
}

export async function payOrderPurchase(input: {
  id: string;
  paidOn: string;
  accountId: string;
  amount: number;
}): Promise<string> {
  const { data, error } = await supabase.schema("tosho").rpc("pay_order_purchase", {
    p_id: input.id,
    p_paid_on: input.paidOn,
    p_account_id: input.accountId,
    p_amount: input.amount,
  });
  if (error) throw toPurchaseError(error);
  return String(data);
}

export async function cancelOrderPurchasePayment(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .rpc("cancel_order_purchase_payment", { p_id: id, p_reason: reason });
  if (error) throw toPurchaseError(error);
}

export async function confirmOrderPurchaseReceipt(input: {
  id: string;
  receivedOn: string;
  receivedQty: number;
  docKind: "waybill" | "act";
  docNumber: string;
}): Promise<void> {
  const { error } = await supabase.schema("tosho").rpc("confirm_order_purchase_receipt", {
    p_id: input.id,
    p_received_on: input.receivedOn,
    p_received_qty: input.receivedQty,
    p_doc_kind: input.docKind,
    p_doc_number: input.docNumber,
  });
  if (error) throw toPurchaseError(error);
}

export async function setOrderPurchasesNone(orderId: string, none: boolean): Promise<void> {
  const { error } = await supabase
    .schema("tosho")
    .rpc("set_order_purchases_none", { p_order_id: orderId, p_none: none });
  if (error) throw toPurchaseError(error);
}

export async function listPendingPurchaseReceipts(teamId: string): Promise<PendingReceipts> {
  const { data, error } = await supabase.schema("tosho").rpc("list_pending_purchase_receipts", { p_team_id: teamId });
  if (error) throw toPurchaseError(error);
  const raw = (data ?? {}) as { pending?: Raw[] | null; none_orders?: Raw[] | null };
  return {
    pending: (raw.pending ?? []).map((row) => ({
      purchaseId: String(row.purchase_id),
      orderId: String(row.order_id),
      orderNumber: String(row.order_number ?? ""),
      description: String(row.description ?? ""),
      supplierName: String(row.supplier_name ?? ""),
      supplierInvoiceNumber: toStr(row.supplier_invoice_number),
      supplierInvoiceDate: String(row.supplier_invoice_date ?? ""),
    })),
    noneOrders: (raw.none_orders ?? []).map((row) => ({
      orderId: String(row.order_id),
      orderNumber: String(row.order_number ?? ""),
      markedAt: String(row.marked_at ?? ""),
      markedByName: toStr(row.marked_by_name),
    })),
  };
}

/** Підказки назв постачальників; джерела необов'язкові — помилка джерела не кидається. */
export async function listSupplierNameHints(teamId: string): Promise<string[]> {
  const [purchases, expenses] = await Promise.all([
    supabase.schema("tosho").from("order_purchases").select("supplier_name").eq("team_id", teamId).limit(2000),
    supabase.schema("tosho").from("finance_expenses").select("supplier_name").eq("team_id", teamId).limit(2000),
  ]);
  const names = new Set<string>();
  for (const result of [purchases, expenses]) {
    if (result.error) continue;
    for (const row of (result.data ?? []) as Array<{ supplier_name: string | null }>) {
      const name = row.supplier_name?.trim();
      if (name) names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, "uk")).slice(0, 200);
}

/** Позначка «закупок немає» і хто її поставив; null — позначки немає. */
export async function getOrderPurchasesNone(orderId: string): Promise<{ byName: string | null } | null> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("orders")
    .select("purchases_none_at,purchases_none_by")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw toPurchaseError(error);
  if (!data?.purchases_none_at) return null;
  if (!data.purchases_none_by) return { byName: null };
  const profile = await supabase
    .schema("tosho")
    .from("team_member_profiles")
    .select("full_name")
    .eq("user_id", data.purchases_none_by)
    .limit(1)
    .maybeSingle();
  return { byName: profile.data?.full_name?.trim() || null };
}

/**
 * Оплати замовлення (REQ-322#p26) — лише через RPC зі scripts/order-payments.sql:
 * таблиця finance_payments менеджерам закрита, а запис має право лише
 * бухгалтерія й СЕО. Права й перерахунок статусу живуть у базі.
 */
import type { OrderPayment } from "./orderPayments";
import { supabase } from "@/lib/supabaseClient";

type PaymentSummary = { paymentStatus: string; paidTotal: number };

type SummaryRow = { payment_status?: string | null; paid_total?: number | string | null; payment_id?: string | null };

const toSummary = (data: unknown): PaymentSummary => {
  const row = (data ?? {}) as SummaryRow;
  return { paymentStatus: row.payment_status ?? "awaiting_payment", paidTotal: Number(row.paid_total ?? 0) };
};

/** Права (42501) і дані (22023) база пояснює сама — текст показуємо як є. */
export const toOrderPaymentError = (error: unknown): Error => {
  const value = error as { code?: string; message?: string } | null;
  if (value && (value.code === "42501" || value.code === "22023") && value.message) {
    return new Error(value.message, { cause: error });
  }
  if (error instanceof Error && !("code" in error)) return error;
  return new Error("Не вдалося зберегти оплату. Спробуйте ще раз.", { cause: error });
};

export async function listOrderPayments(orderId: string): Promise<OrderPayment[]> {
  const { data, error } = await supabase.schema("tosho").rpc("list_order_payments", { p_order_id: orderId });
  if (error) throw toOrderPaymentError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    amount: Number(row.amount) || 0,
    paidAt: row.paid_at,
    kind: row.kind === "balance" ? "balance" : "prepayment",
    createdAt: row.created_at,
    enteredBy: row.entered_by,
    enteredByName: row.entered_by_name,
    accountName: row.account_name,
    bankTxnRef: row.bank_txn_ref,
    notes: row.notes,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
  }));
}

export async function recordOrderPayment(input: {
  orderId: string;
  amount: number;
  paidAt: string;
  accountId: string;
  bankTxnRef?: string | null;
  notes?: string | null;
}): Promise<PaymentSummary & { paymentId: string }> {
  const { data, error } = await supabase.schema("tosho").rpc("record_order_payment", {
    p_order_id: input.orderId,
    p_amount: input.amount,
    p_paid_at: input.paidAt,
    p_account_id: input.accountId,
    p_bank_txn_ref: input.bankTxnRef ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw toOrderPaymentError(error);
  return { ...toSummary(data), paymentId: String((data as SummaryRow | null)?.payment_id ?? "") };
}

export async function cancelOrderPayment(paymentId: string, reason: string): Promise<PaymentSummary> {
  const { data, error } = await supabase
    .schema("tosho")
    .rpc("cancel_order_payment", { p_payment_id: paymentId, p_reason: reason });
  if (error) throw toOrderPaymentError(error);
  return toSummary(data);
}

export async function undoOrderPayment(paymentId: string): Promise<PaymentSummary> {
  const { data, error } = await supabase.schema("tosho").rpc("undo_order_payment", { p_payment_id: paymentId });
  if (error) throw toOrderPaymentError(error);
  return toSummary(data);
}

/**
 * Рахунки, куди могли прийти гроші: гривневі, активні, цієї юрособи або
 * спільні. За замовчуванням — рахунок, запланований у Фінансах для замовлення,
 * інакше перший. Читати finance_accounts можуть ті самі, хто вносить оплату.
 */
export async function listOrderPaymentAccounts(
  teamId: string,
  legalEntityId: string | null,
  quoteId: string | null,
  /** Безготівкове замовлення — спершу банківські рахунки, готівкове — каса. */
  prefer: "bank" | "cash" = "bank"
): Promise<{ accounts: Array<{ id: string; name: string }>; defaultId: string | null }> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("finance_accounts")
    .select("id,name,kind,legal_entity_id,currency,is_active,sort_order")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .eq("currency", "UAH")
    .order("sort_order")
    .order("name");
  if (error) throw toOrderPaymentError(error);
  const accounts = (data ?? [])
    .filter((row) => !legalEntityId || !row.legal_entity_id || row.legal_entity_id === legalEntityId)
    // Стабільне сортування: свій вид рахунку вгору, решта в порядку Фінансів.
    .sort((a, b) => Number(b.kind === prefer) - Number(a.kind === prefer))
    .map((row) => ({ id: row.id, name: row.name }));

  let intended: string | null = null;
  if (quoteId) {
    const meta = await supabase
      .schema("tosho")
      .from("finance_order_meta")
      .select("intended_account_id")
      .eq("team_id", teamId)
      .eq("quote_id", quoteId)
      .maybeSingle();
    intended = meta.data?.intended_account_id ?? null;
  }
  const defaultId = accounts.find((account) => account.id === intended)?.id ?? accounts[0]?.id ?? null;
  return { accounts, defaultId };
}

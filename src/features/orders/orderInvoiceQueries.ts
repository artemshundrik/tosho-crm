import type { DerivedOrderRecord } from "./orderRecords";
import { supabase } from "@/lib/supabaseClient";

/**
 * Запити рахунку через бухгалтерію (REQ-322#p10). Окремо від orderInvoice.ts,
 * щоб чисту логіку можна було тестувати без клієнта Supabase.
 */
export type OrderInvoicePatch = Pick<
  DerivedOrderRecord,
  | "invoiceNumber"
  | "invoiceCreatedAt"
  | "invoiceDate"
  | "invoiceRequestedAt"
  | "invoiceRequestedBy"
  | "invoiceReturnedAt"
  | "invoiceReturnNote"
>;

type InvoiceRow = {
  invoice_number: string | null;
  invoice_created_at: string | null;
  invoice_date: string | null;
  invoice_requested_at: string | null;
  invoice_requested_by: string | null;
  invoice_returned_at: string | null;
  invoice_return_note: string | null;
};

const INVOICE_COLUMNS =
  "invoice_number,invoice_created_at,invoice_date,invoice_requested_at,invoice_requested_by,invoice_returned_at,invoice_return_note";

const toPatch = (row: InvoiceRow): OrderInvoicePatch => ({
  invoiceNumber: row.invoice_number?.trim() || null,
  invoiceCreatedAt: row.invoice_created_at,
  invoiceDate: row.invoice_date,
  invoiceRequestedAt: row.invoice_requested_at,
  invoiceRequestedBy: row.invoice_requested_by,
  invoiceReturnedAt: row.invoice_returned_at,
  invoiceReturnNote: row.invoice_return_note?.trim() || null,
});

/** Помилки тригера вже написані людською мовою — їх показуємо як є. */
const toInvoiceError = (error: { code?: string; message: string }, number?: string) => {
  if (error.code === "23505") {
    return new Error(`Рахунок № ${number ?? ""} за цей рік уже є на іншому замовленні — перевірте номер у BAS.`, {
      cause: error,
    });
  }
  return new Error(error.message || "Не вдалося зберегти рахунок.", { cause: error });
};

async function updateInvoice(
  params: { teamId: string; orderId: string; number?: string },
  values: Record<string, string | null>
): Promise<OrderInvoicePatch> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("orders")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("team_id", params.teamId)
    .eq("id", params.orderId)
    .select(INVOICE_COLUMNS)
    .single<InvoiceRow>();
  if (error) throw toInvoiceError(error, params.number);
  return toPatch(data);
}

/** Час і автора запиту ставить тригер — значення тут лише позначає намір. */
export const requestOrderInvoice = (params: { teamId: string; orderId: string }) =>
  updateInvoice(params, { invoice_requested_at: new Date().toISOString() });

/** «№ 407» і «407» — той самий номер: знак і пробіли прибираємо, інакше унікальність їх не зловить. */
const normalizeInvoiceNumber = (value: string) => value.replace(/№/g, "").replace(/\s+/g, "").trim();

export const issueOrderInvoice = (params: { teamId: string; orderId: string; number: string; date: string }) =>
  updateInvoice({ ...params, number: normalizeInvoiceNumber(params.number) }, {
    invoice_number: normalizeInvoiceNumber(params.number),
    invoice_date: params.date,
  });

export const returnOrderInvoiceRequest = (params: { teamId: string; orderId: string; note: string }) =>
  updateInvoice(params, { invoice_return_note: params.note.trim() });

export type InvoiceCorrectionResult = {
  totalBefore: number;
  totalAfter: number;
  numberBefore: string | null;
  numberAfter: string;
};

/**
 * Виправлення виписаного рахунку (REQ-335): ціна й кількість позицій, номер і
 * дата з BAS — однією транзакцією в tosho.correct_order_invoice. Права й межі
 * (підписана СП, оплата) стереже функція, тут лише виклик.
 */
export async function correctOrderInvoice(params: {
  orderId: string;
  items: Array<{ id: string; qty: number; unitPrice: number }>;
  number: string;
  date: string;
}): Promise<InvoiceCorrectionResult> {
  const number = normalizeInvoiceNumber(params.number);
  const { data, error } = await supabase.schema("tosho").rpc("correct_order_invoice", {
    p_order_id: params.orderId,
    p_items: params.items.map((item) => ({ id: item.id, qty: item.qty, unit_price: item.unitPrice })),
    p_invoice_number: number,
    p_invoice_date: params.date,
  });
  if (error) throw toInvoiceError(error, number);
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    totalBefore: Number(row.total_before) || 0,
    totalAfter: Number(row.total_after) || 0,
    numberBefore: typeof row.number_before === "string" ? row.number_before : null,
    numberAfter: typeof row.number_after === "string" ? row.number_after : number,
  };
}

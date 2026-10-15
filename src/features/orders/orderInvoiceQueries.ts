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

export const issueOrderInvoice = (params: { teamId: string; orderId: string; number: string; date: string }) =>
  updateInvoice({ ...params, number: params.number.trim() }, {
    invoice_number: params.number.trim(),
    invoice_date: params.date,
  });

export const returnOrderInvoiceRequest = (params: { teamId: string; orderId: string; note: string }) =>
  updateInvoice(params, { invoice_return_note: params.note.trim() });

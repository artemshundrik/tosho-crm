import { supabase } from "@/lib/supabaseClient";
import type { TableUpdate } from "@/lib/dbTables";

/**
 * Запис одного поля картки замовника чи ліда.
 *
 * ЛИШЕ ЗМІНЕНА КОЛОНКА. Панель пише поле одразу, а не всю картку: якщо колега
 * тим часом змінив нотатки на сторінці, `update` усієї картки мовчки повернув
 * би старі. Тому тип патча обмежений «дешевими» полями, що лежать окремими
 * колонками; реквізити, контакти й доставка — jsonb-масиви, і їх редагує
 * сторінка під замком.
 *
 * `.select("id")` обовʼязковий: без нього RLS, що не пустив рядок, відповідає
 * успіхом без жодного запису (див. памʼять «update без .select() мовчить»).
 *
 * Порожній рядок → `null` перетворює МІСЦЕ ВИКЛИКУ: тут патч іде як є.
 */

export type CustomerFieldPatch = Partial<
  Pick<
    TableUpdate<"customers">,
    | "payment_type"
    | "accountant_name"
    | "accountant_email"
    | "accountant_edrpou"
    | "notes"
    | "reminder_at"
    | "reminder_comment"
  >
>;

/** Розділи, які сторінка замовника править формою з «Зберегти». */
export type CustomerSection = "requisites" | "contacts" | "delivery";

/** Колонки розділу — див. `customerSectionColumns` у partyCardSave.ts. */
export type CustomerSectionPatch = Partial<
  Pick<
    TableUpdate<"customers">,
    | "legal_entities"
    | "legal_name"
    | "ownership_type"
    | "vat_rate"
    | "tax_id"
    | "iban"
    | "signatory_name"
    | "signatory_position"
    | "contacts"
    | "contact_name"
    | "contact_position"
    | "contact_phone"
    | "contact_email"
    | "contact_birthday"
    | "delivery_points"
  >
>;

export type LeadFieldPatch = Partial<
  Pick<TableUpdate<"leads">, "payment_type" | "notes" | "reminder_at" | "reminder_comment">
>;

export type FieldWriteResult = { ok: true } | { ok: false; reason: "gone" | "network"; message: string };

const NETWORK_MESSAGE = "Не зберіглось: немає звʼязку. Те, що ви ввели, не пропало.";
const looksLikeNetwork = (message: string) => /fetch|network|timeout|abort|load failed/i.test(message);

const toResult = (
  response: { data: unknown; error: { message?: string } | null },
  goneMessage: string,
): FieldWriteResult => {
  if (response.error) {
    const raw = response.error.message ?? "";
    return {
      ok: false,
      reason: "network",
      message: !raw || looksLikeNetwork(raw) ? NETWORK_MESSAGE : `Не зберіглось: ${raw}. Те, що ви ввели, не пропало.`,
    };
  }
  if (!Array.isArray(response.data) || response.data.length === 0) {
    return { ok: false, reason: "gone", message: goneMessage };
  }
  return { ok: true };
};

const caught = (error: unknown): FieldWriteResult => ({
  ok: false,
  reason: "network",
  message: error instanceof Error && !looksLikeNetwork(error.message)
    ? `Не зберіглось: ${error.message}. Те, що ви ввели, не пропало.`
    : NETWORK_MESSAGE,
});

export async function writeCustomerFields(customerId: string, patch: CustomerFieldPatch): Promise<FieldWriteResult> {
  try {
    const response = await supabase.schema("tosho").from("customers").update(patch).eq("id", customerId).select("id");
    return toResult(response, "Замовника вже немає або він вам недоступний");
  } catch (error) {
    return caught(error);
  }
}

/** Запис розділу сторінки замовника — тими самими правилами, що й поле панелі. */
export async function writeCustomerSection(customerId: string, patch: CustomerSectionPatch): Promise<FieldWriteResult> {
  try {
    const response = await supabase.schema("tosho").from("customers").update(patch).eq("id", customerId).select("id");
    return toResult(response, "Замовника вже немає або він вам недоступний");
  } catch (error) {
    return caught(error);
  }
}

export async function writeLeadFields(leadId: string, patch: LeadFieldPatch): Promise<FieldWriteResult> {
  try {
    const response = await supabase.schema("tosho").from("leads").update(patch).eq("id", leadId).select("id");
    return toResult(response, "Ліда вже немає або він вам недоступний");
  } catch (error) {
    return caught(error);
  }
}

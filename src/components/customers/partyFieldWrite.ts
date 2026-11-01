import { supabase } from "@/lib/supabaseClient";
import type { TableUpdate } from "@/lib/dbTables";
import { isMissingReferredByColumn } from "./leadEntryHints";

/**
 * Запис одного поля картки замовника чи ліда.
 *
 * ЛИШЕ ЗМІНЕНА КОЛОНКА. Панель пише поле одразу, а не всю картку: якщо колега
 * тим часом змінив нотатки на сторінці, `update` усієї картки мовчки повернув
 * би старі. Тому тип патча обмежений «дешевими» полями, що лежать окремими
 * колонками (і назва, менеджер, джерело, сайт, лого з шапки картки);
 * реквізити, контакти й доставка — jsonb-масиви, їх пише `writeCustomerSection`.
 *
 * `.select("id")` обовʼязковий: без нього RLS, що не пустив рядок, відповідає
 * успіхом без жодного запису (див. памʼять «update без .select() мовчить»).
 *
 * Порожній рядок → `null` перетворює МІСЦЕ ВИКЛИКУ: тут патч іде як є.
 */

export type CustomerFieldPatch = Partial<
  Pick<
    TableUpdate<"customers">,
    | "name"
    | "manager"
    | "manager_user_id"
    | "source"
    | "website"
    | "logo_url"
    | "payment_type"
    | "accountant_name"
    | "accountant_email"
    | "accountant_edrpou"
    | "notes"
    | "reminder_at"
    | "reminder_comment"
  >
> & {
  /** Колонку додає scripts/party-referred-by.sql; до нього запис поверне помилку колонки. */
  referred_by?: string | null;
};

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

/**
 * Лід тримає реквізити окремими колонками, а не jsonb-масивом, тож бракуюче
 * для рахунку панель пише по одному полю, як і оплату.
 */
export type LeadFieldPatch = Partial<
  Pick<
    TableUpdate<"leads">,
    | "payment_type"
    | "notes"
    | "reminder_at"
    | "reminder_comment"
    | "ownership_type"
    | "tax_id"
    | "legal_address"
    | "iban"
    | "signatory_position"
    | "email"
    | "phone_numbers"
  >
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
    const response = await supabase.schema("tosho").from("customers").update(patch as never).eq("id", customerId).select("id");
    if (response.error && "referred_by" in patch && isMissingReferredByColumn(response.error)) {
      return { ok: false, reason: "network", message: "Не зберіглось: поле «Хто порекомендував» запрацює після оновлення бази." };
    }
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

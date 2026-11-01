import { supabase } from "@/lib/supabaseClient";
import type { CustomerContact, CustomerFormState } from "./CustomerDialog";
import { createEmptyCustomerLegalEntity, parseCustomerLegalEntities } from "@/lib/customerLegalEntities";
import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import { getLocalReminderDateInputValue, getLocalReminderTimeInputValue } from "@/lib/reminderDateTime";
import { parseCustomerDeliveryPoints } from "@/lib/customerDeliveryPoints";
import { isMissingReferredByColumn } from "./leadEntryHints";

/**
 * Один замовник з бази у формі картки. Спільне для бічної панелі й повної
 * сторінки замовника: рядок
 * читається однаково, тож «чого бракує» в панелі й на сторінці рахується з
 * тієї самої форми.
 */

export type CustomerRecord = {
  id: string;
  team_id?: string | null;
  name?: string | null;
  payment_type?: string | null;
  source?: string | null;
  referred_by?: string | null;
  legal_name?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  ownership_type?: string | null;
  vat_rate?: number | null;
  tax_id?: string | null;
  website?: string | null;
  iban?: string | null;
  logo_url?: string | null;
  legal_entities?: unknown;
  contact_name?: string | null;
  contact_position?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_birthday?: string | null;
  contacts?: CustomerContact[] | null;
  signatory_name?: string | null;
  signatory_position?: string | null;
  accountant_name?: string | null;
  accountant_email?: string | null;
  accountant_edrpou?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
  event_name?: string | null;
  event_at?: string | null;
  event_comment?: string | null;
  notes?: string | null;
  delivery_points?: unknown;
  dropbox_client_path?: string | null;
  dropbox_shared_url?: string | null;
  created_at?: string | null;
};

export const CUSTOMER_COLUMNS = [
  "id",
  "team_id",
  "name",
  "payment_type",
  "source",
  "legal_name",
  "manager",
  "manager_user_id",
  "ownership_type",
  "vat_rate",
  "tax_id",
  "website",
  "iban",
  "logo_url",
  "legal_entities",
  "contact_name",
  "contact_position",
  "contact_phone",
  "contact_email",
  "contact_birthday",
  "contacts",
  "signatory_name",
  "signatory_position",
  "accountant_name",
  "accountant_email",
  "accountant_edrpou",
  "reminder_at",
  "reminder_comment",
  "event_name",
  "event_at",
  "event_comment",
  "notes",
  "delivery_points",
  "dropbox_client_path",
  "dropbox_shared_url",
  "created_at",
].join(",");

const EMPTY_CONTACT: CustomerContact = {
  name: "",
  position: "",
  phone: "",
  email: "",
  birthday: "",
  telegram: "",
};

export const buildEmptyForm = (): CustomerFormState => ({
  name: "",
  paymentType: "invoice",
  source: "",
  manager: "",
  managerId: "",
  website: "",
  logoUrl: "",
  logoFile: null,
  logoUploadMode: "url",
  legalEntities: [createEmptyCustomerLegalEntity()],
  contacts: [{ ...EMPTY_CONTACT }],
  deliveryPoints: [],
  reminderDate: "",
  reminderTime: "",
  reminderComment: "",
  eventName: "",
  eventDate: "",
  eventComment: "",
  notes: "",
  accountantName: "",
  accountantEmail: "",
  accountantEdrpou: "",
});

export const parseContactsFromRow = (row: CustomerRecord): CustomerContact[] => {
  const raw = Array.isArray(row.contacts) ? row.contacts : [];
  const normalized = raw
    .map((entry) => {
      const contact = typeof entry === "object" && entry ? (entry as Partial<CustomerContact>) : null;
      return {
        name: contact?.name?.trim() ?? "",
        position: contact?.position?.trim() ?? "",
        phone: contact?.phone?.trim() ?? "",
        email: contact?.email?.trim() ?? "",
        birthday: contact?.birthday?.trim() ?? "",
        telegram: contact?.telegram?.trim() ?? "",
      };
    })
    .filter((contact) => Object.values(contact).some(Boolean));
  if (normalized.length > 0) return normalized;
  const legacy = {
    name: row.contact_name?.trim() ?? "",
    position: row.contact_position?.trim() ?? "",
    phone: row.contact_phone?.trim() ?? "",
    email: row.contact_email?.trim() ?? "",
    birthday: row.contact_birthday?.trim() ?? "",
    telegram: "",
  };
  return Object.values(legacy).some(Boolean) ? [legacy] : [{ ...EMPTY_CONTACT }];
};

const selectCustomerRow = (teamId: string, customerId: string, columns: string) =>
  supabase
    .schema("tosho")
    .from("customers")
    .select(columns)
    .eq("team_id", teamId)
    .eq("id", customerId)
    .maybeSingle<CustomerRecord>();

/**
 * `referred_by` додає scripts/party-referred-by.sql. Поки його не застосовано,
 * читаємо без колонки — картка відкривається, лише без «хто порекомендував».
 */
export const loadCustomerRow = async (teamId: string, customerId: string) => {
  const full = await selectCustomerRow(teamId, customerId, `${CUSTOMER_COLUMNS},referred_by`);
  if (!full.error || !isMissingReferredByColumn(full.error)) return full;
  return selectCustomerRow(teamId, customerId, CUSTOMER_COLUMNS);
};

export const customerRowToForm = (data: CustomerRecord, managerLabel: string): CustomerFormState => ({
  name: data.name ?? "",
  paymentType: data.payment_type === "cash" ? "cash" : "invoice",
  source: data.source ?? "",
  referredBy: data.referred_by ?? "",
  manager: managerLabel,
  managerId: data.manager_user_id ?? "",
  website: data.website ?? "",
  logoUrl: normalizeCustomerLogoUrl(data.logo_url) ?? "",
  logoFile: null,
  logoUploadMode: "url",
  legalEntities: parseCustomerLegalEntities(data),
  contacts: parseContactsFromRow(data),
  deliveryPoints: parseCustomerDeliveryPoints(data.delivery_points),
  reminderDate: getLocalReminderDateInputValue(data.reminder_at),
  reminderTime: getLocalReminderTimeInputValue(data.reminder_at),
  reminderComment: data.reminder_comment ?? "",
  eventName: data.event_name ?? "",
  eventDate: data.event_at ? data.event_at.slice(0, 10) : "",
  eventComment: data.event_comment ?? "",
  notes: data.notes ?? "",
  accountantName: data.accountant_name ?? "",
  accountantEmail: data.accountant_email ?? "",
  accountantEdrpou: data.accountant_edrpou ?? "",
});

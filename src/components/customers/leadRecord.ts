import type { LeadFormState } from "./LeadDialog";

/**
 * Рядок ліда, перелік колонок під нього й вимоги до переведення в замовника.
 *
 * ЧОМУ ОКРЕМО ВІД СТОРІНКИ. OrdersCustomersPage під наглядом ратчета розміру
 * (scripts/check-file-growth.mjs), і саме такий код у ній жити не мусить:
 * перелік колонок і чисті функції нікуди, крім себе, не дивляться. Разом вони
 * забирають зі сторінки близько вісімдесяти рядків, а вимоги до переведення
 * нарешті можна прочитати, не гортаючи чотири тисячі.
 */

export type LeadRow = {
  id: string;
  team_id?: string | null;
  company_name?: string | null;
  payment_type?: string | null;
  legal_name?: string | null;
  ownership_type?: string | null;
  tax_id?: string | null;
  legal_address?: string | null;
  logo_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_numbers?: string[] | null;
  telegram?: string | null;
  source?: string | null;
  website?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  iban?: string | null;
  signatory_name?: string | null;
  signatory_position?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
  event_name?: string | null;
  event_at?: string | null;
  event_comment?: string | null;
  notes?: string | null;
  delivery_points?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};


const LEAD_COLUMNS = [
  "id",
  "team_id",
  "company_name",
  "payment_type",
  "legal_name",
  "ownership_type",
  "tax_id",
  "legal_address",
  "logo_url",
  "first_name",
  "last_name",
  "email",
  "phone_numbers",
  "telegram",
  "source",
  "website",
  "manager",
  "manager_user_id",
  "iban",
  "signatory_name",
  "signatory_position",
  "reminder_at",
  "reminder_comment",
  "event_name",
  "event_at",
  "event_comment",
  "notes",
  "delivery_points",
  "created_at",
  "updated_at",
].join(",");
const LEAD_COLUMNS_WITHOUT_REQUISITES = LEAD_COLUMNS.replace("tax_id,", "").replace("legal_address,", "");
const LEAD_COLUMNS_LEGACY = LEAD_COLUMNS_WITHOUT_REQUISITES.replace("ownership_type,", "");
export type LeadColumnsVariant = "full" | "no_requisites" | "no_ownership";
export const getLeadColumns = (variant: LeadColumnsVariant) => {
  if (variant === "no_ownership") return LEAD_COLUMNS_LEGACY;
  if (variant === "no_requisites") return LEAD_COLUMNS_WITHOUT_REQUISITES;
  return LEAD_COLUMNS;
};
export const getFallbackLeadColumnsVariant = (variant: LeadColumnsVariant, message: string): LeadColumnsVariant | null => {
  if (!/column/i.test(message)) return null;
  if (variant === "full" && (/tax_id/i.test(message) || /legal_address/i.test(message))) return "no_requisites";
  if ((variant === "full" || variant === "no_requisites") && /ownership_type/i.test(message)) return "no_ownership";
  return null;
};

/**
 * Чого бракує, щоб лід став замовником. Телефон тут лишається ОБОВʼЯЗКОВИМ і
 * після REQ-298: послаблення «телефон або Telegram» стосується самого ліда, а
 * замовнику номер потрібен на договір, документи й доставку.
 */
export const getLeadConversionMissingFields = (form: LeadFormState, phones: string[]) => {
  const missing: string[] = [];
  if (!form.ownershipType.trim()) missing.push("форма власності");
  if (!form.taxId.trim()) missing.push(form.ownershipType === "fop" ? "ІПН" : "ЄДРПОУ / ІПН");
  if (!form.legalAddress.trim()) missing.push(form.ownershipType === "fop" ? "прописка" : "юридична адреса");
  if (!form.iban.trim()) missing.push("IBAN");
  if (!form.signatoryPosition.trim()) missing.push("посада підписанта");
  if (!phones.length) missing.push("телефон");
  if (!form.email.trim()) missing.push("email");
  return missing;
};

import type { LeadFormState } from "./partyFormTypes";

/**
 * Підказки на вході нового ліда: що вписали не в те поле. Лише підказують —
 * збереження не блокують, бо «тг masseeds» у пошті краще, ніж лід без
 * контакту взагалі.
 */
export type LeadEntryHint =
  | { field: "email"; kind: "not_email" }
  | { field: "referredBy"; kind: "referral_without_name" };

export const LEAD_ENTRY_HINT_TEXT: Record<LeadEntryHint["kind"], string> = {
  not_email: "Це не схоже на пошту",
  referral_without_name: "Від кого рекомендація?",
};

const TELEGRAM_LINK = /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{3,})\/?$/i;
const TELEGRAM_NICK = /^@([A-Za-z0-9_]{3,})$/;

/** «@masseeds», «t.me/masseeds» → «@masseeds»; номер чи інше → null. */
export function telegramFromPhoneField(value: string): string | null {
  const trimmed = value.trim();
  const match = TELEGRAM_NICK.exec(trimmed) ?? TELEGRAM_LINK.exec(trimmed);
  return match ? `@${match[1]}` : null;
}

export function getLeadEntryHints(form: LeadFormState): LeadEntryHint[] {
  const hints: LeadEntryHint[] = [];
  const email = form.email.trim();
  if (email && !email.includes("@")) hints.push({ field: "email", kind: "not_email" });
  if (form.source === "Рекомендація" && !form.referredBy?.trim()) hints.push({ field: "referredBy", kind: "referral_without_name" });
  return hints;
}

/**
 * Колонку `referred_by` додає scripts/party-referred-by.sql. Поки його не
 * застосовано, запис іде запасним payload без неї — тут її впізнаємо.
 */
export function isMissingReferredByColumn(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message ?? "";
  return /referred_by/i.test(message) && /column/i.test(message);
}

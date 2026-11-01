import type { LeadFormState } from "./LeadDialog";

/**
 * Підказки на вході нового ліда: що вписали не в те поле. Лише підказують —
 * збереження не блокують, бо «тг masseeds» у пошті краще, ніж лід без
 * контакту взагалі.
 */
export type LeadEntryHint =
  | { field: "phone"; kind: "telegram_in_phone"; telegram: string }
  | { field: "email"; kind: "not_email" }
  | { field: "referredBy"; kind: "referral_without_name" };

export const LEAD_ENTRY_HINT_TEXT: Record<LeadEntryHint["kind"], string> = {
  telegram_in_phone: "Схоже на Telegram — перенести в поле Telegram?",
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
  const telegram = form.phones.map(telegramFromPhoneField).find(Boolean);
  if (telegram) hints.push({ field: "phone", kind: "telegram_in_phone", telegram });
  const email = form.email.trim();
  if (email && !email.includes("@")) hints.push({ field: "email", kind: "not_email" });
  if (form.source === "Рекомендація" && !form.referredBy?.trim()) hints.push({ field: "referredBy", kind: "referral_without_name" });
  return hints;
}

/** Переносить нік із поля телефону в Telegram; телефонне поле лишається порожнім. */
export function moveTelegramFromPhones(form: LeadFormState): LeadFormState {
  const index = form.phones.findIndex((phone) => telegramFromPhoneField(phone));
  if (index < 0) return form;
  const telegram = telegramFromPhoneField(form.phones[index])!;
  const phones = form.phones.filter((_, i) => i !== index);
  return { ...form, telegram: form.telegram.trim() || telegram, phones: phones.length ? phones : [""] };
}

/**
 * Колонку `referred_by` додає scripts/party-referred-by.sql. Поки його не
 * застосовано, запис іде запасним payload без неї — тут її впізнаємо.
 */
export function isMissingReferredByColumn(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message ?? "";
  return /referred_by/i.test(message) && /column/i.test(message);
}

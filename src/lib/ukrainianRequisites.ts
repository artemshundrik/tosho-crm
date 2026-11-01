/**
 * Формати українських реквізитів і банк з IBAN.
 *
 * ЄДРПОУ юрособи — 8 цифр, ІПН ФОП — 10, ІПН платника ПДВ — 12, IBAN — UA і
 * 27 цифр. Цифри 5–10 IBAN — МФО банку, з нього підставляється назва банку.
 *
 * Перевірки лише ПІДКАЗУЮТЬ: порожнє поле — не помилка формату (чого бракує,
 * рахує partyReadiness), а помилка формату не стирає введеного.
 *
 * Читачі: IbanInput, редактор реквізитів на сторінці замовника, форма
 * переведення ліда.
 */

/**
 * Банки за МФО — зібрано з реквізитів замовників 01.11.2026 (тільки ті МФО,
 * для яких у картках вписано назву банку). З памʼяті сюди нічого не дописуємо:
 * невідомий МФО віддає `bankName: null`, і інтерфейс банк просто не підставляє.
 * Назва ПриватБанку в картках записана двома написаннями — тут канонічне.
 */
const BANKS_BY_MFO: Record<string, string> = {
  "305299": "АТ КБ «ПриватБанк»",
  "300335": "АТ «Райффайзен Банк Аваль»",
  "300465": "АТ «Ощадбанк»",
};

const UA_IBAN = /^UA\d{27}$/;
const digits = (raw: string) => (raw ?? "").replace(/\D+/g, "");

export function normalizeIban(raw: string): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}

export function ibanIssue(raw: string): string | null {
  const iban = normalizeIban(raw);
  if (!iban) return null;
  return UA_IBAN.test(iban) ? null : "IBAN — це UA і 27 цифр";
}

export function bankFromIban(raw: string): { mfo: string; bankName: string | null } | null {
  const iban = normalizeIban(raw);
  if (!UA_IBAN.test(iban)) return null;
  const mfo = iban.slice(4, 10);
  return { mfo, bankName: BANKS_BY_MFO[mfo] ?? null };
}

export function taxIdIssue(raw: string, ownershipType: string): string | null {
  const value = digits(raw);
  if (!value) return null;
  if (ownershipType === "fop") return value.length === 10 ? null : "ІПН ФОП — 10 цифр";
  return value.length === 8 ? null : "ЄДРПОУ — 8 цифр";
}

export function vatIdIssue(raw: string): string | null {
  const value = digits(raw);
  if (!value) return null;
  return value.length === 12 ? null : "ІПН платника ПДВ — 12 цифр";
}

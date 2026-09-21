import { formatTelegramHandle, normalizeTelegramUsername } from "@/lib/telegramContact";

/**
 * Чим можна набрати ліда — телефон АБО Telegram (REQ-298).
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ, А НЕ ПЕРЕВІРКА НА МІСЦІ. Правило читають троє: форма
 * ліда (там від нього горить зірочка), швидке створення з прорахунку й
 * сторінка «Замовники». Три копії однієї умови розійшлись би так само, як це
 * вже було з формою замовника: інтерфейс показує одне, а збереження відмовляє
 * через інше (див. validateCustomerForm у customerValidation.ts).
 *
 * ЧОМУ САМЕ «АБО». Лід часто приходить ніком маркетолога в Telegram, а єдиний
 * номер на сайті — загальний і нічого не дає. Вимога «мусить бути номер» у
 * ЗАМОВНИКА лишається недоторканою: там договір, документи й доставка.
 */

export type LeadContactInput = {
  phones: string[];
  telegram: string;
};

/** Номери без порожніх рядків — форма завжди тримає щонайменше один порожній. */
export function cleanLeadPhones(phones: ReadonlyArray<string | null | undefined>): string[] {
  return phones.map((phone) => (phone ?? "").trim()).filter(Boolean);
}

export function hasLeadContact({ phones, telegram }: LeadContactInput): boolean {
  return cleanLeadPhones(phones).length > 0 || Boolean(normalizeTelegramUsername(telegram));
}

/** Текст помилки для збереження; `null` означає «можна писати». */
export function getLeadContactIssue(input: LeadContactInput): string | null {
  if (hasLeadContact(input)) return null;
  return "Вкажіть номер телефону або Telegram — інакше з лідом не звʼязатись.";
}

/**
 * Чим набрати ліда в списку: номер, а коли номера немає — нік. «Не вказано» в
 * колонці телефону на телеграмному ліді було б неправдою — звʼязок у нього є.
 * Нік іде з «@», тож із номером не плутається.
 */
export function leadContactLabel(lead: {
  phone_numbers?: string[] | null;
  telegram?: string | null;
}): string {
  const phones = cleanLeadPhones(lead.phone_numbers ?? []);
  if (phones.length > 0) return phones.join(", ");
  return formatTelegramHandle(lead.telegram) || "Не вказано";
}

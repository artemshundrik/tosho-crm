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

export type LeadContactDraft = {
  firstName: string;
  lastName: string;
  phones: string[];
  telegram: string;
  email: string;
};

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

/**
 * Що записати з редактора контакту в панелі: лише змінене. Ім'я порожнім не
 * пишемо, і телефон із Telegram не пишемо, якщо не лишається жодного способу
 * звʼязку: за тими самими правилами перевіряє `validateLeadCard`.
 */
export function leadContactChanges(saved: LeadContactDraft, draft: LeadContactDraft) {
  const patch: {
    first_name?: string;
    last_name?: string | null;
    email?: string | null;
    phone_numbers?: string[];
    telegram?: string | null;
  } = {};
  const changed = (key: "firstName" | "lastName" | "email") => draft[key].trim() !== saved[key].trim();
  if (changed("firstName") && draft.firstName.trim()) patch.first_name = draft.firstName.trim();
  if (changed("lastName")) patch.last_name = draft.lastName.trim() || null;
  if (changed("email")) patch.email = draft.email.trim() || null;

  const issue = getLeadContactIssue(draft);
  if (!issue) {
    const phones = cleanLeadPhones(draft.phones);
    if (phones.join("\n") !== cleanLeadPhones(saved.phones).join("\n")) patch.phone_numbers = phones;
    const telegram = normalizeTelegramUsername(draft.telegram);
    if (telegram !== normalizeTelegramUsername(saved.telegram)) patch.telegram = telegram || null;
  }
  return { patch, issue };
}

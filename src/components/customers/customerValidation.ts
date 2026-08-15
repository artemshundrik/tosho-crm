import { normalizeCustomerLogoUrl } from "@/lib/customerLogo";
import type { CustomerFormState } from "./CustomerDialog";

/** Ключ поля → текст помилки під ним. Порожній обʼєкт означає «можна зберігати». */
export type CustomerFieldErrors = Partial<
  Record<"name" | "source" | "logoUrl" | "contactPhone" | "contactEmail", string>
>;

/**
 * Перевірка форми замовника — одна функція на діалог і на збереження.
 *
 * ЧОМУ ВСІ ПОМИЛКИ ОДРАЗУ. Раніше збереження падало на першій же проблемі й
 * показувало один рядок угорі: людина виправляла назву, тиснула «Зберегти» і
 * дізнавалась про джерело, потім про телефон — по колу. Тут перевіряються всі
 * поля, і форма показує повний список за один раз.
 *
 * ЧОМУ ЧИСТА ФУНКЦІЯ. Її кличе і діалог (щоб підсвітити поля), і обробник
 * збереження (щоб вирішити, чи писати в базу) — інакше два набори правил
 * розійдуться, і форма показуватиме одне, а зберігати відмовлятиметься через
 * інше.
 */
export function validateCustomerForm(
  form: CustomerFormState,
  options: { isNew: boolean }
): CustomerFieldErrors {
  const errors: CustomerFieldErrors = {};

  if (!form.name.trim()) {
    errors.name = "Вкажіть назву — без неї замовника не знайти в списку.";
  }

  if (!form.source.trim()) {
    errors.source = "Вкажіть, звідки прийшов замовник.";
  }

  if (form.logoUploadMode === "url" && form.logoUrl.trim() && !normalizeCustomerLogoUrl(form.logoUrl)) {
    errors.logoUrl = "Вкажіть звичайний URL. `data:image/...;base64,...` більше не підтримується.";
  }

  // Телефон і пошта потрібні лише новому замовнику: у старих картках їх часто
  // немає, і вимагати заповнення при кожному редагуванні означало б не дати
  // виправити навіть одруківку в назві.
  if (options.isNew) {
    const contacts = form.contacts ?? [];
    if (!contacts.some((contact) => contact.phone.trim())) {
      errors.contactPhone = "Потрібен мобільний номер — без нього не оформити договір.";
    }
    if (!contacts.some((contact) => contact.email.trim())) {
      errors.contactEmail = "Потрібна пошта — на неї підуть документи.";
    }
  }

  return errors;
}

export function hasCustomerFieldErrors(errors: CustomerFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

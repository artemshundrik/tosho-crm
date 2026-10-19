/**
 * Назва сторони в рахунку так, як її друкує BAS (REQ-322, зразок рахунку
 * № 433 від 19.10.2026): повна організаційна форма, прямі лапки, великі
 * літери — «ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "АВАНПРІНТ"». У картці
 * замовника назва зазвичай коротка («ТОВ «АВАНТІ ГРУП»»), тож форму розгортаємо.
 */
const ORGANIZATION_FORMS: [RegExp, string][] = [
  [/^ТОВ(?=[\s«"])/i, "Товариство з обмеженою відповідальністю"],
  [/^ТДВ(?=[\s«"])/i, "Товариство з додатковою відповідальністю"],
  [/^ПрАТ(?=[\s«"])/i, "Приватне акціонерне товариство"],
  [/^ПАТ(?=[\s«"])/i, "Публічне акціонерне товариство"],
  [/^АТ(?=[\s«"])/i, "Акціонерне товариство"],
  [/^ПП(?=[\s«"])/i, "Приватне підприємство"],
  [/^ФОП(?=[\s«"])/i, "Фізична особа-підприємець"],
];

/** «ТОВ «АВАНТІ ГРУП»» → «Товариство з обмеженою відповідальністю «АВАНТІ ГРУП»» (преамбула СП). */
export function expandOrganizationForm(name?: string | null): string {
  const value = (name ?? "").replace(/\s+/g, " ").trim();
  const form = ORGANIZATION_FORMS.find(([pattern]) => pattern.test(value));
  return form ? value.replace(form[0], form[1]) : value;
}

export function formatInvoicePartyName(name?: string | null): string {
  return expandOrganizationForm(name).replace(/[«»“”„]/g, '"').toLocaleUpperCase("uk-UA");
}

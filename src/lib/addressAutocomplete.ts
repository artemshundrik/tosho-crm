/**
 * Чиста робота з текстом адреси для AddressAutocomplete.
 *
 * Адреса вводиться одним рядком, а частини розділені комами: активним вважається
 * те, що користувач набирає після останньої коми. Саме цей сегмент іде в пошук
 * Нової Пошти і саме він замінюється на обрану підказку.
 *
 * Тут немає ні React, ні мережі — тільки текст, щоб логіку можна було покрити тестами.
 */

/** Текст після останньої коми — те, що користувач зараз набирає. */
export const getActiveSegment = (text: string): { before: string; segment: string } => {
  const index = text.lastIndexOf(",");
  if (index === -1) return { before: "", segment: text };
  return { before: text.slice(0, index + 1), segment: text.slice(index + 1) };
};

/** Замінює активний сегмент на обране значення й лишає ", " під наступну частину. */
export const replaceActiveSegment = (text: string, replacement: string): string => {
  const { before } = getActiveSegment(text);
  const prefix = before ? `${before.trimEnd()} ` : "";
  return `${prefix}${replacement.trim()}, `;
};

/** Чи текст досі починається з обраного населеного пункту (інакше вибір скидаємо). */
export const startsWithSettlement = (text: string, settlementPresent: string): boolean => {
  const normalized = settlementPresent.trim().toLowerCase();
  if (!normalized) return false;
  return text.trim().toLowerCase().startsWith(normalized);
};

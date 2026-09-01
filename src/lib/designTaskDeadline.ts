/**
 * Дедлайн дизайн-задачі: розбір дати й перевірка часу.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ. Обидві функції чисті й не тримаються ні за стан, ні за
 * пропси, а лежали вони всередині DesignTaskPage — нижче за місця, де їх
 * кличуть. Компілятор React читає це як звертання до змінної до оголошення
 * (`react-hooks/immutability` у ратчеті боргу), а пересувати оголошення
 * всередині файлу на 12 тисяч рядків — латка, яка ще й розростає гіганта.
 */

/**
 * Рядок дати з бази → `Date` у місцевому часі, або `undefined`.
 *
 * Чиста дата (`2026-09-01`) навмисно збирається покомпонентно: `new Date()` на
 * такому рядку дає ПІВНІЧ UTC, і в Києві це стає попереднім днем. Значення з
 * часом віддаємо зрізаним до доби — календарю потрібен день, а не мить.
 */
export function toLocalDate(value: string | null | undefined) {
  if (!value) return undefined;
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    return new Date(year, month, day);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Чи це «ГГ:ХХ» у межах доби. */
export function isValidDeadlineTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

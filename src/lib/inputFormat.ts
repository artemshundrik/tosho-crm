/**
 * Нормалізація сайту/хендла на виході з поля: якщо це інстаграм-нік (@…) або
 * вже є протокол — лишаємо як є; порожнє чи багатослівне — теж не чіпаємо;
 * інакше дописуємо https:// до голого домену.
 */
export function normalizeSiteUrl(value: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/\s/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

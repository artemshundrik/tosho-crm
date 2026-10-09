/**
 * Кому сповіщення про нові моделі для сайту (REQ-311#p18).
 *
 * Вибір людей живе в tosho.site_listing_settings.notify_user_ids, а міняють його
 * в шапці блоку «На сайт». Спільне для блоку в CRM і функції
 * site-listing-reminders: блок показує, кому піде, функція шле — і казати вони
 * мусять одне.
 *
 * НЕМАЄ ВИБОРУ — ЛИШЕ ВЛАСНИК, А НЕ «УСІ». Інакше перший же пуш пішов би обом
 * СЕО, які цього не просили (рішення Артема 09.10.2026). Порожній збережений
 * список — це вже вибір «нікому», і його поважаємо.
 *
 * Сюди приходять лише ті, кому взагалі можна слати: доступ до блоку й досі
 * працює. Людина з вибору, що звільнилась чи втратила доступ, випадає сама.
 */

export type SiteListingRecipientCandidate = {
  userId: string;
  accessRole?: string | null;
};

export const isSiteListingDefaultRecipient = (member: SiteListingRecipientCandidate): boolean =>
  (member.accessRole ?? "").trim().toLowerCase() === "owner";

export function pickSiteListingRecipients<T extends SiteListingRecipientCandidate>(
  eligible: readonly T[],
  saved: readonly string[] | null
): T[] {
  if (saved === null) return eligible.filter(isSiteListingDefaultRecipient);
  const chosen = new Set(saved);
  return eligible.filter((member) => chosen.has(member.userId));
}

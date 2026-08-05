/**
 * Стан картки в розділі «Можливості».
 *
 * Розрізняємо три вхідні ситуації, і це навмисно:
 * - `undefined` — можливість незмірювана (проби в SQL немає) → «unknown»,
 *   чип не малюємо взагалі;
 * - `null` — проба є, але записів по цій людині немає → «не пробував»;
 * - обʼєкт — є використання.
 *
 * Дані беруться з нічного знімка `tosho.feature_adoption`, тож фіча,
 * яку спробували щойно, позначиться завтра.
 */

export type FeatureState = "using" | "tried" | "untried" | "unknown";

export type FeatureAdoption = {
  uses: number;
  lastUsedAt: string | null;
};

/** Від скількох використань вважаємо, що людина фічею користується, а не куштувала раз. */
const REGULAR_USE_THRESHOLD = 3;

/** Скільки днів можливість вважається новою за замовчуванням. */
const FRESH_DAYS = 30;

export function resolveFeatureState(adoption: FeatureAdoption | null | undefined): FeatureState {
  if (adoption === undefined) return "unknown";
  if (!adoption || adoption.uses <= 0) return "untried";
  return adoption.uses >= REGULAR_USE_THRESHOLD ? "using" : "tried";
}

/**
 * Чи можливість ще «нова». Поріг параметром, бо вікна різні: у каталозі чип
 * «Нове» висить 30 днів, а плашка в сайдбарі анонсує лише 14 — вона нав'язливіша.
 */
export function isFreshFeature(
  def: { since?: string },
  now: Date,
  days: number = FRESH_DAYS
): boolean {
  if (!def.since) return false;
  const since = new Date(`${def.since}T00:00:00Z`);
  if (Number.isNaN(since.getTime())) return false;
  const passed = (now.getTime() - since.getTime()) / 86_400_000;
  return passed >= 0 && passed <= days;
}

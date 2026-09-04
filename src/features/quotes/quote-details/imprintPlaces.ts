import { fetchKindPrintPositions, insertPrintPositionRow } from "./queries";

import type { QuoteImportDraftImprint } from "@/features/quotes/quote-import/types";

/** Вид → підпис місця (без регістру) → id рядка довідника. Кеш на один заїзд. */
export type PlaceCache = Map<string, Map<string, string>>;

/**
 * Вписане руками місце → рядок довідника цього виду (REQ-182#p24).
 *
 * Та сама ідея, що з товаром за посиланням: набране людиною стає справжнім
 * рядком бази, інакше довідник місць (заповнений у трьох видів із 92) лишався
 * б порожнім вічно, а всі шість читачів нанесення казали б «Місце не вказано».
 *
 * Дублів не плодимо: спершу читаємо місця виду й порівнюємо без регістру, а
 * створене в цьому ж заїзді лежить у спільному кеші. Не вийшло — місце
 * лишається підписом у `print_position_label`, і позиція від цього не гине.
 */
export async function resolveImprintPlaces(
  imprints: QuoteImportDraftImprint[],
  kindId: string | null | undefined,
  cache: PlaceCache
): Promise<QuoteImportDraftImprint[]> {
  if (!kindId) return imprints;
  const pending = imprints.filter((imprint) => !imprint.positionId && imprint.positionLabel?.trim());
  if (pending.length === 0) return imprints;

  let known = cache.get(kindId);
  if (!known) {
    const existing = await fetchKindPrintPositions(kindId);
    known = new Map(existing.ok ? existing.data.map((place) => [place.label.toLowerCase(), place.id]) : []);
    cache.set(kindId, known);
  }

  const resolved = new Map<string, string>();
  for (const imprint of pending) {
    const label = (imprint.positionLabel ?? "").trim().slice(0, 60);
    const lower = label.toLowerCase();
    if (!label || resolved.has(lower)) continue;
    const hit = known.get(lower);
    if (hit) {
      resolved.set(lower, hit);
      continue;
    }
    const inserted = await insertPrintPositionRow({ kind_id: kindId, label });
    if (!inserted.ok) continue;
    known.set(lower, inserted.data.id);
    resolved.set(lower, inserted.data.id);
  }
  if (resolved.size === 0) return imprints;

  return imprints.map((imprint) => {
    if (imprint.positionId) return imprint;
    const label = (imprint.positionLabel ?? "").trim().slice(0, 60);
    const id = resolved.get(label.toLowerCase());
    return id ? { ...imprint, positionId: id, positionLabel: label } : imprint;
  });
}

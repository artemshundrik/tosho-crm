import type { CatalogSuggestion } from "@/features/quotes/quote-wizard/catalogSuggestions";
import type { QuoteItemMetadata } from "@/lib/printPackage";

/**
 * Що саме пишемо в позицію при заміні товару.
 *
 * Винесено з компонента навмисно: правило «зміна ВИДУ скидає все, що належало
 * виду або моделі» перевіряється тестом, а не оком — саме його непомітна
 * половина (параметри виробу лишались) і була дірою REQ-36#p41.
 *
 * `metadata` повертаємо ЦІЛКОМ, без ключа `printSpec`, а не `{ printSpec: null }`:
 * колонка перезаписується повністю, тож решту ключів (артикул, колір, роль
 * варіанта) треба донести своїми руками.
 */
export function buildModelSwapPatch(
  suggestion: Pick<CatalogSuggestion, "name" | "typeId" | "kindId" | "modelId" | "matched">,
  context: { currentKindId: string | null; metadata: QuoteItemMetadata | null }
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    name: suggestion.name,
    catalog_type_id: suggestion.typeId,
    catalog_kind_id: suggestion.kindId,
    catalog_model_id: suggestion.modelId,
    // Знайшли за артикулом кольору — колір і записуємо; знайшли за назвою —
    // стираємо старий, бо він належав ІНШІЙ моделі (REQ-250#p1).
    catalog_variant_id: suggestion.matched?.variantId ?? null,
  };

  if (suggestion.kindId === context.currentKindId) return patch;

  patch.methods = null;
  patch.print_position_id = null;

  // Параметрів не було — метадані не чіпаємо взагалі, щоб не переписувати
  // колонку заради нічого.
  if (!context.metadata?.printSpec) return patch;

  const { printSpec: _dropped, ...rest } = context.metadata;
  void _dropped;
  patch.metadata = rest;
  return patch;
}

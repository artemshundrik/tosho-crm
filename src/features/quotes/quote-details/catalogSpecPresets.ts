import { supabase } from "@/lib/supabaseClient";

/**
 * `metadata.specPreset` моделей каталогу — окремим скаляром.
 *
 * ЧОМУ НЕ ЧЕРЕЗ `listCatalogModelsByIds`: його кеш свідомо звужує рядок до
 * назви, фото й артикула, і `metadata` в ньому не лишається. Тягнути туди
 * повний metadata заради одного ключа означало б повернути в пам'ять чотири
 * майже однакові URL на кожну картинку — те, від чого його й звужували.
 *
 * Потрібен там, де вид без фото має малюватись сам: картка канбану, рядок
 * позиції, картка прорахунку. Один скаляр на десяток id — дешевше за будь-яке
 * вгадування.
 */
export async function fetchSpecPresetsByModelId(modelIds: string[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(modelIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();

  const { data } = await supabase
    .schema("tosho")
    .from("catalog_models")
    .select("id,specPreset:metadata->>specPreset")
    .in("id", ids);

  const rows = (data ?? []) as Array<{ id: string; specPreset: string | null }>;
  return new Map(rows.map((row) => [row.id, row.specPreset]));
}

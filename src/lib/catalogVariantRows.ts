import { buildCatalogImageAsset } from "@/lib/catalogAssetUrl";
import { supabase } from "@/lib/supabaseClient";

import type { CatalogImageAsset, CatalogModelMetadata, CatalogModelVariant } from "@/types/catalog";

/**
 * Рядок `tosho.catalog_variants` так, як його бере кожен читач каталогу.
 *
 * Варіант (колір) став окремим рядком у REQ-250#p1 — до того всі 440 лежали в
 * `catalog_models.metadata.variants`.
 */
export type CatalogVariantRow = {
  id: string;
  model_id: string;
  name: string;
  sku: string | null;
  image_bucket: string | null;
  image_path: string | null;
  is_active: boolean;
  sort_order: number;
};

/** Стовпці, які треба брати, щоб зібрати варіант цілком. Один рядок на всіх читачів. */
/** Чернетка редактора роздає варіанту uuid; усе інше в таблицю не пускаємо. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CATALOG_VARIANT_COLUMNS = "id,model_id,name,sku,image_bucket,image_path,is_active,sort_order";

/**
 * Рядки таблиці → варіанти, згруповані за моделлю, у тій самій формі, що колись
 * лежала в `metadata.variants` (REQ-178#p9).
 *
 * ЧОМУ СПІЛЬНИЙ ХЕЛПЕР. Той самий перетворювач писали двічі — сторінка каталогу
 * і вікно прорахунку, — і саме такі пари розходяться мовчки: полагодиш одну,
 * друга лишиться зі старим правилом. Тут же лежить і правило картинок: у базі
 * один `bucket` + `path`, решта URL виводиться (`buildCatalogImageAsset`), тож
 * читачі каталогу отримують готовий об'єкт і не знають, що URL похідні.
 *
 * ПОРЯДОК — `sort_order`, як його поставив редактор моделі. Перший варіант у
 * списку особливий: його артикул і назва дублюють артикул і базову назву самої
 * моделі, і кілька екранів показують саме його.
 */
export function groupCatalogVariantsByModel(
  rows: readonly CatalogVariantRow[] | null | undefined
): Map<string, CatalogModelVariant[]> {
  const byModel = new Map<string, CatalogModelVariant[]>();
  [...(rows ?? [])]
    .sort((left, right) => left.sort_order - right.sort_order)
    .forEach((row) => {
      const list = byModel.get(row.model_id) ?? [];
      const asset = buildCatalogImageAsset(row.image_bucket, row.image_path);
      list.push({
        id: row.id,
        name: row.name,
        sku: row.sku,
        active: row.is_active,
        imageUrl: asset?.previewUrl ?? asset?.originalUrl ?? null,
        imageAsset: asset,
      });
      byModel.set(row.model_id, list);
    });
  return byModel;
}

/**
 * Стовпці моделі, потрібні вікну прорахунку, — шістьма стрілками замість цілого
 * `metadata` (REQ-178#p9).
 *
 * ЩО БУЛО НЕ ТАК. Вікно брало `metadata` цілком, а читало з нього шість
 * скалярів. На 250 моделях блоб важив 1041 кБ, і 662 кБ із них — масив
 * `variants`, який уже живе окремою таблицею. Платилось це на КОЖНЕ відкриття
 * «Новий прорахунок», «Редагувати» й білдера, тобто десятки разів на день.
 *
 * Ті самі стрілки, що на сторінці каталогу: там цю дорогу вже проклали в
 * REQ-250#p2, тут вона просто ширша на три ключі, яких сітці каталогу не треба.
 */
export const CATALOG_MODEL_SCALAR_COLUMNS =
  "sku:metadata->>sku,supplierUrl:metadata->>supplierUrl,avantprintUrl:metadata->>avantprintUrl," +
  "configuratorPreset:metadata->>configuratorPreset,specPreset:metadata->>specPreset," +
  "imageBucket:metadata->imageAsset->>bucket,imagePath:metadata->imageAsset->>path";

/** Рядок моделі, зібраний `CATALOG_MODEL_SCALAR_COLUMNS`. */
export type CatalogModelScalarRow = {
  sku?: string | null;
  supplierUrl?: string | null;
  avantprintUrl?: string | null;
  configuratorPreset?: CatalogModelMetadata["configuratorPreset"];
  specPreset?: string | null;
  imageBucket?: string | null;
  imagePath?: string | null;
};

/**
 * Скаляри моделі + її варіанти → той самий `metadata`, який читачі бачили
 * раніше. Складається тут, а не в сторінці, щоб набір ключів і набір стовпців
 * не розходились: додав ключ читачеві — додав стрілку поруч.
 */
export function buildCatalogModelMetadata(
  row: CatalogModelScalarRow,
  variants: CatalogModelVariant[] | undefined
): CatalogModelMetadata {
  return {
    sku: row.sku ?? null,
    supplierUrl: row.supplierUrl ?? null,
    avantprintUrl: row.avantprintUrl ?? null,
    configuratorPreset: row.configuratorPreset ?? null,
    specPreset: row.specPreset ?? null,
    imageAsset: buildCatalogImageAsset(row.imageBucket, row.imagePath),
    ...(variants ? { variants } : {}),
  };
}

/**
 * Варіанти моделі → рядки таблиці (REQ-250#p1, напрямок перевернуто в REQ-178#p9).
 *
 * ЧОМУ НЕ «ВИДАЛИТИ ВСЕ Й ВСТАВИТИ ЗАНОВО», як роблять сусідні
 * `catalog_price_tiers` і `catalog_model_methods`. На варіант посилається
 * `quote_items.catalog_variant_id` через `on delete set null`: видалення рядка
 * СТИРАЄ з чужого прорахунку пам'ять про те, який колір продали, і робить це
 * мовчки. Тому спершу дописуємо, і лише потім прибираємо тих, кого в новому
 * списку справді немає.
 *
 * ПОРЯДОК САМЕ ТАКИЙ І З ДРУГОЇ ПРИЧИНИ: якби спочатку йшло видалення, то
 * зірваний на півдорозі запис лишив би модель зовсім без кольорів. Обірваний у
 * цьому порядку — лишає зайвий, а це видно й лагодиться редагуванням.
 *
 * ID БЕРУТЬСЯ З ЧЕРНЕТКИ: редактор роздає варіанту uuid ще до збереження, тож
 * посилання з прорахунку переживає будь-яку правку моделі.
 */
export async function persistCatalogVariants(params: {
  teamId: string;
  modelId: string;
  variants: readonly CatalogModelVariant[];
}): Promise<void> {
  const { teamId, modelId, variants } = params;
  const rows = variants
    .filter((variant) => UUID_RE.test(variant.id))
    .map((variant, index) => ({
      id: variant.id,
      team_id: teamId,
      model_id: modelId,
      name: variant.name.trim() || "Без назви",
      sku: variant.sku?.trim() || null,
      image_bucket: variant.imageAsset?.bucket?.trim() || null,
      image_path: variant.imageAsset?.path?.trim() || null,
      is_active: variant.active ?? true,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length > 0) {
    const { error } = await supabase
      .schema("tosho")
      .from("catalog_variants")
      .upsert(rows as never, { onConflict: "id" });
    if (error) throw error;
  }

  // Кого прибрати — рахуємо явним списком, а не заперечним фільтром: `not.in`
  // з порожнім списком у PostgREST означає протилежне очікуваному.
  const { data: existing, error: readError } = await supabase
    .schema("tosho")
    .from("catalog_variants")
    .select("id")
    .eq("model_id", modelId);
  if (readError) throw readError;

  const keep = new Set(rows.map((row) => row.id));
  const stale = ((existing ?? []) as Array<{ id: string }>).map((row) => row.id).filter((id) => !keep.has(id));
  if (stale.length > 0) {
    const { error } = await supabase.schema("tosho").from("catalog_variants").delete().in("id", stale);
    if (error) throw error;
  }
}

/**
 * Картинки кольорів моделі — щоб було що прибрати зі сховища, коли модель
 * видаляють (REQ-178#p9).
 *
 * Рядки зникнуть самі, по `on delete cascade`, а файли — ні: без цього списку
 * вони лишились би в бакеті назавжди й невидимо.
 */
export async function fetchCatalogVariantImageAssets(modelId: string): Promise<CatalogImageAsset[]> {
  const { data, error } = await supabase
    .schema("tosho")
    .from("catalog_variants")
    .select("image_bucket,image_path")
    .eq("model_id", modelId);
  if (error) throw error;
  return ((data ?? []) as Array<{ image_bucket: string | null; image_path: string | null }>)
    .map((row) => buildCatalogImageAsset(row.image_bucket, row.image_path))
    .filter((asset): asset is CatalogImageAsset => Boolean(asset?.bucket && asset.path));
}

/**
 * Кольори для копії моделі — власні рядки з власними id (REQ-178#p9).
 *
 * ID НЕ ПЕРЕВИКОРИСТОВУЮТЬСЯ: вони первинний ключ, і на них посилаються
 * прорахунки. Копія мусить мати свої, інакше правка кольору в копії міняла б
 * колір оригіналу.
 *
 * Помилка тут не має валити клонування: модель уже створено, і кольори — не та
 * причина, щоб відкочувати все. Повертає те, що справді лягло.
 */
export async function cloneCatalogVariants(params: {
  teamId: string;
  modelId: string;
  source: readonly CatalogModelVariant[] | undefined;
}): Promise<CatalogModelVariant[]> {
  const cloned = (params.source ?? []).map((variant) => ({ ...variant, id: crypto.randomUUID() }));
  if (cloned.length === 0) return [];
  try {
    await persistCatalogVariants({ teamId: params.teamId, modelId: params.modelId, variants: cloned });
    return cloned;
  } catch (error) {
    console.error("clone catalog variants failed", error);
    return [];
  }
}

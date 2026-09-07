import { buildCatalogImageAsset } from "@/lib/catalogAssetUrl";

import type { CatalogModelMetadata, CatalogModelVariant } from "@/types/catalog";

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

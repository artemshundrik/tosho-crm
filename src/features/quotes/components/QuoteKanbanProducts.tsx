import { Package } from "@/components/icons/appIcons";

import { PrintModelTile } from "@/features/quotes/quote-wizard/printModelArt";
import { KanbanImageZoomPreview } from "@/components/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuoteListLine, QuoteListTotal } from "@/features/quotes/quotes-page/quoteListTotal";

export type QuoteKanbanProduct = {
  id: string;
  name: string;
  sku?: string | null;
  variantName?: string | null;
  variantImageUrl?: string | null;
  qtyLabel: string;
  runLabels?: Array<{
    id: string;
    label: string;
    active?: boolean;
  }>;
  imageUrl: string | null;
  zoomImageUrl?: string | null;
  /** `metadata.specPreset` моделі: наш виріб малюється замість фото. */
  specPreset?: string | null;
};

export type QuoteKanbanProductPreview = {
  itemCount: number;
  itemName: string;
  itemNames?: string[];
  qtyLabel: string;
  imageUrl: string | null;
  zoomImageUrl?: string | null;
  products?: QuoteKanbanProduct[];
  /** Сума з тиражів для таблиці прорахунків; `null` — даних немає. */
  listTotal?: QuoteListTotal | null;
  /** Рядки по позиціях для картки при наведенні в таблиці прорахунків. */
  listLines?: QuoteListLine[];
};

/**
 * Скільки мініатюр стоїть у рядку (хвиля Б4).
 *
 * До 01.11.2026 перші три товари малювались повними рядками з фото 56 px, назвою
 * й тиражами, і картка прорахунку займала ~470 px: на екрані 1440×900 у колонці
 * було видно півтори справи, а суми не було зовсім. Тепер фото — рядком мініатюр
 * 36 px, а назва — одним рядком «перша позиція і ще N · кількість»: товар
 * упізнається з фото, решту видно на наведенні. Картка ~150 px.
 *
 * Чотири по 36 з проміжками — 156 px, і це влазить у найвужчу колонку (224 px,
 * `QUOTES_COLUMN_WIDTH` у lib/kanbanColumnWidth) разом із «+N». Ряд не
 * переноситься ніколи.
 */
const THUMB_LIMIT = 4;

// Варіант дописуємо, лише коли він щось додає: у частини позицій назва
// варіанта дослівно повторює назву товару, і картка показувала «X · X».
const productDisplayName = (product: QuoteKanbanProduct) => {
  const variant = product.variantName?.trim();
  if (!variant) return product.name;
  if (product.name.toLocaleLowerCase("uk").includes(variant.toLocaleLowerCase("uk"))) return product.name;
  return `${product.name} · ${variant}`;
};

type QuoteKanbanProductsProps = {
  preview?: QuoteKanbanProductPreview;
  /** Прев'ю ще їде — показуємо каркас замість фото. */
  isLoading: boolean;
  /** Верхні картки колонки тягнуть фото одразу, решта — коли з'являться в полі зору. */
  imageLoadStrategy: "eager" | "visible";
};

/** Блок «Товари» в картці прорахунку на дошці — і на десктопі, і в мобільному списку. */
export function QuoteKanbanProducts({ preview, isLoading, imageLoadStrategy }: QuoteKanbanProductsProps) {
  if (!preview && !isLoading) return null;

  // Прев'ю ще не доїхало — малюємо один рядок-заглушку з тим, що вже відоме
  // зі списку (назва першої позиції й тираж), інакше картка стрибала б.
  const products: QuoteKanbanProduct[] = preview?.products?.length
    ? preview.products
    : [
        {
          id: "loading",
          name: preview?.itemName ?? "Завантаження товару...",
          sku: null,
          variantName: null,
          variantImageUrl: null,
          qtyLabel: preview?.qtyLabel ?? " ",
          runLabels: [],
          imageUrl: preview?.imageUrl ?? null,
          zoomImageUrl: preview?.zoomImageUrl ?? null,
        },
      ];
  const thumbProducts = products.slice(0, THUMB_LIMIT);
  const overflowProducts = products.slice(THUMB_LIMIT);
  const first = products[0];
  const rest = Math.max((preview?.itemCount ?? products.length) - 1, products.length - 1, 0);
  const summary = `${productDisplayName(first)}${rest ? ` і ще ${rest}` : ""}`;

  /*
    БЕЗ БЛОКУ В КАРТЦІ. Мініатюри стоять прямо на картці: тінтований блок
    «Товари» з плитками всередині давав картку в картці, а рядок фото й так
    читається як окрема річ.
  */
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-nowrap items-center gap-1" aria-label={`Товарів: ${preview?.itemCount ?? products.length}`}>
        {thumbProducts.map((product) => {
          const displayName = productDisplayName(product);
          return (
            <div key={product.id} title={`${displayName} · ${product.qtyLabel}`} className="flex shrink-0">
              {product.specPreset ? (
                <PrintModelTile presetKey={product.specPreset} className="h-9 w-9 rounded-md" iconClassName="h-5 w-5" />
              ) : product.imageUrl ? (
                <KanbanImageZoomPreview
                  imageUrl={product.imageUrl}
                  zoomImageUrl={product.zoomImageUrl ?? undefined}
                  alt={displayName}
                  className="h-9 w-9 rounded-md"
                  loadStrategy={imageLoadStrategy}
                />
              ) : (
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-line bg-secondary">
                  {isLoading ? (
                    <Skeleton className="h-full w-full rounded-md" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted-foreground/60">
                      <Package className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {overflowProducts.length ? (
          <span
            className="inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-line px-1.5 text-xs font-semibold tabular-nums text-muted-foreground"
            title={overflowProducts.map((product) => productDisplayName(product)).join(", ")}
          >
            +{overflowProducts.length}
          </span>
        ) : null}
      </div>
      <div className="truncate text-xs text-muted-foreground" title={products.map((product) => productDisplayName(product)).join(", ")}>
        {summary}
        {first.qtyLabel.trim() ? <span className="tabular-nums"> · {first.qtyLabel}</span> : null}
      </div>
    </div>
  );
}

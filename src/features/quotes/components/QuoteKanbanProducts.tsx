import { Package } from "lucide-react";
import { KanbanImageZoomPreview } from "@/components/kanban";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
};

export type QuoteKanbanProductPreview = {
  itemCount: number;
  itemName: string;
  itemNames?: string[];
  qtyLabel: string;
  imageUrl: string | null;
  zoomImageUrl?: string | null;
  products?: QuoteKanbanProduct[];
};

/**
 * Скільки товарів картка показує повними рядками, а скільки — смугою мініатюр.
 *
 * До цього картка малювала ВСІ позиції прорахунку підряд, по 56 пікселів на
 * рядок: прорахунок на вісім товарів давав картку вищу за екран, і колонка
 * перетворювалась на стрічку, де видно одну справу замість шести. Три повні
 * рядки — це стільки, скільки треба, щоб упізнати замовлення; решта важлива
 * лише кількістю й тим, «що там ще», тож їй досить мініатюр із наведенням.
 */
const FULL_ROWS = 3;
/**
 * Мініатюри й «+N» живуть в ОДНОМУ рядку, тож межа рахується з найвужчої
 * колонки: `basis-[clamp(224px,…)]` мінус відступи картки й блоку лишає
 * приблизно 168 пікселів. П'ять мініатюр по 28 з проміжками — 156, і це
 * стеля; коли товарів більше, останнє місце віддаємо лічильнику «+N»,
 * тобто малюємо чотири. Ряд не переноситься ніколи.
 */
const THUMB_LIMIT = 5;

const productDisplayName = (product: QuoteKanbanProduct) =>
  product.variantName ? `${product.name} · ${product.variantName}` : product.name;

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
  const fullProducts = products.slice(0, FULL_ROWS);
  const collapsedProducts = products.slice(FULL_ROWS);
  const thumbProducts =
    collapsedProducts.length > THUMB_LIMIT ? collapsedProducts.slice(0, THUMB_LIMIT - 1) : collapsedProducts;
  const overflowProducts = collapsedProducts.slice(thumbProducts.length);

  return (
    <div className="mt-3 rounded-inner border border-border/60 bg-secondary px-3 py-2.5">
      <div className="mb-2 inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-caps text-muted-foreground">
        <Package className="h-3.5 w-3.5" />
        {preview && preview.itemCount > 1 ? "Товари" : "Товар"}
        {/* Список обрізаний — кількість каже, скільки їх насправді. */}
        {collapsedProducts.length ? (
          <span className="font-medium normal-case tracking-normal text-muted-foreground/70">
            · {products.length}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-border/50">
        {fullProducts.map((product, productIndex) => {
          const displayName = productDisplayName(product);
          return (
            <div
              key={product.id}
              className={cn(
                "flex items-center gap-2.5",
                productIndex > 0 && "pt-2",
                productIndex < fullProducts.length - 1 && "pb-2"
              )}
            >
              {product.imageUrl ? (
                <KanbanImageZoomPreview
                  imageUrl={product.imageUrl}
                  zoomImageUrl={product.zoomImageUrl ?? undefined}
                  alt={displayName}
                  loadStrategy={imageLoadStrategy}
                />
              ) : (
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-secondary">
                  {isLoading ? (
                    // Каркас на весь квадрат, а не крапка посередині: крапка
                    // читалась як зламане зображення, а не як очікування.
                    <Skeleton className="h-full w-full rounded-lg" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted-foreground/60">
                      <Package className="h-4 w-4" />
                    </div>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium" title={displayName}>
                  {displayName}
                </div>
                {product.sku ? (
                  <div className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground">
                    Артикул: {product.sku}
                  </div>
                ) : null}
                {product.runLabels?.length ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {product.runLabels.map((runLabel) => (
                      <span
                        key={runLabel.id}
                        className={cn(
                          "inline-flex h-5 items-center rounded-full border px-2 text-2xs leading-none",
                          runLabel.active
                            ? "border-foreground/25 bg-foreground/10 font-semibold text-foreground"
                            : "border-border/60 bg-muted/20 font-medium text-muted-foreground"
                        )}
                      >
                        {runLabel.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-0.5 text-[13px] font-normal text-muted-foreground">{product.qtyLabel}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {collapsedProducts.length ? (
        // Хвіст списку — смугою мініатюр: назва тут не потрібна (її видно на
        // наведенні), а от «що там ще» одним поглядом — потрібно.
        <div className="mt-2 flex flex-nowrap items-center gap-1 border-t border-border/50 pt-2">
          {thumbProducts.map((product) => {
            const displayName = productDisplayName(product);
            return (
              <div key={product.id} title={`${displayName} · ${product.qtyLabel}`} className="flex shrink-0">
                {product.imageUrl ? (
                  <KanbanImageZoomPreview
                    imageUrl={product.imageUrl}
                    zoomImageUrl={product.zoomImageUrl ?? undefined}
                    alt={displayName}
                    className="h-7 w-7 rounded-md"
                    loadStrategy="visible"
                  />
                ) : (
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/60 bg-secondary text-muted-foreground/60">
                    <Package className="h-3 w-3" />
                  </div>
                )}
              </div>
            );
          })}
          {overflowProducts.length ? (
            <span
              className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 px-1.5 text-2xs font-semibold text-muted-foreground"
              title={overflowProducts.map((product) => product.name).join(", ")}
            >
              +{overflowProducts.length}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

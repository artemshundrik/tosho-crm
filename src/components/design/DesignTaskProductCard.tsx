/**
 * DesignTaskProductCard — full product card for a standalone design task's
 * catalog snapshot, shown at the top of the "ТЗ для дизайнера" tab. Modeled on
 * the quote product card (QuoteDetailsPage) so the designer sees the same thing:
 * product image + name, article, supplier / Аванпринт links, and the print
 * surfaces (нанесення). Read-only.
 *
 * Layout: a balanced header (media + identity + supplier actions on one line),
 * a divider, then a dedicated surfaces zone — so nothing floats disconnected.
 */

import { ExternalLink, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanImageZoomPreview } from "@/components/kanban";
import { DESIGN_TASK_PRINT_SIDE_LABELS, type DesignTaskProduct } from "@/lib/designTaskProduct";

type DesignTaskProductCardProps = {
  product: DesignTaskProduct;
};

export function DesignTaskProductCard({ product }: DesignTaskProductCardProps) {
  const renderLinkButton = (url: string | null, label: string, hint: string) =>
    url ? (
      <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 transition-colors">
        <a href={url} target="_blank" rel="noopener noreferrer">
          {label}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 border-dashed text-muted-foreground/70"
        disabled
        title={hint}
      >
        {label}
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    );

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      {/* Header: media + identity + supplier actions on one balanced line */}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="shrink-0">
          {product.imageUrl ? (
            <KanbanImageZoomPreview
              imageUrl={product.imageUrl}
              zoomImageUrl={product.imageUrl}
              alt={product.name || "Товар"}
              loadStrategy="eager"
              className="h-24 w-24 rounded-xl border-border/60 bg-muted/20 ring-1 ring-border/50 [&>div]:rounded-xl"
              imageClassName="object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
              <Package className="h-7 w-7 text-muted-foreground/50" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {product.productKind === "print" ? "Поліграфія" : "Товар"}
          </div>
          <div className="mt-1 truncate text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
            {product.name || "Товар"}
          </div>
          {product.sku ? (
            <div className="mt-1.5 text-sm text-muted-foreground">
              Артикул: <span className="text-foreground/80">{product.sku}</span>
            </div>
          ) : null}
        </div>

        {product.productKind === "print" ? null : (
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            {renderLinkButton(
              product.supplierUrl,
              "Постачальник",
              "Посилання на товар у постачальника зʼявиться після його додавання в товарі"
            )}
            {renderLinkButton(
              product.avantprintUrl,
              "Аванпринт",
              "Посилання на товар на Аванпринті зʼявиться після його додавання в товарі"
            )}
          </div>
        )}
      </div>

      {/* Друк (сторони) — поліграфія only */}
      {product.productKind === "print" && product.printSides ? (
        <div className="border-t border-border/50 bg-muted/10 px-4 py-3.5 sm:px-5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Друк
          </div>
          <span className="inline-flex items-center rounded-full border border-border/50 bg-background px-3 py-1.5 text-sm font-medium text-foreground">
            {DESIGN_TASK_PRINT_SIDE_LABELS[product.printSides]}
          </span>
        </div>
      ) : null}

      {/* Surfaces (нанесення) */}
      {product.surfaces.length > 0 ? (
        <div className="border-t border-border/50 bg-muted/10 px-4 py-3.5 sm:px-5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Нанесення
          </div>
          <div className="flex flex-wrap gap-2">
            {product.surfaces.map((surface, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-3 py-1.5 text-sm"
                title={`${surface.positionLabel ?? "—"} · ${surface.methodLabel ?? "—"}`}
              >
                <span className="text-muted-foreground">{surface.positionLabel ?? "Позиція"}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-medium text-foreground">{surface.methodLabel ?? "—"}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

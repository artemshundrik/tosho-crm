/**
 * DesignTaskProductCard — full product card for a standalone design task's
 * catalog snapshot, shown at the top of the "ТЗ для дизайнера" tab. Modeled on
 * the quote product card (QuoteDetailsPage) so the designer sees the same thing:
 * product image + name, supplier / Аванпринт links, and the print surfaces
 * (нанесення). Read-only.
 */

import { ExternalLink, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanImageZoomPreview } from "@/components/kanban";
import type { DesignTaskProduct } from "@/lib/designTaskProduct";

type DesignTaskProductCardProps = {
  product: DesignTaskProduct;
};

export function DesignTaskProductCard({ product }: DesignTaskProductCardProps) {
  const renderLinkButton = (url: string | null, label: string, hint: string) =>
    url ? (
      <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
        <a href={url} target="_blank" rel="noopener noreferrer">
          {label}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
    ) : (
      <Button variant="outline" size="sm" className="h-8 gap-1.5" disabled title={hint}>
        {label}
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    );

  return (
    <div className="overflow-hidden rounded-[22px] border border-border/60 bg-background shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="shrink-0">
          {product.imageUrl ? (
            <KanbanImageZoomPreview
              imageUrl={product.imageUrl}
              zoomImageUrl={product.imageUrl}
              alt={product.name || "Товар"}
              loadStrategy="eager"
              className="h-20 w-20 rounded-2xl border-border/50 bg-muted/20 [&>div]:rounded-2xl"
              imageClassName="object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border/40 bg-muted/40">
              <Package className="h-6 w-6 text-muted-foreground/50" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Товар
              </div>
              <div className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
                {product.name || "Товар"}
              </div>
              {product.sku ? (
                <div className="mt-2 inline-flex items-center rounded-lg border border-border/50 bg-muted/20 px-2 py-0.5 text-sm text-muted-foreground">
                  Артикул: {product.sku}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
          </div>

          {product.surfaces.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Нанесення
              </div>
              <div className="flex flex-wrap gap-2">
                {product.surfaces.map((surface, index) => (
                  <span
                    key={index}
                    className="inline-flex min-h-14 min-w-[112px] max-w-full flex-col justify-center gap-1 rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
                    title={`${surface.methodLabel ?? "—"} · ${surface.positionLabel ?? "—"}`}
                  >
                    <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-muted-foreground">
                      {surface.positionLabel ?? "Позиція"}
                    </span>
                    <span className="max-w-full truncate text-base font-semibold leading-none text-foreground/90">
                      {surface.methodLabel ?? "—"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

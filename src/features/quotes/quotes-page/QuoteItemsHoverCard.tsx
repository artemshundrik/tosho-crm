import * as React from "react";
import { Link } from "react-router-dom";

import { ArrowRight, Package } from "@/components/icons/appIcons";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { formatMoney } from "@/features/quotes/commercial-document/document";
import type { QuoteKanbanProduct, QuoteKanbanProductPreview } from "@/features/quotes/components/QuoteKanbanProducts";
import type { QuoteListLine } from "@/features/quotes/quotes-page/quoteListTotal";
import { normalizeUnitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";

/** Ті самі затримки, що в `HoverTip` (картка замовника): відкриваємось одразу, закриваємось за 90 мс. */
const CLOSE_DELAY_MS = 90;
const THUMB_LIMIT = 8;

const money = (value: number) => formatMoney(Math.round(value));

const lineQty = (line: QuoteListLine | undefined, product: QuoteKanbanProduct) => {
  if (line?.quantity) {
    const label = Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toLocaleString("uk-UA");
    return `${label} ${normalizeUnitLabel(line.unit)}`;
  }
  return product.qtyLabel && product.qtyLabel !== "Не вказано" ? product.qtyLabel : null;
};

function CardBody({ quoteId, preview }: { quoteId: string; preview: QuoteKanbanProductPreview }) {
  const products = preview.products ?? [];
  const linesById = new Map((preview.listLines ?? []).map((line) => [line.id, line]));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = products.find((product) => product.id === activeId) ?? products.find((product) => product.imageUrl) ?? products[0];
  const image = active?.zoomImageUrl || active?.imageUrl || null;
  const thumbs = products.filter((product) => product.imageUrl);
  const total = preview.listTotal ?? null;

  return (
    <div className="w-[360px]">
      <div className="flex h-[200px] items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-white">
        {image ? (
          <img src={image} alt={active?.name ?? ""} decoding="async" className="h-full w-full object-contain p-2" />
        ) : (
          <Package className="h-10 w-10 text-muted-foreground/40" aria-hidden />
        )}
      </div>

      {thumbs.length > 1 ? (
        <div className="mt-2 flex items-center gap-1.5">
          {thumbs.slice(0, THUMB_LIMIT).map((product) => (
            <button
              key={product.id}
              type="button"
              aria-label={product.name}
              aria-pressed={product.id === active?.id}
              onMouseEnter={() => setActiveId(product.id)}
              onFocus={() => setActiveId(product.id)}
              onClick={() => setActiveId(product.id)}
              className={cn(
                "h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                product.id === active?.id ? "border-foreground/60" : "border-border/60 opacity-80 hover:opacity-100"
              )}
            >
              <img src={product.imageUrl ?? ""} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-0.5" />
            </button>
          ))}
          {thumbs.length > THUMB_LIMIT ? (
            <span className="text-2xs text-muted-foreground">+{thumbs.length - THUMB_LIMIT}</span>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-2.5 max-h-[216px] divide-y divide-border/40 overflow-y-auto overscroll-contain">
        {products.map((product) => {
          const line = linesById.get(product.id);
          const qty = lineQty(line, product);
          return (
            <li
              key={product.id}
              onMouseEnter={() => product.imageUrl && setActiveId(product.id)}
              className={cn("flex min-h-9 items-center gap-2 py-1.5 text-xs", line?.declined && "text-muted-foreground")}
            >
              <div className="min-w-0 flex-1">
                <div className={cn("truncate font-medium", !line?.declined && "text-foreground", line?.declined && "line-through")}>
                  {product.variantName ? `${product.name} · ${product.variantName}` : product.name}
                </div>
                {qty ? <div className="text-2xs tabular-nums text-muted-foreground">{qty}</div> : null}
              </div>
              {line?.declined ? (
                <span className="shrink-0 rounded-full border border-border/60 bg-muted/30 px-1.5 py-0.5 text-3xs font-semibold">
                  відмовився
                </span>
              ) : line?.amount ? (
                <span className="shrink-0 tabular-nums text-foreground">
                  {line.partial ? "від " : ""}
                  {money(line.amount)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/50 pt-2.5">
        <div className="min-w-0 text-xs">
          <span className="text-muted-foreground">Сума: </span>
          <span className="font-semibold tabular-nums text-foreground">
            {total ? `${total.partial ? "від " : ""}${money(total.amount)}` : "—"}
          </span>
        </div>
        <Link
          to={`/orders/estimates/${quoteId}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Відкрити прорахунок
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/**
 * Картка позицій прорахунку під курсором у таблиці. Той самий поповер і ті самі
 * затримки, що й у картки замовника, але вміст інтерактивний: по мініатюрах
 * міняється велике фото, перелік прокручується, є посилання на прорахунок.
 * Дані лише з уже завантаженого прев'ю — без запитів на наведення; поки
 * прев'ю немає, картки немає.
 */
export function QuoteItemsHoverCard({
  quoteId,
  preview,
  children,
}: {
  quoteId: string;
  preview: QuoteKanbanProductPreview | undefined;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hide = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  React.useEffect(() => cancelClose, []);

  if (!preview?.products?.length) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className="min-w-0"
          tabIndex={0}
          aria-label="Позиції прорахунку"
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
        >
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={cancelClose}
        onMouseLeave={hide}
        // Портал не відрізає React-події від рядка: без цього клік чи Enter у картці відкрив би прорахунок.
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Escape") event.stopPropagation();
        }}
        className="w-auto max-w-none rounded-xl border-border/60 p-3 shadow-menu"
      >
        <CardBody quoteId={quoteId} preview={preview} />
      </PopoverContent>
    </Popover>
  );
}

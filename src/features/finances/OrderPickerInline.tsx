import * as React from "react";
import { Check, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatOrderMoney } from "@/features/orders/orderRecords";
import type { FinanceOrderRef } from "./types";

type OrderPickerInlineProps = {
  orders: FinanceOrderRef[];
  loading: boolean;
  value: string;
  onChange: (quoteId: string) => void;
  placeholder?: string;
  className?: string;
  excludeQuoteIds?: ReadonlySet<string>;
};

/** Searchable order picker used by payments, invoices and expense allocations. */
export function OrderPickerInline({
  orders,
  loading,
  value,
  onChange,
  placeholder = "Оберіть замовлення",
  className,
  excludeQuoteIds,
}: OrderPickerInlineProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = orders.find((o) => o.quoteId === value) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = orders.filter((o) => {
      if (excludeQuoteIds?.has(o.quoteId) && o.quoteId !== value) return false;
      if (!q) return true;
      return o.number.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q);
    });
    return base.slice(0, 50);
  }, [orders, query, excludeQuoteIds, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("h-9 w-full justify-start font-normal", className)}>
          {selected ? (
            <span className="truncate">
              {selected.number} · {selected.customerName}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-2" align="start">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Номер або замовник…"
            className="h-9 pl-8"
          />
        </div>
        <div className="max-h-[260px] space-y-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Завантажуємо замовлення…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">Замовлень не знайдено</div>
          ) : (
            filtered.map((order) => (
              <button
                key={order.quoteId}
                type="button"
                onClick={() => {
                  onChange(order.quoteId);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60",
                  order.quoteId === value && "bg-muted"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{order.number}</span>
                  <span className="block truncate text-xs text-muted-foreground">{order.customerName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {formatOrderMoney(order.total, order.currency)}
                  {order.quoteId === value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

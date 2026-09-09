import * as React from "react";
import { Loader2, Search } from "lucide-react";

import { SupplierPoolRow } from "@/components/catalog/SupplierPoolRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pluralUk } from "@/lib/lastSeen";
import { cn } from "@/lib/utils";

import { searchTermsFor, useSupplierCategories, useSupplierProducts } from "./queries";
import type { SupplierDefinition } from "./suppliersCatalog";

/**
 * Товари одного постачальника на його сторінці (картка 259).
 *
 * На відміну від пошуку по всіх джерелах, тут можна дивитись БЕЗ запиту:
 * порожнє поле — перегляд усього за абеткою, сторінками по 40 товарів.
 * Розділи — лише коли фід їх дає (у Bergamo їх нуль, і селект не малюється).
 */
const DEBOUNCE_MS = 300;
/** Radix Select не приймає порожнє значення, тож «усі» — окремий ключ. */
const ALL_CATEGORIES = "__all__";

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SupplierProducts({
  definition,
  className,
  debounceMs = DEBOUNCE_MS,
}: {
  definition: SupplierDefinition;
  className?: string;
  debounceMs?: number;
}) {
  const [term, setTerm] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const debounced = useDebounced(term, debounceMs);
  const terms = React.useMemo(() => searchTermsFor(debounced), [debounced]);

  const categories = useSupplierCategories(definition.slug);
  const products = useSupplierProducts(definition.slug, terms, category);

  const pages = products.data?.pages ?? [];
  const items = pages.flatMap((page) => page.products);
  const total = pages[0]?.total ?? 0;
  const searching = term !== debounced || (products.isFetching && !products.isFetchingNextPage);

  return (
    <div className={cn("rounded-section border border-border/60 bg-card", className)}>
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          {searching ? (
            <Loader2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <Input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={`Пошук у товарах ${definition.name}: назва або артикул`}
            aria-label={`Пошук у товарах ${definition.name}`}
            className="h-10 rounded-full pl-9 text-sm"
          />
        </div>
        {categories.data && categories.data.length > 0 ? (
          <Select
            value={category ?? ALL_CATEGORIES}
            onValueChange={(value) => setCategory(value === ALL_CATEGORIES ? null : value)}
          >
            <SelectTrigger className="h-10 sm:w-64" aria-label="Розділ">
              <SelectValue placeholder="Усі розділи" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>Усі розділи</SelectItem>
              {categories.data.map((item) => (
                <SelectItem key={item.category} value={item.category}>
                  {item.category} · {item.products}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="px-2 pb-2">
        {products.isError ? (
          <div className="px-3 py-6 text-center text-sm">
            <p className="text-destructive">Не вдалося завантажити товари.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void products.refetch()}>
              Спробувати ще
            </Button>
          </div>
        ) : null}
        {!products.isError && products.isPending ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Шукаю…</p>
        ) : null}
        {!products.isError && !products.isPending && items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            У {definition.name} такого не знайшлось.
          </p>
        ) : null}
        {items.length > 0 ? (
          <p className="px-3 pt-1 text-2xs text-muted-foreground">
            Знайдено {pluralUk(total, "товар", "товари", "товарів")}
          </p>
        ) : null}
        {items.map((product) => (
          <SupplierPoolRow key={product.key} product={product} />
        ))}
        {products.hasNextPage ? (
          <div className="px-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void products.fetchNextPage()}
              loading={products.isFetchingNextPage}
            >
              Показати ще
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

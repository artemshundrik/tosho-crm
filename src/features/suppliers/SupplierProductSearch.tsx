import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";

import {
  SupplierPoolFilterBar,
  filterSupplierPool,
  POOL_FILTER_ALL,
  type PoolFilter,
} from "@/components/catalog/SupplierPoolFilterBar";
import { SupplierPoolRow } from "@/components/catalog/SupplierPoolRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralUk } from "@/lib/lastSeen";
import { searchSupplierPool, type SupplierPoolProduct } from "@/lib/supplierPool";
import { cn } from "@/lib/utils";

/**
 * Пошук по товарах усіх під'єднаних постачальників — верх сторінки
 * «Постачальники» (картка 259).
 *
 * Рушій той самий, що у вікні прорахунку (search_supplier_pool з чесною
 * часткою на джерело), тож результати тут і там збігаються. Різниця одна:
 * поле відкрите всім і не прив'язане до створення прорахунку.
 *
 * ПІД ЧАС ЗАПИТУ ЛУПА СТАЄ КРУТІЛКОЮ, і ознака враховує дебаунс: поки
 * `debounced` відстає від набраного, жоден прапорець запиту ще не піднятий,
 * а пауза вже йде — без цієї умови крутілка на короткі запити не з'являлась би.
 */
const DEBOUNCE_MS = 300;
const LIMIT = 40;
/** Одна стала на «ще нічого»: новий `[]` на кожен рендер зводив би memo нанівець. */
const NO_PRODUCTS: SupplierPoolProduct[] = [];

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SupplierProductSearch({
  className,
  debounceMs = DEBOUNCE_MS,
}: {
  className?: string;
  debounceMs?: number;
}) {
  const [term, setTerm] = React.useState("");
  const [filter, setFilter] = React.useState<PoolFilter>(POOL_FILTER_ALL);
  const debounced = useDebounced(term, debounceMs);
  const enabled = debounced.trim().length >= 2;

  const query = useQuery({
    queryKey: ["supplier-pool", "page", debounced],
    queryFn: () => searchSupplierPool(debounced, { limit: LIMIT }),
    enabled,
    staleTime: 60_000,
  });

  const products = query.data ?? NO_PRODUCTS;
  const visible = React.useMemo(() => filterSupplierPool(products, filter), [products, filter]);
  const pending = term.trim().length >= 2 && (term !== debounced || query.isFetching);

  return (
    <section
      className={cn("rounded-section border border-border/60 bg-card", className)}
      aria-label="Пошук у товарах постачальників"
    >
      <div className="relative p-3">
        {pending ? (
          <Loader2
            className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <Search
            className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <Input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            // Новий запит — новий склад джерел; старий чип міг би сховати все.
            setFilter(POOL_FILTER_ALL);
          }}
          placeholder="Пошук у товарах постачальників: назва або артикул"
          aria-label="Пошук у товарах постачальників"
          className="h-10 rounded-full pl-9 text-sm"
        />
      </div>

      {enabled ? (
        <>
          <SupplierPoolFilterBar products={products} filter={filter} onChange={setFilter} />
          <div className="px-2 pb-2">
            {query.isError ? (
              <div className="px-3 py-6 text-center text-sm">
                <p className="text-destructive">Не вдалося пошукати.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>
                  Спробувати ще
                </Button>
              </div>
            ) : null}
            {!query.isError && query.isPending ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Шукаю…</p>
            ) : null}
            {!query.isError && !query.isPending && visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                У постачальників такого не знайшлось.
              </p>
            ) : null}
            {visible.length > 0 ? (
              <p className="px-3 pt-2 text-2xs text-muted-foreground">
                {pluralUk(visible.length, "товар", "товари", "товарів")}
                {products.length >= LIMIT ? " — показано перші, уточніть запит" : ""}
              </p>
            ) : null}
            {visible.map((product) => (
              <SupplierPoolRow key={product.key} product={product} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

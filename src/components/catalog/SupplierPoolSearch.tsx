/**
 * Пошук по товарах постачальників — вітрина агрегатора (REQ-250#p3).
 *
 * НАВІЩО ОКРЕМИЙ КОМПОНЕНТ, А НЕ ВСТАВКА В CatalogModelPicker. Той пікер
 * спільний: ним живуть прорахунки, дизайн-задачі й ручні замовлення. Дописати
 * туди друге джерело означало б зачепити три потоки одразу заради одного. Тут
 * же нічого наявного не змінюється — панель просто стає поруч.
 *
 * ЩО ЦЕ ДАЄ МЕНЕДЖЕРУ. Ввів назву — бачить, чи є така річ у постачальників, за
 * скільки і в кого, і може відкрити її на їхньому сайті. Раніше для цього треба
 * було відкрити сім сайтів руками.
 *
 * ЦІНА ТУТ ЧЕСНО ПІДПИСАНА. У фідах вона роздрібна (вітрина постачальника), а не
 * наша оптова — тому поруч стоїть підпис «роздріб». Оптова з'явиться, коли
 * приїдуть прайси з кабінетів (§5, p5), і підпис зміниться сам.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Package, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatSupplierPoolPrice,
  searchSupplierPool,
  type SupplierPoolProduct,
} from "@/lib/supplierPool";

/** Пауза перед запитом: менеджер друкує, а не натискає «шукати». */
const DEBOUNCE_MS = 300;

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type SupplierPoolSearchProps = {
  className?: string;
  /** Початковий запит — напр. назва позиції, з якої відкрили панель. */
  initialTerm?: string;
};

export const SupplierPoolSearch: React.FC<SupplierPoolSearchProps> = ({ className, initialTerm = "" }) => {
  const [term, setTerm] = React.useState(initialTerm);
  const debouncedTerm = useDebounced(term, DEBOUNCE_MS);
  const enabled = debouncedTerm.trim().length >= 2;

  const { data, isFetching, error } = useQuery({
    queryKey: ["supplier-pool", debouncedTerm],
    queryFn: () => searchSupplierPool(debouncedTerm),
    enabled,
    staleTime: 60_000,
  });

  const products = data ?? [];

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Пошук у постачальників: назва або артикул"
          className="h-9 rounded-full pl-8 text-sm"
        />
      </div>

      <div className="max-h-[320px] space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
        {!enabled ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Введіть щонайменше дві літери — шукатиму в товарах постачальників.
          </p>
        ) : null}

        {enabled && error ? (
          <p className="px-3 py-6 text-center text-sm text-destructive">
            Не вдалося пошукати. Спробуйте ще раз.
          </p>
        ) : null}

        {enabled && !error && isFetching && products.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Шукаю…</p>
        ) : null}

        {enabled && !error && !isFetching && products.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            У постачальників такого не знайшлось.
          </p>
        ) : null}

        {products.map((product) => (
          <SupplierPoolRow key={product.key} product={product} />
        ))}
      </div>
    </div>
  );
};

const SupplierPoolRow: React.FC<{ product: SupplierPoolProduct }> = ({ product }) => {
  const price = formatSupplierPoolPrice(product);
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/20">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Package className="h-4 w-4 text-muted-foreground" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{product.name}</span>
        {/* Артикул попереду: саме за ним менеджер звіряє товар, і саме він
            обрізався першим, коли стояв після виробника (видно в прев'ю). */}
        <span className="block truncate text-xs text-muted-foreground">
          {[product.article, product.vendor, product.supplierSlug].filter(Boolean).join(" · ")}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {product.variantCount > 1 ? (
          <Badge variant="outline" className="rounded-full border-border/60 px-2 text-2xs">
            {product.variantCount} вар.
          </Badge>
        ) : null}
        {price ? (
          <span className="text-right">
            <span className="block whitespace-nowrap text-sm font-medium tabular-nums">{price}</span>
            <span className="block text-2xs text-muted-foreground">
              {product.priceKind === "retail" ? "роздріб" : "опт"}
            </span>
          </span>
        ) : null}
        {product.url ? (
          <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Відкрити «${product.name}» у постачальника`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
      </span>
    </div>
  );
};

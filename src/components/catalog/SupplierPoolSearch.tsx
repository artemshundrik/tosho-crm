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
 * ЦІНА ТУТ ЧЕСНО ПІДПИСАНА. Де є домовленість (totobi: сувенірка −44%, одяг
 * −40%, «Єдина ціна» −50%), у пулі вже лежить НАША ціна, і підпис каже «наша».
 * Де домовленості ще немає — ціна вітрини й підпис «роздріб». Ціни сайту поруч
 * НЕ показуємо: Артем просив одну цифру, ту, за якою купуємо (08.09.2026).
 * Вихідна ціна нікуди не дівається — вона в `attrs.sitePrice` для звірки.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Package, Search } from "lucide-react";

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

const money = (value: number) =>
  value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Картка товару. Кольори згорнуті всередину: у totobi «Футболка SoftStyle 153»
 * — це 55 окремих рядків фіда, і показувати їх поспіль означає сховати решту
 * знахідок під одним товаром.
 *
 * КОЛІР ВИБИРАЄТЬСЯ, А НЕ ПРОСТО ЧИТАЄТЬСЯ. У фіді фото своє в КОЖНОГО кольору,
 * тож поки колір не вибрано, картка показує перший — і «Футболка Stage» на всі
 * дев'ять кольорів виглядає чорною. Клік по кольору підмінює фото, ціну й
 * артикул на його власні: далі саме цей артикул поїде в замовлення.
 */
const SupplierPoolRow: React.FC<{ product: SupplierPoolProduct }> = ({ product }) => {
  const expandable = product.variantCount > 1;
  const [open, setOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = product.variants.find((variant) => variant.id === selectedId) ?? null;

  const imageUrl = selected?.imageUrl ?? product.imageUrl;
  const article = selected?.article ?? product.article;
  const price =
    selected && selected.price !== null
      ? `${money(selected.price)} ${product.currency === "UAH" ? "грн" : product.currency}`
      : formatSupplierPoolPrice(product);
  const href = selected?.url ?? product.url;
  const unit = product.variantsAreColors ? "кольор." : "вар.";

  return (
    <div className="rounded-lg transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-3 px-2 py-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/20">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Package className="h-4 w-4 text-muted-foreground" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          {/* title, а не Tooltip-компонент: рядків у списку до сорока, і вішати
              на кожен Radix-обгортку означало б сорок зайвих вузлів заради
              підказки, яку читають зрідка. Довгі назви тут ріжуться завжди —
              «Футболка «SOFTSTYLE» чоловіча» вже не влазить. */}
          <span className="block truncate text-sm font-medium" title={product.name}>
            {product.name}
            {selected?.label ? (
              <span className="font-normal text-muted-foreground"> · {selected.label}</span>
            ) : null}
          </span>
          {/* Артикул попереду: саме за ним менеджер звіряє товар, і саме він
              обрізався першим, коли стояв після виробника (видно в прев'ю).
              Доменів буває два — це картка, злита за артикулом: та сама річ у
              нашому магазині й в оптовика. Кожен домен веде на СВІЙ сайт, і
              підказка називає товар його ж словами: картка носить назву
              Аванпринта, і без цього менеджер не впізнає те, що знайшов за
              словом оптовика. */}
          <span className="block truncate text-xs text-muted-foreground">
            {[article, product.vendor].filter(Boolean).join(" · ")}
            {article || product.vendor ? " · " : null}
            {product.sources.map((source, index) => (
              <React.Fragment key={source.supplierSlug}>
                {index > 0 ? " · " : null}
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`«${source.name}» на ${source.supplierSlug}`}
                    className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    {source.supplierSlug}
                  </a>
                ) : (
                  source.supplierSlug
                )}
              </React.Fragment>
            ))}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {expandable ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {product.variantCount} {unit}
              <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            </button>
          ) : null}
          {price ? (
            <span className="text-right">
              <span className="block whitespace-nowrap text-sm font-medium tabular-nums">{price}</span>
              <span className="block text-2xs text-muted-foreground">
                {product.priceKind === "retail" ? "роздріб" : "наша"}
              </span>
            </span>
          ) : null}
          {href ? (
            <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
              <a
                href={href}
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

      {expandable && open ? (
        <div className="mb-2 ml-14 mr-2 flex flex-wrap gap-1.5">
          {product.variants.map((variant) => {
            const isSelected = variant.id === selectedId;
            return (
              <button
                key={variant.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedId(isSelected ? null : variant.id)}
                title={[variant.label, variant.article].filter(Boolean).join(" · ")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border py-0.5 pl-0.5 pr-2 text-2xs transition-colors",
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/30">
                  {variant.imageUrl ? (
                    <img src={variant.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Package className="h-3 w-3" />
                  )}
                </span>
                <span className="max-w-[9rem] truncate">{variant.label ?? "Без підпису"}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

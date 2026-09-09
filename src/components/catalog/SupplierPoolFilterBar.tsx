/**
 * Смуга фільтра й підвал списку підказок (REQ-250#p34).
 *
 * ЧОМУ ОКРЕМИЙ ФАЙЛ. `QuoteItemCommandField` уже 682 рядки, і все, що сюди
 * додається, — це розмітка без власного стану. За правилом ратчета розміру нове
 * йде в окремий модуль, а не дописується в кінець.
 *
 * ЧОМУ ЧИПИ ЛИШЕ ТИХ ДЖЕРЕЛ, ДЕ ЩОСЬ ЗНАЙШЛОСЬ (Артем, 08.09.2026). Постійний
 * ряд із усіх джерел мав би дві вади одразу: він займає майже всю ширину вже на
 * чотирьох постачальниках, а на п'ятому переноситься на другий рядок; і чип із
 * нулем не фільтр, а повідомлення «тут порожньо», яке однаково нічого не
 * робить. Тому ряд рахується з того, що приїхало.
 */

import * as React from "react";
import { Check } from "lucide-react";

import { supplierDisplayName, type SupplierPoolProduct } from "@/lib/supplierPoolRows";
import { cn } from "@/lib/utils";

/** Що зараз відібрано: `null` — усі джерела. */
export type PoolFilter = { source: string | null; pricedOnly: boolean };

export const POOL_FILTER_ALL: PoolFilter = { source: null, pricedOnly: false };

/**
 * Відсів карток під фільтр. Чиста функція навмисно: її ганяють тести, а
 * компонент нижче лише малює.
 *
 * Джерело збігається по БУДЬ-ЯКОМУ з посилань картки, а не лише по її власному
 * слугу: злита картка стоїть у черзі Аванпринта, але та сама річ є і в
 * оптовика — і на чипі «Тотобі» вона мусить лишитись, бо саме звідти її ціна.
 */
export function filterSupplierPool(
  products: SupplierPoolProduct[],
  filter: PoolFilter
): SupplierPoolProduct[] {
  return products.filter((product) => {
    if (filter.pricedOnly && product.priceMin === null) return false;
    if (!filter.source) return true;
    return product.sources.some((source) => source.supplierSlug === filter.source);
  });
}

/** Джерела, що справді приїхали, з кількістю карток у кожному. */
export function supplierSourceOptions(products: SupplierPoolProduct[]): { slug: string; name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    // Злита картка рахується в обох джерелах — вона справді є в обох.
    for (const slug of new Set(product.sources.map((source) => source.supplierSlug))) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([slug, count]) => ({ slug, name: supplierDisplayName(slug), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk"));
}

const chip =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors";

export function SupplierPoolFilterBar({
  products,
  filter,
  onChange,
}: {
  /** НЕвідфільтровані картки: лічильники мають лишатись стабільними. */
  products: SupplierPoolProduct[];
  filter: PoolFilter;
  onChange: (next: PoolFilter) => void;
}) {
  const options = React.useMemo(() => supplierSourceOptions(products), [products]);
  // Один постачальник — фільтрувати нема між чим, ряд був би просто окрасою.
  if (options.length < 2) return null;
  const withoutPrice = products.some((product) => product.priceMin === null);

  return (
    <div className="flex items-center gap-1.5 border-b border-border/60 px-2 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange({ ...filter, source: null })}
          className={cn(chip, filter.source === null
            ? "border-foreground bg-foreground text-background"
            : "border-border/60 text-muted-foreground hover:text-foreground")}
        >
          Усі
          <span className={cn("tabular-nums", filter.source === null ? "text-background/70" : "text-muted-foreground/70")}>
            {products.length}
          </span>
        </button>
        {options.map((option) => {
          const on = filter.source === option.slug;
          return (
            <button
              key={option.slug}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange({ ...filter, source: on ? null : option.slug })}
              className={cn(chip, on
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 text-muted-foreground hover:text-foreground")}
            >
              {option.name}
              <span className={cn("tabular-nums", on ? "text-background/70" : "text-muted-foreground/70")}>
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
      {/* «Лише з ціною» показуємо, лише коли є що ховати: у Аванпринта ціни
          немає навмисно (вона довідкова), і саме його рядки цим і відсіюються. */}
      {withoutPrice ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange({ ...filter, pricedOnly: !filter.pricedOnly })}
          aria-pressed={filter.pricedOnly}
          className={cn(chip, "shrink-0",
            filter.pricedOnly ? "border-border bg-muted text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground")}
        >
          <Check className={cn("h-3 w-3", !filter.pricedOnly && "opacity-30")} />
          лише з ціною
        </button>
      ) : null}
    </div>
  );
}

/**
 * Підвал списку. Три речі, яких у поповері бракувало: скільки показано зі
 * скількох, чиї це ціни й чим керувати з клавіатури.
 *
 * ПІДПИС ЦІН ОДИН НА ВЕСЬ СПИСОК, а не на кожен рядок. Пул віддає в пошук лише
 * наші, закупівельні (роздрібні відсіює `search_supplier_pool`), тож слово
 * «наша» під дванадцятьма цінами — шум. Але без підпису взагалі менеджер не
 * знає, чи це те, що ми платимо, чи те, що платить клієнт.
 */
export function SuggestListFooter({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-2.5 py-1.5 text-2xs text-muted-foreground/80">
      <span className="tabular-nums">
        показано {shown}
        {total > shown ? ` із ${total}` : null}
      </span>
      <span aria-hidden className="h-3 w-px bg-border/60" />
      <span>ціни закупівельні, наші</span>
      <span className="flex-1" />
      <span className="hidden items-center gap-1 sm:flex">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        рядок
      </span>
      <span className="hidden items-center gap-1 sm:flex">
        <Kbd>alt</Kbd>
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
        джерело
      </span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-b-2 border-border bg-background px-1 py-px text-[0.625rem] font-medium leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

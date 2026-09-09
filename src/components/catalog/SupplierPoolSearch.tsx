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
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchSupplierPool } from "@/lib/supplierPool";

import { SupplierPoolRow } from "./SupplierPoolRow";

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

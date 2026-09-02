import { useCallback, useMemo } from "react";

import { needsApprovedRunChoice } from "@/lib/quoteRuns";
import type { QuoteRun } from "@/lib/toshoApi";
import { normalizeUnitLabel } from "@/lib/units";

import type { QuoteMarkupGateRun } from "./QuoteHeaderFlags";

/**
 * Що тримає двері назовні зачиненими — і як довезти до винуватця.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ. `QuoteDetailsPage` під ратчетом розміру, а це
 * самодостатній шматок: три похідні від items/runs і один обробник, що нічого
 * зі сторінки не читає, крім них.
 *
 * ЧОМУ ПОІМЕННО (REQ-175#p61, p64). Лічильник «1 нижче дна» не каже, у котрому
 * з шести тиражів справа: доводиться переглядати всі руками, і лічильник
 * виглядає як помилка. Те саме з вибором погодженого тиражу — без нього
 * замовлення не зробити, а знав про це лише той, хто дивився на конкретну
 * картку товару.
 */
/**
 * Структурний тип, а не імпорт: `QuoteItem` живе локально в
 * `QuoteDetailsPage`, і тягнути його сюди означало б зв'язати модуль зі
 * сторінкою заради трьох полів.
 */
type FlagItem = { id: string; title: string; unit?: string | null };

export function useQuoteHeaderFlags(params: {
  items: FlagItem[];
  runs: QuoteRun[];
  blockingRunIds: string[];
  /** Тиражі, чиї числа гейт ПДВ тримає в браузері (REQ-242). */
  unsavedRunIds: ReadonlySet<string>;
  /** Перемкнути сторінку на «Товари» перед прокруткою. */
  onOpenProducts: () => void;
}) {
  const { items, runs, blockingRunIds, unsavedRunIds, onOpenProducts } = params;

  const blockingRunIdSet = useMemo(() => new Set(blockingRunIds), [blockingRunIds]);

  /** «Куртка софтшел · 50 шт.» — щоб не шукати винуватця очима по сторінці. */
  const describeRun = useCallback(
    (run: QuoteRun, itemById: Map<string, FlagItem>) => {
      const item = run.quote_item_id ? itemById.get(run.quote_item_id) : undefined;
      const qty = Number(run.quantity) || 0;
      return [item?.title, `${qty.toLocaleString("uk-UA")} ${normalizeUnitLabel(item?.unit)}`]
        .filter(Boolean)
        .join(" · ");
    },
    []
  );

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items]);

  const markupGateRuns = useMemo<QuoteMarkupGateRun[]>(() => {
    if (blockingRunIdSet.size === 0) return [];
    return runs
      .filter((run) => run.id && blockingRunIdSet.has(run.id))
      .map((run) => ({
        id: run.id as string,
        label: describeRun(run, itemById),
        rateLabel: `${(Math.round((Number(run.markup_rate) || 0) * 100) / 100).toLocaleString("uk-UA")} %`,
      }));
  }, [blockingRunIdSet, describeRun, itemById, runs]);

  /**
   * Незбережені тиражі — з тим самим ярликом, але замість накрутки показуємо
   * САМЕ ТУ суму, що не доїхала: вона і є предметом розмови.
   */
  const unsavedRuns = useMemo<QuoteMarkupGateRun[]>(() => {
    if (unsavedRunIds.size === 0) return [];
    return runs
      .filter((run) => run.id && unsavedRunIds.has(run.id))
      .map((run) => ({
        id: run.id as string,
        label: describeRun(run, itemById),
        rateLabel: `${(Number(run.unit_price_model) || 0).toLocaleString("uk-UA", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ₴`,
      }));
  }, [describeRun, itemById, runs, unsavedRunIds]);

  const runChoiceItems = useMemo(
    () =>
      items
        .filter((item) =>
          needsApprovedRunChoice(
            runs.filter((run) =>
              run.quote_item_id ? run.quote_item_id === item.id : items.length === 1
            )
          )
        )
        .map((item) => ({ id: item.id, title: item.title })),
    [items, runs]
  );

  /**
   * Довезти до винуватця (REQ-175#p68).
   *
   * Сторінка довга: у прорахунку з трьох товарів проблемний тираж може стояти
   * за два екрани. Вкладка перемикається класом, тож вузол уже в дереві — але
   * кадр на застосування класу все одно потрібен, інакше `scrollIntoView`
   * міряє схований елемент.
   */
  const focusOnPage = useCallback(
    (elementId: string, tone: "warning" | "error" = "warning") => {
      onOpenProducts();
      window.setTimeout(() => {
        const node = document.getElementById(elementId);
        if (!node) return;
        // БЕЗ behavior: "smooth" (REQ-175#p68). Заміряно в браузері: плавний
        // варіант мовчки не робить НІЧОГО — window.scrollY лишається 0, тоді як
        // миттєвий той самий виклик їде на 2075. Мовчазна відмова гірша за
        // стрибок, а «ось воно» тут і так каже підсвітка.
        node.scrollIntoView({ block: "center" });
        node.animate?.(
          [
            {
              boxShadow: `inset 0 0 0 2px hsl(var(--${tone === "error" ? "destructive" : "warning-solid"}))`,
            },
            { boxShadow: "inset 0 0 0 2px transparent" },
          ],
          { duration: 1500, easing: "ease-out" }
        );
      }, 60);
    },
    [onOpenProducts]
  );

  return { blockingRunIdSet, markupGateRuns, unsavedRuns, runChoiceItems, focusOnPage };
}

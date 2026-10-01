import { useCallback, useEffect, useRef } from "react";
import { readStoredWidth, writeStoredWidth } from "@/lib/storedWidth";
import {
  QUOTES_COLUMNS,
  QUOTES_COLUMN_IDS,
  QUOTES_COLUMNS_STORAGE_KEY,
  QUOTES_FIXED_COLUMNS_PX,
  QUOTES_FLEX_MIN_PX,
  resolveQuotesColumnWidths,
  type QuotesColumnId,
  type QuotesColumnWidths,
} from "@/features/quotes/quotes-page/quotesTableColumns";

export type QuotesColumnBounds = { now: number; min: number; max: number };

export type QuotesTableColumnsController = {
  /** Ref-callback обгортки, всередині якої стоїть таблиця (або її скелет). */
  containerRef: (element: HTMLElement | null) => void;
  measure: (id: QuotesColumnId) => QuotesColumnBounds;
  /** Ширина колонки під час руху: пишеться в CSS-змінну, повз React. */
  preview: (id: QuotesColumnId, px: number) => void;
  /** Зафіксувати й запам'ятати. */
  commit: (id: QuotesColumnId, px: number) => void;
  /** Повернути типову ширину. */
  reset: (id: QuotesColumnId) => void;
};

const storageKey = (id: QuotesColumnId) => `${QUOTES_COLUMNS_STORAGE_KEY}:${id}`;

/**
 * Ширини колонок таблиці прорахунків. Живуть у CSS-змінних на обгортці, тож
 * перетягування межі не перемальовує таблицю: React про ширини не знає взагалі.
 * Збережене в localStorage — побажання; фактичні ширини перераховуються за
 * шириною вікна (ResizeObserver), щоб прокрутки вбік не було ніколи.
 */
export function useQuotesTableColumns(): QuotesTableColumnsController {
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const wantedRef = useRef<Partial<Record<QuotesColumnId, number>> | null>(null);
  const effectiveRef = useRef<QuotesColumnWidths | null>(null);

  const readWanted = () => {
    if (!wantedRef.current) {
      const wanted: Partial<Record<QuotesColumnId, number>> = {};
      for (const id of QUOTES_COLUMN_IDS) {
        const value = readStoredWidth(storageKey(id));
        if (value !== null) wanted[id] = value;
      }
      wantedRef.current = wanted;
    }
    return wantedRef.current;
  };

  const writeVars = (widths: QuotesColumnWidths) => {
    effectiveRef.current = widths;
    const element = elementRef.current;
    if (!element) return;
    for (const id of QUOTES_COLUMN_IDS) element.style.setProperty(`--qcol-${id}`, `${widths[id]}px`);
  };

  const recompute = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    writeVars(resolveQuotesColumnWidths(readWanted(), element.clientWidth));
  }, []);

  const containerRef = useCallback(
    (element: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      elementRef.current = element;
      if (!element) return;
      recompute();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(recompute);
      observer.observe(element);
      observerRef.current = observer;
    },
    [recompute]
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const effective = (): QuotesColumnWidths => {
    const element = elementRef.current;
    return effectiveRef.current ?? resolveQuotesColumnWidths(readWanted(), element?.clientWidth ?? 0);
  };

  const measure = (id: QuotesColumnId): QuotesColumnBounds => {
    const widths = effective();
    const width = elementRef.current?.clientWidth ?? 0;
    const others = QUOTES_COLUMN_IDS.reduce((acc, key) => (key === id ? acc : acc + widths[key]), 0);
    const room = width - QUOTES_FIXED_COLUMNS_PX - QUOTES_FLEX_MIN_PX - others;
    const min = QUOTES_COLUMNS[id].min;
    return { now: widths[id], min, max: Math.max(min, room) };
  };

  const preview = (id: QuotesColumnId, px: number) => {
    writeVars({ ...effective(), [id]: Math.round(px) });
  };

  const commit = (id: QuotesColumnId, px: number) => {
    const rounded = Math.round(px);
    wantedRef.current = { ...readWanted(), [id]: rounded };
    writeStoredWidth(storageKey(id), rounded);
    writeVars({ ...effective(), [id]: rounded });
  };

  const reset = (id: QuotesColumnId) => {
    const next = { ...readWanted() };
    delete next[id];
    wantedRef.current = next;
    writeStoredWidth(storageKey(id), null);
    recompute();
  };

  return { containerRef, measure, preview, commit, reset };
}

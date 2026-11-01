import { useCallback, useEffect, useRef, type RefObject } from "react";

import { readStoredWidth, writeStoredWidth } from "@/lib/storedWidth";
import {
  resolveTableColumnWidths,
  type TableColumnWidths,
  type TableColumnsSpec,
} from "@/components/app/table-columns/tableColumns";

export type TableColumnBounds = { now: number; min: number; max: number };

export type TableColumnsController<Id extends string> = {
  /** Ref-callback обгортки, всередині якої стоїть таблиця (або її скелет). */
  containerRef: (element: HTMLElement | null) => void;
  measure: (id: Id) => TableColumnBounds;
  /** Ширина колонки під час руху: пишеться в CSS-змінну, повз React. */
  preview: (id: Id, px: number) => void;
  /** Зафіксувати й запам'ятати. */
  commit: (id: Id, px: number) => void;
  /** Повернути типову ширину. */
  reset: (id: Id) => void;
};

/**
 * Те, що потрібно ручкам ширини, — без `containerRef`. Окремо навмисно: що стоїть
 * у `ref={}`, React Compiler вважає рефом, а з ним і весь об'єкт, звідки його
 * взято, — і `controller={...}` у заголовку ставав «читанням рефа під час рендера».
 */
export type TableColumnsResizer<Id extends string> = Omit<TableColumnsController<Id>, "containerRef">;

const columnStorageKey = <Id extends string>(spec: TableColumnsSpec<Id>, id: Id) => `${spec.storageKey}:${id}`;

function readWantedWidths<Id extends string>(spec: TableColumnsSpec<Id>, wantedRef: RefObject<Partial<Record<Id, number>> | null>) {
  if (!wantedRef.current) {
    const wanted: Partial<Record<Id, number>> = {};
    for (const id of spec.ids) {
      const value = readStoredWidth(columnStorageKey(spec, id));
      if (value !== null) wanted[id] = value;
    }
    wantedRef.current = wanted;
  }
  return wantedRef.current;
}

function writeWidthVars<Id extends string>(
  spec: TableColumnsSpec<Id>,
  elementRef: RefObject<HTMLElement | null>,
  effectiveRef: RefObject<TableColumnWidths<Id> | null>,
  widths: TableColumnWidths<Id>
) {
  effectiveRef.current = widths;
  const element = elementRef.current;
  if (!element) return;
  for (const id of spec.ids) element.style.setProperty(`--${spec.varPrefix}-${id}`, `${widths[id]}px`);
}

/**
 * Ширини колонок таблиці. Живуть у CSS-змінних на обгортці, тож перетягування
 * межі не перемальовує таблицю: React про ширини не знає взагалі. Збережене в
 * localStorage — побажання; фактичні ширини перераховуються за шириною вікна
 * (ResizeObserver), щоб прокрутки вбік не було ніколи.
 *
 * `spec` має бути сталим (оголошеним поза компонентом).
 */
export function useTableColumns<Id extends string>(spec: TableColumnsSpec<Id>): TableColumnsController<Id> {
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const wantedRef = useRef<Partial<Record<Id, number>> | null>(null);
  const effectiveRef = useRef<TableColumnWidths<Id> | null>(null);

  const storageKey = (id: Id) => columnStorageKey(spec, id);
  const readWanted = () => readWantedWidths(spec, wantedRef);
  const writeVars = (widths: TableColumnWidths<Id>) => writeWidthVars(spec, elementRef, effectiveRef, widths);

  const recompute = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    writeWidthVars(spec, elementRef, effectiveRef, resolveTableColumnWidths(spec, readWantedWidths(spec, wantedRef), element.clientWidth));
  }, [spec]);

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

  const effective = (): TableColumnWidths<Id> =>
    effectiveRef.current ?? resolveTableColumnWidths(spec, readWanted(), elementRef.current?.clientWidth ?? 0);

  const measure = (id: Id): TableColumnBounds => {
    const widths = effective();
    const width = elementRef.current?.clientWidth ?? 0;
    const others = spec.ids.reduce((acc, key) => (key === id ? acc : acc + widths[key]), 0);
    const room = width - spec.fixedPx - spec.flexMinPx - others;
    const min = spec.columns[id].min;
    return { now: widths[id], min, max: Math.max(min, room) };
  };

  const preview = (id: Id, px: number) => {
    writeVars({ ...effective(), [id]: Math.round(px) });
  };

  const commit = (id: Id, px: number) => {
    const rounded = Math.round(px);
    wantedRef.current = { ...readWanted(), [id]: rounded };
    writeStoredWidth(storageKey(id), rounded);
    writeVars({ ...effective(), [id]: rounded });
  };

  const reset = (id: Id) => {
    const next = { ...readWanted() };
    delete next[id];
    wantedRef.current = next;
    writeStoredWidth(storageKey(id), null);
    recompute();
  };

  return { containerRef, measure, preview, commit, reset };
}

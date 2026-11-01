import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Стан прев'ю над списком: яка справа відкрита, сусіди для J/K і пробіл.
 *
 * Пробіл відкриває прев'ю рядка під курсором (або рядка у фокусі) і закриває
 * його повторним натиском — як «швидкий перегляд» у Finder. Рядок позначається
 * атрибутом `data-peek-id`: за ним хук знаходить рядок у фокусі й прокручує
 * список до справи, на яку перейшли J/K.
 *
 * Справа зникла зі списку (фільтр, оновлення) — прев'ю закривається само, щоб
 * не показувати те, чого в списку вже немає.
 *
 * Закриття плавне: `closing` тримає панель змонтованою, поки вона виїжджає
 * (`PEEK_EXIT_MS`, `duration-base`), і лише тоді `item` стає null. Інакше
 * панель, що плавно виїхала, зникала б різко.
 */
const PEEK_EXIT_MS = 160;

export function useEntityPeek<T>(items: readonly T[], getId: (item: T) => string) {
  const [peekId, setPeekId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverIdRef = useRef<string | null>(null);

  const index = peekId ? items.findIndex((item) => getId(item) === peekId) : -1;
  const item = index >= 0 ? items[index] : null;

  const open = useCallback((id: string | null) => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = null;
    setClosing(false);
    setPeekId(id);
  }, []);

  const close = useCallback(() => {
    if (exitTimerRef.current) return;
    setClosing(true);
    exitTimerRef.current = setTimeout(() => open(null), PEEK_EXIT_MS);
  }, [open]);

  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  // Справа зникла зі списку (фільтр, видалення) — панель просто не показується;
  // скидати стан ефектом не треба, це похідне значення.
  const shownId = index >= 0 ? peekId : null;

  const toggle = useCallback(
    (id: string) => (shownId === id && !closing ? close() : open(id)),
    [shownId, closing, close, open]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      // Пробіл у полі — це пробіл, а на кнопці чи прапорці — її натиск.
      if (target?.isContentEditable || target?.closest("input, textarea, select, button, a, [role=checkbox], [role=menuitem]")) {
        return;
      }
      const id = target?.closest<HTMLElement>("[data-peek-id]")?.dataset.peekId ?? hoverIdRef.current;
      if (!id) return;
      event.preventDefault();
      toggle(id);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const goTo = useCallback(
    (delta: number) => {
      const next = index >= 0 ? items[index + delta] : undefined;
      if (!next) return;
      const id = getId(next);
      open(id);
      document.querySelector(`[data-peek-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
    },
    [getId, index, items, open]
  );

  return {
    /** Відкрита справа; поки панель виїжджає — уже null, щоб рядок не світився. */
    peekId: closing ? null : shownId,
    item,
    closing,
    open,
    toggle,
    close,
    next: index >= 0 && index < items.length - 1 ? () => goTo(1) : undefined,
    prev: index > 0 ? () => goTo(-1) : undefined,
    /** Для `onMouseEnter` / `onMouseLeave` рядка: пробіл бере рядок під курсором. */
    setHovered: useCallback((id: string | null) => {
      hoverIdRef.current = id;
    }, []),
  };
}

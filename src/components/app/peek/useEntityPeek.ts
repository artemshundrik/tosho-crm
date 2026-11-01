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
 */
export function useEntityPeek<T>(items: readonly T[], getId: (item: T) => string) {
  const [peekId, setPeekId] = useState<string | null>(null);
  const hoverIdRef = useRef<string | null>(null);

  const index = peekId ? items.findIndex((item) => getId(item) === peekId) : -1;
  const item = index >= 0 ? items[index] : null;

  useEffect(() => {
    if (peekId && index < 0) setPeekId(null);
  }, [peekId, index]);

  const toggle = useCallback((id: string) => setPeekId((current) => (current === id ? null : id)), []);

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
      setPeekId(id);
      document.querySelector(`[data-peek-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
    },
    [getId, index, items]
  );

  return {
    peekId,
    item,
    open: setPeekId,
    toggle,
    close: useCallback(() => setPeekId(null), []),
    next: index >= 0 && index < items.length - 1 ? () => goTo(1) : undefined,
    prev: index > 0 ? () => goTo(-1) : undefined,
    /** Для `onMouseEnter` / `onMouseLeave` рядка: пробіл бере рядок під курсором. */
    setHovered: useCallback((id: string | null) => {
      hoverIdRef.current = id;
    }, []),
  };
}

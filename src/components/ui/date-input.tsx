import * as React from "react";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input, type InputControlSize } from "@/components/ui/input";

/**
 * Поле дати з видимою іконкою, яка відкриває НАТИВНИЙ календар браузера.
 *
 * Навіщо окремий компонент: у `src/index.css` глобально сховано
 * `::-webkit-calendar-picker-indicator` (opacity 0 + display none) — інакше
 * системна іконка ламала верстку контролів. Побічний ефект: у `<input type="date">`
 * зникає єдина точка, якою відкривався календар, і поле перетворюється на
 * набивання цифр руками. Ця кнопка повертає календар, не повертаючи системну іконку.
 *
 * `showPicker()` вимагає жесту користувача — клік ним і є. Там, де його немає
 * (Safari < 16), лишається фокус на полі: людина принаймні бачить, куди друкувати.
 */
const DateInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type"> & { controlSize?: InputControlSize }
>(({ className, disabled, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLInputElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  const openPicker = React.useCallback(() => {
    const node = innerRef.current;
    if (!node || node.disabled) return;
    try {
      if (typeof node.showPicker === "function") node.showPicker();
      else node.focus();
    } catch {
      // showPicker кидає, якщо браузер не вважає виклик жестом користувача.
      node.focus();
    }
  }, []);

  return (
    <div className="relative">
      <Input
        {...props}
        type="date"
        disabled={disabled}
        ref={setRefs}
        className={cn("pr-9", className)}
      />
      {/* inset-y-0 + flex замість -translate-y-1/2: проєкт на Tailwind v4, де
          центрування живе у властивості translate і v3-рецепти з нею конфліктують. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Відкрити календар"
        onClick={openPicker}
        disabled={disabled}
        className={cn(
          "absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-xl text-muted-foreground",
          "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <CalendarDays className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
});
DateInput.displayName = "DateInput";

export { DateInput };

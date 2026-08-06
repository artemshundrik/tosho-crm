import * as React from "react";
import { CalendarDays, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input, type InputControlSize } from "@/components/ui/input";

/**
 * Поля дати й часу з видимою іконкою, яка відкриває НАТИВНИЙ пікер браузера.
 *
 * Навіщо: у `src/index.css` глобально сховано `::-webkit-calendar-picker-indicator`
 * (`opacity: 0; display: none`) одразу для `input[type=date]` і `input[type=time]`
 * — інакше системна іконка ламала висоту й вирівнювання контролів. Побічний
 * ефект: зникає єдина точка, якою відкривався пікер. Клік по самому полю його
 * НЕ відкриває — лише ставить курсор у сегмент. Тобто поле перетворюється на
 * набивання цифр руками, і виглядає це як «календаря/годинника немає».
 *
 * Ця кнопка повертає пікер, не повертаючи системну іконку. `showPicker()`
 * вимагає жесту користувача — клік ним і є. Де його немає (Safari < 16) або де
 * браузер не зарахував виклик за жест, лишається фокус на полі.
 */
type PickerInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  controlSize?: InputControlSize;
};

function createPickerInput(type: "date" | "time", Icon: typeof CalendarDays, label: string) {
  const Component = React.forwardRef<HTMLInputElement, PickerInputProps>(
    ({ className, disabled, ...props }, forwardedRef) => {
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
          node.focus();
        }
      }, []);

      return (
        <div className="relative">
          <Input {...props} type={type} disabled={disabled} ref={setRefs} className={cn("pr-9", className)} />
          {/* inset-y-0 + flex замість -translate-y-1/2: проєкт на Tailwind v4, де
              центрування живе у властивості translate і v3-рецепти з нею конфліктують.
              Без власного радіуса: поле буває і rounded-md (controlSize sm), і
              rounded-xl (lg), а кнопка прозора — фіксований радіус тут лише б розʼїхався. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={label}
            onClick={openPicker}
            disabled={disabled}
            className={cn(
              "absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground",
              "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        </div>
      );
    }
  );
  return Component;
}

const DateInput = createPickerInput("date", CalendarDays, "Відкрити календар");
DateInput.displayName = "DateInput";

const TimeInput = createPickerInput("time", Clock, "Відкрити вибір часу");
TimeInput.displayName = "TimeInput";

export { DateInput, TimeInput };

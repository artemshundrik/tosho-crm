import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { uk } from "date-fns/locale";
import { CalendarDays, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input, type InputControlSize } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { DateQuickActions } from "@/components/ui/date-quick-actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Поля дати й часу з видимою іконкою, яка відкриває пікер.
 *
 * ЧОМУ ВЗАГАЛІ ОКРЕМИЙ КОМПОНЕНТ: у `src/index.css` глобально сховано
 * `::-webkit-calendar-picker-indicator` (`opacity: 0; display: none`) одразу для
 * `input[type=date]` і `input[type=time]` — інакше системна іконка ламала висоту
 * контролів. Побічний ефект: зникає єдина точка, якою відкривався пікер, і поле
 * перетворюється на набивання цифр руками.
 *
 * ЧОМУ САМЕ ТАК, А НЕ ІНАКШЕ (рішення 2026-08-06): у CRM жили два несумісні
 * патерни — наш Popover з `Calendar` і швидкими діями («Завтра», «Тиждень») і
 * голий нативний інпут. Вони не конкуренти: перший виграє там, де думають
 * відносно («нагадай через тиждень»), другий — там, де знають точну дату
 * («народився 15.03.1988»). Тому вони ЗЛИТІ в один контрол: саме поле лишається
 * нативним (набір із клавіатури, на мобільному — системне колесо), а іконка
 * відкриває НАШ календар зі швидкими діями. Один вигляд і обидва сценарії.
 */
type PickerInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  controlSize?: InputControlSize;
};

/**
 * Записати значення так, щоб React побачив звичайний onChange.
 *
 * Календар живе поза інпутом, а всі виклики компонента вже написані під
 * `onChange={(e) => setX(e.target.value)}`. Замість того щоб міняти API у 36
 * місцях (і плодити другий проп поруч із onChange), ставимо значення нативним
 * сеттером і кидаємо `input` — React ловить його штатно й кличе той самий
 * onChange. Просте присвоєння `node.value = …` React НЕ помітить: він тримає
 * власний кеш попереднього значення на DOM-вузлі.
 */
function commitNativeValue(node: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(node, value);
  else node.value = value;
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

function useForwardedInputRef(forwardedRef: React.ForwardedRef<HTMLInputElement>) {
  const innerRef = React.useRef<HTMLInputElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );
  return { innerRef, setRefs };
}

const ICON_BUTTON_CLASS = cn(
  // inset-y-0 + flex замість -translate-y-1/2: проєкт на Tailwind v4, де
  // центрування живе у властивості translate і v3-рецепти з нею конфліктують.
  // Без власного радіуса: поле буває і rounded-md (controlSize sm), і rounded-xl
  // (lg), а кнопка прозора — фіксований радіус тут лише б розʼїхався.
  "absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground",
  "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
  "disabled:pointer-events-none disabled:opacity-50"
);

/** Поле дати: набір із клавіатури + наш календар зі швидкими діями. */
const DateInput = React.forwardRef<HTMLInputElement, PickerInputProps>(
  ({ className, disabled, ...props }, forwardedRef) => {
    const { innerRef, setRefs } = useForwardedInputRef(forwardedRef);
    const [open, setOpen] = React.useState(false);

    const rawValue = typeof props.value === "string" ? props.value : "";
    const selected = React.useMemo(() => {
      if (!rawValue) return undefined;
      const parsed = parse(rawValue, "yyyy-MM-dd", new Date());
      return isValid(parsed) ? parsed : undefined;
    }, [rawValue]);

    // Роки в випадайці: календар має діставати і до дат народження, і до
    // договорів наперед. Межі рахуємо від обраного значення, а не лише від
    // «сьогодні» — інакше вже збережена дата 1988 року в списку відсутня.
    const currentYear = new Date().getFullYear();
    const selectedYear = selected?.getFullYear() ?? currentYear;
    const fromYear = Math.min(currentYear - 80, selectedYear);
    const toYear = Math.max(currentYear + 10, selectedYear);

    const commit = React.useCallback((date: Date | null) => {
      const node = innerRef.current;
      if (node) commitNativeValue(node, date ? format(date, "yyyy-MM-dd") : "");
      setOpen(false);
    }, [innerRef]);

    return (
      <div className="relative">
        <Input {...props} type="date" disabled={disabled} ref={setRefs} className={cn("pr-9", className)} />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" tabIndex={-1} aria-label="Відкрити календар" disabled={disabled} className={ICON_BUTTON_CLASS}>
              <CalendarDays className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-fit max-w-[calc(100vw-2rem)] p-0" align="end">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              onSelect={(date) => commit(date ?? null)}
              captionLayout="dropdown-buttons"
              fromYear={fromYear}
              toYear={toYear}
              locale={uk}
              initialFocus
            />
            <DateQuickActions onSelect={(date) => commit(date)} />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);
DateInput.displayName = "DateInput";

/**
 * Поле часу: набір із клавіатури + нативний системний вибір часу.
 *
 * Свого пікера часу в проєкті немає, та він і не потрібен — швидких дій на
 * кшталт «Завтра» для години не буває, а нативний уже дає і колесо на мобільному,
 * і контроль формату.
 */
const TimeInput = React.forwardRef<HTMLInputElement, PickerInputProps>(
  ({ className, disabled, ...props }, forwardedRef) => {
    const { innerRef, setRefs } = useForwardedInputRef(forwardedRef);

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
    }, [innerRef]);

    return (
      <div className="relative">
        <Input {...props} type="time" disabled={disabled} ref={setRefs} className={cn("pr-9", className)} />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Відкрити вибір часу"
          onClick={openPicker}
          disabled={disabled}
          className={ICON_BUTTON_CLASS}
        >
          <Clock className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }
);
TimeInput.displayName = "TimeInput";

export { DateInput, TimeInput };

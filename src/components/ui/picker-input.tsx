import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { uk } from "date-fns/locale";
import { CalendarDays, Clock, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

type DateInputProps = PickerInputProps & {
  /**
   * Показати блок часу в панелі. Поки вимкнено за замовчуванням: чи зливати
   * дату з часом в одне поле — окреме рішення, і поки воно не ухвалене,
   * поведінка наявних місць не змінюється.
   */
  withTime?: boolean;
  /** Значення часу «HH:MM» для блоку часу. */
  timeValue?: string;
  onTimeChange?: (next: string) => void;
  /** Пресети робочих годин під полем часу. */
  timePresets?: string[];
  /**
   * Режим чернетки: панель не застосовує вибір одразу, а показує
   * «Скасувати / Зберегти». Для тригерів, які пишуть у базу самі.
   */
  draft?: boolean;
  onDraftCommit?: () => void | Promise<void>;
  /** Запит у дорозі: панель не приймає кліків, кнопка показує спінер. */
  saving?: boolean;
};

const DEFAULT_TIME_PRESETS = ["10:00", "14:00", "18:00"];

/**
 * Геометрія панелі — під найширший стан, а не під поточний вміст.
 *
 * 320px мінус поля 12px з боків = 296px. Це рівно три колонки швидких дій по
 * 94px із зазорами 6px, тобто найдовше «Очистити» влазить із запасом і сітка
 * ніколи не переноситься. Ширина фіксована в усіх станах: змінюється лише
 * висота, тож панель виглядає однаково в будь-якій формі.
 */
const PANEL_WIDTH_CLASS = "w-[320px] p-0";

/**
 * Захист від обрізання краєм вікна — усі чотири боки.
 *
 * `collisionPadding` тримає зазор від краю: без нього Radix ставить панель
 * впритул і тінь зрізається. `sticky="always"` не дає їй відірватись від поля
 * при прокрутці, `hideWhenDetached` ховає її, якщо поле виїхало зі скрол-контейнера
 * (у Фінансах панелі мають власний `overflow-y`, і без цього панель зависала б
 * посеред екрана без прив'язки).
 *
 * По висоті працює база `PopoverContent`: `max-h` від
 * `--radix-popover-content-available-height` плюс `overflow-y-auto` — на низькому
 * екрані панель стискається і скролиться всередині, а не вилазить за вікно.
 * Порталювання лишаємо ввімкненим (дефолт): без нього будь-який предок з
 * `overflow: hidden` обріже панель незалежно від колізій.
 */
const COLLISION_PROPS = {
  sideOffset: 6,
  collisionPadding: 12,
  sticky: "always",
  hideWhenDetached: true,
} as const;

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

/**
 * Свій підпис порожнього поля замість браузерного.
 *
 * На `<input type=date|time>` НЕ МОЖНА поставити placeholder: підказку формату
 * («дд.мм.рррр», «--:--») малює сам браузер за локаллю ОС. Тому вона в кожного
 * своя, латиницею і різна для дати й часу — рівно те, що виглядало неохайно.
 *
 * Прийом: поки значення порожнє і поле не у фокусі — гасимо текст самого інпута
 * (`text-transparent`) і кладемо поверх власний підпис. У фокусі підпис зникає,
 * і людина бачить рідні сегменти, у які друкує. Оверлей не ловить кліки, тож
 * поле й іконка працюють як завжди.
 */
const PLACEHOLDER_TEXT = { date: "дд.мм.рррр", time: "гг:хв" } as const;

/** Відступ підпису мусить збігатися з падінгом інпута — він залежить від розміру. */
const PLACEHOLDER_POSITION: Record<InputControlSize, string> = {
  sm: "left-2.5 text-xs",
  md: "left-3 text-sm",
  lg: "left-3 text-sm",
};

function useEmptyPlaceholder(params: {
  kind: "date" | "time";
  value: React.ComponentProps<"input">["value"];
  placeholder?: string;
  controlSize: InputControlSize;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}) {
  const [focused, setFocused] = React.useState(false);
  const isEmpty = !(typeof params.value === "string" ? params.value : "");
  const visible = isEmpty && !focused;

  return {
    visible,
    text: params.placeholder ?? PLACEHOLDER_TEXT[params.kind],
    className: PLACEHOLDER_POSITION[params.controlSize],
    handlers: {
      onFocus: (event: React.FocusEvent<HTMLInputElement>) => {
        setFocused(true);
        params.onFocus?.(event);
      },
      onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
        setFocused(false);
        params.onBlur?.(event);
      },
    },
  };
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
const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      className,
      disabled,
      withTime = false,
      timeValue = "",
      onTimeChange,
      timePresets = DEFAULT_TIME_PRESETS,
      draft = false,
      onDraftCommit,
      saving = false,
      controlSize = "lg",
      placeholder,
      ...props
    },
    forwardedRef
  ) => {
    const { innerRef, setRefs } = useForwardedInputRef(forwardedRef);
    const [open, setOpen] = React.useState(false);
    const hint = useEmptyPlaceholder({
      kind: "date",
      value: props.value,
      placeholder,
      controlSize,
      onFocus: props.onFocus,
      onBlur: props.onBlur,
    });

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

    const commit = React.useCallback(
      (date: Date | null) => {
        const node = innerRef.current;
        if (node) commitNativeValue(node, date ? format(date, "yyyy-MM-dd") : "");
        // У режимі чернетки панель лишається відкритою: рішення застосує «Зберегти».
        if (!draft) setOpen(false);
      },
      [innerRef, draft]
    );

    return (
      <div className="relative">
        <Input
          {...props}
          {...hint.handlers}
          type="date"
          controlSize={controlSize}
          disabled={disabled}
          ref={setRefs}
          className={cn("pr-9", hint.visible && "text-transparent", className)}
        />
        {hint.visible ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 flex items-center text-muted-foreground",
              hint.className
            )}
          >
            {hint.text}
          </span>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" tabIndex={-1} aria-label="Відкрити календар" disabled={disabled} className={ICON_BUTTON_CLASS}>
              <CalendarDays className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className={PANEL_WIDTH_CLASS} {...COLLISION_PROPS}>
            <div className={cn(saving && "pointer-events-none select-none opacity-60")}>
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
                classNames={{
                  // «Сьогодні» — лише крапка під числом, без заливки й обводки.
                  // Рамка сперечалась із заливкою обраного дня, коли це один день.
                  day_today:
                    "font-semibold text-primary relative after:absolute after:bottom-1.5 after:left-0 after:right-0 after:mx-auto after:h-1 after:w-1 after:rounded-full after:bg-current after:content-[''] aria-selected:!bg-primary aria-selected:!text-primary-foreground aria-selected:after:bg-primary-foreground",
                  // Недоступний день закреслюємо: бліде в календарі вже означає
                  // «інший місяць», два різні сенси одним прийомом читались би як помилка.
                  day_disabled: "text-muted-foreground/60 line-through",
                }}
              />

              <div className="flex flex-col gap-3 border-t border-border/60 p-3">
                {withTime ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground">Час</span>
                    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-1.5">
                      <TimeInput
                        controlSize="sm"
                        className="h-[34px] pr-8 text-sm font-semibold tabular-nums"
                        value={timeValue}
                        onChange={(event) => onTimeChange?.(event.target.value)}
                      />
                      <div className="grid grid-cols-3 gap-1.5">
                        {timePresets.map((preset) => (
                          <Button
                            key={preset}
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={cn(
                              "h-[30px] w-full justify-center rounded-[9px] border px-1 text-xs font-medium tabular-nums",
                              preset === timeValue
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/60 hover:border-primary hover:text-primary"
                            )}
                            onClick={() => onTimeChange?.(preset)}
                          >
                            {preset}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground">Швидко</span>
                  <DateQuickActions flush onSelect={(date) => commit(date)} />
                </div>
              </div>
            </div>

            {draft ? (
              <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-3">
                <Button type="button" variant="outline" size="sm" className="h-[34px]" disabled={saving} onClick={() => setOpen(false)}>
                  Скасувати
                </Button>
                <Button type="button" size="sm" className="h-[34px] gap-1.5" disabled={saving} onClick={() => void onDraftCommit?.()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  {saving ? "Зберігаємо" : "Зберегти"}
                </Button>
              </div>
            ) : null}
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
  ({ className, disabled, controlSize = "lg", placeholder, ...props }, forwardedRef) => {
    const { innerRef, setRefs } = useForwardedInputRef(forwardedRef);
    const hint = useEmptyPlaceholder({
      kind: "time",
      value: props.value,
      placeholder,
      controlSize,
      onFocus: props.onFocus,
      onBlur: props.onBlur,
    });

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
        <Input
          {...props}
          {...hint.handlers}
          type="time"
          controlSize={controlSize}
          disabled={disabled}
          ref={setRefs}
          className={cn("pr-9", hint.visible && "text-transparent", className)}
        />
        {hint.visible ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 flex items-center text-muted-foreground",
              hint.className
            )}
          >
            {hint.text}
          </span>
        ) : null}
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

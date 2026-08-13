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
 * Поля дати, часу й дати-часу з єдиною панеллю.
 *
 * ЧОМУ ВЗАГАЛІ ОКРЕМИЙ КОМПОНЕНТ: у `src/index.css` глобально сховано
 * `::-webkit-calendar-picker-indicator` — інакше системна іконка ламала висоту
 * контролів. Побічний ефект: зникає єдина точка, якою відкривався пікер.
 *
 * ЧОМУ ПОЛЕ НАТИВНЕ, А КАЛЕНДАР СВІЙ: у CRM жили два несумісні патерни — наш
 * Popover зі швидкими діями і голий нативний інпут. Вони не конкуренти: перший
 * виграє там, де думають відносно («нагадай через тиждень»), другий — там, де
 * знають точну дату («народився 15.03.1988»). Тому злиті: поле лишається
 * нативним (набір із клавіатури, системне колесо на мобільному), а іконка
 * відкриває наш календар.
 */

type PickerKind = "date" | "time" | "datetime-local";

type PickerInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  controlSize?: InputControlSize;
};

/** Робоча година за замовчуванням, коли дату обрали, а часу ще немає. */
const DEFAULT_TIME = "10:00";
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
 * при прокрутці, `hideWhenDetached` ховає її, якщо поле виїхало зі
 * скрол-контейнера (у Фінансах панелі мають власний `overflow-y`).
 *
 * По висоті працює база `PopoverContent`: `max-h` від
 * `--radix-popover-content-available-height` плюс `overflow-y-auto` — на низькому
 * екрані панель стискається і скролиться всередині. Порталювання лишаємо
 * ввімкненим (дефолт): без нього будь-який предок з `overflow: hidden` обріже
 * панель незалежно від колізій.
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
 * Календар живе поза інпутом, а всі виклики вже написані під
 * `onChange={(e) => setX(e.target.value)}`. Ставимо значення нативним сеттером і
 * кидаємо `input` — React ловить його штатно. Просте `node.value = …` він НЕ
 * помітить: тримає власний кеш попереднього значення на DOM-вузлі.
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
 * На `<input type=date|time|datetime-local>` НЕ МОЖНА поставити placeholder:
 * підказку формату малює сам браузер за локаллю ОС. Тому вона в кожного своя й
 * латиницею. Поки значення порожнє і поле не у фокусі — гасимо текст інпута
 * (`text-transparent`) і кладемо поверх власний підпис.
 *
 * Умова «не у фокусі» обовʼязкова: під час набору невалідна часткова дата дає
 * порожнє value, і без неї підпис вилазив би поверх того, що друкують.
 */
const PLACEHOLDER_TEXT: Record<PickerKind, string> = {
  date: "дд.мм.рррр",
  time: "гг:хв",
  "datetime-local": "дд.мм.рррр, гг:хв",
};

/** Відступ підпису мусить збігатися з падінгом інпута — він залежить від розміру. */
const PLACEHOLDER_POSITION: Record<InputControlSize, string> = {
  sm: "left-2.5 text-xs",
  md: "left-3 text-sm",
  lg: "left-3 text-sm",
};

function useEmptyPlaceholder(params: {
  kind: PickerKind;
  value: React.ComponentProps<"input">["value"];
  placeholder?: string;
  controlSize: InputControlSize;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}) {
  const [focused, setFocused] = React.useState(false);
  const isEmpty = !(typeof params.value === "string" ? params.value : "");

  return {
    visible: isEmpty && !focused,
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

function EmptyHint({ hint }: { hint: ReturnType<typeof useEmptyPlaceholder> }) {
  if (!hint.visible) return null;
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-y-0 flex items-center text-muted-foreground", hint.className)}
    >
      {hint.text}
    </span>
  );
}

/** Спільна панель: календар → (час) → швидкі дії → (підтвердження). */
function PickerPanel({
  selected,
  onPickDate,
  timeValue,
  onPickTime,
  timePresets,
  draft,
  onDraftCommit,
  onDraftCancel,
  saving,
}: {
  selected?: Date;
  onPickDate: (date: Date | null) => void;
  /** undefined — блок часу не показуємо взагалі. */
  timeValue?: string;
  onPickTime?: (next: string) => void;
  timePresets: string[];
  draft: boolean;
  onDraftCommit?: () => void | Promise<void>;
  onDraftCancel: () => void;
  saving: boolean;
}) {
  // Роки у випадайці: календар має діставати і до дат народження, і до
  // договорів наперед. Межі рахуємо від ОБРАНОГО значення, а не лише від
  // «сьогодні» — інакше вже збережена дата 1988 року в списку відсутня.
  const currentYear = new Date().getFullYear();
  const selectedYear = selected?.getFullYear() ?? currentYear;
  const withTime = timeValue !== undefined;

  return (
    <>
      <div className={cn(saving && "pointer-events-none select-none opacity-60")}>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => onPickDate(date ?? null)}
          captionLayout="dropdown-buttons"
          fromYear={Math.min(currentYear - 80, selectedYear)}
          toYear={Math.max(currentYear + 10, selectedYear)}
          locale={uk}
          initialFocus
          classNames={{
            // «Сьогодні» — лише крапка під числом, без заливки й обводки: обводка
            // сперечалась із заливкою обраного дня, коли це один і той самий день.
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
                    onClick={() => onPickTime?.(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
              {/*
               * Поле довільного часу під пресетами.
               *
               * Пресети покривають типовий день, але не весь: дедлайн «до 12:00»
               * ними не поставити взагалі, а там, де панель — ЄДИНИЙ вхід (пікер
               * із довільним тригером у шапці задачі), альтернативи набрати час
               * просто немає. У полі `DateTimeInput` час хоч набирався з
               * клавіатури, у шапці — ні.
               *
               * Порожнє значення не комітимо: під час набору браузер віддає ""
               * на кожному проміжному стані, і кожен такий крок збивав би час на
               * 00:00 просто тому, що людина стирає години.
               */}
              <TimeInput
                controlSize="sm"
                value={timeValue}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next) onPickTime?.(next);
                }}
                aria-label="Свій час"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground">Швидко</span>
            <DateQuickActions flush onSelect={(date) => onPickDate(date)} />
          </div>
        </div>
      </div>

      {draft ? (
        <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-3">
          <Button type="button" variant="outline" size="sm" className="h-[34px]" disabled={saving} onClick={onDraftCancel}>
            Скасувати
          </Button>
          <Button type="button" size="sm" className="h-[34px] gap-1.5" disabled={saving} onClick={() => void onDraftCommit?.()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {saving ? "Зберігаємо" : "Зберегти"}
          </Button>
        </div>
      ) : null}
    </>
  );
}

type PanelBehaviourProps = {
  /**
   * Режим чернетки: панель не закривається на вибір, а чекає «Зберегти».
   *
   * Правило одне: підтвердження потрібне ЛИШЕ там, де клік сам пише в базу.
   * Якщо поруч є спільне «Зберегти» (форма) або окрема кнопка запису — панель
   * закривається одразу, інакше на екрані два «Зберегти» й незрозуміло, котре
   * справжнє.
   */
  draft?: boolean;
  onDraftCommit?: () => void | Promise<void>;
  /** Запит у дорозі: панель не приймає кліків, кнопка показує спінер. */
  saving?: boolean;
  timePresets?: string[];
};

/** Поле дати: набір із клавіатури + наш календар зі швидкими діями. */
const DateInput = React.forwardRef<HTMLInputElement, PickerInputProps & PanelBehaviourProps>(
  (
    { className, disabled, draft = false, onDraftCommit, saving = false, timePresets = DEFAULT_TIME_PRESETS, controlSize = "lg", placeholder, ...props },
    forwardedRef
  ) => {
    const { innerRef, setRefs } = useForwardedInputRef(forwardedRef);
    const [open, setOpen] = React.useState(false);
    const hint = useEmptyPlaceholder({ kind: "date", value: props.value, placeholder, controlSize, onFocus: props.onFocus, onBlur: props.onBlur });

    const rawValue = typeof props.value === "string" ? props.value : "";
    const selected = React.useMemo(() => {
      if (!rawValue) return undefined;
      const parsed = parse(rawValue, "yyyy-MM-dd", new Date());
      return isValid(parsed) ? parsed : undefined;
    }, [rawValue]);

    const pickDate = React.useCallback(
      (date: Date | null) => {
        const node = innerRef.current;
        if (node) commitNativeValue(node, date ? format(date, "yyyy-MM-dd") : "");
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
        <EmptyHint hint={hint} />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" tabIndex={-1} aria-label="Відкрити календар" disabled={disabled} className={ICON_BUTTON_CLASS}>
              <CalendarDays className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className={PANEL_WIDTH_CLASS} {...COLLISION_PROPS}>
            <PickerPanel
              selected={selected}
              onPickDate={pickDate}
              timePresets={timePresets}
              draft={draft}
              onDraftCommit={onDraftCommit}
              onDraftCancel={() => setOpen(false)}
              saving={saving}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);
DateInput.displayName = "DateInput";

/**
 * Поле дати-часу — одним контролом.
 *
 * Дедлайни й нагадування завжди йдуть парою «день + година», і двома полями це
 * два окремі рухи: половина нагадувань у базі стоїть на 00:00, бо час просто
 * забували. Тут «Завтра» ставить і день, і робочу годину, а саме поле показує
 * обидві частини — не треба відкривати панель, щоб побачити час.
 *
 * Значення — нативний формат `datetime-local`: «YYYY-MM-DDTHH:MM».
 */
const DateTimeInput = React.forwardRef<HTMLInputElement, PickerInputProps & PanelBehaviourProps>(
  (
    { className, disabled, draft = false, onDraftCommit, saving = false, timePresets = DEFAULT_TIME_PRESETS, controlSize = "lg", placeholder, ...props },
    forwardedRef
  ) => {
    const { innerRef, setRefs } = useForwardedInputRef(forwardedRef);
    const [open, setOpen] = React.useState(false);
    const hint = useEmptyPlaceholder({ kind: "datetime-local", value: props.value, placeholder, controlSize, onFocus: props.onFocus, onBlur: props.onBlur });

    const rawValue = typeof props.value === "string" ? props.value : "";
    const [datePart = "", timePart = ""] = rawValue.split("T");
    const selected = React.useMemo(() => {
      if (!datePart) return undefined;
      const parsed = parse(datePart, "yyyy-MM-dd", new Date());
      return isValid(parsed) ? parsed : undefined;
    }, [datePart]);

    const write = React.useCallback(
      (nextDate: string, nextTime: string) => {
        const node = innerRef.current;
        if (!node) return;
        commitNativeValue(node, nextDate ? `${nextDate}T${nextTime || DEFAULT_TIME}` : "");
      },
      [innerRef]
    );

    const pickDate = React.useCallback(
      (date: Date | null) => {
        // Очистити — значить очистити цілком: дата без часу тут не існує.
        write(date ? format(date, "yyyy-MM-dd") : "", timePart);
        if (!draft) setOpen(false);
      },
      [write, timePart, draft]
    );

    const pickTime = React.useCallback(
      (next: string) => {
        // Час без дати — теж не значення. Якщо дати ще немає, беремо сьогодні:
        // людина клікнула годину, отже має на увазі найближчий день.
        write(datePart || format(new Date(), "yyyy-MM-dd"), next);
      },
      [write, datePart]
    );

    return (
      <div className="relative">
        <Input
          {...props}
          {...hint.handlers}
          type="datetime-local"
          controlSize={controlSize}
          disabled={disabled}
          ref={setRefs}
          className={cn("pr-9", hint.visible && "text-transparent", className)}
        />
        <EmptyHint hint={hint} />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" tabIndex={-1} aria-label="Відкрити календар" disabled={disabled} className={ICON_BUTTON_CLASS}>
              <CalendarDays className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className={PANEL_WIDTH_CLASS} {...COLLISION_PROPS}>
            <PickerPanel
              selected={selected}
              onPickDate={pickDate}
              timeValue={timePart || ""}
              onPickTime={pickTime}
              timePresets={timePresets}
              draft={draft}
              onDraftCommit={onDraftCommit}
              onDraftCancel={() => setOpen(false)}
              saving={saving}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);
DateTimeInput.displayName = "DateTimeInput";

/**
 * Поле часу окремо — там, де дати поруч немає (журнал витрат тощо), і всередині
 * `PickerPanel` як «свій час» під пресетами.
 *
 * Свого пікера часу в проєкті немає, та він і не потрібен: швидких дій на
 * кшталт «Завтра» для години не буває, а нативний уже дає і колесо на
 * мобільному, і контроль формату.
 */
const TimeInput = React.forwardRef<HTMLInputElement, PickerInputProps>(
  ({ className, disabled, controlSize = "lg", placeholder, ...props }, forwardedRef) => {
    const { innerRef, setRefs } = useForwardedInputRef(forwardedRef);
    const hint = useEmptyPlaceholder({ kind: "time", value: props.value, placeholder, controlSize, onFocus: props.onFocus, onBlur: props.onBlur });

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
        <EmptyHint hint={hint} />
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

/**
 * Тон терміновості для дедлайну.
 *
 * ЛИШЕ для дедлайнів (рішення 2026-08-06). У фінансах і профілі минула дата —
 * це норма (дата оплати завжди позаду), і фарбувати кожне таке поле означало б
 * зробити півсторінки червоною без причини. Колір має стояти там, де є наслідок
 * пропуску.
 */
export function deadlineUrgencyTone(value: Date | null | undefined): "neutral" | "warning" | "danger" {
  if (!value || Number.isNaN(value.getTime())) return "neutral";
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(value) - startOfDay(new Date())) / 86400000);
  if (days < 0) return "danger";
  if (days <= 1) return "warning";
  return "neutral";
}

/**
 * Пікер із ДОВІЛЬНИМ тригером — для шапок і тулбарів, де дата не вводиться, а
 * читається («Дедлайн: Завтра 14:00»).
 *
 * Тригер свідомо лишається за викликачем. Ці пікери стоять у рядах з іншими
 * чіпами (валюта, менеджер, замовник), і власний вигляд кнопки тут розсинхронив
 * би весь ряд. Уніфікуємо ПАНЕЛЬ і поведінку — календар, швидкі дії, час,
 * захист від країв вікна, — а не форму того, за що її смикають.
 */
const DateTimePicker = React.forwardRef<
  HTMLDivElement,
  {
    value: Date | null;
    onChange: (next: Date | null) => void;
    /** Будь-який елемент; отримує onClick від Popover через asChild. */
    trigger: React.ReactNode;
    withTime?: boolean;
    timePresets?: string[];
    align?: "start" | "center" | "end";
    /**
     * Контрольоване відкриття — коли панель має відкриватись ззовні. Напр.
     * валідація «Вкажіть дедлайн» одразу розкриває пікер, замість того щоб
     * лишати людину самій шукати, куди тиснути.
     */
    open?: boolean;
    onOpenChange?: (next: boolean) => void;
  } & PanelBehaviourProps
>(
  (
    { value, onChange, trigger, withTime = true, timePresets = DEFAULT_TIME_PRESETS, align = "start", open: openProp, onOpenChange, draft = false, onDraftCommit, saving = false },
    forwardedRef
  ) => {
    const [openState, setOpenState] = React.useState(false);
    const open = openProp ?? openState;
    const setOpen = React.useCallback(
      (next: boolean) => {
        setOpenState(next);
        onOpenChange?.(next);
      },
      [onOpenChange]
    );
    const timeValue = value ? format(value, "HH:mm") : "";

    const pickDate = React.useCallback(
      (date: Date | null) => {
        if (!date) {
          onChange(null);
        } else {
          const next = new Date(date);
          const [h, m] = (timeValue || DEFAULT_TIME).split(":").map(Number);
          next.setHours(h || 0, m || 0, 0, 0);
          onChange(next);
        }
        if (!draft) setOpen(false);
      },
      [onChange, timeValue, draft, setOpen]
    );

    const pickTime = React.useCallback(
      (next: string) => {
        const [h, m] = next.split(":").map(Number);
        const base = value ? new Date(value) : new Date();
        base.setHours(h || 0, m || 0, 0, 0);
        onChange(base);
      },
      [onChange, value]
    );

    return (
      <div ref={forwardedRef} className="contents">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align={align} className={PANEL_WIDTH_CLASS} {...COLLISION_PROPS}>
            <PickerPanel
              selected={value ?? undefined}
              onPickDate={pickDate}
              timeValue={withTime ? timeValue : undefined}
              onPickTime={pickTime}
              timePresets={timePresets}
              draft={draft}
              onDraftCommit={onDraftCommit}
              onDraftCancel={() => setOpen(false)}
              saving={saving}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);
DateTimePicker.displayName = "DateTimePicker";

export { DateInput, DateTimeInput, DateTimePicker, TimeInput };

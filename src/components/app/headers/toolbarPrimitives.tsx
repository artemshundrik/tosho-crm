import * as React from "react";
import { Check, ChevronDown, FilterX, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TOOLBAR_CONTROL, TOOLBAR_CONTROL_ACTIVE, TOOLBAR_FILTER } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";

// Примітиви тулбара списків. Кожна сторінка збирала пошук/бейдж/мету руками —
// однаковий markup жив у 6+ копіях і повільно розповзався (різні позиції лоадера,
// різні розміри бейджів). Тут — канонічна версія; сторінки лише передають дані.
// Конвенція: список = UnifiedPageToolbar (через usePageHeaderActions) + ці примітиви.

type ToolbarSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Показує спінер у полі (пошук/оновлення даних у процесі). */
  loading?: boolean;
  className?: string;
  inputClassName?: string;
  /**
   * Пауза перед тим, як віддати запит сторінці. 0 — віддавати одразу.
   * Міняти є сенс лише там, де сторінка справді легка.
   */
  debounceMs?: number;
};

/**
 * Пошук тулбара: іконка зліва, очистка справа, опційний спінер.
 *
 * ЧОМУ ТУТ ЗАТРИМКА. Поле віддає запит сторінці не на кожну літеру, а коли
 * людина спинилась. Раніше кожне натискання одразу міняло стан сторінки, і на
 * важких списках це коштувало сотні мілісекунд перемальовування. Заміряно на
 * дизайні 2026-08-10: друк у людському темпі (140мс на символ) — з 14 літер
 * слова «агропродсервіс» до поля дійшло 8, головний потік був заблокований
 * 9 секунд, найдовше одиночне блокування 872мс. Літери, набрані під час
 * блокування, просто зникали (REQ-23).
 *
 * `useDeferredValue` на сторінці цього не рятує: він лише відкладає перерахунок
 * фільтра, а перемальовування всього дерева однаково йде на кожну літеру.
 *
 * Поки людина друкує, перемальовується ЛИШЕ це поле. Сторінка дізнається про
 * запит один раз за серію.
 *
 * 300мс, а не 150: пауза мусить бути довшою за проміжок між натисканнями, інакше
 * повільніший друк однаково дасть перемальовування на кожну літеру. Заміряно
 * після правки — та сама серія з 14 літер: 3 довгі задачі замість 20, сумарне
 * блокування 1.7с замість 9с, жодної втраченої літери.
 */
export function ToolbarSearch({
  value,
  onChange,
  placeholder = "Пошук...",
  loading = false,
  className,
  inputClassName,
  debounceMs = 300,
}: ToolbarSearchProps) {
  // Те, що бачить людина. Оновлюється миттєво й нікого більше не чіпає.
  const [draft, setDraft] = React.useState(value);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Останнє, що ми ВІДДАЛИ нагору. Потрібне, щоб відрізнити відповідь на власну
  // подію від справжньої зміни ззовні («Скинути фільтри», відновлення стану).
  const emittedRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    if (value === emittedRef.current) return;
    emittedRef.current = value;
    setDraft(value);
  }, [value]);

  const emit = React.useCallback((next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    emittedRef.current = next;
    onChangeRef.current(next);
  }, []);

  const schedule = React.useCallback(
    (next: string) => {
      setDraft(next);
      if (debounceMs <= 0) {
        emit(next);
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => emit(next), debounceMs);
    },
    [debounceMs, emit]
  );

  // Незакінчений запит не має пропасти разом із полем: сторінки зберігають
  // фільтри при виході, і людина повернулась би до чужого стану.
  React.useEffect(
    () => () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(event) => schedule(event.target.value)}
        // Enter — «шукай зараз», без очікування паузи.
        onKeyDown={(event) => {
          if (event.key === "Enter") emit(draft);
        }}
        onBlur={() => {
          if (timerRef.current) emit(draft);
        }}
        placeholder={placeholder}
        className={cn(TOOLBAR_CONTROL, "pl-9 pr-9", inputClassName)}
      />
      {draft ? (
        <Button
          type="button"
          variant="control"
          size="iconSm"
          aria-label="Очистити пошук"
          className="absolute right-2 top-1/2 -translate-y-1/2"
          // Очистка — дія, а не набір: віддаємо одразу, без паузи.
          onClick={() => {
            setDraft("");
            emit("");
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
      {loading ? (
        <Loader2
          className={cn(
            "absolute top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground",
            draft ? "right-10" : "right-3"
          )}
        />
      ) : null}
    </div>
  );
}

export type ToolbarFilterOption = {
  value: string;
  /** Підпис у списку й у тригері. Може бути вузлом (аватарка + імʼя). */
  label: React.ReactNode;
  /** Іконка пункту — статуси беруть ту саму, що на канбан-дошці. */
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

type ToolbarFilterSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: ToolbarFilterOption[];
  /**
   * Значення, яке НЕ фільтрує («all», «Всі менеджери»). Коли вибрано інше,
   * контрол підсвічується як увімкнений. Без цього пропа підсвітки немає —
   * саме так лишаються сортування, які нічого не ховають і не бувають
   * «вимкненими», тож постійна підсвітка на них нічого б не означала.
   */
  neutralValue?: string;
  /** Запасний підпис, коли значення немає серед опцій. */
  placeholder?: string;
  /** Ширина й інші правки розкладки: "sm:w-[180px]". */
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

/**
 * Фільтр-випадайко тулбара — ОДИН компонент на всі сторінки.
 *
 * ЧОМУ КНОПКА З МЕНЮ, А НЕ `Select`. Спершу тулбарні фільтри були `Select`
 * (Radix Select), і за однакових стилів вони поводились інакше за кнопки-фільтри
 * дошки запитів: натиск спрацьовував через раз і смикався. Причина не в стилях —
 * Radix Select це окремий примітив зі своєю механікою відкриття: він захоплює
 * вказівник і позиціонує список по вибраному пункту, тож `:active` на тригері
 * гасне ще до першого кадру.
 *
 * Тому тут узято рівно ту саму зв’язку, що на дошці запитів і в контролі
 * групування: `Button` + `DropdownMenu`. Не «схожа на неї» — та сама, тож
 * натиск, поява меню й таймінги збігаються за побудовою, а не за домовленістю.
 */
export function ToolbarFilterSelect({
  value,
  onValueChange,
  options,
  neutralValue,
  placeholder,
  className,
  contentClassName,
  ariaLabel,
  disabled,
}: ToolbarFilterSelectProps) {
  const selected = options.find((option) => option.value === value);
  const SelectedIcon = selected?.icon;
  const active = neutralValue !== undefined && value !== neutralValue;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(TOOLBAR_FILTER, "min-w-0 justify-between", className, active && TOOLBAR_CONTROL_ACTIVE)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0 opacity-70" /> : null}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          {/* Без власного кольору: стрілка тонується разом зі станом кнопки. */}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn("max-h-[320px] w-[var(--radix-dropdown-menu-trigger-width)] min-w-[200px]", contentClassName)}
      >
        {options.map((option) => {
          const OptionIcon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              disabled={option.disabled}
              onSelect={() => onValueChange(option.value)}
              className="gap-2 rounded-lg text-[13px]"
            >
              {/* Галочка займає місце завжди (opacity-0), інакше рядки стрибають. */}
              <Check className={cn("h-3.5 w-3.5 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
              {OptionIcon ? <OptionIcon className="h-3.5 w-3.5 shrink-0 opacity-70" /> : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Бейдж кількості в segmented-табі: «Замовники [128]». Один стиль на всі сторінки. */
export function CountBadge({
  value,
  className,
  loading = false,
}: {
  value: number | string;
  className?: string;
  /**
   * Даних ще немає — показуємо риску, а не число.
   *
   * НАВІЩО. Лічильники рахуються з порожнього списку, тож поки дані їдуть, у
   * перемикачі стоять чесні нулі: «Дошка 0 · Ідеї 0 · Не робимо 0». За мить
   * вони стають справжніми — і це той самий зайвий стан завантаження, що й
   * підписи колонок у каркасі дошки: спершу одне, потім друге, потім третє.
   * Нуль тут ще й бреше: він означає «порожньо», а насправді «ще не знаємо».
   */
  loading?: boolean;
}) {
  return (
    <span className={cn("rounded-md bg-card px-1.5 py-0.5 text-2xs tabular-nums", className)}>
      {loading ? <span className="text-muted-foreground/50">—</span> : value}
    </span>
  );
}

type ToolbarMetaProps = {
  count: number | string;
  /** Підпис після числа, напр. «знайдено». Без нього — просто число. */
  countLabel?: string;
  /** Коли передано і showReset не false — зʼявляється кнопка скидання фільтрів. */
  onReset?: () => void;
  showReset?: boolean;
  loading?: boolean;
  className?: string;
};

/** Права мета тулбара: [скинути фільтри] N [знайдено] [спінер]. */
export function ToolbarMeta({
  count,
  countLabel,
  onReset,
  showReset,
  loading = false,
  className,
}: ToolbarMetaProps) {
  const resetVisible = Boolean(onReset) && showReset !== false;
  return (
    <div className={cn("flex items-center gap-2 text-sm font-semibold text-foreground", className)}>
      {resetVisible ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          className="h-8 w-8 shrink-0 text-muted-foreground"
          title="Скинути фільтри"
          aria-label="Скинути фільтри"
        >
          <FilterX className="h-4 w-4" />
        </Button>
      ) : null}
      <span className="tabular-nums">{count}</span>
      {countLabel ? <span className="text-muted-foreground">{countLabel}</span> : null}
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

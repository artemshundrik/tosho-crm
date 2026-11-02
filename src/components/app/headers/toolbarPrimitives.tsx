import * as React from "react";
import { Check, ChevronDown, FilterX, Loader2, Search, X } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";
import { pluralWordUk } from "@/lib/lastSeen";
import { Input } from "@/components/ui/input";
import { TOOLBAR_CONTROL, TOOLBAR_CONTROL_ACTIVE, TOOLBAR_FILTER } from "@/components/ui/controlStyles";
import { HoverTip } from "@/components/ui/hover-tip";
import { cn } from "@/lib/utils";

// Примітиви тулбара списків. Кожна сторінка збирала пошук/бейдж/мету руками —
// однаковий markup жив у 6+ копіях і повільно розповзався (різні позиції лоадера,
// різні розміри бейджів). Тут — канонічна версія; сторінки лише передають дані.
// Конвенція: список = UnifiedPageToolbar (через usePageHeaderActions) + ці примітиви.

/**
 * Спільний стан рядка тулбара: чи згорнутий пошук до лупи. Ставить
 * `UnifiedPageToolbar`, вирішує `ToolbarFilterBar` — лише він знає, чи влазять
 * фільтри. Поза тулбаром контексту немає, і пошук завжди повний.
 */
export type ToolbarRowState = {
  compactSearch: boolean;
  setCompactSearch: (next: boolean) => void;
  /** Ширина повного пошуку з останнього разу, коли він був повним. */
  searchFullWidthRef: React.MutableRefObject<number>;
};
export const ToolbarRowContext = React.createContext<ToolbarRowState | null>(null);

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

  // Фільтри не влазять — пошук стає лупою. Набраний запит лупою не ховається:
  // поле з текстом лишається повним, інакше пошук «зникав» би з виду.
  const row = React.useContext(ToolbarRowContext);
  const [expanded, setExpanded] = React.useState(false);
  const compact = Boolean(row?.compactSearch);
  if (compact && !expanded && !draft) {
    return (
      <Button
        type="button"
        variant="outline"
        aria-label={placeholder}
        title={placeholder}
        onClick={() => setExpanded(true)}
        className={cn(TOOLBAR_CONTROL, "w-9 shrink-0 px-0")}
      >
        <Search className="h-4 w-4 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <div className={cn("relative", compact && "w-[240px]", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus={compact && expanded}
        value={draft}
        onChange={(event) => schedule(event.target.value)}
        // Enter — «шукай зараз», без очікування паузи.
        onKeyDown={(event) => {
          if (event.key === "Enter") emit(draft);
        }}
        onBlur={() => {
          if (timerRef.current) emit(draft);
          if (!draft) setExpanded(false);
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
  /**
   * Назва виміру для `ToolbarFilterBar`: «Менеджер», «Статус». Без неї фільтр
   * у смузі лишається випадайком на виду (так живуть сортування).
   */
  label?: string;
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
              className="gap-2 rounded-lg text-md"
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
  /**
   * Чого саме N — три форми слова: `["замовник", "замовники", "замовників"]`.
   * Хвиля Б2: лічильник пише «164 замовники», а не «164 знайдено» на одній
   * сторінці й голе «164» на іншій. Має перевагу над `countLabel`.
   */
  unit?: readonly [one: string, few: string, many: string];
  /** Після лічильника через крапку — сума для грошових списків: «· 1 236 450 грн». */
  extra?: React.ReactNode;
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
  unit,
  extra,
  onReset,
  showReset,
  loading = false,
  className,
}: ToolbarMetaProps) {
  const resetVisible = Boolean(onReset) && showReset !== false;
  return (
    <div className={cn("flex items-center gap-2 text-sm font-semibold text-foreground", className)}>
      {resetVisible ? (
        <HoverTip asChild label="Скинути фільтри">
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onReset}
            className="shrink-0 text-muted-foreground"
            aria-label="Скинути фільтри"
          >
            <FilterX className="h-4 w-4" />
          </Button>
        </HoverTip>
      ) : null}
      <span className="tabular-nums">{count}</span>
      {unit ? (
        <span className="-ml-1 text-muted-foreground">
          {typeof count === "number" ? pluralWordUk(count, ...unit) : unit[2]}
        </span>
      ) : countLabel ? (
        <span className="text-muted-foreground">{countLabel}</span>
      ) : null}
      {/* Сума — лише на широкому: нижче рядок тулбара не влазить, а суми груп
          таблиці однаково стоять у їхніх заголовках. Кількість лишається. */}
      {extra ? <span className="-ml-1 hidden tabular-nums text-muted-foreground min-[1600px]:inline">· {extra}</span> : null}
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

/**
 * Смуга фільтрів: на виду стільки, скільки влазить в один рядок.
 *
 * 01.11 тут була «+ Фільтр» і чипи — незастосовані фільтри ховались у меню
 * навіть на широкому екрані, і не було видно, що вибрано; Артем попросив
 * повернути випадайки (REQ-173#p19). Але чотири випадайки й пошук на вузькому
 * вікні лягали у два рядки, тож коли місця бракує, діє порядок (REQ-173#p20):
 *   1. фільтри завжди завширшки зі свій текст, а не 180–220 px;
 *   2. не влазять — пошук згортається до лупи (`ToolbarRowContext`);
 *   3. однаково не влазять — ОСТАННІ діти йдуть у «Ще». Порядок дітей і є
 *      пріоритет: головний вибір (менеджер, дизайнер) ставити першим.
 * «Ще» підсвічене й з числом, коли схований фільтр застосований.
 *
 * Ширини міряються з DOM; схованого фільтра не видно, тож береться остання
 * виміряна. На телефоні діти малюються як є — вони живуть в аркуші.
 */
const FILTER_GAP = 8;
const SEARCH_ICON_WIDTH = 36;

/** Чи застосований фільтр: випадайко — значення не нейтральне; замовник — вибраний. */
function isFilterChildActive(child: React.ReactNode) {
  if (!React.isValidElement<{ value?: unknown; neutralValue?: unknown }>(child)) return false;
  const { value, neutralValue } = child.props;
  if (neutralValue !== undefined) return value !== neutralValue;
  return value !== null && typeof value === "object";
}

export function ToolbarFilterBar({ children }: { children: React.ReactNode }) {
  const isNarrow = useIsNarrowViewport();
  const row = React.useContext(ToolbarRowContext);
  const items = React.Children.toArray(children).filter(React.isValidElement);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const widthsRef = React.useRef<number[]>([]);
  const moreWidthRef = React.useRef(72);
  const [visible, setVisible] = React.useState(items.length);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setTick((tick) => tick + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [isNarrow]);

  // `items` новий на кожен рендер — і це навмисно: ширина міняється й від
  // вибраного значення. Стан ставиться лише коли змінився, тож циклу немає.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll<HTMLElement>("[data-filter-item]").forEach((node) => {
      widthsRef.current[Number(node.dataset.filterItem)] = node.offsetWidth;
    });
    const more = el.querySelector<HTMLElement>("[data-filter-more]");
    if (more) moreWidthRef.current = more.offsetWidth;
    const widths = items.map((_, index) => widthsRef.current[index] ?? 160);
    const need = (count: number) =>
      widths.slice(0, count).reduce((sum, width) => sum + width, 0) +
      FILTER_GAP * Math.max(count - 1, 0) +
      (count < items.length ? (count > 0 ? FILTER_GAP : 0) + moreWidthRef.current : 0);
    const available = el.clientWidth;
    let fit = items.length;
    while (fit > 0 && need(fit) > available) fit -= 1;

    if (row) {
      if (fit < items.length && !row.compactSearch) {
        row.setCompactSearch(true);
        return;
      }
      const freed = row.searchFullWidthRef.current - SEARCH_ICON_WIDTH;
      if (row.compactSearch && fit === items.length && need(items.length) + freed <= available) {
        row.setCompactSearch(false);
        return;
      }
    }
    if (fit !== visible) setVisible(fit);
  }, [items, row, tick, visible]);

  if (isNarrow) return <>{children}</>;

  const shown = items.slice(0, visible);
  const hidden = items.slice(visible);
  const hiddenActive = hidden.filter(isFilterChildActive).length;

  return (
    <div ref={ref} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      {shown.map((child, index) => (
        <div key={child.key ?? index} data-filter-item={index} className="shrink-0 [&>*]:w-auto! [&>*]:max-w-[240px]">
          {child}
        </div>
      ))}
      {hidden.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              data-filter-more=""
              className={cn(TOOLBAR_FILTER, "w-auto shrink-0", hiddenActive > 0 && TOOLBAR_CONTROL_ACTIVE)}
            >
              Ще
              {hiddenActive > 0 ? <span className="-ml-1 tabular-nums text-muted-foreground">· {hiddenActive}</span> : null}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-[260px] flex-col gap-2 p-2 [&>*]:w-full!">
            {hidden}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

export type ToolbarTabItem<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Скільки записів у вкладці; `undefined` — лічильника немає. */
  count?: number | string;
  /** Лічильник вимагає уваги (запити на розгляд) — жовтий замість сірого. */
  attention?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
};

/**
 * Вкладки сторінки (хвиля Б2): текст із лічильником, вибрана — підкреслена.
 *
 * Один стиль на всі вкладки вмісту: «Всі / З прорахунку / Окремі», «Люди /
 * Календар / Запити», «Всі / Непрочитані». Доти кожна сторінка брала обведений
 * сегментний перемикач, і вкладки вмісту виглядали так само, як перемикач
 * вигляду («Дошка / Таблиця») поруч — дві різні речі одним контролом. Сегментний
 * перемикач лишився лише за виглядом.
 */
export function ToolbarTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  countLoading = false,
  className,
}: {
  items: ReadonlyArray<ToolbarTabItem<T>>;
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  /** Дані ще їдуть — лічильники рискою, а не чесними нулями (див. CountBadge). */
  countLoading?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex h-9 max-w-full items-stretch gap-5 overflow-x-auto [scrollbar-width:none]", className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        const ItemIcon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 text-sm font-medium transition-colors",
              "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
              selected
                ? "text-foreground after:bg-foreground"
                : "text-muted-foreground after:bg-transparent hover:text-foreground"
            )}
          >
            {ItemIcon ? <ItemIcon className="h-3.5 w-3.5 shrink-0" /> : null}
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  item.attention ? "font-semibold text-warning-foreground" : "text-muted-foreground"
                )}
              >
                {countLoading ? "–" : item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

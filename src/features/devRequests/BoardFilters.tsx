import { useMemo, useState } from "react";
import { Check, ListFilter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TOOLBAR_CONTROL_ACTIVE, TOOLBAR_FILTER } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";
import {
  REQUEST_ZONES,
  ZONE_ICONS,
  ZONE_LABELS,
  type DevRequest,
  type RequestZone,
} from "./types";

/**
 * Фільтри дошки: зона й тема.
 *
 * ЧОМУ КНОПКА, А НЕ ЧІПИ РОЗСИПОМ. Чіпи були правильні, поки їх було три. Зон
 * пʼять із закритим набором, а теми ростуть самі з кожного розбору — тобто ряд
 * переповнювався б і далі, скільки його не лагодь: спершу він ламався надвоє,
 * потім ховав хвіст за краєм екрана. Плюс чіп заввишки 28 px не сідав на одну
 * лінію з 40-піксельним пошуком, і тулбар виглядав зібраним нашвидкуруч.
 *
 * Тепер у ряду одна кнопка з числом увімкнених, а поруч — чіпи ВИБРАНОГО з
 * хрестиком. Ряд не росте від кількості тем: активних фільтрів ставлять
 * один-два, стільки чіпів там і буде. Те, заради чого чіпи задумувались —
 * видно назву й кількість одразу, — не зникло, а переїхало на клік углиб.
 *
 * У МЕЖАХ ГРУПИ — АБО, МІЖ ГРУПАМИ — І. Дві зони разом означають «вигляд або
 * швидкість», а зона плюс тема — «вигляд І в темі навігація». Це те, чого
 * очікують від фільтрів скрізь, і саме тому правило не варто вигадувати своє.
 *
 * ЧІПА «НЕРОЗІБРАНІ» ТУТ БІЛЬШЕ НЕМАЄ. Він рахував картки без напрямку АБО без
 * зони — і на живій дошці це виявилась половина всіх карток. Фільтр, під який
 * підпадає половина, нічого не звужує: він не каже «оце потребує уваги», він
 * каже «тут усе».
 */
export type BoardFilterState = {
  zones: Set<RequestZone>;
  themes: Set<string>;
};

export const EMPTY_BOARD_FILTERS: BoardFilterState = {
  zones: new Set(),
  themes: new Set(),
};

export function hasActiveFilters(state: BoardFilterState): boolean {
  return state.zones.size > 0 || state.themes.size > 0;
}

export function activeFilterCount(state: BoardFilterState): number {
  return state.zones.size + state.themes.size;
}

/** Чи проходить картка крізь фільтри. Порожній фільтр пропускає все. */
export function matchesBoardFilters(request: DevRequest, state: BoardFilterState): boolean {
  if (state.zones.size > 0 && (!request.zone || !state.zones.has(request.zone))) return false;
  if (state.themes.size > 0 && (!request.theme || !state.themes.has(request.theme))) return false;
  return true;
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Чіп вибраного фільтра в тулбарі — один стиль на зони й теми (REQ-48):
 *  нейтральний навмисно, бо тони зон у ряду ставали веселкою; який це фільтр —
 *  у чіпі написано словом. ZONE_TONE на картках живе своїм життям. */
const SELECTED_FILTER_CHIP =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/70 pl-2.5 pr-2 text-2xs font-medium text-foreground transition-opacity hover:opacity-80";

/** Рядок у панелі: галочка, іконка, назва, кількість. */
function FilterRow({
  selected,
  disabled,
  label,
  count,
  icon: Icon,
  onSelect,
}: {
  selected: boolean;
  disabled?: boolean;
  label: string;
  count: number;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2 py-1.5 text-left text-[13px] transition-colors",
        // Вибране темнішає, а не синіє — тим самим правилом, що й тригери
        // тулбара: у ряду не має бути двох різних мов «увімкнено».
        selected ? "bg-muted/70 font-medium text-foreground" : "text-foreground hover:bg-muted/60",
        disabled && "cursor-default opacity-40 hover:bg-transparent"
      )}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors",
          selected ? "border-foreground bg-foreground text-background" : "border-border"
        )}
      >
        {selected ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
      </span>
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" /> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 font-mono text-2xs tabular-nums opacity-60">{count}</span>
    </button>
  );
}

export function BoardFilters({
  requests,
  state,
  onChange,
}: {
  /** Картки поточного вигляду ДО фільтрів — із них рахуються лічильники. */
  requests: DevRequest[];
  state: BoardFilterState;
  onChange: (next: BoardFilterState) => void;
}) {
  const [open, setOpen] = useState(false);

  const counts = useMemo(() => {
    const zones = new Map<RequestZone, number>();
    const themes = new Map<string, number>();
    for (const request of requests) {
      if (request.zone) zones.set(request.zone, (zones.get(request.zone) ?? 0) + 1);
      if (request.theme) themes.set(request.theme, (themes.get(request.theme) ?? 0) + 1);
    }
    return { zones, themes };
  }, [requests]);

  const themeList = useMemo(
    () =>
      Array.from(counts.themes.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "uk")
      ),
    [counts.themes]
  );

  const active = activeFilterCount(state);
  // Порожня дошка — фільтрувати нічого; кнопка без вмісту тільки заважає.
  if (counts.zones.size === 0 && themeList.length === 0 && active === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              TOOLBAR_FILTER,
              "shrink-0 px-3.5",
              active > 0 && TOOLBAR_CONTROL_ACTIVE
            )}
          >
            <ListFilter className="h-4 w-4" />
            Фільтр
            {active > 0 ? (
              <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-2xs tabular-nums">
                {active}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        {/* slide={false}: тригер стоїть у тулбарі, панель падає рівно під ним, і
            типові 8 px переїзду читаються не як рух, а як промах позиціонування. */}
        <PopoverContent align="start" slide={false} className="w-[260px] p-1.5">
          <p className="px-2 pb-1 pt-1.5 text-3xs font-semibold uppercase tracking-caps text-muted-foreground">
            Зона
          </p>
          {REQUEST_ZONES.map((zone) => {
            const count = counts.zones.get(zone) ?? 0;
            const selected = state.zones.has(zone);
            return (
              <FilterRow
                key={zone}
                selected={selected}
                // Зону з нулем показуємо, але тьмяно й без кліку. У ряду вона
                // була б брехнею — натиснув і отримав порожньо; у списку каже
                // правду: такого просто немає.
                disabled={count === 0 && !selected}
                label={ZONE_LABELS[zone]}
                count={count}
                icon={ZONE_ICONS[zone]}
                onSelect={() => onChange({ ...state, zones: toggle(state.zones, zone) })}
              />
            );
          })}

          {themeList.length > 0 ? (
            <>
              <div className="-mx-1.5 my-1.5 h-px bg-border" />
              <p className="px-2 pb-1 text-3xs font-semibold uppercase tracking-caps text-muted-foreground">
                Тема
              </p>
              {/* Теми ростуть самі з розбору — список має власну прокрутку,
                  інакше панель колись переросте екран. */}
              <div className="max-h-[210px] overflow-y-auto">
                {themeList.map(([theme, count]) => (
                  <FilterRow
                    key={theme}
                    selected={state.themes.has(theme)}
                    label={theme}
                    count={count}
                    onSelect={() => onChange({ ...state, themes: toggle(state.themes, theme) })}
                  />
                ))}
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>

      {/* Вибране — чіпами поруч: зняти фільтр можна не відкриваючи панель.
          Саме тут 28-піксельний чіп доречний, бо він уже не орган керування, а
          позначка стану. */}
      {Array.from(state.zones).map((zone) => {
        const Icon = ZONE_ICONS[zone];
        return (
          <button
            key={`zone-${zone}`}
            type="button"
            onClick={() => onChange({ ...state, zones: toggle(state.zones, zone) })}
            title={`Прибрати фільтр «${ZONE_LABELS[zone]}»`}
            className={SELECTED_FILTER_CHIP}
          >
            <Icon className="h-3 w-3" />
            {ZONE_LABELS[zone]}
            <X className="h-3 w-3 opacity-70" />
          </button>
        );
      })}
      {Array.from(state.themes).map((theme) => (
        <button
          key={`theme-${theme}`}
          type="button"
          onClick={() => onChange({ ...state, themes: toggle(state.themes, theme) })}
          title={`Прибрати фільтр «${theme}»`}
          className={SELECTED_FILTER_CHIP}
        >
          {theme}
          <X className="h-3 w-3 opacity-70" />
        </button>
      ))}
    </div>
  );
}

import { useMemo } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";
import {
  REQUEST_ZONES,
  ZONE_ICONS,
  ZONE_LABELS,
  ZONE_TONE,
  type DevRequest,
  type RequestZone,
} from "./types";

/**
 * Фільтри дошки: зона, тема, «нерозібрані».
 *
 * ЧОМУ ЧІПИ, А НЕ ВИПАДАЙКИ. Фільтр тут вмикають, дивлячись на дошку, і
 * найчастіше на один клік: «покажи все про вигляд». Випадайка на кожен фільтр
 * — це два кліки й закритий список, у якому не видно, скільки чого є. Чіп
 * одразу показує і назву, і кількість, і чи він увімкнений.
 *
 * У МЕЖАХ ГРУПИ — АБО, МІЖ ГРУПАМИ — І. Дві зони разом означають «вигляд або
 * швидкість», а зона плюс тема — «вигляд І в темі навігація». Це те, чого
 * очікують від фільтрів скрізь, і саме тому правило не варто вигадувати своє.
 *
 * Чіпи з нулем не показуємо: фільтр, який гарантовано дасть порожньо, —
 * не вибір, а пастка.
 *
 * ЧІПА «НЕРОЗІБРАНІ» ТУТ БІЛЬШЕ НЕМАЄ. Він рахував картки без напрямку АБО без
 * зони — і на живій дошці це виявилась половина всіх карток. Фільтр, під який
 * підпадає половина, нічого не звужує: він не каже «оце потребує уваги», він
 * каже «тут усе». Якщо колись знадобиться, це має бути окремий вигляд, а не
 * чіп поруч із зонами.
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

const CHIP =
  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-2xs font-medium transition-colors";

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
      Array.from(counts.themes.entries())
        // Часті теми першими: рідкісна тема на початку ряду з'їдає місце в тих,
        // хто справді збирає роботу.
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "uk"))
        .slice(0, 6),
    [counts.themes]
  );

  const zoneList = REQUEST_ZONES.filter((zone) => (counts.zones.get(zone) ?? 0) > 0);
  const active = hasActiveFilters(state);

  if (zoneList.length === 0 && themeList.length === 0) return null;

  return (
    // Один ряд зі скролом, а не перенос: на вузькому екрані чіпи лягали в два
    // ряди й тулбар підростав удвічі, зсуваючи саму дошку вниз. Смуга тут
    // доречніша — фільтрів небагато, і горизонтальний жест звичний саме на
    // дошці, яку й так гортають убік.
    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {zoneList.map((zone) => {
        const Icon = ZONE_ICONS[zone];
        const on = state.zones.has(zone);
        return (
          <button
            key={zone}
            type="button"
            aria-pressed={on}
            onClick={() => onChange({ ...state, zones: toggle(state.zones, zone) })}
            className={cn(
              CHIP,
              on
                ? cn("border-transparent", toneSubtleClass[ZONE_TONE[zone]], toneTextClass[ZONE_TONE[zone]])
                : "border-border/60 text-muted-foreground hover:border-foreground/25 hover:text-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
            {ZONE_LABELS[zone]}
            <span className="tabular-nums opacity-70">{counts.zones.get(zone)}</span>
          </button>
        );
      })}

      {themeList.length > 0 && zoneList.length > 0 ? (
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
      ) : null}

      {themeList.map(([theme, count]) => {
        const on = state.themes.has(theme);
        return (
          <button
            key={theme}
            type="button"
            aria-pressed={on}
            onClick={() => onChange({ ...state, themes: toggle(state.themes, theme) })}
            className={cn(
              CHIP,
              on
                ? "border-transparent bg-primary/12 text-primary"
                : "border-border/60 text-muted-foreground hover:border-foreground/25 hover:text-foreground"
            )}
          >
            {theme}
            <span className="tabular-nums opacity-70">{count}</span>
          </button>
        );
      })}

      {active ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-7 gap-1.5 px-2 text-2xs text-muted-foreground"
          onClick={() => onChange(EMPTY_BOARD_FILTERS)}
        >
          <RotateCcw className="h-3 w-3" />
          скинути
        </Button>
      ) : null}
    </div>
  );
}

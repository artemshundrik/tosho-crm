/**
 * Ритм людини за квартал — та сама теплова мапа, що в «Релізах».
 *
 * НАВІЩО ТУТ, А НЕ У ВКЛАДЦІ. Ряд квадратиків за тиждень відповідає «чи
 * працювала вона цими днями», але не відповідає на питання, з яким відкривають
 * картку колеги: «як у неї взагалі з навантаженням». Тиждень надто короткий —
 * одна відпустка робить його порожнім, один аврал робить чорним. Квартал
 * показує звичку: коли людина зазвичай активна, коли її не було, і чи це
 * рівний ритм, чи сплески.
 *
 * Пороги рахуються КВАНТИЛЯМИ від власних чисел людини (`heatThresholds` із
 * «Релізів»), а не сталою шкалою: у дизайнерки 60 дій на день — норма, у
 * логіста 6 — теж норма, і спільна шкала показала б одного вічно чорним, а
 * другого вічно порожнім.
 */

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabaseClient";
import { heatLevel, heatThresholds } from "@/lib/releaseHistory";
import { pluralUk, pluralWordUk } from "@/lib/lastSeen";
import { cn } from "@/lib/utils";

/** Зелений ramp «Релізів» — щоб дві теплові мапи в застосунку читались однаково. */
const HEAT_BG = ["bg-secondary", "bg-chart-3/25", "bg-chart-3/45", "bg-chart-3/70", "bg-chart-3"] as const;

const DAYS_BACK = 91; // 13 тижнів рівно — сітка без обрізаної колонки
const MONTHS_SHORT = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];

/** Локальний день у вигляді YYYY-MM-DD. UTC тут дав би зсув на добу ввечері. */
function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeekMonday(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const shift = (copy.getDay() + 6) % 7; // нд=0 → 6, пн=1 → 0
  copy.setDate(copy.getDate() - shift);
  return copy;
}

export function PersonActivityHeatmap({ userId }: { userId: string }) {
  const [counts, setCounts] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();
        // Беремо лише мітку часу: рахувати треба кількість, а не читати події.
        const { data } = await supabase
          .from("activity_log")
          .select("created_at")
          .eq("user_id", userId)
          .gte("created_at", since)
          .limit(5000);
        if (cancelled) return;
        const next = new Map<string, number>();
        (data ?? []).forEach((row: { created_at?: string | null }) => {
          if (!row.created_at) return;
          const key = dayKey(new Date(row.created_at));
          next.set(key, (next.get(key) ?? 0) + 1);
        });
        setCounts(next);
      } catch {
        if (!cancelled) setCounts(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const grid = useMemo(() => {
    const today = new Date();
    const lastMonday = startOfWeekMonday(today);
    const weeks: { key: string; date: Date; future: boolean }[][] = [];
    // 13 колонок, остання — поточний тиждень.
    for (let w = 12; w >= 0; w -= 1) {
      const monday = new Date(lastMonday);
      monday.setDate(monday.getDate() - w * 7);
      const week = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(monday);
        date.setDate(date.getDate() + index);
        return { key: dayKey(date), date, future: date > today };
      });
      weeks.push(week);
    }
    return weeks;
  }, []);

  const thresholds = useMemo(
    () => heatThresholds([...(counts?.values() ?? [])]),
    [counts]
  );

  const total = useMemo(
    () => [...(counts?.values() ?? [])].reduce((sum, n) => sum + n, 0),
    [counts]
  );
  const activeDays = counts ? [...counts.values()].filter((n) => n > 0).length : 0;

  /** Підпис місяця над колонкою, у якій цей місяць почався. */
  const monthLabels = useMemo(() => {
    const seen = new Set<number>();
    return grid.map((week) => {
      const first = week[0];
      const month = first.date.getMonth();
      if (seen.has(month)) return "";
      seen.add(month);
      return MONTHS_SHORT[month];
    });
  }, [grid]);

  return (
    <div className="flex flex-col gap-2">
      {/* Число без одиниці нічого не каже: «49» — це дій чи днів? Обидва підписані. */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[15px] font-semibold leading-none tracking-[-0.01em]">
          <span className="tabular-nums">{total}</span> {pluralWordUk(total, "дія", "дії", "дій")}
        </span>
        <span className="text-2xs text-muted-foreground">
          за 3 місяці · {pluralUk(activeDays, "активний день", "активні дні", "активних днів")}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex gap-[3px] text-3xs leading-none text-muted-foreground">
          {monthLabels.map((label, index) => (
            <span key={index} className="w-[11px] shrink-0 overflow-visible whitespace-nowrap">
              {label}
            </span>
          ))}
        </div>
        <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, 11px)" }}>
          {grid.flatMap((week) =>
            week.map((cell) => {
              if (cell.future) return <span key={cell.key} className="h-[11px] w-[11px]" />;
              const count = counts?.get(cell.key) ?? 0;
              return (
                <span
                  key={cell.key}
                  title={`${cell.date.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" })} — ${
                    count === 0 ? "без дій" : pluralUk(count, "дія", "дії", "дій")
                  }`}
                  className={cn("h-[11px] w-[11px] rounded-[2px]", HEAT_BG[heatLevel(count, thresholds)])}
                />
              );
            })
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-3xs text-muted-foreground">
        <span>менше</span>
        {HEAT_BG.map((bg, index) => (
          <i key={index} className={cn("h-[11px] w-[11px] rounded-[2px]", bg)} aria-hidden />
        ))}
        <span>більше</span>
      </div>
    </div>
  );
}

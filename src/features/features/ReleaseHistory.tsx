import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import {
  CHANGE_TYPE_BAR,
  CHANGE_TYPE_TONE,
  compareScopes,
  groupByMonth,
  legendTotals,
  monthIn,
  monthOf,
  monthTitle,
  monthTotals,
  paceDelta,
  summarize,
  typeLabel,
  workingDays,
  type Release,
  type ScopeComparison,
} from "@/lib/releaseHistory";

/**
 * Історія релізів — для власника й SEO.
 *
 * Відповідає на інше питання, ніж стрічка «Що нового»: не «що змінилося для
 * мене», а «скільки роботи зроблено». Тому джерело тут git, а не курований
 * список анонсів — у стрічку більшість дрібних правок свідомо не потрапляє.
 *
 * ЧОМУ РОЗДІЛИ, А НЕ ДНІ: обсяг без розподілу нічого не пояснює. 112 змін за
 * місяць виглядають однаково, чи то був один великий розділ, чи дванадцять
 * дрібних. Денна деталізація потрібна рідко, тож вона всередині розділу.
 */

const DAY = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });

type ReleaseRow = {
  id: string;
  released_at: string;
  title: string | null;
  changes: unknown;
};

function useReleases() {
  return useQuery({
    queryKey: ["releases"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Release[]> => {
      const { data, error } = await supabase
        .schema("tosho")
        .from("releases")
        .select("id, released_at, title, changes")
        .order("released_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as ReleaseRow[]).map((row) => ({
        id: row.id,
        releasedAt: row.released_at,
        title: row.title,
        changes: Array.isArray(row.changes) ? (row.changes as Release["changes"]) : [],
      }));
    },
  });
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : DAY.format(date);
}

export function ReleaseHistory() {
  const { data: releases, isPending } = useReleases();
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = useMemo(() => groupByMonth(releases ?? []), [releases]);
  const allTime = useMemo(() => summarize(releases ?? []), [releases]);
  const months = useMemo(() => monthTotals(groups), [groups]);

  if (isPending) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Завантажую…</p>;
  }

  if (!releases || releases.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-semibold">Історія порожня</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Записи зʼявляться після наступного релізу.
        </p>
      </div>
    );
  }

  const [current, previous] = groups;
  const currentSummary = summarize(current.releases);
  const days = workingDays(current.releases);
  const perDay = Math.round(currentSummary.changes / Math.max(days, 1));
  // Темп, а не сума: поточний місяць ще не скінчився, і порівняння підсумків
  // показувало б падіння там, де його немає.
  const delta = previous ? paceDelta(current.releases, previous.releases) : null;

  const rows = compareScopes(current.releases, previous?.releases ?? []);
  const scale = Math.max(...rows.map((row) => Math.max(row.current, row.previous)), 1);
  const legend = legendTotals(allTime.byType);
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const monthScale = Math.max(...months.map((month) => month.changes), 1);

  return (
    <div className="grid gap-8">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <p className="text-5xl font-light leading-none tracking-tighter tabular-nums">
            {currentSummary.changes}
          </p>
          <p className="pb-1 text-sm leading-tight text-muted-foreground">
            <span className="block">
              змін у <span className="font-medium text-foreground">{monthIn(current.key)}</span>
            </span>
            <span className="block">за {days} днів роботи</span>
          </p>

          {delta !== null ? (
            <p className="ml-auto pb-1 text-right">
              <span
                className={cn(
                  "block text-xl font-semibold tabular-nums",
                  delta >= 0 ? "text-chart-3" : "text-muted-foreground"
                )}
              >
                {delta > 0 ? "+" : ""}
                {delta}%
              </span>
              <span className="text-xs text-muted-foreground">
                темп до {monthOf(previous.key)}
              </span>
            </p>
          ) : null}
        </div>

        {/* Підсумок за весь час — він же легенда до заливки смуг нижче. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground tabular-nums">{perDay}</span> у середньому
            за день
          </span>
          <span>
            <span className="font-medium text-foreground tabular-nums">{allTime.changes}</span> змін
            за весь час, із них
          </span>
          {legend.map((item) => (
            <span key={item.type} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 shrink-0 rounded-[3px]",
                  CHANGE_TYPE_BAR[item.type] ?? CHANGE_TYPE_BAR.other
                )}
              />
              <span className="font-medium text-foreground tabular-nums">{item.count}</span>
              {item.label}
            </span>
          ))}
        </div>
      </header>

      {/* Місяць до місяця. Смуга — обсяг, але поруч обов'язково скільки днів
          враховано: без цього неповний місяць читається як провальний. */}
      <section className="grid gap-2">
        <header className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-sm font-semibold tracking-tight">Місяць до місяця</h2>
          <span className="text-xs text-muted-foreground">
            жоден місяць у вибірці поки не повний
          </span>
        </header>

        <div className="grid gap-1.5">
          {months.map((month) => {
            const partial = Number(month.firstDay.slice(8, 10)) > 1;
            const ongoing = month.key === thisMonthKey;
            return (
              <div
                key={month.key}
                className="grid grid-cols-[minmax(5rem,8.5rem)_minmax(0,1fr)] items-center gap-3"
              >
                <span className="truncate text-right text-sm font-medium">
                  {monthTitle(month.key)}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-6 shrink-0 rounded-md bg-chart-3/80"
                    style={{ width: `${Math.max((month.changes / monthScale) * 55, 4)}%` }}
                  />
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground tabular-nums">
                      {month.changes}
                    </span>{" "}
                    змін за{" "}
                    <span className="font-medium text-foreground tabular-nums">{month.days}</span>{" "}
                    дн. · {month.perDay} за день
                    {/* Неповні місяці треба називати неповними, інакше коротша
                        смуга читається як «менше працювали». */}
                    {ongoing ? <em className="not-italic"> · місяць ще триває</em> : null}
                    {!ongoing && partial ? (
                      <em className="not-italic"> · історія з {formatDay(month.firstDay)}</em>
                    ) : null}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Куди пішла робота — з рискою на місці минулого місяця. */}
      <section className="grid gap-2">
        <header className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-sm font-semibold tracking-tight">Куди пішла робота</h2>
          {previous ? (
            <span className="text-xs text-muted-foreground">
              {monthTitle(current.key)} проти {monthOf(previous.key)} · риска — минулий місяць
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{monthTitle(current.key)}</span>
          )}
        </header>

        <div className="grid gap-px">
          {rows.map((row) => (
            <ScopeRow
              key={row.scope}
              row={row}
              scale={scale}
              hasPrevious={Boolean(previous)}
              open={expanded === row.scope}
              onToggle={() => setExpanded((prev) => (prev === row.scope ? null : row.scope))}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ScopeRow({
  row,
  scale,
  hasPrevious,
  open,
  onToggle,
}: {
  row: ScopeComparison;
  /** Найбільше значення обох місяців — щоб риска й смуга були в одній шкалі. */
  scale: number;
  hasPrevious: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const total = row.byType.reduce((sum, item) => sum + item.count, 0) || 1;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full cursor-pointer grid-cols-[minmax(5rem,8.5rem)_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-lg py-1.5 pr-1 text-left transition-colors hover:bg-secondary/60"
      >
        <span className="truncate text-right text-sm font-medium">{row.scope}</span>

        <span className="relative flex h-5 items-stretch">
          {/* Довжина — обсяг цього місяця, заливка — склад роботи. */}
          <span
            className="flex overflow-hidden rounded-md"
            style={{ width: `${(row.current / scale) * 100}%` }}
          >
            {row.byType.map((item) => (
              <span
                key={item.type}
                className={cn(CHANGE_TYPE_BAR[item.type] ?? CHANGE_TYPE_BAR.other)}
                style={{ width: `${(item.count / total) * 100}%` }}
                title={`${item.count} ${typeLabel(item.type)}`}
              />
            ))}
          </span>

          {hasPrevious && row.previous > 0 ? (
            <span
              aria-hidden
              title={`минулого місяця: ${row.previous}`}
              className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground/45"
              style={{ left: `${(row.previous / scale) * 100}%` }}
            />
          ) : null}
        </span>

        <span className="flex items-center justify-end gap-1.5 text-xs tabular-nums">
          <span className="font-medium">{row.current}</span>
          {hasPrevious && row.delta !== 0 ? (
            <span className="text-muted-foreground">
              {row.delta > 0 ? "+" : "−"}
              {Math.abs(row.delta)}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        </span>
      </button>

      {open ? (
        <ul className="grid gap-1 py-2 pl-[calc(8.5rem+0.75rem)] pr-2">
          <li className="flex flex-wrap gap-1 pb-1">
            {row.byType.map((item) => (
              <span
                key={item.type}
                className={cn(
                  "rounded-full px-2 py-0.5 text-3xs font-semibold",
                  CHANGE_TYPE_TONE[item.type] ?? CHANGE_TYPE_TONE.other
                )}
              >
                {item.count} {typeLabel(item.type)}
              </span>
            ))}
          </li>
          {row.changes.map((change) => (
            <li key={change.sha} className="flex gap-2 text-xs leading-5">
              <time className="w-14 shrink-0 tabular-nums text-muted-foreground">
                {formatDay(change.releasedAt)}
              </time>
              <span className="min-w-0 flex-1">{change.subject}</span>
              <code className="shrink-0 font-mono text-3xs text-muted-foreground">
                {change.sha}
              </code>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

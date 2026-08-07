import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import {
  CHANGE_TYPE_BAR,
  CHANGE_TYPE_TONE,
  buildThreads,
  compareScopes,
  groupByDay,
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
  type DayGroup,
  type Release,
  type ScopeComparison,
  type Thread,
} from "@/lib/releaseHistory";

/**
 * Історія релізів — для власника й SEO.
 *
 * Відповідає на інше питання, ніж стрічка «Що нового»: не «що змінилося для
 * мене», а «скільки роботи зроблено». Тому джерело тут git, а не курований
 * список анонсів — у стрічку більшість дрібних правок свідомо не потрапляє.
 *
 * Головна одиниця — ДЕНЬ, бо саме так про роботу й питають: «що зроблено
 * сьогодні». Місячні зведення лишились нижче, вони відповідають на інше
 * питання — «куди пішов місяць».
 */

const DAY_FULL = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Kiev",
});
const DAY_SHORT = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Kiev",
});
const TIME = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Kiev",
});

/** Скільки днів показуємо в рейці. Далі за них ходять уже через місяці. */
const RAIL_DAYS = 14;

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

function fmt(iso: string, format: Intl.DateTimeFormat): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : format.format(date);
}

/**
 * Час показуємо лише там, де він справжній. Записи, зроблені до того, як
 * записувач почав зберігати час коміта, його не мають — там краще порожньо,
 * ніж вигадана хвилина.
 */
function hasRealTime(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}

export function ReleaseHistory() {
  const { data: releases, isPending } = useReleases();
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [openScope, setOpenScope] = useState<string | null>(null);

  const days = useMemo(() => groupByDay(releases ?? []), [releases]);
  const groups = useMemo(() => groupByMonth(releases ?? []), [releases]);
  const allTime = useMemo(() => summarize(releases ?? []), [releases]);
  const months = useMemo(() => monthTotals(groups), [groups]);

  if (isPending) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Завантажую…</p>;
  }

  if (!releases || releases.length === 0 || days.length === 0) {
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
  const workDays = workingDays(current.releases);
  const perDay = Math.round(currentSummary.changes / Math.max(workDays, 1));
  // Темп, а не сума: поточний місяць ще не скінчився, і порівняння підсумків
  // показувало б падіння там, де його немає.
  const delta = previous ? paceDelta(current.releases, previous.releases) : null;

  const rail = days.slice(0, RAIL_DAYS).reverse();
  const railMax = Math.max(...rail.map((day) => day.changes.length), 1);
  const day = days.find((item) => item.day === pickedDay) ?? days[0];
  const legend = legendTotals(allTime.byType);

  const rows = compareScopes(current.releases, previous?.releases ?? []);
  const scopeScale = Math.max(...rows.map((row) => Math.max(row.current, row.previous)), 1);
  const monthScale = Math.max(...months.map((month) => month.changes), 1);
  const thisMonthKey = new Date().toISOString().slice(0, 7);

  return (
    <div className="grid gap-9">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <p className="text-5xl font-light leading-none tracking-tighter tabular-nums">
            {currentSummary.changes}
          </p>
          <p className="pb-1 text-sm leading-tight text-muted-foreground">
            <span className="block">
              змін у <span className="font-medium text-foreground">{monthIn(current.key)}</span>
            </span>
            <span className="block">за {workDays} днів роботи</span>
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

        {/* Підсумок за весь час — він же легенда до кольорів нижче. */}
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

      {/* ── По днях ───────────────────────────────────────────────── */}
      <section className="grid gap-4">
        <div className="flex items-end gap-1" role="group" aria-label="Дні">
          {rail.map((item) => {
            const active = item.day === day.day;
            return (
              <button
                key={item.day}
                type="button"
                onClick={() => {
                  setPickedDay(item.day);
                  setOpenThread(null);
                }}
                aria-pressed={active}
                title={`${fmt(`${item.day}T12:00:00Z`, DAY_SHORT)} — ${item.changes.length} змін`}
                className="group flex flex-1 cursor-pointer flex-col items-center justify-end gap-1.5"
              >
                <span
                  className={cn(
                    "w-full rounded-md transition-colors",
                    active ? "bg-chart-3" : "bg-secondary group-hover:bg-muted-foreground/40"
                  )}
                  style={{ height: `${Math.max((item.changes.length / railMax) * 44, 4)}px` }}
                />
                <span
                  className={cn(
                    "text-3xs tabular-nums transition-colors",
                    active ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {item.day.slice(8, 10)}
                </span>
              </button>
            );
          })}
        </div>

        <DayPanel
          day={day}
          openThread={openThread}
          onToggleThread={(id) => setOpenThread((prev) => (prev === id ? null : id))}
        />
      </section>

      {/* ── Місяць до місяця ─────────────────────────────────────── */}
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
                    {ongoing ? <em className="not-italic"> · місяць ще триває</em> : null}
                    {!ongoing && partial ? (
                      <em className="not-italic">
                        {" "}
                        · історія з {fmt(`${month.firstDay}T12:00:00Z`, DAY_SHORT)}
                      </em>
                    ) : null}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Куди пішла робота ────────────────────────────────────── */}
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
              scale={scopeScale}
              hasPrevious={Boolean(previous)}
              open={openScope === row.scope}
              onToggle={() => setOpenScope((prev) => (prev === row.scope ? null : row.scope))}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DayPanel({
  day,
  openThread,
  onToggleThread,
}: {
  day: DayGroup;
  openThread: string | null;
  onToggleThread: (id: string) => void;
}) {
  const threads = useMemo(() => buildThreads(day.changes), [day.changes]);
  const first = day.changes[0];
  const last = day.changes[day.changes.length - 1];
  const span =
    first && last && hasRealTime(first.releasedAt) && first.releasedAt !== last.releasedAt
      ? `${fmt(first.releasedAt, TIME)} — ${fmt(last.releasedAt, TIME)}`
      : null;

  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight first-letter:uppercase">
          {fmt(`${day.day}T12:00:00Z`, DAY_FULL)}
        </h2>
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{day.changes.length}</span>{" "}
          змін
          {span ? ` · ${span}` : null}
          {threads.length < day.changes.length ? ` · ${threads.length} справ` : null}
        </span>
      </header>

      <div className="grid gap-1.5">
        {threads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            open={openThread === thread.id}
            onToggle={() => onToggleThread(thread.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Одна справа за день. Кілька комітів про одне зливаються в сюжет: список із
 * тринадцяти рядків читається як шум, п'ять справ — як зроблена робота.
 */
function ThreadCard({
  thread,
  open,
  onToggle,
}: {
  thread: Thread;
  open: boolean;
  onToggle: () => void;
}) {
  const solo = thread.count === 1;
  const time = hasRealTime(thread.lead.releasedAt) ? fmt(thread.lead.releasedAt, TIME) : null;

  const head = (
    <>
      <span className="w-11 shrink-0 pt-px text-xs tabular-nums text-muted-foreground">{time}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug">{thread.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs text-muted-foreground">
          {thread.scopes.map((scope) => (
            <span key={scope} className="rounded-full bg-secondary px-2 py-0.5 font-medium">
              {scope}
            </span>
          ))}
          {thread.byType.map((item) => (
            <span key={item.type} className="inline-flex items-center gap-1">
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-[2px]",
                  CHANGE_TYPE_BAR[item.type] ?? CHANGE_TYPE_BAR.other
                )}
              />
              {item.count} {typeLabel(item.type)}
            </span>
          ))}
        </span>
      </span>
    </>
  );

  if (solo) {
    return (
      <div className="flex gap-3 rounded-xl border border-border bg-card px-4 py-3">{head}</div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-secondary/50"
      >
        {head}
        <span className="flex shrink-0 items-center gap-1.5 pt-px text-xs text-muted-foreground">
          <span className="tabular-nums">ще {thread.count - 1}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open ? (
        <ul className="grid gap-1.5 border-t border-border/70 px-4 py-3">
          {thread.rest.map((change) => (
            <li key={change.sha} className="flex gap-3 text-xs leading-5">
              <time className="w-11 shrink-0 tabular-nums text-muted-foreground">
                {hasRealTime(change.releasedAt) ? fmt(change.releasedAt, TIME) : null}
              </time>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "font-semibold",
                    change.type === "feat"
                      ? "text-chart-3"
                      : change.type === "fix"
                        ? "text-chart-7"
                        : "text-muted-foreground"
                  )}
                >
                  {typeLabel(change.type)}.
                </span>{" "}
                {change.subject}
              </span>
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
                {fmt(change.releasedAt, DAY_SHORT)}
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

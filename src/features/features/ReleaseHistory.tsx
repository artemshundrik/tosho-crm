import { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReleases } from "@/features/features/releaseQueries";
import {
  CHANGE_TYPE_BAR,
  buildThreads,
  groupByDay,
  groupByMonth,
  legendTotals,
  monthOf,
  monthTitle,
  monthTotals,
  paceDelta,
  scopeBreakdown,
  summarize,
  type DayGroup,
  type Release,
  type Thread,
} from "@/lib/releaseHistory";

/**
 * Історія релізів — для власника й SEO.
 *
 * Відповідає на інше питання, ніж стрічка «Що нового»: не «що змінилося для
 * мене», а «скільки роботи зроблено». Тому джерело тут git, а не курований
 * список анонсів — у стрічку більшість дрібних правок свідомо не потрапляє.
 *
 * ОДНА РЕЙКА ЗАМІСТЬ ТАБІВ: періоди були сегментованим перемикачем по місяцях,
 * і це ламалось від власного зростання — в історії вже 9 місяців, за рік буде
 * 21. Рейка показує місяці, клік розкриває місяць у дні, і на будь-якій
 * глибині це та сама смуга, лише з іншою кількістю поділок. Вона ж замінила
 * окремий блок «місяць до місяця»: порівняння місяців тепер видно просто з
 * висоти стовпчиків.
 *
 * ДВІ КОЛОНКИ: підсумки, розподіл і події йшли вниз одне за одним, і щоб
 * скласти картину, доводилось гортати. Тепер зведення липне праворуч, а
 * прокрутка потрібна лише щоб читати більше подій дня.
 */

const DAY_FULL = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  weekday: "long",
  timeZone: "Europe/Kiev",
});
const TIME = new Intl.DateTimeFormat("uk-UA", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Kiev",
});

/** Рівень масштабу рейки. */
type Zoom = { level: "months" } | { level: "days"; month: string };

function fmt(iso: string, format: Intl.DateTimeFormat): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : format.format(date);
}

export function ReleaseHistory() {
  const { data: all, isPending } = useReleases();
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const releases = useMemo(() => all ?? [], [all]);
  const days = useMemo(() => groupByDay(releases), [releases]);
  const groups = useMemo(() => groupByMonth(releases), [releases]);
  const months = useMemo(() => monthTotals(groups), [groups]);

  if (isPending) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Завантажую…</p>;
  }

  if (days.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-semibold">Історія порожня</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Записи зʼявляться після наступного релізу.
        </p>
      </div>
    );
  }

  // Стартуємо одразу в останньому місяці: питають майже завжди про нього.
  const view: Zoom = zoom ?? { level: "days", month: months[0].key };
  const inMonth = view.level === "days";
  const month = view.level === "days" ? view.month : null;

  const scopedDays = month ? days.filter((item) => item.day.startsWith(month)) : days;
  const scopedReleases = month
    ? releases.filter((release) => release.releasedAt.slice(0, 7) === month)
    : releases;

  const day = scopedDays.find((item) => item.day === pickedDay) ?? scopedDays[0] ?? days[0];

  const summary = summarize(scopedReleases);
  const dayCount = scopedDays.length;
  const perDay = dayCount === 0 ? 0 : summary.changes / dayCount;

  const monthIndex = month ? months.findIndex((item) => item.key === month) : -1;
  const previousMonth = monthIndex >= 0 ? months[monthIndex + 1] : undefined;
  const delta =
    month && previousMonth
      ? paceDelta(
          scopedReleases,
          releases.filter((release) => release.releasedAt.slice(0, 7) === previousMonth.key)
        )
      : null;

  // Рейка йде зліва направо від старого до нового — так читають час.
  const railUnits = inMonth
    ? scopedDays
        .map((item) => ({ key: item.day, value: item.changes.length, label: item.day.slice(8, 10) }))
        .reverse()
    : months
        .map((item) => ({
          key: item.key,
          value: item.changes,
          label: monthTitle(item.key).slice(0, 3).toLowerCase(),
        }))
        .reverse();
  const railMax = Math.max(...railUnits.map((unit) => unit.value), 1);
  const selectedKey = inMonth ? day.day : "";

  return (
    <div className="grid gap-4">
      {/* Шапка: де ми і скільки — одним рядком, без великих плиток. */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          {inMonth ? (
            <button
              type="button"
              onClick={() => {
                setZoom({ level: "months" });
                setPickedDay(null);
              }}
              className="flex cursor-pointer items-center gap-1 rounded-md py-0.5 pr-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Усе
            </button>
          ) : null}
          <h2 className="text-base font-semibold tracking-tight">
            {month ? monthTitle(month) : "Уся історія"}
          </h2>
          {!inMonth ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              · {months.length} міс.
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Kpi value={String(summary.changes)} label="змін" />
          <Kpi value={perDay.toFixed(1)} label="за день" />
          <Kpi value={String(dayCount)} label="днів" />
          {delta !== null && previousMonth ? (
            <Kpi
              value={`${delta > 0 ? "+" : ""}${delta}%`}
              label={`темп до ${monthOf(previousMonth.key)}`}
              tone={delta >= 0 ? "up" : undefined}
            />
          ) : null}
        </div>
      </header>

      {/* Рейка. Місяці або дні — той самий елемент, інша кількість поділок. */}
      <section className="grid gap-1.5">
        <div className="flex h-14 items-end gap-0.5" role="group" aria-label="Період">
          {railUnits.map((unit) => {
            const active = unit.key === selectedKey;
            return (
              <button
                key={unit.key}
                type="button"
                aria-pressed={active}
                title={`${unit.key} — ${unit.value} змін`}
                onClick={() => {
                  if (inMonth) {
                    setPickedDay(unit.key);
                  } else {
                    setZoom({ level: "days", month: unit.key });
                    setPickedDay(null);
                  }
                }}
                className="group flex min-w-0 flex-1 cursor-pointer flex-col justify-end gap-1"
              >
                <span
                  className={cn(
                    "w-full rounded-[3px] transition-colors",
                    active ? "bg-chart-3" : "bg-secondary group-hover:bg-muted-foreground/40"
                  )}
                  style={{ height: `${Math.max((unit.value / railMax) * 42, 3)}px` }}
                />
                <span
                  className={cn(
                    "truncate text-center text-3xs tabular-nums transition-colors",
                    active ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {unit.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="flex justify-between border-t border-border/60 pt-1.5 text-3xs text-muted-foreground">
          <span>
            {inMonth ? "дні місяця — клікай, щоб відкрити" : "місяці — клікай, щоб розкрити в дні"}
          </span>
          <span className="tabular-nums">{railUnits.length} поділок</span>
        </p>
      </section>

      {/* Тіло: події зліва, зведення липне справа. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <DayPanel day={day} />

        <aside className="grid gap-3 lg:sticky lg:top-2">
          <div className="rounded-xl border border-border bg-card p-3.5">
            <h3 className="mb-2.5 text-3xs font-bold uppercase tracking-widest text-muted-foreground">
              Куди пішла робота
            </h3>
            <ScopeList releases={scopedReleases} />
          </div>

          <div className="rounded-xl border border-border bg-card p-3.5">
            <h3 className="mb-2 text-3xs font-bold uppercase tracking-widest text-muted-foreground">
              Склад
            </h3>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {legendTotals(summary.byType).map((item) => (
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
          </div>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ value, label, tone }: { value: string; label: string; tone?: "up" }) {
  return (
    <span className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
      <b
        className={cn(
          "text-xl font-semibold tracking-tight tabular-nums",
          tone === "up" ? "text-chart-3" : "text-foreground"
        )}
      >
        {value}
      </b>
      {label}
    </span>
  );
}

function ScopeList({ releases }: { releases: Release[] }) {
  const buckets = useMemo(() => scopeBreakdown(releases).slice(0, 9), [releases]);
  const max = buckets[0]?.total ?? 1;

  return (
    <div className="grid gap-2">
      {buckets.map((bucket) => (
        <div key={bucket.scope} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">{bucket.scope}</span>
            <span className="font-medium tabular-nums">{bucket.total}</span>
          </div>
          <span
            className="flex h-1.5 overflow-hidden rounded-full"
            style={{ width: `${Math.max((bucket.total / max) * 100, 4)}%` }}
          >
            {bucket.byType.map((item) => (
              <span
                key={item.type}
                className={cn(CHANGE_TYPE_BAR[item.type] ?? CHANGE_TYPE_BAR.other)}
                style={{ width: `${(item.count / bucket.total) * 100}%` }}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayPanel({ day }: { day: DayGroup }) {
  const threads = useMemo(() => buildThreads(day.changes), [day.changes]);
  const first = day.changes[0];
  const last = day.changes[day.changes.length - 1];
  const span =
    first && last && first.releasedAt !== last.releasedAt
      ? `${fmt(first.releasedAt, TIME)} — ${fmt(last.releasedAt, TIME)}`
      : null;

  return (
    <div className="grid gap-2.5">
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
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </div>
    </div>
  );
}

/**
 * Одна справа за день. Кілька комітів про одне зливаються в сюжет: список із
 * тринадцяти рядків читається як шум, п'ять справ — як зроблена робота.
 */
function ThreadCard({ thread }: { thread: Thread }) {
  return (
    <article className="rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-baseline gap-3">
        <time className="w-10 shrink-0 text-3xs tabular-nums text-muted-foreground">
          {fmt(thread.lead.releasedAt, TIME)}
        </time>
        {/* Технічний оригінал у title: переказ AI може збрехати, і тоді це
            єдиний спосіб помітити. */}
        <span
          className="min-w-0 flex-1 text-sm leading-snug"
          title={thread.lead.plain ? thread.lead.subject : undefined}
        >
          {thread.title}
        </span>
      </div>

      <div className="ml-[3.25rem] mt-1.5 flex flex-wrap items-center gap-1.5 text-3xs text-muted-foreground">
        {thread.scopes.map((scope) => (
          <span key={scope} className="rounded-full bg-secondary px-2 py-0.5 font-medium">
            {scope}
          </span>
        ))}
        {thread.count > 1 ? <span className="tabular-nums">{thread.count} зміни</span> : null}
      </div>

      {thread.rest.length > 0 ? (
        <ul className="ml-[3.25rem] mt-2 grid gap-1.5 border-t border-border/60 pt-2">
          {thread.rest.map((change) => (
            <li key={change.sha} className="flex gap-3 text-xs leading-5 text-muted-foreground">
              <time className="w-10 shrink-0 text-3xs tabular-nums">
                {fmt(change.releasedAt, TIME)}
              </time>
              <span className="min-w-0 flex-1" title={change.plain ? change.subject : undefined}>
                {change.plain ?? change.subject}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

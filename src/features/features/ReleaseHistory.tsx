import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import {
  CHANGE_TYPE_BAR,
  CHANGE_TYPE_TONE,
  groupByMonth,
  monthIn,
  monthOf,
  monthTitle,
  paceDelta,
  scopeBreakdown,
  summarize,
  typeLabel,
  workingDays,
  type Release,
  type ScopeBucket,
} from "@/lib/releaseHistory";

/**
 * Історія релізів — для власника й SEO.
 *
 * Відповідає на інше питання, ніж стрічка «Що нового»: не «що змінилося для
 * мене», а «скільки роботи зроблено». Тому джерело тут git, а не курований
 * список анонсів — у стрічку більшість дрібних правок свідомо не потрапляє.
 *
 * ЧОМУ САМЕ РОЗДІЛИ, А НЕ ДНІ: обсяг без розподілу нічого не пояснює. 112 змін
 * за місяць виглядають однаково, чи то був один великий розділ, чи дванадцять
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

export function ReleaseHistory() {
  const { data: releases, isPending } = useReleases();
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = useMemo(() => groupByMonth(releases ?? []), [releases]);
  const allTime = useMemo(() => summarize(releases ?? []), [releases]);

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

  return (
    <div className="grid gap-8">
      {/* Обсяг останнього місяця — перше, на що дивляться. */}
      <header className="grid gap-4">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <p className="text-5xl font-light leading-none tracking-tighter tabular-nums">
            {currentSummary.changes}
          </p>
          <p className="pb-1 text-sm leading-tight text-muted-foreground">
            <span className="block">
              змін у{" "}
              <span className="font-medium text-foreground">{monthIn(current.key)}</span>
            </span>
            <span className="block">за {days} днів роботи</span>
          </p>

          {delta !== null ? (
            <p className="ml-auto pb-1 text-right">
              <span
                className={cn(
                  "block text-xl font-semibold tabular-nums",
                  delta >= 0 ? "text-success-foreground" : "text-muted-foreground"
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
          {allTime.byType.map((item) => (
            <span key={item.type} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 shrink-0 rounded-[3px]",
                  CHANGE_TYPE_BAR[item.type] ?? CHANGE_TYPE_BAR.other
                )}
              />
              <span className="font-medium text-foreground tabular-nums">{item.count}</span>
              {typeLabel(item.type)}
            </span>
          ))}
        </div>
      </header>

      {groups.map((group) => {
        const summary = summarize(group.releases);
        const buckets = scopeBreakdown(group.releases);
        const max = buckets[0]?.total ?? 1;

        return (
          <section key={group.key} className="grid gap-3">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold tracking-tight">{monthTitle(group.key)}</h2>
              <span className="text-xs text-muted-foreground">
                {summary.changes} змін · {summary.releases} релізів · {buckets.length} розділів
              </span>
            </header>

            <div className="grid gap-px">
              {buckets.map((bucket) => (
                <ScopeRow
                  key={bucket.scope}
                  bucket={bucket}
                  share={bucket.total / max}
                  open={expanded === `${group.key}:${bucket.scope}`}
                  onToggle={() =>
                    setExpanded((prev) =>
                      prev === `${group.key}:${bucket.scope}`
                        ? null
                        : `${group.key}:${bucket.scope}`
                    )
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ScopeRow({
  bucket,
  share,
  open,
  onToggle,
}: {
  bucket: ScopeBucket;
  /** Частка від найбільшого розділу місяця — задає довжину смуги. */
  share: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full cursor-pointer grid-cols-[minmax(5rem,8.5rem)_minmax(0,1fr)_2.25rem] items-center gap-3 rounded-lg py-1.5 pr-1 text-left transition-colors hover:bg-secondary/60"
      >
        <span className="truncate text-right text-sm font-medium">{bucket.scope}</span>

        {/* Довжина смуги — обсяг, заливка — склад роботи. Рейка на всю ширину
            навмисно немає: однакові рамки з'їдають саме те порівняння, заради
            якого смуга й малюється. */}
        <span
          className="flex h-5 min-w-px items-stretch overflow-hidden rounded-md bg-secondary"
          style={{ width: `${Math.max(share * 100, 3)}%` }}
        >
          {bucket.byType.map((item) => (
            <span
              key={item.type}
              className={cn(CHANGE_TYPE_BAR[item.type] ?? CHANGE_TYPE_BAR.other)}
              style={{ width: `${(item.count / bucket.total) * 100}%` }}
              title={`${item.count} ${typeLabel(item.type)}`}
            />
          ))}
        </span>

        <span className="flex items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground">
          {bucket.total}
          <ChevronDown
            className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open ? (
        <ul className="grid gap-1 py-2 pl-[calc(8.5rem+0.75rem)] pr-2">
          <li className="flex flex-wrap gap-1 pb-1">
            {bucket.byType.map((item) => (
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
          {bucket.changes.map((change) => {
            const date = new Date(change.releasedAt);
            return (
              <li key={change.sha} className="flex gap-2 text-xs leading-5">
                <time className="w-14 shrink-0 tabular-nums text-muted-foreground">
                  {Number.isNaN(date.getTime()) ? "—" : DAY.format(date)}
                </time>
                <span className="min-w-0 flex-1">{change.subject}</span>
                <code className="shrink-0 font-mono text-3xs text-muted-foreground">
                  {change.sha}
                </code>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

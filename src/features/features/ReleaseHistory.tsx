import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import {
  CHANGE_TYPE_TONE,
  groupByMonth,
  scopeLabel,
  summarize,
  typeLabel,
  type Release,
} from "@/lib/releaseHistory";

/**
 * Історія релізів — для власника й SEO.
 *
 * Відповідає на інше питання, ніж стрічка «Що нового»: не «що змінилося для
 * мене», а «скільки роботи зроблено». Тому джерело тут git, а не курований
 * список анонсів — у стрічку більшість дрібних правок свідомо не потрапляє.
 */

const MONTH = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" });
const DAY = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" });

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
  const total = useMemo(() => summarize(releases ?? []), [releases]);

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

  return (
    <div className="grid gap-6">
      {/* Підсумок за весь час — щоб масштаб було видно одразу. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={total.changes} label="змін усього" />
        <Stat value={total.releases} label="релізів" />
        {total.byType.slice(0, 2).map((item) => (
          <Stat key={item.type} value={item.count} label={typeLabel(item.type)} />
        ))}
      </div>

      {groups.map((group) => {
        const monthSummary = summarize(group.releases);
        const monthDate = new Date(`${group.key}-01T00:00:00Z`);
        return (
          <section key={group.key}>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-2">
              <h2 className="text-sm font-semibold tracking-tight">
                {Number.isNaN(monthDate.getTime()) ? group.key : MONTH.format(monthDate)}
              </h2>
              <span className="text-xs text-muted-foreground">
                {monthSummary.changes} змін · {monthSummary.releases} релізів
              </span>
              <span className="flex flex-wrap gap-1">
                {monthSummary.topScopes.map((item) => (
                  <span
                    key={item.scope}
                    className="rounded-full bg-secondary px-2 py-0.5 text-3xs text-muted-foreground"
                  >
                    {item.scope} · {item.count}
                  </span>
                ))}
              </span>
            </header>

            {group.releases.map((release) => {
              const summary = summarize([release]);
              const open = expanded === release.id;
              const date = new Date(release.releasedAt);
              return (
                <div key={release.id} className="border-b border-border/70">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : release.id)}
                    aria-expanded={open}
                    className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left transition-colors hover:bg-secondary/40"
                  >
                    <time className="w-[6.5rem] shrink-0 text-xs tabular-nums text-muted-foreground">
                      {Number.isNaN(date.getTime()) ? "—" : DAY.format(date)}
                    </time>

                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium tabular-nums">
                        {summary.changes} змін
                      </span>
                      {summary.byType.map((item) => (
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
                    </span>

                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>

                  {open ? (
                    <ul className="grid gap-1 pb-3 pl-[7.5rem] pr-2">
                      {release.changes.map((item) => (
                        <li key={item.sha} className="flex gap-2 text-xs leading-5">
                          <span className="w-[5.5rem] shrink-0 truncate text-muted-foreground">
                            {scopeLabel(item.scope)}
                          </span>
                          <span className="min-w-0 flex-1">{item.subject}</span>
                          <code className="shrink-0 font-mono text-3xs text-muted-foreground">
                            {item.sha}
                          </code>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

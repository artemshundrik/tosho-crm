import React from "react";
import { ChevronDown, History } from "lucide-react";
import { buildDayDigests, type ThreadEntry } from "@/lib/taskThread";
import { cn } from "@/lib/utils";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

/**
 * Історія справи згорнута в один рядок на день.
 *
 * За замовчуванням прихована цілком: у важкій задачі подій під сотню, і сирим
 * списком вони забивають панель так, що розмови не видно взагалі.
 */
export function ThreadHistory({ events }: { events: ThreadEntry[] }) {
  const [open, setOpen] = React.useState(false);
  const [openDays, setOpenDays] = React.useState<Set<string>>(() => new Set());

  const digests = React.useMemo(() => buildDayDigests(events, new Date()), [events]);
  if (digests.length === 0) return null;

  const toggleDay = (key: string) =>
    setOpenDays((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-2.5 py-1.5",
          "text-2xs text-muted-foreground transition-colors hover:bg-muted/40",
          open && "border-solid text-foreground/80"
        )}
      >
        <History className="h-3.5 w-3.5" />
        {open ? "Історія" : "Показати історію"}
        <span className="ml-auto tabular-nums">
          {digests.length} {digests.length === 1 ? "день" : "днів"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open
        ? digests.map((digest) => {
            const expanded = openDays.has(digest.key);
            return (
              <React.Fragment key={digest.key}>
                <button
                  type="button"
                  onClick={() => toggleDay(digest.key)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="w-10 shrink-0 pt-px text-2xs font-semibold tabular-nums text-foreground/80">
                    {digest.label}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{digest.summary}</span>
                    {digest.marks.length > 0 ? (
                      <span className="flex gap-1">
                        {digest.marks.map((mark, index) => (
                          <span
                            key={`${mark}-${index}`}
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              mark === "rev" && "bg-warning-foreground",
                              mark === "dl" && "bg-destructive",
                              mark === "vis" && "bg-[hsl(var(--success-solid))]"
                            )}
                          />
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 pt-0.5 text-3xs tabular-nums text-muted-foreground">
                    {digest.count}
                  </span>
                </button>

                {expanded ? (
                  <div className="mb-1 ml-[52px] flex flex-col gap-1 border-l-2 border-border/40 pl-2.5">
                    {digest.entries.map((item) => (
                      <span key={item.id} className="flex gap-2 text-2xs text-muted-foreground">
                        <span className="shrink-0 tabular-nums opacity-70">{timeOf(item.createdAt)}</span>
                        <span className="min-w-0">{item.body}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </React.Fragment>
            );
          })
        : null}
    </div>
  );
}

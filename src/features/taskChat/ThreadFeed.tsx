import React from "react";
import { CheckCheck, ChevronDown, Clock, Lock, MessageSquare, Send } from "lucide-react";
import { AvatarBase } from "@/components/app/avatar-kit";
import { buildThreadBlocks, type ThreadEntry } from "@/lib/taskThread";
import { cn } from "@/lib/utils";
import { eventTone } from "./threadEvents";

type Props = {
  entries: ThreadEntry[];
  userId: string | null;
  memberName: (userId: string | null) => string;
  memberAvatar: (userId: string | null) => string | null;
  /** Імена, згадка яких підсвічує баббл (я і мої псевдоніми). */
  mentionNames: string[];
  onRetry?: () => void;
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

/** Колір імені автора — у тон аватарки, щоб люди впізнавались периферійним зором. */
const AUTHOR_TONES = [
  "text-[hsl(219_70%_42%)] dark:text-[hsl(219_80%_70%)]",
  "text-[hsl(291_46%_40%)] dark:text-[hsl(291_60%_72%)]",
  "text-[hsl(160_55%_26%)] dark:text-[hsl(160_50%_62%)]",
  "text-[hsl(24_76%_36%)] dark:text-[hsl(24_80%_66%)]",
];

function authorTone(userId: string | null): string {
  if (!userId) return AUTHOR_TONES[0];
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) % 997;
  }
  return AUTHOR_TONES[hash % AUTHOR_TONES.length];
}

export function ThreadFeed({
  entries,
  userId,
  memberName,
  memberAvatar,
  mentionNames,
  onRetry,
}: Props) {
  const [collapsedDays, setCollapsedDays] = React.useState<Set<string>>(() => new Set());

  const blocks = React.useMemo(
    () => buildThreadBlocks(entries, { userId, now: new Date() }),
    [entries, userId]
  );

  const toggleDay = (key: string) =>
    setCollapsedDays((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const mentionsMe = React.useCallback(
    (body: string) =>
      mentionNames.some((name) => name.length > 1 && body.toLowerCase().includes(`@${name.toLowerCase()}`)),
    [mentionNames]
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-5 py-10 text-center">
        <span className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-muted text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold">Тут поки тихо</span>
        <span className="max-w-[32ch] text-xs text-muted-foreground">
          Напишіть перше повідомлення — його побачить уся команда по цій справі.
        </span>
      </div>
    );
  }

  let currentDay: string | null = null;

  return (
    <div className="flex flex-col gap-2.5 px-2.5 py-3">
      {blocks.map((block, index) => {
        if (block.type === "day") {
          currentDay = block.key;
          const collapsed = collapsedDays.has(block.key);
          return (
            <button
              key={`day-${block.key}`}
              type="button"
              onClick={() => toggleDay(block.key)}
              aria-expanded={!collapsed}
              className="sticky top-1 z-10 mx-auto inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted px-2.5 py-0.5 text-2xs font-semibold text-muted-foreground transition-colors hover:bg-muted/70"
            >
              {block.label}
              <span className="font-normal opacity-75">· {block.count}</span>
              <ChevronDown
                className={cn("h-3 w-3 transition-transform", collapsed && "-rotate-90")}
              />
            </button>
          );
        }

        if (currentDay && collapsedDays.has(currentDay)) return null;

        if (block.type === "service") {
          const tone = eventTone(block.entry.eventType);
          return (
            <div
              key={block.entry.id}
              className="mx-auto flex max-w-[88%] items-center gap-1.5 rounded-full border border-border/40 bg-muted px-2.5 py-0.5 text-2xs text-muted-foreground"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  tone === "ok" && "bg-[hsl(var(--success-solid))]",
                  tone === "warn" && "bg-warning-foreground",
                  tone === "neutral" && "bg-border"
                )}
              />
              <span className="truncate">{block.entry.body}</span>
              <span className="shrink-0 tabular-nums opacity-70">{timeOf(block.entry.createdAt)}</span>
            </div>
          );
        }

        return (
          <div key={`group-${index}`} className="flex flex-col gap-0.5">
            {block.entries.map((entry, position) => {
              const isLast = position === block.entries.length - 1;
              const restricted = entry.visibility === "finance";
              const highlighted = !block.own && !restricted && mentionsMe(entry.body);

              return (
                <div
                  key={entry.id}
                  className={cn("flex items-end gap-1.5", block.own && "flex-row-reverse")}
                >
                  {block.own ? null : isLast ? (
                    <AvatarBase
                      size={24}
                      src={memberAvatar(block.authorId)}
                      name={memberName(block.authorId)}
                      className="shrink-0"
                    />
                  ) : (
                    <span className="w-6 shrink-0" />
                  )}

                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-2.5 py-1.5 text-xs leading-snug",
                      entry.pending && "opacity-60",
                      restricted
                        ? "border border-warning-soft-border bg-warning-soft text-foreground"
                        : highlighted
                          ? "border border-primary/30 bg-primary/10 text-foreground"
                          : block.own
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                      isLast && (block.own ? "rounded-br-sm" : "rounded-bl-sm")
                    )}
                  >
                    {restricted && position === 0 ? (
                      <span className="mb-0.5 flex items-center gap-1 text-3xs font-semibold uppercase tracking-wide text-warning-foreground">
                        <Lock className="h-2.5 w-2.5" /> Внутрішня
                      </span>
                    ) : null}

                    {!block.own && position === 0 ? (
                      <span
                        className={cn("mb-0.5 block text-2xs font-semibold", authorTone(block.authorId))}
                      >
                        {memberName(block.authorId)}
                      </span>
                    ) : null}

                    <span
                      className={cn(
                        "float-right ml-2 mt-1.5 inline-flex items-center gap-1 text-3xs tabular-nums",
                        block.own && !restricted
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground"
                      )}
                    >
                      {entry.pending ? "надсилаю…" : timeOf(entry.createdAt)}
                      {block.own && !entry.pending ? <CheckCheck className="h-3 w-3" /> : null}
                      {entry.pending ? <Clock className="h-3 w-3" /> : null}
                    </span>

                    <span className="whitespace-pre-wrap break-words">{entry.body}</span>
                  </div>
                </div>
              );
            })}

            {block.own && block.entries.some((entry) => entry.failed) ? (
              <div className="flex items-center justify-end gap-2 pr-1 text-3xs text-destructive">
                Не надіслалось.
                {onRetry ? (
                  <button type="button" onClick={onRetry} className="font-semibold underline">
                    Повторити
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-2.5 py-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className={cn("flex items-end gap-1.5", row === 1 && "flex-row-reverse")}>
          {row === 1 ? null : <span className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />}
          <span
            className="h-9 animate-pulse rounded-2xl bg-muted"
            style={{ width: row === 1 ? "45%" : "62%" }}
          />
        </div>
      ))}
    </div>
  );
}

/** Порожній композер-заглушка для стану «нема доступу». */
export function ThreadNoAccess() {
  return (
    <div className="flex flex-col items-center gap-1.5 px-5 py-10 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-muted text-muted-foreground">
        <Send className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold">Обговорення недоступне</span>
      <span className="max-w-[32ch] text-xs text-muted-foreground">
        Ця справа не у вашому доступі. Попросіть керівника відкрити її.
      </span>
    </div>
  );
}

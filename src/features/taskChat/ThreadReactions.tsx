import React from "react";
import { SmilePlus } from "lucide-react";
import { HoverTip } from "@/components/ui/hover-tip";
import { cn } from "@/lib/utils";
import { QUICK_REACTIONS, ThreadEmojiPicker } from "./ThreadEmojiPicker";
import type { ThreadReaction } from "./queries";

type Props = {
  reactions: ThreadReaction[];
  userId: string | null;
  memberName: (userId: string | null) => string;
  onToggle: (emoji: string, mine: boolean) => void;
  align: "start" | "end";
};

/**
 * Реакції під бабблом окремим рядком — щоб однаково працювали для тексту,
 * картинки й файлу, нічого не перекриваючи.
 */
export function ThreadReactions({ reactions, userId, memberName, onToggle, align }: Props) {
  const grouped = React.useMemo(() => {
    const map = new Map<string, ThreadReaction[]>();
    for (const reaction of reactions) {
      const bucket = map.get(reaction.emoji);
      if (bucket) bucket.push(reaction);
      else map.set(reaction.emoji, [reaction]);
    }
    return [...map.entries()];
  }, [reactions]);

  if (grouped.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", align === "end" && "justify-end")}>
        {grouped.map(([emoji, list]) => {
          const mine = list.some((item) => item.userId === userId);
          // «Ви» першим — так одразу видно власну участь.
          const names = list
            .map((item) => (item.userId === userId ? "Ви" : memberName(item.userId)))
            .sort((a) => (a === "Ви" ? -1 : 0));

          return (
            <HoverTip key={emoji} label={names.join(", ")}>
                <button
                  type="button"
                  onClick={() => onToggle(emoji, mine)}
                  className={cn(
                    "inline-flex h-[22px] items-center gap-1 rounded-full border px-1.5 text-2xs tabular-nums transition-colors",
                    mine
                      ? "border-primary/40 bg-primary/10 font-semibold text-primary"
                      : "border-border/60 bg-card text-foreground/80 hover:bg-muted/60"
                  )}
                >
                  <span className="text-[13px] leading-none">{emoji}</span>
                  {list.length}
                </button>
            </HoverTip>
          );
        })}

        <ThreadEmojiPicker
          align={align}
          onPick={(emoji) => onToggle(emoji, false)}
          trigger={
            <button
              type="button"
              aria-label="Додати реакцію"
              className="grid h-[22px] w-[22px] place-items-center rounded-full border border-border/60 bg-card text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <SmilePlus className="h-3 w-3" />
            </button>
          }
        />
    </div>
  );
}

/** Панель швидких реакцій, що зринає при наведенні на повідомлення. */
export function ThreadReactionBar({
  onPick,
  align,
}: {
  onPick: (emoji: string) => void;
  align: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "absolute -top-3.5 z-10 hidden items-center gap-0.5 rounded-full border border-border/60 bg-card p-0.5 shadow-[var(--shadow-menu)] group-hover:flex",
        align === "end" ? "right-2" : "left-8"
      )}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="grid h-6 w-6 place-items-center rounded-full text-sm leading-none transition-colors hover:bg-muted/70"
        >
          {emoji}
        </button>
      ))}
      <ThreadEmojiPicker
        align={align}
        onPick={onPick}
        trigger={
          <button
            type="button"
            aria-label="Інші реакції"
            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <SmilePlus className="h-3 w-3" />
          </button>
        }
      />
    </div>
  );
}

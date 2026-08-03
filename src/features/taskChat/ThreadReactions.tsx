import React from "react";
import { Copy, MoreHorizontal, Reply, SmilePlus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  onReply,
  onCopy,
  onDelete,
}: {
  onPick: (emoji: string) => void;
  align: "start" | "end";
  onReply: () => void;
  onCopy: () => void;
  /** null — видаляти нема права (чуже повідомлення й ти не керівник). */
  onDelete: (() => void) | null;
}) {
  return (
    <div
      className={cn(
        // bottom-full — панель повністю НАД повідомленням, а не поверх нього.
        // Затримка 400 мс на появу: без неї панель вискакувала від найменшого
        // руху миші й заважала читати. Зникає одразу, без затримки.
        "absolute bottom-full z-10 mb-1 flex items-center gap-0.5 rounded-full border border-border/60 bg-card p-0.5",
        "opacity-0 shadow-[var(--shadow-menu)] transition-opacity duration-150",
        "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-hover:delay-[400ms]",
        align === "end" ? "right-0" : "left-0"
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

      {/* Одне меню на всі дії — щоб не було двох, які сваряться за наведення. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Дії з повідомленням"
            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align === "end" ? "end" : "start"} className="w-44">
          <DropdownMenuItem onClick={onReply}>
            <Reply className="h-3.5 w-3.5" />
            Відповісти
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
            Копіювати текст
          </DropdownMenuItem>
          {onDelete ? (
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Видалити
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

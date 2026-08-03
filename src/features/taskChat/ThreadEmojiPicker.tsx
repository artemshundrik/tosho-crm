import React from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Одна суцільна сітка без розділів: часті стоять першими, далі решта.
 * Порядок — від того, що реально пишуть у друкарні, а не від алфавіту.
 */
export const THREAD_EMOJI = [
  "👍", "🔥", "✅", "👀", "❤️", "🙏", "😅", "🤝",
  "😀", "😂", "🙂", "😉", "😍", "🤔", "😐", "😴",
  "😎", "🥲", "😱", "🤯", "💪", "🎉", "💡", "⚡",
  "📌", "🕐", "💰", "📦", "🖨️", "🎨", "✂️", "👕",
  "📄", "📷", "🚚", "⚠️", "❌", "➕", "👌", "🤞",
];

/** Реакції, які показуються одразу при наведенні на повідомлення. */
export const QUICK_REACTIONS = ["👍", "❤️", "🔥", "👀"];

type Props = {
  onPick: (emoji: string) => void;
  className?: string;
  /** Кнопка-тригер: за замовчуванням смайлик у стилі композера. */
  trigger?: React.ReactNode;
  align?: "start" | "center" | "end";
  /** Щоб панель наведення не ховалась, поки палітра відкрита. */
  onOpenChange?: (open: boolean) => void;
};

export function ThreadEmojiPicker({ onPick, className, trigger, align = "start", onOpenChange }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="Емодзі"
            className={cn(
              "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
              open && "bg-primary/10 text-primary",
              className
            )}
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent align={align} side="top" className="w-[268px] p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {THREAD_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="grid h-7 place-items-center rounded-md text-[17px] leading-none transition-colors hover:bg-muted/70"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

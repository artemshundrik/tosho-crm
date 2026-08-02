import * as React from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Підказка по наведенню.
 *
 * Чому на Popover, а не на окремій бібліотеці: @radix-ui/react-tooltip у
 * проєкті не встановлений, а тягнути залежність заради підказки — зайве.
 * Popover уже є, і цей же прийом (hover + затримка на закриття) вже
 * використовує клітинка нотатки у виплатах.
 *
 * Затримка на закриття потрібна, щоб підказка не блимала, поки курсор
 * перетинає зазор між тригером і бульбашкою.
 */
export function HoverTip({
  label,
  children,
  side = "top",
  className,
  contentClassName,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** Класи ТРИГЕРА (обгортки навколо children). */
  className?: string;
  /**
   * Класи самої бульбашки. Потрібні, коли всередині не рядок, а картка:
   * дефолтні `max-w-[240px]` і дрібні відступи їй затісні.
   */
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  React.useEffect(() => () => cancelClose(), []);

  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hide = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 90);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          className={cn("inline-flex", className)}
          onMouseEnter={show}
          onMouseLeave={hide}
          // Клавіатура має показувати те саме, що й миша.
          onFocusCapture={show}
          onBlurCapture={hide}
        >
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side={side}
        align="center"
        sideOffset={6}
        // Підказка нічого не ловить: кліки й ховер мають лишатися в тригері.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn(
          "pointer-events-none w-auto max-w-[240px] rounded-md border-border/60 px-2.5 py-1.5 text-xs leading-snug text-popover-foreground shadow-md",
          contentClassName
        )}
      >
        {label}
      </PopoverContent>
    </Popover>
  );
}

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
 *
 * `ready` — для карток із лінивими даними (людина, замовник): без нього
 * бульбашка відкривалась миттєво напівпорожньою і ДОРОСТАЛА, коли запит
 * повертався, — «стрибала» (правка CEO 2026-08-07). Тепер відкриття чекає
 * готовності, але не довше за короткий ліміт: на повільній мережі краще
 * показати картку з «завантажуємо…», ніж не показати нічого.
 */
export function HoverTip({
  label,
  children,
  side = "top",
  className,
  contentClassName,
  ready = true,
  maxReadyWaitMs = 450,
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
  /** false — вміст ще вантажиться; відкриття зачекає (до maxReadyWaitMs). */
  ready?: boolean;
  maxReadyWaitMs?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Курсор досі над тригером? Без цього готовність, що прийшла після
  // відходу миші, відкривала б бульбашку в порожнечу.
  const wantsOpen = React.useRef(false);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const cancelWait = () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    waitTimer.current = null;
  };

  React.useEffect(
    () => () => {
      cancelClose();
      cancelWait();
    },
    []
  );

  const show = () => {
    cancelClose();
    wantsOpen.current = true;
    if (ready) {
      setOpen(true);
      return;
    }
    if (!waitTimer.current) {
      waitTimer.current = setTimeout(() => {
        waitTimer.current = null;
        if (wantsOpen.current) setOpen(true);
      }, maxReadyWaitMs);
    }
  };
  const hide = () => {
    wantsOpen.current = false;
    cancelWait();
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 90);
  };

  React.useEffect(() => {
    // Дані доїхали, поки ми чекали — відкриваємось одразу, без решти ліміту.
    if (ready && wantsOpen.current && !open) {
      cancelWait();
      setOpen(true);
    }
  }, [ready, open]);

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

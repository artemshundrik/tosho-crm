import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    portalled?: boolean;
    /** Див. пояснення в DropdownMenuContent: у тулбарі переїзд читається як промах. */
    slide?: boolean;
  }
>(({ className, align = "center", sideOffset = 4, portalled = true, slide = true, onWheelCapture, onTouchMoveCapture, ...props }, ref) => {
  /**
   * Поповер портується в body — тобто ПОЗА DialogContent. react-remove-scroll,
   * яким Radix лочить прокрутку діалогу, слухає wheel/touchmove на document і
   * робить preventDefault усьому, що не лежить у діалозі (його єдиний shard).
   * Через це списки всередині поповера не скролилися мишею.
   *
   * Гасимо подію на підйомі до document — але ЛИШЕ коли під курсором справді є
   * що прокрутити в цей бік. Інакше (курсор над падінгом, або список уже
   * докручено до краю) лок треба лишити: без нього браузер передасть прокрутку
   * далі вгору й поїде сторінка позаду діалогу.
   */
  const findScrollableUnderPointer = (event: React.WheelEvent | React.TouchEvent, deltaY: number) => {
    const root = event.currentTarget as HTMLElement;
    let node = event.target as HTMLElement | null;
    while (node && root.contains(node)) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
        const atTop = node.scrollTop <= 0;
        const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
        if (deltaY === 0 || (deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return node;
      }
      node = node.parentElement;
    }
    return null;
  };

  const content = (
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      onWheelCapture={(event) => {
        onWheelCapture?.(event);
        if (findScrollableUnderPointer(event, event.deltaY)) event.stopPropagation();
      }}
      onTouchMoveCapture={(event) => {
        onTouchMoveCapture?.(event);
        // На тачі напрямок наперед невідомий — досить того, що під пальцем є скролер.
        if (findScrollableUnderPointer(event, 0)) event.stopPropagation();
      }}
      className={cn(
        "z-50 w-72 max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto overscroll-contain rounded-xl border border-border/50 bg-popover/95 p-4 text-popover-foreground shadow-menu backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-[--radix-popover-content-transform-origin]",
        slide &&
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  );

  if (!portalled) return content;

  return <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal>;
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }

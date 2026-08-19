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
  }
>(({ className, align = "center", sideOffset = 4, portalled = true, onWheelCapture, onTouchMoveCapture, ...props }, ref) => {
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
        "z-50 w-72 max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto overscroll-contain rounded-xl border border-border/50 bg-popover/95 p-4 text-popover-foreground shadow-menu backdrop-blur-xl outline-none origin-[--radix-popover-content-transform-origin]",
  // ВІДКРИТТЯ БЕЗ РУХУ — свідоме рішення (REQ-26), не забутий стиль.
  //
  // Меню прив'язане до свого тригера, і будь-який рух рве цей зв'язок: 8 px
  // зсуву читаються не як анімація, а як промах позиціонування — панель ніби
  // спершу стала не туди, а потім поправилась. Те саме робив zoom-in-95:
  // заміряно на панелі фільтра шириною 247 px — це 12 px приросту, тобто кожен
  // край їде приблизно на 6 px, і око ловить хвіст цього руху.
  //
  // Тому тут лише проявлення. Зовсім без анімації теж не можна — панель
  // з'являлась би різко.
  //
  // ЧОМУ В МОДАЛОК ІНАКШЕ. Там навпаки додано і масштаб, і підйом. Це не
  // суперечність: модалка — великий об'єкт, що приходить у центр екрана, їй рух
  // личить. Меню — маленька панель під кнопкою, їй потрібна прив'язка, а не рух.
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-fast ease-out motion-reduce:animate-none",
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

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
        "z-50 w-72 max-h-[var(--radix-popover-content-available-height)] max-w-[var(--radix-popover-content-available-width)] overflow-y-auto overscroll-contain rounded-xl border border-border/50 bg-popover/95 p-4 text-popover-foreground shadow-menu backdrop-blur-xl outline-none",
  // ПАНЕЛЬ РОЗКРИВАЄТЬСЯ З ТОЧКИ ТРИГЕРА (REQ-26).
  //
  // Ключове тут — рядок data-[side=*]:origin-* вище. Він задає точку, ВІД якої
  // росте масштаб: край, яким панель торкається кнопки, стоїть на місці.
  //
  // ЧОМУ НЕ ЗМІННА RADIX. У Radix є --radix-*-content-transform-origin, і це
  // точніше — вона враховує ще й вирівнювання. Але вона проставляється ЗАПІЗНО:
  // заміряно, origin іде "130px 235px → 0px 0px" вже посеред анімації, бо Radix
  // спершу мусить виміряти позицію. Тому перші кадри йшли з ЦЕНТРУ, і панель
  // роз'їжджалась на всі боки. Атрибут data-side є одразу — тому беремо його.
  // заякорений край стоїть на місці, рухається лише протилежний. Панель ніби
  // розгортається з кнопки, а не наповзає збоку.
  //
  // Саме тому зсуви (slide-in-from-*) сюди НЕ ПОВЕРТАТИ. Вони рухають панель
  // цілком, разом із заякореним краєм, — і ті 8 px читаються не як анімація, а
  // як промах позиціонування: панель ніби спершу стала не туди, а потім
  // поправилась. Це була вихідна скарга в REQ-26.
  //
  // Масштаб 0.97, а не 0.95 із рецепта shadcn: на панелі шириною 260 px 5%
  // давали 13 px приросту, і рух читався вже як переїзд. 3% дають близько 8 px
  // на весь протилежний край — це вже подих, а не поїздка. Заміряно.
  //
  // Закриття коротше (fast) і майже без масштабу: іти має швидко.
  //
  // ЧОМУ В МОДАЛОК ІНАКШЕ. Там і масштаб більший, і є підйом: модалка — великий
  // об'єкт, що приходить у центр екрана, їй рух личить. Меню прив'язане до
  // кнопки, тож уся його анімація мусить рахуватись із цією прив'язкою.
        "data-[side=bottom]:origin-top data-[side=top]:origin-bottom data-[side=left]:origin-right data-[side=right]:origin-left data-[side=bottom]:data-[align=start]:origin-top-left data-[side=bottom]:data-[align=end]:origin-top-right data-[side=top]:data-[align=start]:origin-bottom-left data-[side=top]:data-[align=end]:origin-bottom-right",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:duration-base data-[state=closed]:duration-fast ease-out motion-reduce:animate-none",
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

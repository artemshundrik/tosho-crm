import type { ReactNode } from "react";

import { Maximize2, X } from "@/components/icons/appIcons";
import { Button } from "@/components/ui/button";
import { DRAWER_OVERLAY, Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsNarrowViewport } from "@/hooks/useIsNarrowViewport";

/**
 * Шторка замовника чи ліда (варіант А, REQ-349): виїжджає справа поверх
 * розмитої підкладки, на телефоні — нижній аркуш на 90% висоти.
 *
 * Не `EntityPeek`: прев'ю справ гортає список J/K і фокуса не ловить, а
 * тут вписують реквізити — модальна шторка тримає фокус і клавіатуру в собі.
 *
 * `onExpand` — ⤢ «Розгорнути на всю сторінку» поруч із ×.
 */
export function PartyDrawer(props: {
  title: string;
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  onExpand?: () => void;
}) {
  const narrow = useIsNarrowViewport();
  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <SheetContent
        side={narrow ? "bottom" : "right"}
        dismissible
        hideClose
        overlayClassName={DRAWER_OVERLAY}
        className={
          narrow
            ? "h-[90dvh] gap-0 rounded-t-2xl p-0"
            : "flex w-[480px] max-w-[calc(100vw-24px)] flex-col gap-0 p-0 sm:max-w-[480px]"
        }
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">{props.title}</SheetTitle>
        <header className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-5 pb-4 pt-5">
          <div className="min-w-0 flex-1">{props.header}</div>
          <div className="flex shrink-0 items-center gap-1">
            {props.onExpand ? (
              <Button
                type="button"
                variant="ghost"
                size="iconXs"
                aria-label="Розгорнути на всю сторінку"
                title="Розгорнути на всю сторінку"
                onClick={props.onExpand}
              >
                <Maximize2 className="size-4" />
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="iconXs" aria-label="Закрити" onClick={props.onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
        {props.footer ? (
          <footer className="flex shrink-0 items-center gap-2 border-t border-line-subtle px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {props.footer}
          </footer>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { registerOverlay } from "@/components/ui/overlayPresence";

/**
 * Нижній аркуш — одна поверхня на всі мобільні «фільтри й налаштування».
 *
 * Доти кожне місце збирало його з `SheetContent side="bottom"` саме, і вони
 * розходились: у одного був хрестик Radix у кутку, в іншого — ні; заокруглення
 * діставалось усім чотирьом кутам, хоча нижні два стоять за краєм екрана;
 * тінь бралась від бічного дровера — велика й розсіяна, розрахована на панель
 * заввишки в екран.
 *
 * Що дає компонент:
 *  • заокруглення ЛИШЕ згори — аркуш виїжджає знизу й прилипає до краю;
 *  • м'яка тінь угору, а не ореол навколо;
 *  • смужка-«ручка» як обіцянка «тягнеться знизу»;
 *  • хрестик у власному колі, а не голий значок у порожнечі;
 *  • смуга вкладок ховається, поки аркуш відкритий (див. [[overlayPresence]]).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Клас на прокрутному тілі — коли потрібні власні відступи. */
  contentClassName?: string;
}) {
  // Реєструємо саме за `open`, а не в момент монтування: аркуш зазвичай живе
  // в дереві весь час і лише перемикає видимість.
  useEffect(() => {
    if (!open) return;
    return registerOverlay();
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Фільтри й налаштування зберігаються одразу, втрачати нема чого —
        // дотик повз має закривати, а не питати.
        dismissible
        hideClose
        className={cn(
          "gap-0 rounded-t-3xl border-t p-0",
          // Тінь угору й вужча за типову панельну: аркуш прилипає до низу, і
          // розсіяний ореол з усіх боків тут читався б як брудна пляма.
          "shadow-[0_-10px_30px_-12px_hsl(var(--foreground)/0.18)]",
          "max-h-[88dvh]",
          /*
           * Тривалість закриття — рівно як у підкладки (200ms).
           *
           * Базовий дровер їде 300ms, а підкладка згасає за 200: сотню
           * мілісекунд аркуш ще повзе вниз по вже яскравій сторінці, і на
           * довгому світлому списку це читається як спалах. Саме це й було
           * «мигає в прорахунках».
           */
          "data-[state=closed]:duration-200 data-[state=open]:duration-300",
          className
        )}
      >
        <div className="shrink-0 px-4 pt-2.5">
          <div className="mx-auto h-1 w-9 rounded-full bg-border" aria-hidden="true" />
          {/* items-start, а не center: біля довгого опису хрестик з'їжджав на
              його середину й губив зв'язок із заголовком. */}
          <SheetHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-2 pt-3 text-left">
            <div className="min-w-0">
              <SheetTitle className="text-base">{title}</SheetTitle>
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <SheetClose
              data-unsaved-ignore
              aria-label="Закрити"
              // Коло з підкладкою: сам по собі значок губився в порожньому
              // кутку й не читався як кнопка. 36px — у межах тач-таргета для
              // другорядної дії поруч із заголовком.
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                "bg-muted/70 text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
              )}
            >
              <X className="h-4 w-4" />
            </SheetClose>
          </SheetHeader>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-1",
            contentClassName
          )}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

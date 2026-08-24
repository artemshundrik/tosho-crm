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
        // Та сама підкладка, що в палітри ToSho AI: розмиття замість щільного
        // затемнення — застосунок позаду видно, і аркуш читається як тимчасове
        // вікно, а не як новий екран.
        overlayClassName="bg-background/60 backdrop-blur-md"
        className={cn(
          // 28px і рамка лише згори — рівно як у палітри ToSho AI, з якої цей
          // вигляд і взято. Тіні немає: див. `sheetVariants`, варіант bottom.
          "gap-0 rounded-b-none rounded-t-[28px] p-0",
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
        {/* Смужка-ручка: звичний знак «це аркуш». Абсолютна, як у палітри, —
            інакше вона з'їдала б рядок і зсувала заголовок униз. */}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-2 z-20 h-1 w-9 -translate-x-1/2 rounded-full bg-border"
        />
        <SheetClose
          data-unsaved-ignore
          aria-label="Закрити"
          // Коло з підкладкою, як у палітри: сам по собі значок губився в
          // порожньому кутку й не читався як кнопка.
          className={cn(
            "absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full",
            "bg-muted/70 text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          )}
        >
          <X className="h-4 w-4" />
        </SheetClose>

        <div className="shrink-0 px-4 pt-5">
          <SheetHeader className="space-y-0 pb-2 pr-12 text-left">
            <SheetTitle className="text-base">{title}</SheetTitle>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
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

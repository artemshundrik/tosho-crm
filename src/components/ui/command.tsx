import * as React from "react";
import { DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";

import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-inner bg-popover text-popover-foreground",
      className
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

type CommandDialogProps = DialogProps & {
  children: React.ReactNode;
};

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      {/* ✅ ховаємо стандартний Close (правий X), щоб він не конфліктував з clear */}
      <DialogContent
        hideClose
        // Палітра — навігація, а не форма: зберігати в ній нема чого. Без цього
        // спрацьовував типовий захист від втрати введеного, і набраний пошук
        // перетворював Esc (а з ним і вибір рядка) на питання «Закрити без
        // збереження?» — там, де відповідь завжди «так».
        dismissible
        // На телефоні — аркуш знизу майже на всю висоту (92dvh), із заокругленим
        // верхом і смужкою-ручкою. Не повний екран: смужка згори каже, що це
        // тимчасове вікно, а не новий розділ, і застосунок позаду не зникає.
        // Не маленький аркуш: клавіатура з'їдає пів екрана, і від списку лишалась
        // би смужка на три рядки. Поле лишається ВНИЗУ (flex-col-reverse) — під
        // великим пальцем, як просили склад із логістикою.
        overlayClassName="max-sm:backdrop-blur-md max-sm:bg-background/60"
        className="!top-4 !translate-y-0 sm:!top-8 w-[calc(100vw-2rem)] max-w-[980px] max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] overflow-hidden border border-border/60 bg-card !gap-0 !p-0 sm:!gap-0 sm:!p-0 text-foreground max-sm:!left-0 max-sm:!top-auto max-sm:!bottom-0 max-sm:!translate-x-0 max-sm:!h-[92dvh] max-sm:!max-h-[92dvh] max-sm:!w-screen max-sm:!max-w-none max-sm:!rounded-b-none max-sm:!rounded-t-[28px] max-sm:!border-x-0 max-sm:!border-b-0"
      >
        <DialogTitle className="sr-only">Глобальний пошук</DialogTitle>

        {/* Смужка-ручка: звичний знак «це аркуш, його можна закрити». */}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-2 z-20 hidden h-1 w-9 -translate-x-1/2 rounded-full bg-border max-sm:block"
        />

        {/* Закрити: аркуш перекриває майже весь екран, тож краю, повз який
            клікнути, майже немає, а клавіші Esc на телефоні немає взагалі. */}
        <DialogClose
          data-unsaved-ignore
          aria-label="Закрити пошук"
          className="absolute right-3 z-20 hidden h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-sm:inline-flex"
          style={{ top: "0.75rem" }}
        >
          <X className="h-4 w-4" />
        </DialogClose>
        <Command
          className={cn(
            // Зворотний порядок на телефоні: список угорі, поле знизу. Так само
            // поводяться месенджери — те, що натискають, унизу; те, що
            // читають, вище. Порядок у DOM не міняється, тож клавіатурна
            // навігація cmdk лишається тією самою.
            "max-sm:flex-col-reverse",
            "[&_[cmdk-group-heading]]:px-3",
            "[&_[cmdk-group-heading]]:py-2",
            "[&_[cmdk-group-heading]]:font-semibold",
            "[&_[cmdk-group-heading]]:text-muted-foreground",
            "[&_[cmdk-group-heading]]:text-3xs",
            "[&_[cmdk-group-heading]]:uppercase",
            "[&_[cmdk-group-heading]]:tracking-wider"
          )}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

type CommandInputProps = React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
};

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  CommandInputProps
>(({ className, leftIcon, rightSlot, ...props }, ref) => (
  /* Рядок на флексі, а не на абсолютах: інакше поле неможливо перетворити на
     капсулу — іконка й кнопки висіли б поверх неї, а не всередині. На великому
     екрані вигляд той самий, що був. */
  <div
    className={cn(
      "relative flex items-center gap-2 border-b border-border px-3",
      // На телефоні поле — та сама капсула, що в обговоренні справи:
      // тонка рамка, тло картки, підсвітка рамки на фокусі, круглі кнопки
      // всередині. Капсула кругла повністю (rounded-full), а не 20px.
      // Різниця лише в наповненні: там скріпка й «надіслати», тут лупа й
      // мікрофон. Стоїть воно внизу аркуша, тож зайву межу знизу прибираємо.
      "max-sm:m-2 max-sm:mb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] max-sm:rounded-full",
      "max-sm:border max-sm:border-border/60 max-sm:bg-card max-sm:px-1.5 max-sm:py-1",
      "max-sm:focus-within:border-primary/50"
    )}
    cmdk-input-wrapper=""
  >
    {leftIcon ? (
      <span className="pointer-events-none shrink-0 text-muted-foreground max-sm:pl-2.5">{leftIcon}</span>
    ) : null}

    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "h-12 min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "max-sm:h-[38px] max-sm:py-1",
        className
      )}
      {...props}
    />

    {/* rightSlot клікабельний: там чистилка, мікрофон і підказка клавіш. */}
    {rightSlot ? <div className="flex shrink-0 items-center">{rightSlot}</div> : null}
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      "flex-1 overflow-y-auto overflow-x-hidden py-1.5",
      // Зверху аркуша — ручка й хрестик, списку туди заходити не можна.
      "max-sm:pt-12",
      className
    )}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn("py-12 text-center text-sm text-muted-foreground", className)}
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn("overflow-hidden px-1.5 pb-1.5 text-foreground", className)}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("mx-3 my-1.5 h-px bg-border", className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 text-[15px] outline-none",
      "transition-colors hover:bg-muted/50",
      "aria-selected:bg-muted aria-selected:text-foreground",
      // На телефоні cmdk однаково позначає перший рядок обраним — це потрібно
      // стрілкам, яких там немає. Виглядає ж це як натиснута кнопка, якої ніхто
      // не натискав. Тому на вузьких екранах підсвітку прибираємо, а замість неї
      // даємо чесний стан натискання під пальцем.
      "max-sm:aria-selected:bg-transparent max-sm:aria-selected:text-foreground max-sm:active:bg-muted",
      "focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
      className
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn("ml-auto text-[12px] tracking-wider text-muted-foreground", className)}
    {...props}
  />
);

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
};

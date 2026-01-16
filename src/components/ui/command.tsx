import * as React from "react";
import { DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-inner)] bg-popover text-popover-foreground",
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
      <DialogContent hideClose className="overflow-hidden p-0">
        <Command
          className={cn(
            "[&_[cmdk-group-heading]]:px-4",
            "[&_[cmdk-group-heading]]:py-2.5",
            "[&_[cmdk-group-heading]]:font-semibold",
            "[&_[cmdk-group-heading]]:text-muted-foreground",
            "[&_[cmdk-group-heading]]:text-[10px]",
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
  <div className="relative border-b border-border" cmdk-input-wrapper="">
    {leftIcon ? (
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
        {leftIcon}
      </div>
    ) : null}

    {/* ✅ rightSlot має бути клікабельний (clear button!) */}
    {rightSlot ? (
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        {rightSlot}
      </div>
    ) : null}

    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "flex h-14 w-full bg-transparent px-4 py-3 text-[15px] outline-none",
        "placeholder:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        leftIcon ? "pl-12" : "",
        // ✅ місце під clear + kbd
        rightSlot ? "pr-44" : "pr-6",
        className
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("flex-1 overflow-y-auto overflow-x-hidden py-2", className)}
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
    className={cn("overflow-hidden px-2 pb-2 text-foreground", className)}
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
    className={cn("mx-4 my-2 h-px bg-border", className)}
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
      "relative flex cursor-default select-none items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-[15px] outline-none",
      "transition-colors hover:bg-muted/50",
      "aria-selected:bg-muted aria-selected:text-foreground",
      "focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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

"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { CONTROL_BASE, TOOLBAR_CONTROL_ACTIVE } from "@/components/ui/controlStyles"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

/**
 * Та сама шкала, що в Input: радіус іде за висотою контролу.
 * CONTROL_BASE несе один rounded-xl, розрахований на 40px, і на тригері 32–36px
 * він виглядає таблеткою. Типовий розмір (`lg`) лишає поведінку як була.
 */
const SELECT_TRIGGER_SIZE = {
  sm: "h-8 rounded-md px-2.5 py-1 text-xs",
  md: "h-9 rounded-lg px-3 py-1.5 text-sm",
  lg: "h-10 rounded-xl px-3 py-1.5 text-sm",
} as const

export type SelectTriggerSize = keyof typeof SELECT_TRIGGER_SIZE

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    controlSize?: SelectTriggerSize
    /**
     * Селект-фільтр щось відсіює (значення ≠ «всі»). Підсвічує тригер так само,
     * як кнопку-фільтр у тулбарі: інакше увімкнений фільтр не відрізнити від
     * вимкненого, хоча він ховає частину списку. Для селектів у ФОРМАХ не
     * вживається — там вибране значення це дані, а не фільтр.
     */
    active?: boolean
  }
>(({ className, children, controlSize = "lg", active = false, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    data-active={active ? "true" : undefined}
    className={cn(
      CONTROL_BASE,
      // Тінь прибрано з тієї ж причини, що і в `Input`: `shadow-sm` — дефолт
      // Tailwind повз наші токени. Тримати обидва контроли однаково важливо,
      // бо вони стоять поруч у кожній формі.
      "flex w-full min-w-0 items-center justify-between whitespace-nowrap leading-[20px]",
      SELECT_TRIGGER_SIZE[controlSize],
      "ring-offset-background data-[placeholder]:text-muted-foreground [&>span]:min-w-0 [&>span]:line-clamp-1",
      className,
      // ПІСЛЯ className навмисно: сторінки передають TOOLBAR_CONTROL саме туди,
      // і його bg-muted/40 перебивав би підсвітку через tailwind-merge.
      active && TOOLBAR_CONTROL_ACTIVE
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      {/* У спокої стрілка тиха (підказка, не зміст), а на увімкненому фільтрі
          успадковує його колір — інакше синій підпис із сірою стрілкою. */}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "opacity-70" : "text-muted-foreground opacity-80"
        )}
      />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    portalled?: boolean;
  }
>(({ className, children, position = "popper", portalled = true, ...props }, ref) => {
  const content = (
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 min-w-[8rem] overflow-hidden rounded-xl border border-border/50 bg-popover/95 backdrop-blur-xl text-popover-foreground shadow-menu data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-select-content-transform-origin]",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "max-h-[min(24rem,var(--radix-select-content-available-height))] overflow-y-auto p-1",
          position === "popper" &&
            "w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  );

  if (!portalled) return content;

  return <SelectPrimitive.Portal>{content}</SelectPrimitive.Portal>;
})
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { description?: React.ReactNode }
>(({ className, children, description, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none flex-col items-stretch rounded-lg py-1.5 pl-2 pr-8 text-sm leading-[20px] outline-none transition-colors focus:bg-muted/70 focus:text-foreground data-[state=checked]:bg-muted data-[state=checked]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute right-2 top-1.5 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText className="text-sm leading-[20px]">{children}</SelectPrimitive.ItemText>
    {description ? (
      <span className="mt-0.5 text-xs leading-[16px] text-muted-foreground">{description}</span>
    ) : null}
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}

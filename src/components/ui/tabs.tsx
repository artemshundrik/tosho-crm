import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { useSegmentedSlider } from "@/components/ui/segmented-group"
import { TAB_BAR_ITEM, TAB_BAR_ROW } from "@/components/ui/tab-bar"
import { cn } from "@/lib/utils"

/** Radix дає свій ref, хук риски — свій; на одному вузлі потрібні обидва. */
function mergeRefs<T>(...refs: Array<React.Ref<T> | null>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node
    }
  }
}

const Tabs = TabsPrimitive.Root

/**
 * Смуга вкладок Radix у вигляді підкреслення.
 *
 * Вигляд і РУХ спільні з `TabBar` (ui/tab-bar.tsx): та сама риска, той самий
 * хук, ті самі класи кнопки. Різниця лише в тому, хто тримає вміст — тут його
 * тримає Radix, а `TabBar` малює саму смугу для сторінок, де розділи лежать
 * поруч. Механіка одна, тож полагоджене в одному місці працює в обох.
 */
type TabsVariant = "default" | "underline"

const TabsListContext = React.createContext<TabsVariant>("default")

const DEFAULT_LIST =
  "inline-flex h-11 items-center justify-center rounded-xl border border-border/50 bg-muted/40 p-1 text-muted-foreground"

const UNDERLINE_LIST = cn(TAB_BAR_ROW, "h-auto border-b border-border/40 bg-transparent p-0")

const DEFAULT_TRIGGER =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg px-4 py-1 text-sm font-medium cursor-pointer transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--soft-ring))] disabled:pointer-events-none disabled:opacity-50 hover:bg-background/50 hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-[hsl(var(--soft-ring))]"

const UNDERLINE_TRIGGER = cn(TAB_BAR_ITEM, "data-[state=active]:font-semibold data-[state=active]:text-foreground")

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "default", ...props }, ref) => {
  // Риску веде той самий хук, що й плашку сегментованого перемикача: він
  // знаходить активний тригер за `data-state="active"` (Radix ставить його
  // сам) і переїжджає до нього.
  const { ref: rowRef, indicator } = useSegmentedSlider<HTMLDivElement>("underline")
  const underline = variant === "underline"

  return (
    <TabsListContext.Provider value={variant}>
      <TabsPrimitive.List
        ref={mergeRefs(ref, underline ? rowRef : null)}
        className={cn(underline ? UNDERLINE_LIST : DEFAULT_LIST, className)}
        {...props}
      >
        {underline ? indicator : null}
        {props.children}
      </TabsPrimitive.List>
    </TabsListContext.Provider>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsListContext)

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(variant === "underline" ? UNDERLINE_TRIGGER : DEFAULT_TRIGGER, className)}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      // `tab-panel` — те саме згасання, що й у розділів картки прорахунку:
      // зміну вкладки має бути ВИДНО, а не тільки чутно по риску.
      "tab-panel mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }

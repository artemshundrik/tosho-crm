import * as React from "react"
import { flushSync } from "react-dom"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { runViewTransition } from "@/lib/viewTransition"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

/**
 * Смуга вкладок із підкресленням: підпис, під ним лінія в акцентному кольорі.
 *
 * ЧОМУ ВАРІАНТ, А НЕ РЯДОК КЛАСІВ ПО МІСЦЯХ. Цей вигляд уже жив п'ятьма
 * копіями — двома константами `UNDERLINE_TAB` (картка замовника, картка ліда) і
 * трьома дослівними рядками в картці прорахунку. Копії й розійшлись: у картці
 * прорахунку відступ `py-3`, у замовника `py-2.5`, а `hover:text-foreground`
 * був не всюди.
 *
 * АЛЕ ГОЛОВНЕ НЕ ЄДНІСТЬ ВИГЛЯДУ, А ТЕ, ЩО ПІДКРЕСЛЕННЯ ТЕПЕР ПЕРЕЇЖДЖАЄ.
 * Доти воно було нижньою рамкою самого тригера: у старої вкладки рамка
 * ставала прозорою, у нової — кольоровою, тобто підкреслення зникало в одному
 * місці й з'являлось в іншому. Тепер це окремий проліт усередині тригера, і
 * поки він активний — на ньому лежить `view-transition-name`. Ім'я в межах
 * переходу одне (активний тригер завжди один), тому браузер бачить ТОЙ САМИЙ
 * елемент у двох положеннях і розводить їх рухом. Жодного вимірювання
 * координат для цього не треба — і саме тому воно не ламається на вкладках, у
 * яких міняється ширина підпису (лічильники «12» → «7»).
 */
type TabsVariant = "default" | "underline"

const TabsListContext = React.createContext<{ variant: TabsVariant; underlineName: string | null }>({
  variant: "default",
  underlineName: null,
})

const DEFAULT_LIST =
  "inline-flex h-11 items-center justify-center rounded-xl border border-border/50 bg-muted/40 p-1 text-muted-foreground"

const UNDERLINE_LIST =
  "flex h-auto items-center justify-start gap-6 rounded-none border-0 border-b border-border/40 bg-transparent p-0 text-muted-foreground"

const DEFAULT_TRIGGER =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-lg px-4 py-1 text-sm font-medium cursor-pointer transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--soft-ring))] disabled:pointer-events-none disabled:opacity-50 hover:bg-background/50 hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:ring-1 data-[state=active]:ring-[hsl(var(--soft-ring))]"

/**
 * `border-b-2 border-transparent` лишається НАВМИСНО, хоч колір тепер малює
 * проліт: рамка тримає ті самі два пікселі висоти, що й раніше. Прибереш її —
 * і смуга вкладок стане на 2px нижчою рівно в тих п'яти місцях, де цей вигляд
 * використовується.
 */
const UNDERLINE_TRIGGER =
  "relative inline-flex h-auto shrink-0 cursor-pointer items-center whitespace-nowrap rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:ring-0"

/**
 * Ім'я для переходу мусить бути валідним CSS-ідентифікатором, а `useId` віддає
 * щось на кшталт «r0» у лапках-ялинках — у CSS такий рядок недійсний, і
 * `view-transition-name` мовчки стає `none`. Тому лишаємо лише те, що ідентифі-
 * катору дозволено; префікс наперед знімає питання з цифри на початку.
 */
function underlineTransitionName(id: string): string {
  return `tabs-underline-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "default", style, ...props }, ref) => {
  const id = React.useId()
  const underlineName = React.useMemo(() => underlineTransitionName(id), [id])
  const context = React.useMemo(
    () => ({ variant, underlineName: variant === "underline" ? underlineName : null }),
    [variant, underlineName]
  )

  return (
    <TabsListContext.Provider value={context}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(variant === "underline" ? UNDERLINE_LIST : DEFAULT_LIST, className)}
        // Ім'я їде змінною, а не класом: воно різне для кожної смуги вкладок, і
        // саме через це дві відкриті картки не зривають одна одній перехід —
        // два однакові `view-transition-name` у кадрі скасовують його цілком.
        style={
          context.underlineName
            ? ({ ...style, "--tabs-underline-name": context.underlineName } as React.CSSProperties)
            : style
        }
        {...props}
      />
    </TabsListContext.Provider>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const { variant } = React.useContext(TabsListContext)

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(variant === "underline" ? UNDERLINE_TRIGGER : DEFAULT_TRIGGER, className)}
      {...props}
    >
      {children}
      {variant === "underline" ? <span aria-hidden="true" className="tabs-underline" /> : null}
    </TabsPrimitive.Trigger>
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
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

/**
 * Перемкнути вкладку під перехресним згасанням вмісту.
 *
 * ЧОМУ ЦЕ НЕ МОЖНА СХОВАТИ ВСЕРЕДИНУ `<Tabs>`. Перехід знімає кадр «до» перед
 * тим, як покликати зворотний виклик, тож зміна значення мусить статись саме
 * там і синхронно. У НЕкерованих вкладок значення тримає Radix і міняє його у
 * своєму обробнику кліку — тобто ще до того, як ми встигнемо почати перехід:
 * кадр «до» вже містив би нову вкладку, і перехід розвів би два однакові
 * кадри. Тому вкладки з переходом мусять бути керованими, а `defaultValue`
 * замінюється на цей хук.
 */
export function useViewTransitionTabs(initial: string): {
  value: string
  onValueChange: (next: string) => void
} {
  const [value, setValue] = React.useState(initial)
  const onValueChange = React.useCallback((next: string) => {
    runViewTransition(() => flushSync(() => setValue(next)))
  }, [])
  return { value, onValueChange }
}

/**
 * Те саме для вкладок, чиє значення вже живе в стані сторінки:
 * `onValueChange={(v) => switchTabWithTransition(() => setTab(v))}`.
 *
 * Витримує й значення, що лежить в АДРЕСІ (`?tab=` у профілі): усередині
 * переходу `setSearchParams` виконується синхронно, тож у кадр «після» React
 * потрапляє вже з новим розділом. Проп `viewTransition` самого роутера тут не
 * допоміг би — він діє лише з data-роутером, а застосунок зібраний на
 * класичному `<BrowserRouter>`, де опція мовчки ігнорується.
 *
 * Якщо в одному перемиканні міняється кілька станів — усі мусять бути всередині
 * ОДНОГО виклику, інакше кадр «до» знімуть уже після частини з них.
 */
export function switchTabWithTransition(update: () => void): void {
  runViewTransition(() => flushSync(update))
}

export { Tabs, TabsList, TabsTrigger, TabsContent }

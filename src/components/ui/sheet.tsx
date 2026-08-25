import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { registerOverlay } from "@/components/ui/overlayPresence"
import { UnsavedChangesPrompt, UnsavedGuardListener, useUnsavedGuard } from "@/components/ui/unsaved-guard"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      // Тривалості — рівно ті самі, що в самої панелі (див. sheetVariants).
      // Доти підкладка згасала за 200 мс, а панель їхала 300: сотню мілісекунд
      // вона повзла по вже яскравій сторінці, і це читалось як спалах.
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:pointer-events-none notranslate data-[state=closed]:duration-200 data-[state=open]:duration-300",
      className
    )}
    translate="no"
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

/**
 * Дровер — колонка з трьох частин: шапка, вміст, підвал.
 *
 * `flex flex-col` тут не косметика, а те, що взагалі робить шапку й підвал
 * нерухомими. Раніше `overflow-y-auto` вішали на весь дровер, тож при прокрутці
 * їхало все разом — і заголовок, і кнопки «Скасувати / Зберегти». `shrink-0` на
 * шапці при цьому нічого не давав, бо батько не був flex-контейнером.
 *
 * Прокручується лише середина — див. `SheetBody`.
 */
const sheetVariants = cva(
  /*
   * 200 мс на закриття й 300 на відкриття — замість 300/500.
   *
   * Панель і підкладка мусять жити одним тактом: доти вони розходились, і
   * найпомітніше це було на довгих світлих списках, де сторінка встигала
   * спалахнути під панеллю, яка ще їхала. Заразом закриття стало відчутно
   * жвавішим — півсекунди на зникнення вікна це задовго.
   */
  "fixed z-50 flex flex-col gap-4 overflow-hidden bg-background p-6 shadow-elevated-panel transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        /**
         * Нижній аркуш: тіні НЕМАЄ жодної.
         *
         * Базова `shadow-elevated-panel` розрахована на бічну панель заввишки
         * в екран — під аркушем, що прилипає до низу, вона перетворювалась на
         * широку сіру пляму вздовж усього верхнього краю. Межу тримає рамка
         * зверху, і цього досить.
         */
        bottom:
          "inset-x-0 bottom-0 border-x-0 border-b-0 border-t shadow-none data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:w-3/4 sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:w-3/4 sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  hideClose?: boolean
  /**
   * Чи закривати дровер кліком повз нього. За замовчуванням — НІ.
   *
   * Замовчування навмисно захисне. Більшість дроверів у CRM — форми, а клік
   * повз модалку не намір, а промах (особливо на тачі), і коштував він усього
   * введеного: жодна з 33 форм не мала захисту від втрати даних.
   *
   * Замовчування саме таке, а не навпаки, через асиметрію ціни помилки: забутий
   * захист на новій формі стирає роботу, а забутий `dismissible` на новій
   * інформаційній модалці лише трохи дратує й помітний одразу.
   *
   * Вмикати лише там, де втрачати нічого: перегляд, звіт, промо, налаштування,
   * що зберігаються одразу. Esc і хрестик закривають у будь-якому разі.
   */
  dismissible?: boolean
  /**
   * Явний сигнал «у формі є незбережені зміни». Якщо не переданий, дровер
   * визначає це сам — див. `useUnsavedGuard`. Передавати лише там, де
   * автовизначення перестраховується, а точність важлива.
   */
  isDirty?: boolean
  /** Класи для підкладки — нижній аркуш затемнює й розмиває тло по-своєму. */
  overlayClassName?: string
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, hideClose = false, dismissible = false, isDirty, overlayClassName, onInteractOutside, onEscapeKeyDown, ...props }, ref) => {
  const guard = useUnsavedGuard({ enabled: !dismissible, isDirty })
  // Закрити дровер «по-справжньому» з-під вікна підтвердження. Radix не дає
  // дотягнутись до `onOpenChange` з контенту, а класти сюди `SheetPrimitive.Close`
  // не можна: всередині AlertDialog він підхопив би контекст ТОГО діалогу й
  // закривав би підтвердження, а не дровер.
  const closeRef = React.useRef<HTMLButtonElement>(null)

  // Поки панель відкрита, смуга вкладок ховається — та сама причина, що й у
  // модалок: вона висить поверх нижнього краю й ловить дотики.
  React.useEffect(() => registerOverlay(), [])

  return (
  <SheetPortal>
    <SheetOverlay className={overlayClassName} />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      translate="no"
      onInteractOutside={(event) => {
        // Спершу віддаємо подію споживачу: він міг сам вирішити її скасувати.
        onInteractOutside?.(event)
        if (event.defaultPrevented || dismissible) return
        /**
         * Клік повз поводиться так само, як Esc: порожню форму закриває, а
         * заповнену — питає. Раніше тут стояв беззастережний preventDefault,
         * тобто клік повз не робив НІЧОГО — і порожній дровер ігнорував його
         * так само, як заповнений (REQ-5).
         */
        if (guard.shouldBlock()) {
          event.preventDefault()
          guard.ask()
        }
      }}
      onEscapeKeyDown={(event) => {
        onEscapeKeyDown?.(event)
        if (event.defaultPrevented) return
        if (guard.shouldBlock()) {
          event.preventDefault()
          guard.ask()
        }
      }}
      /**
       * Radix при відкритті ставить фокус на ПЕРШИЙ фокусований елемент вмісту,
       * а це завжди хрестик — він стоїть першим у розмітці. Через це кожен
       * дровер відкривався з синім ореолом навколо хрестика: `:focus-visible`
       * спрацьовує й на програмному фокусі, коли той заходить у щойно
       * відкрите вікно.
       *
       * Фокус не прибираємо, а переносимо на сам контейнер — Radix дає йому
       * `tabIndex={-1}`. Пастка фокуса, Tab усередині дровера й Esc лишаються
       * робочими, а кільця немає, бо на контейнері стилів фокуса нема.
       *
       * Стоїть ДО `{...props}` навмисно: місця, яким потрібна своя поведінка
       * (курсор одразу в полі), передають власний `onOpenAutoFocus` і
       * перекривають цей.
       */
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        ;(event.currentTarget as HTMLElement | null)?.focus()
      }}
      {...props}
    >
      {/* НЕ прибирати tabIndex={-1}: Radix шукає перший елемент із tabIndex >= 0
          і поставив би сюди фокус при відкритті. CSS-клас `hidden` його не
          рятує — фільтр дивиться на властивість, а не на стилі. */}
      {/* Слухач захисту — усередині вмісту, щоб жити рівно стільки, скільки
          відкритий дровер. Пояснення — у useUnsavedGuard. */}
      <UnsavedGuardListener enabled={guard.listening} touchedRef={guard.touchedRef} />
      <SheetPrimitive.Close ref={closeRef} data-unsaved-ignore className="hidden" aria-hidden tabIndex={-1} />
      {!hideClose ? (
        <SheetPrimitive.Close
          data-unsaved-ignore
          onClick={(event) => {
            // Radix пропускає власний обробник, якщо подію скасували, — саме так
            // хрестик і перехоплюється, без підміни примітива.
            if (guard.shouldBlock()) {
              event.preventDefault()
              guard.ask()
            }
          }}
          className="absolute right-4 top-4 rounded-[var(--radius-md)] p-1.5 text-muted-foreground opacity-60 transition-all hover:opacity-100 hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none data-[state=open]:bg-secondary"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      ) : null}
      {children}
      <UnsavedChangesPrompt
        open={guard.asking}
        onDismiss={guard.dismiss}
        onDiscard={() => {
          guard.dismiss()
          closeRef.current?.click()
        }}
      />
    </SheetPrimitive.Content>
  </SheetPortal>
  )
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

/**
 * Прокрутна середина дровера.
 *
 * Єдине місце, де має стояти `overflow-y-auto`. Якщо повісити його на
 * `SheetContent`, поїде весь дровер разом із шапкою й підвалом.
 *
 * `min-h-0` обовʼязковий: flex-елемент за замовчуванням не стискається менше за
 * свій вміст, тож без нього `flex-1` не обмежить висоту й прокрутки не буде —
 * замість неї дровер просто виїде за екран.
 */
const SheetBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)} {...props} />
)
SheetBody.displayName = "SheetBody"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

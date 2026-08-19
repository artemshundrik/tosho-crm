import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnsavedChangesPrompt, UnsavedGuardListener, useUnsavedGuard } from "@/components/ui/unsaved-guard";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm notranslate",
      // Підкладка приходить м'яко й трохи довше за вікно: спершу гасне тло,
      // на ньому вже проявляється модалка. Крива smooth, а не пружна: для
      // чистого фейду пружність не читається, лише вкорочує реальний час.
      // Розмиття НЕ анімуємо — ramp backdrop-filter коштує кадрів на слабких
      // машинах, а виграшу не дає: око ловить зміну яскравості, не різкості.
      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      "data-[state=open]:duration-slow data-[state=closed]:duration-fast ease-smooth",
      "motion-reduce:animate-none",
      className
    )}
    translate="no"
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  hideClose?: boolean;
  /**
   * Чи закривати модалку кліком повз неї. За замовчуванням — НІ.
   *
   * Те саме правило й з тієї ж причини, що в `SheetContent`: клік повз — промах,
   * а не намір, і донедавна він стирав усе введене. Замовчування захисне, бо
   * ціна помилки асиметрична: забутий захист коштує роботи, забутий
   * `dismissible` — лише секунди роздратування.
   *
   * `AlertDialog` (на ньому `ConfirmDialog`) сюди не входить: Radix там ігнорує
   * клік повз від початку, тож підтвердження вже захищені.
   *
   * Вмикати лише там, де втрачати нічого: перегляд, звіт, промо, налаштування,
   * що зберігаються одразу. Esc і хрестик закривають у будь-якому разі.
   */
  dismissible?: boolean;
  /**
   * Явний сигнал «є незбережені зміни». Якщо не переданий, модалка визначає це
   * сама — див. `useUnsavedGuard`.
   */
  isDirty?: boolean;
  /**
   * Класи для затемнення під модалкою. Потрібні там, де тло має розмиватись
   * сильніше за типове — наприклад, у палітрі на телефоні, де аркуш займає
   * пів екрана й решта має відійти на задній план.
   */
  overlayClassName?: string;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideClose = false, dismissible = false, isDirty, overlayClassName, onInteractOutside, onEscapeKeyDown, ...props }, ref) => {
  const guard = useUnsavedGuard({ enabled: !dismissible, isDirty });
  // Прихований Close, щоб закрити модалку з-під вікна підтвердження: покласти
  // `DialogClose` всередину AlertDialog не можна — там він підхопить контекст
  // того діалогу й закриє підтвердження замість модалки.
  const closeRef = React.useRef<HTMLButtonElement>(null);

  return (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />

    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-20px)] max-w-lg translate-x-[-50%] translate-y-[-50%] notranslate",
        "max-h-[calc(100dvh-1.5rem)]",
        "rounded-4xl border border-border/40 bg-card shadow-2xl ring-1 ring-black/5 dark:ring-white/5 outline-none",
        "flex flex-col gap-2 overflow-hidden p-4 sm:gap-3 sm:p-5",
        // ВІДКРИТТЯ: проявлення + легкий приріст масштабу + підйом на 8px.
        // Разом це читається як «вікно виринає», а не «кадр підмінили». Крива —
        // токен ease-out (cubic-bezier(.32,.72,0,1), «пружне виринання»), тривалість
        // slow (240ms): саме під це токен і заведений — «розгортання, поява панелей».
        //
        // ЗАКРИТТЯ навмисно вдвічі коротше (fast, 110ms) і без підйому: піти має
        // швидко. Симетрична анімація закриття читається як гальмування інтерфейсу.
        //
        // ПРО slide-in-from-bottom-2 і Tailwind v4. Забороняти треба не slide взагалі,
        // а ВІДСОТКОВІ зсуви з рецептів shadcn (slide-in-from-top-[48%] і подібні):
        // ті писані під v3, де центрування жило в transform і зсув його ЗАМІНЯВ. У v4
        // центрування в окремій властивості translate, тож зсув до нього ДОДАЄТЬСЯ —
        // і 48% викидають вікно за екран. Фіксовані 8px (-2) додаються так само, але
        // це рівно той підйом, який тут і потрібен. Перевірено заміром: вікно
        // стартує на 8px нижче центру й доїжджає рівно в центр.
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        "data-[state=open]:duration-slow data-[state=closed]:duration-fast ease-out",
        "motion-reduce:animate-none",
        className
      )}
      translate="no"
      onInteractOutside={(event) => {
        // Спершу віддаємо подію споживачу: він міг сам вирішити її скасувати.
        onInteractOutside?.(event);
        if (event.defaultPrevented || dismissible) return;
        /**
         * Клік повз поводиться так само, як Esc: порожню форму закриває, а
         * заповнену — питає.
         *
         * Раніше тут стояв беззастережний preventDefault, тобто клік повз
         * НЕ РОБИВ НІЧОГО: ні закривав, ні питав. Порожня форма ігнорувала
         * клік так само, як заповнена, і це читалось як зламана взаємодія —
         * саме на це поскаржився Артем (REQ-5). Захист від втрати введеного
         * при цьому нікуди не подівся: він просто питає, замість мовчати.
         */
        if (guard.shouldBlock()) {
          event.preventDefault();
          guard.ask();
        }
      }}
      onEscapeKeyDown={(event) => {
        onEscapeKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (guard.shouldBlock()) {
          event.preventDefault();
          guard.ask();
        }
      }}
      {...props}
    >
      {/* НЕ прибирати tabIndex={-1}: Radix шукає перший елемент із tabIndex >= 0
          і поставив би сюди фокус при відкритті. CSS-клас `hidden` не рятує —
          фільтр дивиться на властивість, а не на стилі. */}
      {/* Слухач захисту — саме ТУТ, усередині вмісту: він має жити рівно стільки,
          скільки відкрите вікно. Ззовні він висів би й на закритому, і клік, яким
          вікно відкривають, позначав би форму зміненою. */}
      <UnsavedGuardListener enabled={guard.listening} touchedRef={guard.touchedRef} />
      <DialogClose ref={closeRef} data-unsaved-ignore className="hidden" aria-hidden tabIndex={-1} />
      {children}

      {!hideClose && (
        <DialogClose
          data-unsaved-ignore
          onClick={(event) => {
            // Radix пропускає власний обробник, якщо подію скасували.
            if (guard.shouldBlock()) {
              event.preventDefault();
              guard.ask();
            }
          }}
          className={cn(
            "absolute right-4 top-4 rounded-[var(--radius-md)] p-1.5 text-muted-foreground opacity-60 transition-all hover:opacity-100 hover:bg-muted/50 hover:text-foreground",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
      )}
      <UnsavedChangesPrompt
        open={guard.asking}
        onDismiss={guard.dismiss}
        onDiscard={() => {
          guard.dismiss();
          closeRef.current?.click();
        }}
      />
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn("flex flex-col space-y-1 text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};

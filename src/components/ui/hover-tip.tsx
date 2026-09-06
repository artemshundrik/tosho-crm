import * as React from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Підказка по наведенню.
 *
 * Чому на Popover, а не на окремій бібліотеці: @radix-ui/react-tooltip у
 * проєкті не встановлений, а тягнути залежність заради підказки — зайве.
 * Popover уже є, і цей же прийом (hover + затримка на закриття) вже
 * використовує клітинка нотатки у виплатах.
 *
 * Затримка на закриття потрібна, щоб підказка не блимала, поки курсор
 * перетинає зазор між тригером і бульбашкою.
 *
 * `ready` — для карток із лінивими даними (людина, замовник): без нього
 * бульбашка відкривалась миттєво напівпорожньою і ДОРОСТАЛА, коли запит
 * повертався, — «стрибала» (правка CEO 2026-08-07). Тепер відкриття чекає
 * готовності, але не довше за короткий ліміт: на повільній мережі краще
 * показати картку з «завантажуємо…», ніж не показати нічого.
 */
export function HoverTip({
  label,
  children,
  side = "top",
  className,
  contentClassName,
  ready = true,
  maxReadyWaitMs = 450,
  asChild = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** Класи ТРИГЕРА (обгортки навколо children). */
  className?: string;
  /**
   * Класи самої бульбашки. Потрібні, коли всередині не рядок, а картка:
   * дефолтні `max-w-[240px]` і дрібні відступи їй затісні.
   */
  contentClassName?: string;
  /** false — вміст ще вантажиться; відкриття зачекає (до maxReadyWaitMs). */
  ready?: boolean;
  maxReadyWaitMs?: number;
  /**
   * Не малювати власної обгортки — повісити підказку ПРЯМО на дитину.
   *
   * НАВІЩО. Типовий тригер — це `<span class="inline-flex">` навколо дитини, і
   * в рядку з `flex` елементом ряду стає саме він. Кнопка з `shrink-0`,
   * загорнута в такий span, свою незжимальність втрачає — span її не має, — і
   * розкладка тихо їде. Для іконкових кнопок, яких у базі під сотню, це було б
   * сотня ризиків на рівному місці.
   *
   * Radix `asChild` вливає обробники в саму дитину через Slot (він же й
   * склеює їх із її власними), тож зайвого вузла в дереві не з'являється
   * взагалі. Дитина має бути ОДНИМ елементом, що приймає ref і DOM-пропси.
   */
  asChild?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  // Ідентифікатор бульбашки: він потрібен, щоб ПРИВ'ЯЗАТИ підказку до
  // елемента, а не просто показати її поруч. Без цього читалка оголошує
  // кнопку без жодного пояснення — рівно та сама дірка, що була в
  // системному `title`, тільки гарніша на вигляд.
  const tipId = React.useId();
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Курсор досі над тригером? Без цього готовність, що прийшла після
  // відходу миші, відкривала б бульбашку в порожнечу.
  const wantsOpen = React.useRef(false);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const cancelWait = () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    waitTimer.current = null;
  };

  React.useEffect(
    () => () => {
      cancelClose();
      cancelWait();
    },
    []
  );

  const show = () => {
    cancelClose();
    wantsOpen.current = true;
    if (ready) {
      setOpen(true);
      return;
    }
    if (!waitTimer.current) {
      waitTimer.current = setTimeout(() => {
        waitTimer.current = null;
        if (wantsOpen.current) setOpen(true);
      }, maxReadyWaitMs);
    }
  };
  const hide = () => {
    wantsOpen.current = false;
    cancelWait();
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 90);
  };

  React.useEffect(() => {
    // Дані доїхали, поки ми чекали — відкриваємось одразу, без решти ліміту.
    if (ready && wantsOpen.current && !open) {
      cancelWait();
      setOpen(true);
    }
  }, [ready, open]);

  // Порожній підпис — підказки немає взагалі, і Popover не заводиться.
  // Так виглядає кнопка, чия підказка залежить від стану («чому не можна
  // натиснути»): у робочому стані пояснювати нічого, а порожня бульбашка
  // під курсором виглядала б як помилка.
  if (!label) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {asChild ? (
        <PopoverAnchor
          asChild
          onMouseEnter={show}
          onMouseLeave={hide}
          // Обробник стоїть на самій кнопці, тож focus/blur ловляться прямо —
          // capture-варіант потрібен лише обгортці, повз яку фокус не спливає.
          onFocus={show}
          onBlur={hide}
          aria-describedby={open ? tipId : undefined}
        >
          {children}
        </PopoverAnchor>
      ) : (
      <PopoverAnchor asChild>
        <span
          className={cn("inline-flex", className)}
          onMouseEnter={show}
          onMouseLeave={hide}
          // Клавіатура має показувати те саме, що й миша.
          onFocusCapture={show}
          onBlurCapture={hide}
        >
          {/*
            `aria-describedby` вішаємо на САМУ дитину, а не на обгортку.
            Опис читається для того елемента, на якому стоїть фокус: на
            span-обгортці він не прозвучав би ніколи, бо фокус отримує кнопка
            всередині. Клонування — те саме, що робить radix-tooltip через
            `asChild`; коли дитина не елемент (рядок, фрагмент), лишаємо як є.
          */}
          {open && React.isValidElement(children)
            ? React.cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, {
                "aria-describedby":
                  [(children.props as { "aria-describedby"?: string })["aria-describedby"], tipId]
                    .filter(Boolean)
                    .join(" "),
              })
            : children}
        </span>
      </PopoverAnchor>
      )}
      <PopoverContent
        id={tipId}
        role="tooltip"
        side={side}
        align="center"
        sideOffset={6}
        // Підказка нічого не ловить: кліки й ховер мають лишатися в тригері.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn(
          "pointer-events-none w-auto max-w-[240px] rounded-md border-border/60 px-2.5 py-1.5 text-xs leading-snug text-popover-foreground shadow-menu",
          contentClassName
        )}
      >
        {label}
      </PopoverContent>
    </Popover>
  );
}

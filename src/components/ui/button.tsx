import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { CONTROL_DISABLED_STATE } from "@/components/ui/controlStyles";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap",
    "select-none cursor-pointer",
    // Перелік властивостей замість transition-all: all анімує зокрема
    // властивості розкладки. active:duration-fast — це «натиск коротший за
    // відпускання» (§5.5): у стані active УСІ переходи йдуть 110ms, назад 160ms.
    // Розводити тривалості по властивостях (§5.1) можна лише позиційним
    // arbitrary-списком без токенів — свідомо обрано простіший запис.
    // `scale` У ПЕРЕЛІКУ ОБОВʼЯЗКОВО: Tailwind v4 масштабує однойменною
    // властивістю, а не transform, тож без неї натиск стрибав без переходу.
    "transition-[background-color,border-color,color,box-shadow,transform,scale,opacity]",
    "duration-base ease-out active:duration-fast",
    "motion-reduce:transition-none",
    // Typography base (без font-weight — вага тільки у variant; кегль — у size)
    "tracking-[0.01em]",
    // Icons: розмір і gap живуть у size, тут лише поведінка
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "[&_svg]:-mt-[0.5px]",
    // Focus/disabled
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    // Заблокований стан — спільний із полями рядок на --control-* токенах
    // (не opacity: прозорість не знає про тему й топила темну в багно).
    // Прозорі варіанти (ghost/link/text*) глушать плашку в себе нижче.
    "disabled:pointer-events-none disabled:ring-0",
    CONTROL_DISABLED_STATE,
    // Shape / spacing
    "rounded-xl",
    // will-change тут НЕ ставимо: він тримає окремий композиторський шар на
    // кожній кнопці, а на дошці й у таблицях їх сотні. Натиск і так анімується
    // властивістю scale, яку браузер піднімає на шар лише на час переходу.
    "bg-clip-padding",
  ].join(" "),
  {
    variants: {
      variant: {
        // ✅ Filled CTA (Linear-style): semibold ALWAYS
        primary: [
          "!font-medium",
          "bg-foreground text-background",
          "ring-1 ring-[hsl(var(--soft-ring))]",
          "hover:bg-(--btn-solid-hover)",
          "active:bg-(--btn-solid-active) active:scale-[0.972]",
        ].join(" "),

        // ✅ Surface (hero/secondary): medium by default (як у Linear)
        secondary: [
          "!font-medium",
          "bg-muted/40 text-foreground border border-border/50",
          "hover:bg-muted/80",
          "active:bg-muted active:scale-[0.972]",
        ].join(" "),

        outline: [
          "!font-medium",
          "border border-border/50 bg-transparent text-foreground",
          "hover:bg-muted/60",
          "active:bg-muted/80 active:scale-[0.972]",
        ].join(" "),

        // ✅ Danger: soft, low-emphasis destructive tone
        destructive: [
          "!font-medium",
          "text-destructive",
          "bg-transparent",
          "border border-danger-soft-border",
          "hover:bg-danger-soft hover:border-destructive/55",
          "active:bg-destructive/15 active:scale-[0.972]",
        ].join(" "),

        destructiveSolid: [
          "!font-medium",
          "bg-destructive text-destructive-foreground",
          "hover:bg-(--btn-danger-hover)",
          "active:bg-(--btn-danger-active) active:scale-[0.972]",
        ].join(" "),

        // ✅ Success: тональна для дій-підтверджень («Сплачено», «Готово», «Виплачено»)
        successTonal: [
          "!font-medium",
          "bg-success-soft text-success-foreground border border-success-soft-border",
          "hover:bg-success-soft/70",
          "active:scale-[0.972]",
        ].join(" "),

        // ✅ Ghost/link: medium.
        // Прозорим варіантам disabled-плашка з бази недоречна: кнопка, якої «не
        // видно» до ховера, у disabled матеріалізувалась би в сірий прямокутник.
        // Текст сіріє тим самим токеном, тло лишається прозорим.
        ghost: "!font-medium bg-transparent text-foreground hover:bg-muted/60 hover:text-foreground active:bg-muted/80 active:scale-[0.972] disabled:bg-transparent disabled:border-transparent",
        link: "!font-medium bg-transparent text-primary underline-offset-4 hover:underline disabled:bg-transparent disabled:border-transparent",

        // ✅ Menu trigger / list item
        menu: "!font-medium bg-transparent text-foreground hover:bg-muted/60 flex w-full justify-start rounded-lg disabled:bg-transparent disabled:border-transparent",

        // ✅ Muted text action
        textMuted: [
          "!font-medium bg-transparent text-muted-foreground",
          "rounded-lg hover:text-foreground hover:bg-muted/50",
          "disabled:bg-transparent disabled:border-transparent",
        ].join(" "),

        // ✅ Primary text action
        textPrimary: "!font-medium bg-transparent text-primary hover:text-primary/90 disabled:bg-transparent disabled:border-transparent",

        // ✅ Text on primary surface (e.g., split primary buttons)
        onPrimary: [
          "!font-medium bg-transparent text-background",
          "hover:bg-background/10",
          "disabled:bg-transparent disabled:border-transparent",
        ].join(" "),

        // ✅ Segmented tabs (uses aria-pressed for active state)
        segmented: [
          "!font-medium border border-transparent bg-transparent text-muted-foreground",
          "hover:bg-background/40 hover:text-foreground",
          "aria-[pressed=true]:border-border aria-[pressed=true]:bg-background aria-[pressed=true]:text-foreground",
          "disabled:bg-transparent disabled:border-transparent",
        ].join(" "),

        // ✅ Filter chip / pill toggle
        chip: [
          "!font-semibold rounded-full border border-border/50",
          "h-7 px-3",
          "bg-muted/40 text-muted-foreground",
          "hover:text-foreground hover:bg-muted/60",
          "aria-[pressed=true]:border-foreground/20 aria-[pressed=true]:bg-foreground aria-[pressed=true]:text-background",
        ].join(" "),

        // ✅ Card-like action (list items, selection cards)
        card: [
          "!font-medium w-full justify-start text-left",
          "rounded-xl border border-border/50 bg-card/60",
          "hover:bg-muted/40",
          "data-[state=active]:border-foreground/30 data-[state=active]:bg-foreground/5 data-[state=active]:ring-1 data-[state=active]:ring-foreground/10",
          "data-[status=unavailable]:border-dashed data-[status=unavailable]:border-danger-soft-border data-[status=unavailable]:bg-danger-soft data-[status=unavailable]:opacity-80",
        ].join(" "),

        // ✅ Icon control (toolbar/search clear)
        control: [
          "!font-medium",
          "rounded-xl",
          "bg-transparent",
          "text-muted-foreground hover:text-foreground",
          "hover:bg-muted/40",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          "disabled:bg-transparent disabled:border-transparent",
        ].join(" "),

        // ✅ Icon control (destructive)
        controlDestructive: [
          "!font-medium",
          "rounded-xl",
          "bg-transparent",
          "text-destructive hover:text-destructive",
          "hover:bg-danger-soft/40",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          "disabled:bg-transparent disabled:border-transparent",
        ].join(" "),

        // ✅ Inverted icon (dark on light, for avatar edit)
        inverted: [
          "!font-medium",
          "rounded-full",
          "bg-foreground text-background hover:bg-foreground/80",
        ].join(" "),

        // ✅ Pill toggle (attendance / binary switch)
        pill: [
          "!font-semibold rounded-full",
          "bg-muted/40 text-foreground hover:bg-muted/60",
          "aria-[pressed=true]:bg-foreground aria-[pressed=true]:text-background aria-[pressed=true]:hover:bg-foreground/90",
          "border border-transparent",
        ].join(" "),
      },

      // ✅ Height (як ти хотів “як була”)
      // Радіус масштабується з висотою (інакше 14px на h-8 читається як піл):
      // ≤h-8 → rounded-md, h-9 → rounded-lg, h-10 → базовий rounded-xl,
      // у парі з інпутами тієї ж висоти.
      // Іконка і gap — частина розміру: 16px іконка поруч із 12px текстом (sm)
      // була більша за підпис у 1.33 раза. Відступ тримає ≈0.375 висоти.
      size: {
        xxs: "h-6 rounded-md px-2 text-3xs leading-none gap-1 [&_svg]:size-3",
        xs: "h-7 rounded-md px-2.5 text-xs gap-1 [&_svg]:size-3.5",
        sm: "h-8 rounded-md px-3 text-xs gap-1.5 [&_svg]:size-3.5",
        md: "h-9 rounded-lg px-3.5 text-sm gap-1.5 [&_svg]:size-4",
        lg: "h-10 px-4 text-base gap-2 [&_svg]:size-4",
        iconXs: "h-7 w-7 rounded-md px-0 [&_svg]:size-3.5",
        iconSm: "h-8 w-8 rounded-md px-0 [&_svg]:size-3.5",
        iconMd: "h-9 w-9 rounded-lg px-0 [&_svg]:size-4",
        icon: "h-10 w-10 px-0 [&_svg]:size-4",
      },
    },

    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

/**
 * Спінер стану завантаження: кільце-доріжка + головка-дуга, не гола дуга.
 * transform-box/origin обовʼязкові — без них SVG обертається навколо кута.
 * Розмір не задає: успадковує [&_svg]:size-* від size кнопки, тому займає
 * рівно місце провідної іконки й ширина кнопки не змінюється.
 */
function ButtonSpinner() {
  return (
    <svg
      data-btn-spinner=""
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      className="animate-spin [transform-box:fill-box] [transform-origin:50%_50%]"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" strokeOpacity=".28" />
      <path
        d="M8 1.5A6.5 6.5 0 0 1 14.5 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Зайнята кнопка: спінер по центру, вміст лишається на місці, але невидимий.
   *
   * ЧОМУ САМЕ ТАК. Ширина кнопки не змінюється ані на піксель — прихований
   * підпис і далі тримає розмір. Підміна підпису на «Збереження…» міняла
   * ширину й посувала сусідню кнопку, а спінер, доданий ПОРУЧ із підписом,
   * робив те саме в кнопок без іконки. У футері діалогу це особливо помітно:
   * «Скасувати» стрибає вбік у момент кліку.
   *
   * Активація глушиться повністю (клік, Enter/Space, сабміт форми), але
   * свідомо НЕ атрибутом disabled — заблокована і зайнята кнопки мають різний
   * вигляд і різний зміст для читача з екрана. При asChild спінера немає
   * (Slot вимагає рівно одного child-елемента) — лишаються aria-стан,
   * глушіння і пригашення.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const showSpinner = loading && !asChild;
    const ariaProps = loading
      ? ({ "aria-busy": true, "aria-disabled": true } as const)
      : undefined;
    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant, size }),
          // relative — щоб спінер ліг рівно по центру кнопки, не змінюючи її
          // розмір; на кнопки без loading це не впливає.
          loading && "pointer-events-none relative",
          // asChild не має спінера, тож хоч пригашенням показуємо «зайнято».
          loading && asChild && "opacity-85",
          className
        )}
        // pointer-events-none глушить лише мишу; Enter/Space на сфокусованій
        // кнопці й імпліцитний сабміт форми по Enter у полі все одно генерують
        // click — перехоплюємо його, інакше «зайнята» кнопка сабмітить двічі.
        onClick={loading ? (event) => event.preventDefault() : onClick}
        {...props}
        {...ariaProps}
      >
        {showSpinner ? (
          <>
            {/* Вміст лишається в потоці й тримає ширину, але не видимий —
                інакше кнопка змінила б розмір і посунула сусідні. */}
            <span className="invisible inline-flex items-center gap-[inherit]" aria-hidden="true">
              {children}
            </span>
            <span className="absolute inset-0 flex items-center justify-center">
              <ButtonSpinner />
            </span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };

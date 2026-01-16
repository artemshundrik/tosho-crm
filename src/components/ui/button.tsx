import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap",
    "select-none",
    "transition-all duration-200 ease-out",
    // Typography base (без font-weight — вага тільки у variant)
    "text-[16px] leading-[24.8px] tracking-[0.2px]",
    // Icons
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "[&_svg]:-mt-[0.5px]",
    // Focus/disabled
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    // Shape / spacing
    "rounded-[var(--btn-radius)]",
    "gap-2",
    "will-change-transform",
    "bg-clip-padding",
  ].join(" "),
  {
    variants: {
      variant: {
        // ✅ Filled CTA (Linear-style): semibold ALWAYS
        primary: [
          "!font-medium", // ⬅️ ключ: прибиває “regular” у всіх кнопках з іконкою
          "text-primary-foreground",
          "gumloop-blue-gradient",
          "btn-3d-shadow",
          "btn-glow btn-glow-primary btn-sheen",
          "hover:-translate-y-[1px]",
          "active:scale-[0.985]",
        ].join(" "),

        // ✅ Surface (hero/secondary): medium by default (як у Linear)
        secondary: [
          "!font-medium",
          "bg-secondary text-secondary-foreground border border-border",
          "btn-surface-shadow",
          "hover:-translate-y-[1px]",
          "hover:btn-surface-shadow-hover",
          "active:translate-y-0",
          "active:scale-[0.99]",
          "active:btn-surface-pressed",
        ].join(" "),

        outline: [
          "!font-medium",
          "border border-border bg-transparent text-foreground",
          "hover:bg-muted/40",
          "hover:-translate-y-[1px]",
          "active:translate-y-0",
          "active:scale-[0.99]",
        ].join(" "),

        // ✅ Danger: soft, low-emphasis destructive tone
        destructive: [
          "!font-medium",
          "text-destructive",
          "bg-transparent",
          "border border-destructive/30",
          "hover:bg-destructive/10",
          "hover:-translate-y-[1px]",
          "hover:text-destructive",
          "active:translate-y-0",
          "active:scale-[0.99]",
        ].join(" "),

        destructiveSolid: [
          "!font-medium",
          "bg-destructive text-destructive-foreground",
          "shadow-md shadow-destructive/20",
          "hover:bg-destructive/90",
          "hover:-translate-y-[1px]",
          "active:translate-y-0",
          "active:scale-[0.99]",
        ].join(" "),

        // ✅ Ghost/link: medium
        ghost: "!font-medium bg-transparent text-foreground hover:bg-accent active:scale-[0.99]",
        link: "!font-medium bg-transparent text-primary underline-offset-4 hover:underline",

        // ✅ Menu trigger / list item
        menu: "!font-medium bg-transparent text-foreground hover:bg-muted/60 flex w-full justify-start",

        // ✅ Muted text action
        textMuted: [
          "!font-medium bg-transparent text-muted-foreground",
          "rounded-[var(--radius-md)] hover:text-foreground hover:bg-muted/50",
        ].join(" "),

        // ✅ Primary text action
        textPrimary: "!font-medium bg-transparent text-primary hover:text-primary/90",

        // ✅ Text on primary surface (e.g., split primary buttons)
        onPrimary: [
          "!font-medium bg-transparent text-primary-foreground",
          "hover:bg-primary-foreground/10",
        ].join(" "),

        // ✅ Segmented tabs (uses aria-pressed for active state)
        segmented: [
          "!font-medium bg-transparent text-muted-foreground",
          "hover:text-foreground",
          "aria-[pressed=true]:bg-card aria-[pressed=true]:text-foreground aria-[pressed=true]:shadow-sm",
        ].join(" "),

        // ✅ Filter chip / pill toggle
        chip: [
          "!font-semibold rounded-full border border-border",
          "h-7 px-3",
          "bg-muted/30 text-muted-foreground",
          "hover:text-foreground hover:bg-muted/40",
          "aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary/10 aria-[pressed=true]:text-primary",
        ].join(" "),

        // ✅ Card-like action (list items, selection cards)
        card: [
          "!font-medium w-full justify-start text-left",
          "rounded-[var(--radius-inner)] border border-border bg-card/60",
          "hover:bg-muted/40",
          "data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:ring-1 data-[state=active]:ring-primary/10",
          "data-[status=unavailable]:border-dashed data-[status=unavailable]:border-red-200 data-[status=unavailable]:bg-red-50/30 data-[status=unavailable]:opacity-80",
        ].join(" "),

        // ✅ Icon control (toolbar/search clear)
        control: [
          "!font-medium",
          "rounded-[var(--radius-lg)]",
          "text-muted-foreground hover:text-foreground",
          "hover:bg-muted",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        ].join(" "),

        // ✅ Icon control (destructive)
        controlDestructive: [
          "!font-medium",
          "rounded-[var(--radius-lg)]",
          "text-destructive hover:text-destructive",
          "hover:bg-danger-soft/40",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
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
          "aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground aria-[pressed=true]:hover:bg-primary/90",
          "border border-transparent",
        ].join(" "),
      },

      // ✅ Height (як ти хотів “як була”)
      size: {
        xxs: "h-7 px-2 text-[11px] leading-none",
        xs: "h-8 px-4 text-sm",
        sm: "h-9 px-3",          // 36
        md: "h-10 px-5",         // 40 (default)
        lg: "h-11 px-6",         // 44
        iconXs: "h-8 w-8 px-0",
        iconSm: "h-7 w-7 px-0",
        iconMd: "h-9 w-9 px-0",
        icon: "h-10 w-10 px-0",  // 40x40
      },
    },

    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };

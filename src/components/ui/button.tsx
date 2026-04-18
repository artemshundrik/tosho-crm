import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap",
    "select-none cursor-pointer",
    "transition-all duration-150 ease-out",
    // Typography base (без font-weight — вага тільки у variant)
    "text-[16px] leading-[24.8px] tracking-[0.2px]",
    // Icons
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "[&_svg]:-mt-[0.5px]",
    // Focus/disabled
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    // Shape / spacing
    "rounded-xl",
    "gap-2",
    "will-change-transform",
    "bg-clip-padding",
  ].join(" "),
  {
    variants: {
      variant: {
        // ✅ Filled CTA (Linear-style): semibold ALWAYS
        primary: [
          "!font-medium",
          "bg-foreground text-background",
          "shadow-[var(--shadow-elevated-sm)] ring-1 ring-[hsl(var(--soft-ring))]",
          "hover:opacity-85",
          "active:scale-[0.98]",
        ].join(" "),

        // ✅ Surface (hero/secondary): medium by default (як у Linear)
        secondary: [
          "!font-medium",
          "bg-muted/40 text-foreground border border-border/50",
          "shadow-inner",
          "hover:bg-muted/80",
          "active:scale-[0.98]",
        ].join(" "),

        outline: [
          "!font-medium",
          "border border-border/50 bg-transparent text-foreground",
          "hover:bg-muted/60",
          "active:scale-[0.98]",
        ].join(" "),

        // ✅ Danger: soft, low-emphasis destructive tone
        destructive: [
          "!font-medium",
          "text-destructive",
          "bg-transparent",
          "border border-destructive/30",
          "hover:bg-danger-soft/80 hover:text-destructive",
          "active:scale-[0.98]",
        ].join(" "),

        destructiveSolid: [
          "!font-medium",
          "bg-destructive text-destructive-foreground",
          "shadow-[var(--shadow-elevated-sm)]",
          "hover:opacity-85",
          "active:scale-[0.98]",
        ].join(" "),

        // ✅ Ghost/link: medium
        ghost: "!font-medium bg-transparent text-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.98]",
        link: "!font-medium bg-transparent text-primary underline-offset-4 hover:underline",

        // ✅ Menu trigger / list item
        menu: "!font-medium bg-transparent text-foreground hover:bg-muted/60 flex w-full justify-start rounded-lg",

        // ✅ Muted text action
        textMuted: [
          "!font-medium bg-transparent text-muted-foreground",
          "rounded-lg hover:text-foreground hover:bg-muted/50",
        ].join(" "),

        // ✅ Primary text action
        textPrimary: "!font-medium bg-transparent text-primary hover:text-primary/90",

        // ✅ Text on primary surface (e.g., split primary buttons)
        onPrimary: [
          "!font-medium bg-transparent text-background",
          "hover:bg-background/10",
        ].join(" "),

        // ✅ Segmented tabs (uses aria-pressed for active state)
        segmented: [
          "!font-medium border border-transparent bg-transparent text-muted-foreground shadow-none",
          "hover:bg-background/40 hover:text-foreground",
          "aria-[pressed=true]:border-border aria-[pressed=true]:bg-background aria-[pressed=true]:text-foreground aria-[pressed=true]:shadow-sm",
        ].join(" "),

        // ✅ Filter chip / pill toggle
        chip: [
          "!font-semibold rounded-full border border-border/50",
          "h-7 px-3",
          "bg-muted/40 text-muted-foreground shadow-inner",
          "hover:text-foreground hover:bg-muted/60",
          "aria-[pressed=true]:border-foreground/20 aria-[pressed=true]:bg-foreground aria-[pressed=true]:text-background aria-[pressed=true]:shadow-md",
        ].join(" "),

        // ✅ Card-like action (list items, selection cards)
        card: [
          "!font-medium w-full justify-start text-left",
          "rounded-xl border border-border/50 bg-card/60 shadow-sm",
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
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        ].join(" "),

        // ✅ Icon control (destructive)
        controlDestructive: [
          "!font-medium",
          "rounded-xl",
          "bg-transparent",
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
          "bg-muted/40 text-foreground shadow-inner hover:bg-muted/60",
          "aria-[pressed=true]:bg-foreground aria-[pressed=true]:text-background aria-[pressed=true]:hover:bg-foreground/90 aria-[pressed=true]:shadow-md",
          "border border-transparent",
        ].join(" "),
      },

      // ✅ Height (як ти хотів “як була”)
      size: {
        xxs: "h-6 px-2 text-[10px] leading-none",
        xs: "h-7 px-2.5 text-xs",
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-10 px-5 text-[15px]",
        compact: "h-7 px-3 text-xs",
        iconXs: "h-7 w-7 px-0",
        iconSm: "h-8 w-8 px-0",
        iconMd: "h-9 w-9 px-0",
        icon: "h-10 w-10 px-0",
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

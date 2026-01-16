import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge system goals:
 * - One component for all status chips across the app
 * - Semantic tones: neutral/info/success/danger (+ destructive for system)
 * - Consistent sizing + pill shape
 * - Still compatible with existing `variant` usage
 */
const badgeVariants = cva(
  "inline-flex items-center border font-semibold whitespace-nowrap select-none",
  {
    variants: {
      /**
       * Keep shadcn-style variants for backwards compatibility
       */
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-sm",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-sm",
        outline: "bg-transparent text-foreground",
      },

      /**
       * Semantic tones for product statuses (preferred)
       * Uses your semantic tokens: info/success/danger/neutral and their soft/border/foreground variants.
       */
      tone: {
        neutral: "bg-neutral-soft text-neutral-foreground border-neutral-soft-border",
        info: "bg-info-soft text-info-foreground border-info-soft-border",
        success: "bg-success-soft text-success-foreground border-success-soft-border",
        danger: "bg-danger-soft text-danger-foreground border-danger-soft-border",

        /**
         * System destructive tone (keeps shadcn destructive palette)
         * Useful for "canceled"/critical states if you want it distinct from "danger (loss)"
         */
        destructive: "bg-destructive/10 text-destructive border-destructive/20",
      },

      size: {
        sm: "text-[11px] px-2.5 py-0.5",
        md: "text-xs px-3 py-1",
      },

      pill: {
        true: "rounded-full uppercase tracking-wide",
        false: "rounded-[var(--radius)]",
      },
    },

    compoundVariants: [
      // If tone is used, we usually want outline-like behavior but with soft bg; ensure no shadow by default
      { tone: "neutral", className: "shadow-none" },
      { tone: "info", className: "shadow-none" },
      { tone: "success", className: "shadow-none" },
      { tone: "danger", className: "shadow-none" },
      { tone: "destructive", className: "shadow-none" },

      // Default shadcn variants: make them look nice if pill is true
      { variant: "default", pill: true, className: "shadow-none" },
      { variant: "secondary", pill: true, className: "shadow-none" },
      { variant: "destructive", pill: true, className: "shadow-none" },
      { variant: "outline", pill: true, className: "shadow-none" },
    ],

    defaultVariants: {
      variant: "default",
      size: "md",
      pill: false,
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * If `tone` is provided, it becomes the primary styling mechanism.
   * `variant` remains for backwards compatibility.
   */
}

function Badge({ className, variant, tone, size, pill, ...props }: BadgeProps) {
  // If tone is set, prefer tone styling; keep variant as fallback.
  // We still pass `variant` to keep base shape/behavior stable, but tone defines colors.
  return (
    <div
      className={cn(
        badgeVariants({
          variant: tone ? "outline" : variant,
          tone,
          size,
          pill,
        }),
        className
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

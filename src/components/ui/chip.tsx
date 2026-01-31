import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Linear-style Chip component
 * Compact pill-shaped buttons with icons, subtle borders, and semi-transparent backgrounds
 */

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Icon to display on the left side of the chip
   */
  icon?: React.ReactNode;
  /**
   * Whether the chip is in an active/selected state
   */
  active?: boolean;
  /**
   * Size variant
   */
  size?: "sm" | "md";
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, icon, active, size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          // Base styles
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full",
          "border border-border/30 bg-muted/10 text-foreground",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
          "disabled:pointer-events-none disabled:opacity-50",
          // Hover state
          "hover:bg-muted/20 hover:border-border/40 hover:cursor-pointer",
          // Active state
          active && "bg-primary/10 border-primary/30 text-primary hover:bg-primary/15",
          // Size variants
          size === "sm" && "h-8 px-3 text-xs",
          size === "md" && "h-9 px-3.5 text-sm",
          className
        )}
        {...props}
      >
        {icon && (
          <span className="inline-flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">
            {icon}
          </span>
        )}
        <span className="font-medium">{children}</span>
      </button>
    );
  }
);

Chip.displayName = "Chip";

export { Chip };

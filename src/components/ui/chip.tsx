import * as React from "react";
import { cn } from "@/lib/utils";
import { TOOLBAR_CONTROL_ACTIVE } from "@/components/ui/controlStyles";

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
          "transition-all duration-base",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-1",
          "disabled:pointer-events-none disabled:opacity-50",
          // Hover state
          "hover:bg-muted/20 hover:border-border/40 hover:cursor-pointer",
          // Активний стан — той самий нейтральний рецепт, що в тулбарних
          // фільтрах: увімкнене просто темнішає, а не синіє.
          active && TOOLBAR_CONTROL_ACTIVE,
          // Size variants
          size === "sm" && "h-(--control-h-sm) px-3 text-xs",
          size === "md" && "h-(--control-h) px-3.5 text-sm",
          className
        )}
        {...props}
      >
        {icon && (
          <span className="inline-flex items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">
            {icon}
          </span>
        )}
        {/*
          min-w-0: БЕЗ ЦЬОГО ТЕКСТ ВИЛІЗАЄ ЗА МЕЖІ ЧИПА. Цей span — flex-елемент
          кнопки вище, а типове min-width:auto у flex-елемента не дає йому
          стиснутись менше за вміст, навіть якщо сам вміст (наприклад, рядок
          нижче з min-w-0 + truncate) готовий стиснутись. Без цього рядка
          max-w на кнопці лише обрізає РАМКУ, а текст малюється поверх неї —
          саме так «Вишивка · ліва частина грудей» вилазила за чип.
        */}
        <span className="min-w-0 font-medium">{children}</span>
      </button>
    );
  }
);

Chip.displayName = "Chip";

export { Chip };

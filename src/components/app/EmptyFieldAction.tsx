import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";

type EmptyFieldActionProps = {
  /** Що додаємо, без плюса: «Додати реквізити». */
  label: string;
  /** Підказка при наведенні — що саме бракує. */
  title?: string;
  onClick: () => void;
  className?: string;
};

/**
 * Порожнє поле як тиха дія «+ Додати …» замість жовтого попередження.
 * Відсутні дані — це наступний крок, а не тривога: рядок не має кричати,
 * якщо там просто ще нічого не заповнили.
 */
export function EmptyFieldAction({ label, title, onClick, className }: EmptyFieldActionProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <span aria-hidden>+</span>
      {label}
    </button>
  );
}

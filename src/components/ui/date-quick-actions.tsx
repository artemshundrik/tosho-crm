import { addDays, endOfMonth, endOfWeek, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DateQuickActionsProps = {
  onSelect: (date: Date | null) => void | Promise<void>;
  className?: string;
  clearLabel?: string;
  fullWidth?: boolean;
};

export function DateQuickActions({
  onSelect,
  className,
  clearLabel = "Очистити",
  fullWidth = false,
}: DateQuickActionsProps) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const plusThree = addDays(today, 3);
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const monthEnd = endOfMonth(today);

  const actionButtonClass = cn(
    "h-7 rounded-full border border-border/60 px-2 text-xs font-medium",
    fullWidth ? "w-full justify-center" : ""
  );

  return (
    <div className={cn("flex border-t border-border/60 px-2 pb-3 pt-2", fullWidth ? "justify-stretch" : "justify-center", className)}>
      <div className={cn(fullWidth ? "grid w-full grid-cols-3 gap-1.5" : "inline-grid grid-cols-[auto_auto_auto] gap-1.5")}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={actionButtonClass}
          onClick={() => void onSelect(today)}
        >
          Сьогодні
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={actionButtonClass}
          onClick={() => void onSelect(tomorrow)}
        >
          Завтра
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={actionButtonClass}
          onClick={() => void onSelect(plusThree)}
        >
          +3 дні
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={actionButtonClass}
          onClick={() => void onSelect(weekEnd)}
        >
          Тиждень
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={actionButtonClass}
          onClick={() => void onSelect(monthEnd)}
        >
          Місяць
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-7 rounded-full border border-transparent px-2 text-xs font-medium text-muted-foreground hover:text-foreground min-w-0",
            fullWidth ? "w-full justify-center" : ""
          )}
          onClick={() => void onSelect(null)}
        >
          {clearLabel}
        </Button>
      </div>
    </div>
  );
}

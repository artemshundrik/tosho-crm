import { addDays, endOfMonth, endOfWeek, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DateQuickActionsProps = {
  onSelect: (date: Date | null) => void | Promise<void>;
  className?: string;
  clearLabel?: string;
};

export function DateQuickActions({
  onSelect,
  className,
  clearLabel = "Очистити",
}: DateQuickActionsProps) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const plusThree = addDays(today, 3);
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const monthEnd = endOfMonth(today);

  return (
    <div className={cn("flex justify-center border-t border-border/60 px-2 pb-3 pt-2", className)}>
      <div className="inline-grid grid-cols-[auto_auto_auto] gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-full border border-border/60 px-2 text-xs font-medium"
          onClick={() => void onSelect(today)}
        >
          Сьогодні
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-full border border-border/60 px-2 text-xs font-medium"
          onClick={() => void onSelect(tomorrow)}
        >
          Завтра
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-full border border-border/60 px-2 text-xs font-medium"
          onClick={() => void onSelect(plusThree)}
        >
          +3 дні
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-full border border-border/60 px-2 text-xs font-medium"
          onClick={() => void onSelect(weekEnd)}
        >
          Тиждень
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-full border border-border/60 px-2 text-xs font-medium"
          onClick={() => void onSelect(monthEnd)}
        >
          Місяць
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 rounded-full border border-transparent px-2 text-xs font-medium text-muted-foreground hover:text-foreground min-w-0"
          onClick={() => void onSelect(null)}
        >
          {clearLabel}
        </Button>
      </div>
    </div>
  );
}

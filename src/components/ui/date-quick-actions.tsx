import { addDays, endOfMonth, endOfWeek, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DateQuickActionsProps = {
  onSelect: (date: Date | null) => void | Promise<void>;
  className?: string;
  clearLabel?: string;
  /** @deprecated Сітка тепер завжди на всю ширину — проп лишено, щоб не правити виклики. */
  fullWidth?: boolean;
  /**
   * Без власної рамки, підпису й полів — коли блок кладуть у контейнер, який їх
   * уже дає (панель пікера). Інакше виходить дві лінії поспіль.
   */
  flush?: boolean;
};

/**
 * Швидкі дії під календарем.
 *
 * СІТКА, А НЕ ПІГУЛКИ (рішення 2026-08-06): раніше кнопки лежали інлайном і
 * переносились — «Тиждень / Місяць / Очистити» щоразу давали ряд іншої довжини,
 * а на вузькій панелі рвались посеред слова. Фіксовані три колонки означають, що
 * блок займає ту саму висоту при будь-якому наборі слів і не залежить від ширини
 * панелі: колонки стискаються, перенесення не буває.
 */
export function DateQuickActions({
  onSelect,
  className,
  clearLabel = "Очистити",
  flush = false,
}: DateQuickActionsProps) {
  const today = startOfDay(new Date());
  const actions: Array<{ label: string; value: Date | null; muted?: boolean }> = [
    { label: "Сьогодні", value: today },
    { label: "Завтра", value: addDays(today, 1) },
    { label: "+3 дні", value: addDays(today, 3) },
    { label: "Тиждень", value: endOfWeek(today, { weekStartsOn: 1 }) },
    { label: "Місяць", value: endOfMonth(today) },
    { label: clearLabel, value: null, muted: true },
  ];

  const grid = (
    <div className="grid grid-cols-3 gap-1.5">
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-[30px] w-full justify-center rounded-lg border px-1.5 text-xs font-medium",
            action.muted
              ? "border-transparent text-muted-foreground hover:text-foreground"
              : "border-border/60 hover:border-foreground/30 hover:text-foreground"
          )}
          onClick={() => void onSelect(action.value)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );

  if (flush) return <div className={className}>{grid}</div>;

  return (
    <div className={cn("border-t border-border/60 p-3", className)}>{grid}</div>
  );
}

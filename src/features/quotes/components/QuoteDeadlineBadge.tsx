import { CalendarDays, CalendarClock, Timer, XCircle } from "@/components/icons/appIcons";
import { cn } from "@/lib/utils";

export type QuoteDeadlineTone = "none" | "future" | "soon" | "today" | "overdue";

// Дата — тихий текст, без заливки й рамки: на дошці дедлайн є на кожній
// картці, і залитий чип робив червоний звичним. Колір лишається сигналом:
// сірий — запас є, бурштиновий — скоро, червоний — прострочено.
const deadlineToneClass: Record<QuoteDeadlineTone, string> = {
  none: "text-muted-foreground",
  future: "text-muted-foreground",
  soon: "tone-text-warning",
  today: "tone-text-warning",
  overdue: "tone-text-danger",
};

type QuoteDeadlineBadgeProps = {
  tone: QuoteDeadlineTone;
  label: string;
  title?: string;
  className?: string;
  compact?: boolean;
};

export function QuoteDeadlineBadge({
  tone,
  label,
  title,
  className,
  compact = false,
}: QuoteDeadlineBadgeProps) {
  const Icon = {
    overdue: XCircle,
    today: CalendarClock,
    soon: Timer,
    future: CalendarDays,
    none: CalendarDays,
  }[tone];

  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap text-xs tabular-nums",
        tone === "none" || tone === "future" ? "font-normal" : "font-medium",
        deadlineToneClass[tone],
        className
      )}
    >
      <Icon className={compact ? "mr-1.5 h-3.5 w-3.5" : "mr-1 h-3 w-3"} />
      {label}
    </span>
  );
}

import { CalendarDays, CalendarClock, Timer, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type QuoteDeadlineTone = "none" | "future" | "soon" | "today" | "overdue";

const deadlineToneClass: Record<QuoteDeadlineTone, string> = {
  none: "quote-neutral-badge",
  future: "quote-neutral-badge",
  soon: "quote-warning-badge",
  today: "quote-warning-badge",
  overdue: "quote-danger-badge",
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
    <Badge
      variant="outline"
      title={title}
      className={cn(
        "font-medium",
        compact ? "h-auto px-2 py-1 text-xs" : "text-xs",
        deadlineToneClass[tone],
        className
      )}
    >
      <Icon className={compact ? "h-3.5 w-3.5 mr-1.5" : "h-3 w-3 mr-1"} />
      {label}
    </Badge>
  );
}

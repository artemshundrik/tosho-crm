import * as React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type EmptyStateTone = "neutral" | "info" | "success" | "danger";

export type EmptyStateCardProps = {
  className?: string;

  badgeLabel: string;
  tone?: EmptyStateTone;

  title: string;
  description?: string;

  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;

  /** якщо треба більш компактно (наприклад у таблицях) */
  compact?: boolean;
};

export function EmptyStateCard({
  className,
  badgeLabel,
  tone = "neutral",
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  compact = false,
}: EmptyStateCardProps) {
  const padding = compact ? "px-4 py-6 sm:px-6" : "px-4 py-8 sm:px-6";

  return (
    <div
      className={cn(
        "rounded-inner border border-dashed border-border bg-card/40",
        // Компактна коробка по центру, а не смуга на всю ширину сторінки.
        // Всередині все й так вирівняно по центру, тож на широкому екрані
        // виходив довжелезний блок із крихітним текстом посередині — рамка
        // ліворуч, рамка за метр праворуч, а між ними порожнеча.
        // Хто справді хоче на всю ширину — перебиває через className.
        "mx-auto w-full max-w-md",
        padding,
        "text-center",
        "shadow-surface",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <Badge tone={tone} pill size="sm">
          {badgeLabel}
        </Badge>

        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description ? (
            <div className="text-sm text-muted-foreground max-w-[460px]">
              {description}
            </div>
          ) : null}
        </div>

        {actionLabel && actionTo ? (
          <Button asChild>
            <Link to={actionTo}>{actionLabel}</Link>
          </Button>
        ) : actionLabel && onAction ? (
          <Button onClick={onAction}>{actionLabel}</Button>
        ) : null}
      </div>
    </div>
  );
}

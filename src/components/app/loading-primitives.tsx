import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type InlineLoadingProps = {
  label?: string;
  className?: string;
  spinnerClassName?: string;
  textClassName?: string;
};

export function InlineLoading({
  label = "Завантаження...",
  className,
  spinnerClassName,
  textClassName,
}: InlineLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("inline-flex min-h-8 items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <Loader2 className={cn("h-4 w-4 animate-spin text-muted-foreground", spinnerClassName)} />
      <span className={cn("truncate", textClassName)}>{label}</span>
    </div>
  );
}

type SurfaceSkeletonProps = {
  label?: string;
  className?: string;
  rows?: number;
  compact?: boolean;
};

export function SurfaceSkeleton({
  label = "Завантаження...",
  className,
  rows = 4,
  compact = false,
}: SurfaceSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "rounded-[24px] border border-border/60 bg-card/82 p-4 shadow-[var(--shadow-elevated-sm)]",
        compact ? "space-y-3" : "space-y-4",
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" />
          <span className="relative rounded-full bg-primary/70 h-2.5 w-2.5" />
        </span>
        <span>{label}</span>
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center gap-3 rounded-[18px] border border-border/40 bg-background/60 px-3 py-3",
              compact && "rounded-[16px] py-2.5"
            )}
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn("h-3.5 rounded-full", index % 3 === 0 ? "w-[42%]" : "w-[58%]")} />
              <Skeleton className={cn("h-3 rounded-full opacity-80", index % 2 === 0 ? "w-[72%]" : "w-[64%]")} />
            </div>
            <Skeleton className="h-7 w-16 shrink-0 rounded-full opacity-90" />
          </div>
        ))}
      </div>
    </div>
  );
}

type MenuSkeletonProps = {
  className?: string;
  rows?: number;
  label?: string;
};

export function MenuSkeleton({
  className,
  rows = 4,
  label = "Шукаємо результати...",
}: MenuSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("space-y-2 p-1.5", className)}
    >
      <div className="px-2 pb-1">
        <InlineLoading label={label} className="min-h-6 text-xs" spinnerClassName="h-3.5 w-3.5" textClassName="text-xs" />
      </div>

      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex min-h-12 items-center gap-3 rounded-[14px] px-2 py-2">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn("h-3.5 rounded-full", index % 2 === 0 ? "w-[52%]" : "w-[64%]")} />
            <Skeleton className={cn("h-3 rounded-full opacity-80", index % 2 === 0 ? "w-[74%]" : "w-[58%]")} />
          </div>
          <Skeleton className="h-4 w-12 shrink-0 rounded-full opacity-90" />
        </div>
      ))}
    </div>
  );
}

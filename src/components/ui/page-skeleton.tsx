import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

type PageSkeletonProps = {
  /** кількість карток у гріді */
  cards?: number;
  /** кількість рядків у списку */
  rows?: number;
};

export function PageSkeleton({ cards = 6, rows = 3 }: PageSkeletonProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={`kpi-${idx}`} className="h-24 rounded-[var(--radius-inner)]" />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, idx) => (
          <Skeleton key={`card-${idx}`} className="h-[240px] rounded-[var(--radius-section)]" />
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <Skeleton key={`row-${idx}`} className="h-14 rounded-[var(--radius-inner)]" />
        ))}
      </div>
    </div>
  );
}

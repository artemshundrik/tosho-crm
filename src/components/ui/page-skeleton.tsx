import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SKELETON_SIZES, SKELETON_RADIUS } from "@/lib/skeletonConstants";

type PageSkeletonProps = {
  /** кількість карток у гріді */
  cards?: number;
  /** кількість рядків у списку */
  rows?: number;
  /** Варіант висоти карток: "default" (240px) або "large" (220px) */
  cardVariant?: "default" | "large";
};

export function PageSkeleton({ cards = 6, rows = 3, cardVariant = "default" }: PageSkeletonProps) {
  const cardHeight = cardVariant === "large" ? SKELETON_SIZES.CARD_LARGE_HEIGHT : SKELETON_SIZES.CARD_HEIGHT;
  
  return (
    <div className="space-y-6" role="status" aria-label="Завантаження сторінки..." aria-live="polite" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className={`${SKELETON_SIZES.HEADER_HEIGHT} w-48`} aria-label="" />
        <Skeleton className={`${SKELETON_SIZES.SUBHEADER_HEIGHT} w-72`} aria-label="" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton 
            key={`kpi-${idx}`} 
            className={`${SKELETON_SIZES.KPI_HEIGHT} ${SKELETON_RADIUS.INNER}`} 
            aria-label="" 
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, idx) => (
          <Skeleton 
            key={`card-${idx}`} 
            className={`${cardHeight} ${SKELETON_RADIUS.SECTION}`} 
            aria-label="" 
          />
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <Skeleton 
            key={`row-${idx}`} 
            className={`${SKELETON_SIZES.ROW_HEIGHT} ${SKELETON_RADIUS.INNER}`} 
            aria-label="" 
          />
        ))}
      </div>
    </div>
  );
}

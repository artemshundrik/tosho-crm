import { Skeleton } from "@/components/ui/skeleton";
import { SKELETON_SIZES, SKELETON_RADIUS } from "@/lib/skeletonConstants";

export function DashboardSkeleton() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-label="Завантаження сторінки..."
      aria-live="polite"
      aria-busy="true"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" aria-label="" />
        <Skeleton className={`${SKELETON_SIZES.SUBHEADER_HEIGHT} w-72`} aria-label="" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={`dash-kpi-${idx}`} className="h-24 rounded-[var(--radius-inner)]" aria-label="" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-[280px] rounded-[var(--radius-section)]" aria-label="" />
        <div className="space-y-4">
          <Skeleton className="h-[132px] rounded-[var(--radius-inner)]" aria-label="" />
          <Skeleton className="h-[132px] rounded-[var(--radius-inner)]" aria-label="" />
        </div>
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton
            key={`dash-row-${idx}`}
            className={`${SKELETON_SIZES.ROW_HEIGHT} ${SKELETON_RADIUS.INNER}`}
            aria-label=""
          />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-label="Завантаження сторінки..."
      aria-live="polite"
      aria-busy="true"
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" aria-label="" />
        <Skeleton className={`${SKELETON_SIZES.SUBHEADER_HEIGHT} w-64`} aria-label="" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-28 rounded-[var(--radius-md)]" aria-label="" />
        <Skeleton className="h-9 w-24 rounded-[var(--radius-md)]" aria-label="" />
        <Skeleton className="h-9 w-32 rounded-[var(--radius-md)]" aria-label="" />
        <Skeleton className="h-9 w-56 rounded-[var(--radius-md)]" aria-label="" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 7 }).map((_, idx) => (
          <Skeleton key={`list-row-${idx}`} className="h-16 rounded-[var(--radius-inner)]" aria-label="" />
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-label="Завантаження сторінки..."
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" aria-label="" />
          <Skeleton className={`${SKELETON_SIZES.SUBHEADER_HEIGHT} w-64`} aria-label="" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-[var(--radius-md)]" aria-label="" />
          <Skeleton className="h-9 w-20 rounded-[var(--radius-md)]" aria-label="" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-[var(--radius-md)]" aria-label="" />
        <Skeleton className="h-9 w-28 rounded-[var(--radius-md)]" aria-label="" />
        <Skeleton className="h-9 w-24 rounded-[var(--radius-md)]" aria-label="" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Skeleton className="h-[220px] rounded-[var(--radius-section)]" aria-label="" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-[150px] rounded-[var(--radius-inner)]" aria-label="" />
            <Skeleton className="h-[150px] rounded-[var(--radius-inner)]" aria-label="" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton
                key={`detail-row-${idx}`}
                className={`${SKELETON_SIZES.ROW_HEIGHT} ${SKELETON_RADIUS.INNER}`}
                aria-label=""
              />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-[160px] rounded-[var(--radius-inner)]" aria-label="" />
          <Skeleton className="h-[160px] rounded-[var(--radius-inner)]" aria-label="" />
          <Skeleton className="h-[160px] rounded-[var(--radius-inner)]" aria-label="" />
        </div>
      </div>
    </div>
  );
}

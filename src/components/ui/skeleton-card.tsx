import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type SkeletonCardProps = {
  className?: string;
  /** висота "карточки" (пікселі або tailwind клас) */
  heightClassName?: string;
  /** макет: "nextUp" під твій OperationalSummary або "list" під таблиці */
  variant?: "nextUp" | "list";
  /** Accessibility label для screen readers */
  "aria-label"?: string;
};

function Skel({ className }: { className: string }) {
  return (
    <Skeleton
      className={cn("rounded-[var(--radius-section)]", className)}
      aria-label=""
    />
  );
}

export function SkeletonCard({
  className,
  heightClassName,
  variant = "list",
  "aria-label": ariaLabel,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-inner)] border border-border bg-card/40",
        variant === "nextUp"
          ? "px-6 py-6 sm:px-8 sm:py-7"
          : "px-4 py-4 sm:px-6 sm:py-5",
        heightClassName,
        className
      )}
      role="status"
      aria-label={ariaLabel ?? (variant === "nextUp" ? "Завантаження матчу..." : "Завантаження...")}
      aria-live="polite"
      aria-busy="true"
    >

      {variant === "nextUp" ? (
  <div className="flex flex-col items-center">
    {/* CONTEXT (league / round) */}
    <div className="flex items-center gap-3">
      <Skel className="h-6 w-6 rounded-full" />
      <Skel className="h-5 w-40" />
      <Skel className="h-5 w-20" />
    </div>

    {/* MAIN HERO ROW */}
    <div className="mt-6 grid w-full max-w-[820px] grid-cols-[1fr_auto_1fr] items-center gap-6 sm:gap-10">
      {/* LEFT TEAM */}
      <div className="flex items-center justify-end gap-3 min-w-0">
        <Skel className="h-6 w-40" />
        <Skel className="h-16 w-16 rounded-full" />
      </div>

      {/* TIME */}
      <div className="flex flex-col items-center">
        <Skel className="h-12 w-28 rounded-[var(--radius-lg)]" />
        <Skel className="mt-2 h-4 w-36" />

      </div>

      {/* RIGHT TEAM */}
      <div className="flex items-center justify-start gap-3 min-w-0">
        <Skel className="h-16 w-16 rounded-full" />
        <Skel className="h-6 w-44" />
      </div>
    </div>

    {/* CTA */}
    <div className="mt-5">
      <Skel className="h-5 w-48" />
    </div>
  </div>
) : (

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <Skel className="h-4 w-48" />
            <Skel className="h-4 w-64" />
          </div>
          <Skel className="h-8 w-24 rounded-full" />
        </div>
      )}
    </div>
  );
}

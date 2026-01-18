// src/components/ui/skeleton.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Accessibility label для screen readers */
  "aria-label"?: string;
};

function Skeleton({ className, "aria-label": ariaLabel, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-md)]",
        "bg-[hsl(var(--skeleton-bg))]",
        className
      )}
      role="status"
      aria-label={ariaLabel ?? "Завантаження..."}
      aria-live="polite"
      aria-busy="true"
      {...props}
    />
  );
}

export { Skeleton };

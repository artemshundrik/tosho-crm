// src/components/ui/skeleton.tsx
import type * as React from "react";
import { cn } from "@/lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Accessibility label для screen readers */
  "aria-label"?: string;
};

function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-[hsl(var(--skeleton-bg))]", className)} {...props} />;
}

export { Skeleton };

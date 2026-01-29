// src/components/ui/skeleton.tsx
import type * as React from "react";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Accessibility label для screen readers */
  "aria-label"?: string;
};

function Skeleton(_props: SkeletonProps) {
  return null;
}

export { Skeleton };

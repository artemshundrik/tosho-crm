// src/components/ui/skeleton.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-md)] border border-border/50 bg-card/70",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };

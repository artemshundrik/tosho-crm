import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type UnifiedPageToolbarProps = {
  topLeft?: ReactNode;
  topRight?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  meta?: ReactNode;
  className?: string;
  topRowClassName?: string;
  topLeftClassName?: string;
  topRightClassName?: string;
  bottomRowClassName?: string;
  searchClassName?: string;
  filtersClassName?: string;
  metaClassName?: string;
};

export function UnifiedPageToolbar({
  topLeft,
  topRight,
  search,
  filters,
  meta,
  className,
  topRowClassName,
  topLeftClassName,
  topRightClassName,
  bottomRowClassName,
  searchClassName,
  filtersClassName,
  metaClassName,
}: UnifiedPageToolbarProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {(topLeft || topRight) ? (
        <div
          className={cn(
            "flex flex-col gap-3 lg:flex-row lg:items-center",
            topLeft && topRight ? "lg:justify-between" : topRight ? "lg:justify-end" : undefined,
            topRowClassName
          )}
        >
          {topLeft ? <div className={cn("min-w-0", topLeftClassName)}>{topLeft}</div> : null}
          {topRight ? (
            <div
              className={cn(
                "flex w-full flex-col gap-2 self-stretch sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:self-auto",
                topRightClassName
              )}
            >
              {topRight}
            </div>
          ) : null}
        </div>
      ) : null}

      {(search || filters || meta) ? (
        <div className={cn("flex flex-col gap-3 xl:flex-row xl:items-center", bottomRowClassName)}>
          {search ? (
            <div className={cn("w-full xl:max-w-[370px] xl:flex-none", searchClassName)}>
              {search}
            </div>
          ) : null}
          {filters ? (
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
                filtersClassName
              )}
            >
              {filters}
            </div>
          ) : null}
          {meta ? (
            <div className={cn("flex items-center gap-2 xl:ml-auto xl:flex-none", metaClassName)}>{meta}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

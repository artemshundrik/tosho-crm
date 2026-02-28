import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type KanbanBoardProps = PropsWithChildren<{
  className?: string;
  rowClassName?: string;
}>;

export function KanbanBoard({ className, rowClassName, children }: KanbanBoardProps) {
  return (
    <div className={cn("overflow-x-auto px-4 pb-4 pt-3 md:px-5 md:pb-5", className)}>
      <div className={cn("w-max flex gap-4 pb-0", rowClassName)}>{children}</div>
    </div>
  );
}


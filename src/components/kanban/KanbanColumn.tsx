import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";

type KanbanColumnProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
  header: ReactNode;
  className?: string;
  bodyClassName?: string;
}
>;

export function KanbanColumn({
  header,
  className,
  bodyClassName,
  children,
  ...props
}: KanbanColumnProps) {
  return (
    <div className={cn("shrink-0 flex flex-col", className)} {...props}>
      {header}
      <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain", bodyClassName)}>{children}</div>
    </div>
  );
}

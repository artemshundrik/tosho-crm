import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type KanbanCardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function KanbanCard({
  className,
  children,
  ...props
}: KanbanCardProps) {
  return (
    <div
      data-kanban-card="true"
      className={cn("rounded-[var(--radius-md)] border border-border/60 bg-card/90 cursor-pointer", className)}
      {...props}
    >
      {children}
    </div>
  );
}

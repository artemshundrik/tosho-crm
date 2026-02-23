import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type EstimatesKanbanCanvasProps = PropsWithChildren<{
  className?: string;
}>;

export function EstimatesKanbanCanvas({ className, children }: EstimatesKanbanCanvasProps) {
  return <section className={cn("page-canvas-body estimates-kanban-canvas", className)}>{children}</section>;
}

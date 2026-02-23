import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type EstimatesTableCanvasProps = PropsWithChildren<{
  className?: string;
}>;

export function EstimatesTableCanvas({ className, children }: EstimatesTableCanvasProps) {
  return <section className={cn("page-canvas-body estimates-table-canvas", className)}>{children}</section>;
}

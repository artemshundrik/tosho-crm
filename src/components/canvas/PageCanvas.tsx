import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type PageCanvasProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function PageCanvas({ className, children, ...props }: PageCanvasProps) {
  return (
    <div className={cn("page-canvas-root quote-page-canvas", className)} {...props}>
      {children}
    </div>
  );
}

type PageCanvasHeaderProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    sticky?: boolean;
  }
>;

export function PageCanvasHeader({ className, children, sticky = false, ...props }: PageCanvasHeaderProps) {
  return (
    <div className={cn(sticky ? "page-canvas-header" : "page-canvas-body", className)} {...props}>
      {children}
    </div>
  );
}

type PageCanvasBodyProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function PageCanvasBody({ className, children, ...props }: PageCanvasBodyProps) {
  return (
    <div className={cn("page-canvas-body", className)} {...props}>
      {children}
    </div>
  );
}

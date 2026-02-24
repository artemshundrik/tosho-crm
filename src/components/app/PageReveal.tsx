import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageRevealProps = {
  children: ReactNode;
  activeKey: string;
  className?: string;
};

export function PageReveal({ children, activeKey: _activeKey, className }: PageRevealProps) {
  return (
    <div className={cn("page-reveal", className)}>
      {children}
    </div>
  );
}

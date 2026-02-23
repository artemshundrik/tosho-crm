import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SidebarIconTooltipProps = {
  label: string;
  collapsed: boolean;
  children: ReactNode;
};

export function SidebarIconTooltip({ label, collapsed, children }: SidebarIconTooltipProps) {
  if (!collapsed) return <>{children}</>;

  return (
    <div className="group/sidebar-tip relative flex items-center">
      {children}
      <span
        className={cn(
          "pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap",
          "rounded-[10px] border border-border/70 bg-card/95 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-[var(--shadow-floating)] backdrop-blur-md",
          "opacity-0 translate-x-1 transition-all duration-200 ease-out",
          "group-hover/sidebar-tip:opacity-100 group-hover/sidebar-tip:translate-x-0"
        )}
        role="tooltip"
      >
        {label}
      </span>
    </div>
  );
}

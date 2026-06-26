import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type SidebarIconTooltipProps = {
  label: string;
  collapsed: boolean;
  children: ReactNode;
};

type TipCoords = { top: number; left: number };

export function SidebarIconTooltip({ label, collapsed, children }: SidebarIconTooltipProps) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<TipCoords | null>(null);

  const open = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.top + rect.height / 2, left: rect.right + 10 });
  }, []);

  const close = useCallback(() => setCoords(null), []);

  if (!collapsed) {
    return <div className="relative min-w-0">{children}</div>;
  }

  return (
    <div
      ref={triggerRef}
      className="relative flex cursor-pointer items-center justify-center"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocusCapture={open}
      onBlurCapture={close}
    >
      {children}
      {coords
        ? createPortal(
            <span
              role="tooltip"
              style={{ top: coords.top, left: coords.left }}
              className={cn(
                "pointer-events-none fixed z-[100] -translate-y-1/2 whitespace-nowrap",
                "rounded-[10px] border border-border/70 bg-card/95 px-2.5 py-1 text-[12px] font-medium text-foreground",
                "shadow-[var(--shadow-overlay)] backdrop-blur-md",
                "animate-in fade-in-0 slide-in-from-left-1 duration-150 ease-out"
              )}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </div>
  );
}

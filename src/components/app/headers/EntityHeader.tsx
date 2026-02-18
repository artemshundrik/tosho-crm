import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EntityHeaderProps = {
  topBar?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  viewers?: ReactNode;
  actions?: ReactNode;
  hint?: ReactNode;
  className?: string;
};

export function EntityHeader({
  topBar,
  title,
  subtitle,
  meta,
  viewers,
  actions,
  hint,
  className,
}: EntityHeaderProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/60 bg-gradient-to-r from-card/95 via-card/85 to-primary/5 p-4 md:p-5",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          {topBar ? <div className="flex flex-wrap items-center gap-2">{topBar}</div> : null}
          <div className="space-y-1">
            <div className="text-2xl font-semibold tracking-tight">{title}</div>
            {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          {viewers}
          {meta ? <div className="flex flex-wrap items-center gap-2 text-sm">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
      </div>
      {hint ? <div className="mt-3 text-xs text-muted-foreground">{hint}</div> : null}
    </section>
  );
}

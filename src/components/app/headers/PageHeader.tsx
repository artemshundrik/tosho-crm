import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  contentClassName,
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/60 bg-gradient-to-r from-card/95 via-card/85 to-primary/5",
        "p-4 md:p-5",
        className
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex items-center gap-3">
          {icon ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary shadow-sm">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 min-h-11 flex flex-col justify-center gap-0.5">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm leading-5 text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className={cn("mt-4", contentClassName)}>{children}</div> : null}
    </section>
  );
}

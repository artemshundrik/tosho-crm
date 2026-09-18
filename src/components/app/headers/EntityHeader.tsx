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
        "@container rounded-xl border border-border/60 bg-gradient-to-r from-card/95 via-card/85 to-primary/5 p-4 md:p-5",
        className
      )}
    >
      {/*
        Назва й дії в один ряд — коли вміщає САМА ШАПКА, а не вікно (REQ-294).
        Шапка стоїть у лівій колонці сторінки-запису, і з рейкою поруч вона буває
        вузькою при широкому вікні: з `lg:` дії стискались нижче свого вмісту й
        плашка стану лягала просто на назву задачі. Тому дії не стискаються
        (`shrink-0` — поступається назва, вона обрізається), а вужче 45rem
        стають під назву.
      */}
      <div className="flex flex-col gap-4 @min-[45rem]:flex-row @min-[45rem]:items-start @min-[45rem]:justify-between">
        <div className="min-w-0 space-y-3">
          {topBar ? <div className="flex flex-wrap items-center gap-2">{topBar}</div> : null}
          <div className="space-y-1">
            <div className="text-2xl font-semibold tracking-tight">{title}</div>
            {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          {viewers}
          {meta ? <div className="flex flex-wrap items-center gap-2 text-sm">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2 @min-[45rem]:justify-end">{actions}</div> : null}
      </div>
      {hint ? <div className="mt-3 text-xs text-muted-foreground">{hint}</div> : null}
    </section>
  );
}

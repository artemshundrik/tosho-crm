import { useEffect, useRef, useState, type ReactNode } from "react";

import { AlertTriangle, CheckCircle2, Info } from "@/components/icons/appIcons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { RequirementCheck } from "@/features/orders/orderDocumentRequirements";
import { cn } from "@/lib/utils";

/** Значок «i» з поясненням на наведенні та список умов документа. Спільні для частин картки замовлення. */
export const InfoHint = ({
  title,
  children,
  widthClass = "w-[320px]",
}: {
  title: string;
  children: ReactNode;
  widthClass?: string;
}) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => cancelClose(), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          onPointerEnter={openNow}
          onPointerLeave={closeSoon}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={openNow}
        onPointerLeave={closeSoon}
        className={`${widthClass} max-w-[min(440px,calc(100vw-2rem))] p-3 text-xs leading-5`}
      >
        <div className="mb-1 font-semibold text-foreground">{title}</div>
        {children}
      </PopoverContent>
    </Popover>
  );
};


export const RequirementList = ({ checks }: { checks: RequirementCheck[] }) => (
  <div className="space-y-1.5">
    {checks.map((check) => (
      <div key={check.label} className="flex items-start gap-2">
        {check.done ? (
          <CheckCircle2 className="tone-text-success mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="tone-text-warning mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div>
          <div className={cn("font-medium", check.done ? "text-foreground" : "tone-text-warning")}>{check.label}</div>
          <div className="text-muted-foreground">{check.help}</div>
        </div>
      </div>
    ))}
  </div>
);

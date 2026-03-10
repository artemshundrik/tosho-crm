import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AppSectionLoaderProps = {
  label?: string;
  compact?: boolean;
  className?: string;
};

export function AppSectionLoader({
  label = "Завантаження...",
  compact = false,
  className,
}: AppSectionLoaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border border-border/50 bg-muted/5 text-muted-foreground",
        compact ? "gap-2 px-4 py-4 text-sm" : "flex-col gap-2 px-4 py-8 text-sm",
        className
      )}
    >
      <Loader2 className={cn("animate-spin", compact ? "h-4 w-4" : "h-5 w-5")} />
      <span>{label}</span>
    </div>
  );
}

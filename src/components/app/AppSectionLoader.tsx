import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SurfaceSkeleton } from "@/components/app/loading-primitives";

type AppSectionLoaderProps = {
  label?: string;
  compact?: boolean;
  className?: string;
  variant?: "surface" | "table";
};

export function AppSectionLoader({
  label = "Завантаження...",
  compact = false,
  className,
  variant = "surface",
}: AppSectionLoaderProps) {
  if (!compact) {
    return <SurfaceSkeleton label={label} className={className} rows={4} variant={variant} />;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl border border-border/50 bg-muted/5 text-muted-foreground",
        "gap-2 px-4 py-4 text-sm",
        className
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

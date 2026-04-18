import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type AppPageLoaderProps = {
  title?: string;
  subtitle?: string;
};

export function AppPageLoader({
  title = "Завантаження",
  subtitle = "Готуємо дані сторінки.",
}: AppPageLoaderProps) {
  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <div className="w-full max-w-[28rem] rounded-[32px] border border-border/60 bg-card/85 p-6 shadow-[0_18px_60px_-36px_rgba(15,23,42,0.25)] backdrop-blur">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>Loading</span>
        </div>

        <div className="mt-5">
          <div className="text-lg font-semibold tracking-tight text-foreground">{title}</div>
          <div className="mt-1.5 text-sm leading-6 text-muted-foreground">{subtitle}</div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3 rounded-[20px] border border-border/40 bg-muted/[0.04] px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-xl bg-muted/80" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-[42%] rounded-full bg-muted/80" />
              <Skeleton className="h-3 w-[68%] rounded-full bg-muted/60" />
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-[20px] border border-border/40 bg-muted/[0.04] px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-xl bg-muted/80" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-[56%] rounded-full bg-muted/80" />
              <Skeleton className="h-3 w-[52%] rounded-full bg-muted/60" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

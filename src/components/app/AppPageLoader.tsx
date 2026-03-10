import { Loader2 } from "lucide-react";

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
      <div className="w-full max-w-sm rounded-[28px] border border-border bg-card p-5 text-center shadow-surface">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <div className="mt-4 text-base font-semibold text-foreground">{title}</div>
        <div className="mt-2 text-sm text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

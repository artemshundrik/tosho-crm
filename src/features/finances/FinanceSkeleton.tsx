import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Заглушка завантаження для вкладок Фінансів.
 *
 * Раніше кожна вкладка малювала однаковий рядок «⟳ Завантаження…» — і при
 * перемиканні вкладок, і при перемиканні місяця. Через це вміст стрибав:
 * замість таблиці на секунду з'являвся вузький рядок тексту, потім розкривався
 * повний блок. Скелетон повторює форму того, що завантажується, тож висота
 * тримається і сторінка не смикається.
 *
 * Варіанти — за формою вмісту вкладки, а не за її назвою:
 *  · stats — ряд карток-показників і список під ними (Огляд, Звіти, Маржа, Звірка)
 *  · bento — широкий підсумковий блок і список (Календар, Рахунки компанії)
 *  · rows  — самий список карток, без блоку зверху (Податки)
 *
 * Таблиця сюди не входить свідомо: заглушка таблиці має повторювати її колонки,
 * а вгадати їх узагальнено не вийде. У «Виплатах команді» вона будується з того
 * самого опису колонок, що й сама таблиця (PayrollTableSkeleton).
 */
type FinanceSkeletonVariant = "stats" | "bento" | "rows";

const SHIMMER = "rounded-full";

function RowLines({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/50", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-4 px-4 py-3.5",
            index > 0 && "border-t border-border/30"
          )}
        >
          <Skeleton className={cn(SHIMMER, "h-8 w-8 shrink-0 rounded-full")} />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn(SHIMMER, "h-3.5", index % 3 === 0 ? "w-[38%]" : "w-[28%]")} />
            <Skeleton className={cn(SHIMMER, "h-3 opacity-70", index % 2 === 0 ? "w-[20%]" : "w-[26%]")} />
          </div>
          <Skeleton className={cn(SHIMMER, "h-3.5 w-16 shrink-0 opacity-80")} />
        </div>
      ))}
    </div>
  );
}

export function FinanceSkeleton({
  variant = "stats",
  rows = 5,
}: {
  variant?: FinanceSkeletonVariant;
  rows?: number;
}) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true" aria-label="Завантаження">
      {variant === "bento" ? (
        <div className="rounded-xl border border-border/50 p-5">
          <Skeleton className={cn(SHIMMER, "h-3 w-40 opacity-70")} />
          <Skeleton className={cn(SHIMMER, "mt-3 h-8 w-56")} />
          <Skeleton className={cn(SHIMMER, "mt-4 h-2 w-full opacity-60")} />
          <div className="mt-4 flex gap-6">
            <Skeleton className={cn(SHIMMER, "h-3 w-28 opacity-70")} />
            <Skeleton className={cn(SHIMMER, "h-3 w-24 opacity-70")} />
          </div>
        </div>
      ) : null}

      {variant === "stats" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border/50 p-4">
              <Skeleton className={cn(SHIMMER, "h-3 w-24 opacity-70")} />
              <Skeleton className={cn(SHIMMER, "mt-3 h-6 w-32")} />
            </div>
          ))}
        </div>
      ) : null}

      <RowLines rows={rows} />
    </div>
  );
}

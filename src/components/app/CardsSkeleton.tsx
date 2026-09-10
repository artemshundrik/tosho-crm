import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Рамка картки «Сервісів» і «Постачальників» — одна на картки й на їхній каркас.
 *
 * П'ять рядків фіксованої висоти: хто це і в якому стані (36), підпис (18), три
 * числа (46), відбита смуга з поясненням (65), підвал із розкладом (32). Висоти
 * жорсткі навмисно — інакше картки в ряду різної довжини й сітка «пливе».
 *
 * ЖИВЕ ТУТ, А НЕ В КАРТЦІ, бо читачів троє: `SupplierCard`, `IntegrationCard` і
 * каркас нижче. Доки константа була скопійована в кожну картку окремо, каркас
 * про неї не знав узагалі й малював вільний потік — картка-заглушка виходила
 * іншої висоти за справжню, і в момент готовності даних сітка підстрибувала.
 * Це та сама історія, що з кількістю колонок канбану: поки число списували
 * руками, воно розходилось.
 */
export const ENTITY_CARD_FRAME =
  "grid w-full gap-3 rounded-section border border-border/60 bg-card p-4 text-left";
export const ENTITY_CARD_ROWS = "grid-rows-[36px_18px_46px_65px_32px]";

/**
 * Сітка карток-заглушок під «Сервіси» й «Постачальники».
 *
 * НАВІЩО ОКРЕМИЙ ФАЙЛ, А НЕ ФОРМА ВСЕРЕДИНІ page-loading. Каркас тут показують
 * ДВІЧІ поспіль: спершу поки їде чанк сторінки (форма `cards` у page-loading),
 * потім поки їдуть числа пулу (сама сторінка). Доки це були дві різні розмітки,
 * перехід читався як стрибок — рівно те, на чому свого часу спіймали канбан.
 * Тому розмітка одна, а хто її показує — байдуже.
 *
 * Сітка теж не вигадана: `sm:grid-cols-2 xl:grid-cols-3` — те саме, що роблять
 * обидві сторінки.
 */
export function CardsSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={cn(ENTITY_CARD_FRAME, ENTITY_CARD_ROWS, "bg-card/70")}>
          {/* 1. Лого, назва, стан. */}
          <div className="flex min-w-0 items-center gap-2.5">
            <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
            <Skeleton className={cn("h-4 rounded-full", index % 3 === 0 ? "w-[44%]" : "w-[36%]")} />
            <Skeleton className="ml-auto h-5 w-20 shrink-0 rounded-full opacity-70" />
          </div>

          {/* 2. Підпис: асортимент або призначення сервісу. */}
          <Skeleton className={cn("h-3 self-center rounded-full opacity-70", index % 2 === 0 ? "w-[86%]" : "w-[72%]")} />

          {/* 3. Три числа: значення й підпис під ним. */}
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((__, cell) => (
              <div key={cell} className="space-y-1.5">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-2.5 w-full rounded-full opacity-60" />
              </div>
            ))}
          </div>

          {/* 4. Відбита смуга з поясненням. */}
          <div className="space-y-1.5 self-center rounded-inner border border-border/50 px-2.5 py-2">
            <Skeleton className="h-2.5 w-full rounded-full opacity-60" />
            <Skeleton className="h-2.5 w-[68%] rounded-full opacity-60" />
          </div>

          {/* 5. Підвал: розклад ліворуч, «Відкрити» праворуч. */}
          <div className="flex items-center justify-between gap-2 self-center">
            <Skeleton className="h-2.5 w-[52%] rounded-full opacity-60" />
            <Skeleton className="h-2.5 w-16 rounded-full opacity-70" />
          </div>
        </div>
      ))}
    </div>
  );
}

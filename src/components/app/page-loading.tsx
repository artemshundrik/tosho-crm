import * as React from "react";
import { useLocation } from "react-router-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { useDelayedFlag } from "@/hooks/useLoadingGate";
import { useRouteLoadingSignal } from "@/layout/routeProgress";
import { resolvePageSurface, type PageShape, type PageToolbarKind } from "@/layout/pageSurfaces";
import { cn } from "@/lib/utils";

/**
 * Каркаси завантаження — по одному на форму сторінки.
 *
 * ЧОМУ НЕ ОДНА ПЛИТКА НА ВСІХ. До REQ-19 усі сторінки показували AppPageLoader:
 * центровану картку на 400 px із двома фейковими рядками. Вона не схожа НІ НА
 * ЩО в CRM, тож у момент готовності даних екран перебудовувався повністю — і це
 * читалось як стрибок. Каркас має бути тієї ж форми, що й майбутня сторінка:
 * дошка — колонками, таблиця — рядками, картка — своїми блоками. Тоді поява
 * даних лише «проявляє» вже наявну композицію.
 *
 * ЧОМУ ФОРМУ БЕРЕМО З РЕЄСТРУ, А НЕ ЗІ СТОРІНКИ. Каркас потрібен саме тоді,
 * коли сторінки ще немає (чанк вантажиться), — спитати в неї нікого. Форма
 * записана поруч зі шляхом у pageSurfaces.ts.
 *
 * Кожен каркас піднімає сигнал смуги прогресу: каркас на екрані і є той факт,
 * що щось вантажиться.
 */

function shellClass(className?: string) {
  return cn("w-full", className);
}

function ListShape() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-3xl border border-border/50 bg-card/70 px-4 py-3.5"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn("h-3.5 rounded-full", index % 3 === 0 ? "w-[38%]" : "w-[52%]")} />
            <Skeleton className={cn("h-3 rounded-full opacity-75", index % 2 === 0 ? "w-[68%]" : "w-[58%]")} />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full opacity-80" />
        </div>
      ))}
    </div>
  );
}

function TableShape() {
  return (
    <div className="overflow-hidden rounded-section border border-border/60 bg-card/70">
      <div className="grid h-11 grid-cols-[1.3fr_1.5fr_1fr_0.9fr_0.7fr] items-center gap-6 border-b border-border/50 bg-muted/40 px-5">
        {["w-20", "w-24", "w-16", "w-14", "w-10"].map((width, index) => (
          <Skeleton key={index} className={cn("h-3 rounded-full opacity-70", width, index === 4 && "ml-auto")} />
        ))}
      </div>
      {Array.from({ length: 9 }).map((_, index) => (
        <div
          key={index}
          className="grid min-h-14 grid-cols-[1.3fr_1.5fr_1fr_0.9fr_0.7fr] items-center gap-6 border-b border-border/30 px-5 py-3 last:border-b-0"
        >
          <div className="space-y-2">
            <Skeleton className={cn("h-3.5 rounded-full", index % 3 === 0 ? "w-[62%]" : "w-[48%]")} />
            <Skeleton className={cn("h-3 rounded-full opacity-70", index % 2 === 0 ? "w-[40%]" : "w-[54%]")} />
          </div>
          <Skeleton className={cn("h-3.5 rounded-full", index % 2 === 0 ? "w-[70%]" : "w-[58%]")} />
          <Skeleton className={cn("h-6 rounded-full", index % 2 === 0 ? "w-24" : "w-20")} />
          <Skeleton className={cn("h-3.5 rounded-full", index % 3 === 0 ? "w-[66%]" : "w-[52%]")} />
          <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function BoardShape() {
  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[420px] gap-3 overflow-hidden">
      {Array.from({ length: 5 }).map((_, columnIndex) => (
        <div
          key={columnIndex}
          className="flex h-full min-w-0 flex-1 flex-col rounded-section border border-border/50 bg-muted/25"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
              <Skeleton className={cn("h-3 rounded-full", columnIndex % 2 === 0 ? "w-20" : "w-24")} />
            </div>
            <Skeleton className="h-3 w-5 rounded-full opacity-70" />
          </div>
          <div className="min-h-0 flex-1 space-y-2 px-2.5 pb-3">
            {Array.from({ length: 3 }).map((_, cardIndex) => (
              <div key={cardIndex} className="rounded-2xl border border-border/50 bg-card/82 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className={cn("h-3.5 rounded-full", cardIndex % 2 === 0 ? "w-[68%]" : "w-[52%]")} />
                      <Skeleton className="h-3 w-[44%] rounded-full opacity-75" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <Skeleton className={cn("h-3 rounded-full opacity-80", columnIndex % 2 === 0 ? "w-[86%]" : "w-[74%]")} />
                  <Skeleton className="h-3 w-[62%] rounded-full opacity-70" />
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <Skeleton className="h-3 w-[46%] rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailShape() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-section border border-border/60 bg-card/70 p-5">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-6 w-[38%] rounded-full" />
          <Skeleton className="h-3.5 w-[54%] rounded-full opacity-75" />
          <div className="flex flex-wrap gap-2 pt-1">
            <Skeleton className="h-6 w-24 rounded-full opacity-80" />
            <Skeleton className="h-6 w-20 rounded-full opacity-70" />
            <Skeleton className="h-6 w-28 rounded-full opacity-60" />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl opacity-80" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-section border border-border/60 bg-card/70 p-5">
              <Skeleton className={cn("h-4 rounded-full", index % 2 === 0 ? "w-32" : "w-40")} />
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-full rounded-full opacity-75" />
                <Skeleton className="h-3.5 w-[82%] rounded-full opacity-70" />
                <Skeleton className="h-3.5 w-[64%] rounded-full opacity-60" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-section border border-border/60 bg-card/70 p-5">
              <Skeleton className="h-4 w-24 rounded-full" />
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-[42%] rounded-full opacity-70" />
                  <Skeleton className="h-3 w-[28%] rounded-full opacity-60" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardShape() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-section border border-border/60 bg-card/70 p-4">
            <Skeleton className="h-3 w-24 rounded-full opacity-70" />
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Skeleton className="h-3 w-[58%] rounded-full opacity-60" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-section border border-border/60 bg-card/70 p-5">
          <Skeleton className="h-4 w-40 rounded-full" />
          <Skeleton className="h-[200px] w-full rounded-2xl opacity-70" />
        </div>
        <div className="space-y-3 rounded-section border border-border/60 bg-card/70 p-5">
          <Skeleton className="h-4 w-28 rounded-full" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className={cn("h-3 rounded-full", index % 2 === 0 ? "w-[54%]" : "w-[68%]")} />
                <Skeleton className="h-2.5 w-[36%] rounded-full opacity-60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GridShape() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-section border border-border/60 bg-card/70 p-3">
          <Skeleton className="aspect-[4/3] w-full rounded-2xl opacity-80" />
          <div className="space-y-2 px-1 pb-1">
            <Skeleton className={cn("h-3.5 rounded-full", index % 2 === 0 ? "w-[64%]" : "w-[48%]")} />
            <Skeleton className="h-3 w-[38%] rounded-full opacity-65" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SplitShape() {
  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] overflow-hidden rounded-section border border-border/60 bg-card/60">
      <div className="hidden w-[260px] shrink-0 flex-col gap-2 border-r border-border/50 p-3 md:flex">
        <Skeleton className="h-8 w-full rounded-xl opacity-80" />
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
            <Skeleton className={cn("h-3 rounded-full", index % 3 === 0 ? "w-[52%]" : "w-[70%]")} />
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
          <Skeleton className="h-9 w-full max-w-[360px] rounded-xl" />
          <Skeleton className="ml-auto h-9 w-28 shrink-0 rounded-xl opacity-80" />
        </div>
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-border/50 bg-background/50 p-3">
              <Skeleton className="h-24 w-full rounded-xl opacity-75" />
              <Skeleton className={cn("h-3.5 rounded-full", index % 2 === 0 ? "w-[58%]" : "w-[44%]")} />
              <Skeleton className="h-3 w-[34%] rounded-full opacity-60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SHAPES: Record<PageShape, () => React.ReactElement> = {
  list: ListShape,
  table: TableShape,
  board: BoardShape,
  detail: DetailShape,
  dashboard: DashboardShape,
  grid: GridShape,
  split: SplitShape,
};

/**
 * Каркас сторінки заданої форми.
 *
 * ЗАТРИМКА ЖИВЕ ВСЕРЕДИНІ, і це не дрібниця. Спокусливо винести її в хук на
 * стороні сторінки, але в наших сторінках гейт завантаження стоїть після інших
 * ранніх return-ів (`if (!teamId) …`), тож хук там опинився б за умовою —
 * порушення правил хуків із «різна кількість хуків між рендерами». Компонент
 * же вільно живе будь-де, тому поріг переїхав сюди: перші 150 мс він не малює
 * нічого, далі проявляє каркас.
 *
 * Мінімум показу тут не діє: прибирає компонент батько, а зупинити його
 * зсередини неможливо. Роль запобіжника грає саме проявлення — каркас, який
 * прожив 20 мс, не встигає стати помітним.
 */
export function PageLoading({
  shape,
  className,
  delayMs = 150,
}: {
  shape: PageShape;
  className?: string;
  delayMs?: number;
}) {
  const Shape = SHAPES[shape];
  const ready = useDelayedFlag(delayMs);
  useRouteLoadingSignal(true);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        shellClass(className),
        "transition-opacity duration-200",
        ready ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <span className="sr-only">Завантаження</span>
      {ready ? <Shape /> : null}
    </div>
  );
}

/**
 * Каркас смуги дій, поки сторінка не віддала свої кнопки.
 *
 * Це і є «резерв висоти» з рішення по REQ-19: смуга не з'являється в момент,
 * коли приїхали actions, — вона стоїть від першого кадру маршруту, і контент під
 * нею нікуди не їде.
 */
export function PageToolbarSkeleton({ kind }: { kind: Exclude<PageToolbarKind, "none"> }) {
  return (
    /*
      Висоти не декоративні, а заміряні по живих тулбарах 21.08.2026:
      верхній рядок 44 px (заголовок + підпис), нижній 40 px (пошук і фільтри),
      проміжок 12 px. Промазати тут означає лише перенести стрибок, а не забрати
      його — тому цифри збігаються з реальними, а не «схожі на них».
    */
    <div aria-hidden="true" className="space-y-3">
      <div className="flex min-h-11 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-4 w-64 rounded-full opacity-60" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-9 w-24 rounded-xl opacity-70" />
          <Skeleton className="h-9 w-32 rounded-xl opacity-80" />
        </div>
      </div>

      {kind === "full" ? (
        <div className="flex min-h-10 flex-col gap-3 xl:flex-row xl:items-center">
          <Skeleton className="h-10 w-full rounded-xl opacity-70 xl:max-w-[370px]" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-32 rounded-xl opacity-60" />
            <Skeleton className="h-10 w-28 rounded-xl opacity-60" />
            <Skeleton className="h-10 w-24 rounded-xl opacity-50" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full opacity-50 xl:ml-auto" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Фолбек маршруту: чанк сторінки ще вантажиться.
 *
 * Форму бере з реєстру за адресою — тобто ще до того, як сторінка існує в
 * пам'яті. Затримка 150 мс усередині: кешований чанк віддається за десятки
 * мілісекунд, і показувати заради цього каркас означає додати зайвий кадр.
 */
export function RouteFallback({ shell = false }: { shell?: boolean }) {
  const location = useLocation();
  const surface = shell ? resolvePageSurface(location.pathname) : null;

  // Поза оболонкою (вхід, інвайт, скидання пароля) форми сторінки немає й бути
  // не може — там свій повноекранний макет, і будь-який каркас списку був би
  // чужим. Смузі прогресу все одно кажемо, що чекаємо.
  if (!surface) return <BareRouteFallback />;

  return <PageLoading shape={surface.shape} />;
}

function BareRouteFallback() {
  useRouteLoadingSignal(true);
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="min-h-[240px]">
      <span className="sr-only">Завантаження</span>
    </div>
  );
}

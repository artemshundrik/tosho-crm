import * as React from "react";
import { useLocation } from "react-router-dom";

import { useSkeletonVisible } from "@/components/app/loadingHandoff";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouteLoadingSignal } from "@/layout/routeProgress";
import { resolvePageSurface, resolveSurfaceShape, type PageShape, type PageToolbarKind } from "@/layout/pageSurfaces";
import { cn } from "@/lib/utils";

/**
 * Каркаси завантаження — по одному на форму сторінки.
 *
 * ЧОМУ НЕ ОДНА ПЛИТКА НА ВСІХ. До REQ-19 усі сторінки показували AppPageLoader:
 * центровану картку на 400 px із двома фейковими рядками. Вона не схожа НІ НА
 * ЩО в CRM, тож у момент готовності даних екран перебудовувався повністю — і це
 * читалось як стрибок.
 *
 * ЧОМУ ГЕОМЕТРІЯ ТУТ ТАКА ДРІБНА. Каркас, що не збігається з рамкою сторінки,
 * дратує більше за його відсутність: у режимі полотна (дошки, картки, таблиці)
 * колонка вмісту йде БЕЗ бічних відступів — їх додає сама сторінка. Перший
 * захід цього не враховував, і каркас картки прорахунку тягнувся від краю до
 * краю, чого на самій сторінці немає. Тому кожна форма нижче повторює заміряну
 * рамку своєї сторінки: відступи, ширину правої колонки, висоту рядка таблиці.
 * Числа взяті з живих сторінок 21.08.2026, а не придумані.
 *
 * ЧОМУ ФОРМУ БЕРЕМО З РЕЄСТРУ, А НЕ ЗІ СТОРІНКИ. Каркас потрібен саме тоді,
 * коли сторінки ще немає (чанк вантажиться), — спитати в неї нікого. Форма й
 * ознака полотна записані поруч зі шляхом у pageSurfaces.ts.
 */

type BoardGeometry = { columns: number; columnWidth: string };

type ShapeProps = {
  canvas: boolean;
  /** Скільки колонок і якої ширини — у кожної дошки своє (див. pageSurfaces). */
  board?: BoardGeometry;
};

/** Запасна геометрія: коли поверхня дошки в реєстрі не описана. */
const DEFAULT_BOARD: BoardGeometry = {
  columns: 5,
  columnWidth: "clamp(224px, calc((100cqw - 52px) / 4.2), 312px)",
};

/* ─────────────────────────── допоміжні цеглинки ─────────────────────────── */

function Line({ w, h = "h-3.5", dim }: { w: string; h?: string; dim?: boolean }) {
  return <Skeleton className={cn(h, w, "rounded-full", dim && "opacity-70")} />;
}

/** Картка канбан-колонки: та сама розмітка, що й у справжніх дошок. */
function BoardCard({ seed }: { seed: number }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/82 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Line w={seed % 2 === 0 ? "w-[68%]" : "w-[52%]"} />
            <Line w="w-[44%]" h="h-3" dim />
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <Line w={seed % 3 === 0 ? "w-[86%]" : "w-[74%]"} h="h-3" dim />
        <Line w="w-[62%]" h="h-3" dim />
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border/40 pt-3">
        <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
        <Line w="w-[46%]" h="h-3" />
      </div>
    </div>
  );
}

/** Блок-секція картки сутності. */
function SectionBlock({ rows = 3, title = "w-32" }: { rows?: number; title?: string }) {
  return (
    <div className="space-y-3 rounded-section border border-border/60 bg-card/70 p-5">
      <Line w={title} h="h-4" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Line key={index} w={["w-full", "w-[82%]", "w-[64%]", "w-[73%]"][index % 4]} dim />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────── форми ───────────────────────────────── */

/**
 * Дошка. Повторює KanbanBoard/KanbanColumn один в один: та сама смуга прокрутки
 * з `px-4 pt-4`, та сама ширина колонки `clamp(224px … 312px)` від ширини
 * контейнера, ті самі поверхні колонок. Інакше перехід від цього каркаса до
 * власного каркаса дошки читався б як перебудова екрана.
 */
function BoardShape({ board }: ShapeProps) {
  const { columns, columnWidth } = board ?? DEFAULT_BOARD;
  return (
    <div className="h-[calc(100dvh-177px)] min-h-[420px] overflow-hidden">
      <div className="h-full overflow-hidden px-4 pt-4 pb-6 [container-type:inline-size] [scrollbar-gutter:stable_both-edges] md:px-5 md:pt-5 md:pb-7">
        <div className="flex h-full w-max items-stretch gap-4 pb-2">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <div
              key={columnIndex}
              className="kanban-column-surface flex h-full shrink-0 flex-col"
              // Ширина — рядком із реєстру, слово в слово як у самої дошки:
              // клас тут не годиться, бо значення різне в різних розділів.
              style={{ flexBasis: columnWidth }}
            >
              <div className="kanban-column-header flex shrink-0 items-center justify-between gap-2 px-3.5 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
                  <Line w={columnIndex % 2 === 0 ? "w-20" : "w-24"} h="h-3" />
                </div>
                <Line w="w-5" h="h-3" dim />
              </div>
              <div className="min-h-0 flex-1 space-y-2 px-2.5 pb-1.5 pt-2.5">
                {Array.from({ length: 3 }).map((_, cardIndex) => (
                  <BoardCard key={cardIndex} seed={columnIndex + cardIndex} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Таблиця. Замовники, Підрядники й Склад малюють таблицю НА ВСЮ ширину полотна,
 * без картки-обгортки: шапка `h-11`, рядок 74 px, комірки `px-6`. Саме ці числа
 * тут і стоять — каркас у рамочці на тому місці виглядав би чужим.
 */
function TableShape() {
  return (
    <div className="w-full">
      <div className="flex h-11 items-center gap-6 border-b border-border/50 px-6">
        {["w-20", "w-24", "w-16", "w-14", "w-10"].map((width, index) => (
          <div
            key={index}
            className={cn(
              index === 0 ? "flex-[1.3]" : index === 1 ? "flex-[1.5]" : "flex-1",
              index === 4 && "flex justify-end"
            )}
          >
            <Line w={width} h="h-3" dim />
          </div>
        ))}
      </div>
      {Array.from({ length: 9 }).map((_, index) => (
        <div key={index} className="flex min-h-[74px] items-center gap-6 border-b border-border/30 px-6 py-3.5">
          <div className="flex-[1.3] space-y-2">
            <Line w={index % 3 === 0 ? "w-[62%]" : "w-[48%]"} />
            <Line w={index % 2 === 0 ? "w-[40%]" : "w-[54%]"} h="h-3" dim />
          </div>
          <div className="flex-[1.5]">
            <Line w={index % 2 === 0 ? "w-[70%]" : "w-[58%]"} />
          </div>
          <div className="flex-1">
            <Skeleton className={cn("h-6 rounded-full", index % 2 === 0 ? "w-24" : "w-20")} />
          </div>
          <div className="flex-1">
            <Line w={index % 3 === 0 ? "w-[66%]" : "w-[52%]"} />
          </div>
          <div className="flex flex-1 justify-end">
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Картка сутності з правою колонкою — прорахунок і дизайн-задача.
 *
 * Обидві сторінки збудовані однаково: зліва основна колонка з власними
 * відступами, справа рейка фіксованої ширини з роздільником. Різниця лише в
 * ширині рейки (360 проти 412) і в тому, що прорахунок має ще й верхню панель —
 * тому це один каркас із двома параметрами, а не два схожі.
 */
function RecordShape({ grid, topBar }: { grid: string; topBar: boolean }) {
  return (
    <div className="w-full">
      {topBar ? (
        <div className="border-b border-border/70">
          <div className="flex items-center justify-between gap-3 px-4 py-2 md:px-5 lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
              <Line w="w-40" h="h-4" />
            </div>
            <div className="flex shrink-0 gap-2">
              <Skeleton className="h-9 w-24 rounded-xl opacity-80" />
              <Skeleton className="h-9 w-9 rounded-xl opacity-70" />
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn("grid grid-cols-1 xl:items-start", grid)}>
        <div className="min-w-0 px-4 pb-10 md:px-5 lg:px-6 2xl:px-8">
          <div className="-mx-4 mb-4 border-b border-border/50 px-4 py-2 md:-mx-5 md:px-5 lg:-mx-6 lg:px-6 2xl:-mx-8 2xl:px-8">
            <div className="flex items-center justify-between gap-3">
              <Line w="w-56" h="h-4" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20 rounded-lg opacity-70" />
                <Skeleton className="h-8 w-24 rounded-lg opacity-60" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <SectionBlock rows={3} title="w-40" />
            <SectionBlock rows={4} />
            <SectionBlock rows={2} title="w-28" />
          </div>
        </div>

        <div className="px-4 pb-10 pt-2 md:px-5 lg:px-6 xl:border-l xl:border-[hsl(var(--app-structure-divider))] xl:px-6 xl:pt-6">
          <div className="space-y-6">
            <div className="space-y-3 rounded-section border border-border/60 bg-card/70 p-4">
              <Line w="w-24" h="h-4" />
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-3">
                  <Line w="w-[42%]" h="h-3" dim />
                  <Line w="w-[28%]" h="h-3" dim />
                </div>
              ))}
            </div>
            <div className="space-y-3 rounded-section border border-border/60 bg-card/70 p-4">
              <Line w="w-28" h="h-4" />
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <Line w={index % 2 === 0 ? "w-[54%]" : "w-[68%]"} h="h-3" dim />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuoteRecordShape() {
  return (
    <RecordShape
      grid="xl:h-[calc(100dvh-112px)] xl:grid-cols-[minmax(0,1.9fr)_360px] xl:overflow-hidden"
      topBar
    />
  );
}

function DesignRecordShape() {
  return (
    <RecordShape
      grid="xl:h-[calc(100dvh-120px)] xl:grid-cols-[minmax(0,1.75fr)_412px] xl:overflow-hidden"
      topBar={false}
    />
  );
}

/** Проста картка сутності: замовлення, профіль, налаштування сервісу. */
function DetailShape({ canvas }: ShapeProps) {
  return (
    <div className={cn("space-y-5", canvas && "px-4 py-4 pb-20 sm:px-6 lg:px-8 2xl:px-10")}>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-section border border-border/60 bg-card/70 p-5">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-6 w-[38%] rounded-full" />
          <Line w="w-[54%]" dim />
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
          <SectionBlock rows={3} />
          <SectionBlock rows={4} title="w-40" />
          <SectionBlock rows={2} title="w-28" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-section border border-border/60 bg-card/70 p-5">
              <Line w="w-24" h="h-4" />
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex items-center justify-between gap-3">
                  <Line w="w-[42%]" h="h-3" dim />
                  <Line w="w-[28%]" h="h-3" dim />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardShape({ canvas }: ShapeProps) {
  return (
    <div className={cn("space-y-5", canvas && "px-4 py-4 md:px-5 lg:px-6")}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-section border border-border/60 bg-card/70 p-4">
            <Line w="w-24" h="h-3" dim />
            <Skeleton className="h-7 w-20 rounded-lg" />
            <Line w="w-[58%]" h="h-3" dim />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-section border border-border/60 bg-card/70 p-5">
          <Line w="w-40" h="h-4" />
          <Skeleton className="h-[200px] w-full rounded-2xl opacity-70" />
        </div>
        <div className="space-y-3 rounded-section border border-border/60 bg-card/70 p-5">
          <Line w="w-28" h="h-4" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Line w={index % 2 === 0 ? "w-[54%]" : "w-[68%]"} h="h-3" />
                <Line w="w-[36%]" h="h-2.5" dim />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Галерея однакових карток: Маркетинг, «Можливості». */
function GridShape() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none opacity-80" />
          <div className="space-y-2 p-3">
            <Line w={index % 2 === 0 ? "w-[64%]" : "w-[48%]"} />
            <Line w="w-[38%]" h="h-3" dim />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Стрічка однакових рядків. */
function ListShape({ canvas }: ShapeProps) {
  return (
    <div className={cn(canvas && "px-3 py-3 pb-20 sm:px-5 md:pb-6")}>
      <div className="space-y-2.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-3xl border border-border/50 bg-card/70 px-4 py-3.5"
          >
            <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Line w={index % 3 === 0 ? "w-[38%]" : "w-[52%]"} />
              <Line w={index % 2 === 0 ? "w-[68%]" : "w-[58%]"} h="h-3" dim />
            </div>
            <Skeleton className="h-6 w-16 shrink-0 rounded-full opacity-80" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Стрічка подій усередині однієї картки — «Активність». */
function FeedShape() {
  return (
    <div className="rounded-section border border-border bg-card/60 p-5">
      <div className="space-y-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex items-start gap-3 border-b border-border/30 pb-4 last:border-b-0 last:pb-0"
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Line w={index % 3 === 0 ? "w-[46%]" : "w-[62%]"} />
              <Line w={index % 2 === 0 ? "w-[72%]" : "w-[54%]"} h="h-3" dim />
            </div>
            <Line w="w-16" h="h-3" dim />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Список ліворуч, деталі праворуч: Каталог і «Ролі та доступи». */
function SplitShape({ canvas }: ShapeProps) {
  return (
    <div
      className={cn(
        "flex overflow-hidden",
        canvas
          ? "h-[calc(100dvh-125px)] min-h-[420px] border-t border-border/50"
          : "mx-auto h-[calc(100dvh-7rem)] min-h-[420px] w-full max-w-[1400px] rounded-section border border-border bg-card/60"
      )}
    >
      <div className="hidden w-[300px] shrink-0 flex-col gap-2 border-r border-border/50 p-3 md:flex">
        <Skeleton className="h-9 w-full rounded-xl opacity-80" />
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
            <Line w={index % 3 === 0 ? "w-[52%]" : "w-[70%]"} h="h-3" />
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
              <Line w={index % 2 === 0 ? "w-[58%]" : "w-[44%]"} />
              <Line w="w-[34%]" h="h-3" dim />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SHAPES: Record<PageShape, (props: ShapeProps) => React.ReactElement> = {
  list: ListShape,
  feed: FeedShape,
  table: TableShape,
  board: BoardShape,
  detail: DetailShape,
  "quote-record": QuoteRecordShape,
  "design-record": DesignRecordShape,
  dashboard: DashboardShape,
  grid: GridShape,
  split: SplitShape,
};

/**
 * Каркас сторінки заданої форми.
 *
 * ЗАТРИМКА НАЛЕЖИТЬ ПЕРЕХОДУ, А НЕ КОМПОНЕНТУ. Кожен каркас відміряв свої 150 мс
 * окремо, тож на холодному вході виходило «каркас → порожньо → каркас», і це
 * читалось як поломка. Тепер перший у ланцюжку чекає, а решта підхоплює
 * естафету миттєво (див. loadingHandoff.ts).
 */
export function PageLoading({
  shape,
  className,
  canvas,
}: {
  /** Без значення форма береться з реєстру за адресою — так і слід робити. */
  shape?: PageShape;
  className?: string;
  /** Полотно (сторінка сама дає бічні відступи). Без значення — з реєстру. */
  canvas?: boolean;
}) {
  const location = useLocation();
  const surface = resolvePageSurface(location.pathname);
  const Shape = SHAPES[shape ?? (surface ? resolveSurfaceShape(surface) : "list")];
  const visible = useSkeletonVisible();
  useRouteLoadingSignal(true);

  const isCanvas = canvas ?? surface?.canvas ?? false;
  // Сторінка, що обмежує собі ширину, мусить отримати каркас тієї ж ширини —
  // інакше на широкому екрані видно, як каркас «згортається» під сторінку.
  const maxWidth = surface?.maxWidth;

  if (!visible) {
    // Порожньо, але з тією ж роллю: читач екрана вже знає, що триває
    // завантаження, а очі ще не бачать зайвого кадру заради 100 мс очікування.
    return (
      <span role="status" aria-live="polite" aria-busy="true" className="sr-only">
        Завантаження
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("mx-auto w-full", className)}
      style={maxWidth ? { maxWidth } : undefined}
    >
      <span className="sr-only">Завантаження</span>
      <Shape canvas={isCanvas} board={surface?.board} />
    </div>
  );
}

/**
 * Каркас смуги дій, поки сторінка не віддала свої кнопки.
 *
 * Це і є «резерв висоти» з рішення по REQ-19: смуга не з'являється в момент,
 * коли приїхали actions, — вона стоїть від першого кадру маршруту, і контент під
 * нею нікуди не їде.
 *
 * Висоти заміряні по живих тулбарах: верхній рядок 44 px (заголовок + підпис),
 * нижній 40 px (пошук і фільтри), проміжок 12 px. Промазати тут означає лише
 * перенести стрибок, а не забрати його.
 */
export function PageToolbarSkeleton({ kind }: { kind: Exclude<PageToolbarKind, "none"> }) {
  return (
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
 * пам'яті. Далі сторінка змонтується й покаже СВІЙ каркас тієї ж форми, тож
 * заміна одного на інший непомітна.
 */
export function RouteFallback({ shell = false }: { shell?: boolean }) {
  const location = useLocation();
  const surface = shell ? resolvePageSurface(location.pathname) : null;

  // Поза оболонкою (вхід, інвайт, скидання пароля) форми сторінки немає й бути
  // не може — там свій повноекранний макет, і будь-який каркас списку був би
  // чужим. Смузі прогресу все одно кажемо, що чекаємо.
  if (!surface) return <BareRouteFallback />;

  return <PageLoading shape={surface.shape} canvas={surface.canvas} />;
}

function BareRouteFallback() {
  useRouteLoadingSignal(true);
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="min-h-[240px]">
      <span className="sr-only">Завантаження</span>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar as CalendarIcon,
  Check,
  ChevronRight,
  ChevronsDown,
  ChevronUp,
  Clock,
  Printer,
  FileText,
  Minus,
  RotateCcw,
  Star,
  Target,
  Timer,
  TimerOff,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppDropdown } from "@/components/app/AppDropdown";
import { resolveWorkspaceId } from "@/lib/workspace";
import { loadNormPlans, type MonthNormPlan } from "@/lib/designerPayroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarBase } from "@/components/app/avatar-kit";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import { DesignersPrintReport, type PrintReportVariant } from "@/components/design/DesignersPrintReport";
import {
  firstName,
  formatHM,
  formatHours,
  formatHumanMinutes,
  formatHumanSeconds,
  getInitials,
  monthShort,
  monthTitle,
} from "@/lib/designerAnalyticsFormat";
import {
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_NORM_MINUTES,
  DESIGN_TASK_TYPE_OPTIONS,
  type DesignTaskType,
} from "@/lib/designTaskType";
import {
  avgSecondsForType,
  avgSecondsPerTask,
  MAX_SESSION_SECONDS,
  loadDesignerAnalytics,
  revisionsPerTask,
  type DesignerAnalytics,
  type DesignerMonthAgg,
  type DesignerWorkGroup,
} from "@/lib/designerAnalytics";

/**
 * «Дизайнери» як єдиний дашборд (гібрид трьох концептів):
 *  · липкий скоуп-бар «Вся команда / людина» — усі блоки перемикаються під скоуп;
 *  · KPI місяця з дельтами до попереднього і спарклайнами за вікно;
 *  · середній час за типами (команда: поточний vs попередній; людина: vs команда);
 *  · права колонка: баланс команди (скоуп «команда») або особиста динаміка;
 *  · одна таблиця з двома лінзами: «Місяць» (лідерборд) і «По місяцях» (теплова
 *    матриця з перемикачем метрики);
 *  · «Роботи» (скоуп «людина») — картки задач із файлами замість дровера.
 */

export type DesignersDashboardProps = {
  teamId: string | null;
  currentUserId: string | null;
  /** SEO/superadmin бачать усіх; решта — лише себе (як у старому звіті файлів). */
  canSeeAll: boolean;
  designers: Array<{ id: string; label: string }>;
  memberInactiveById: Record<string, boolean>;
  getMemberAvatar: (id: string | null | undefined) => string | null;
};

/* ---------- формат (спільний із друкованим звітом) ---------- */

const revisionsWord = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "правка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "правки";
  return "правок";
};

/* ---------- кольори серій (типи задач) ---------- */

const TYPE_CHART_VAR: Record<DesignTaskType, string> = {
  visualization: "--chart-1",
  presentation: "--chart-2",
  layout_adaptation: "--chart-3",
  layout: "--chart-4",
  creative: "--chart-5",
};

const typeColor = (type: DesignTaskType) => `hsl(var(${TYPE_CHART_VAR[type]}))`;

const TYPE_SHORT: Record<DesignTaskType, string> = {
  visualization: "Візуалізація",
  presentation: "Презентація",
  layout_adaptation: "Адаптація",
  layout: "Верстка",
  creative: "Креатив",
};

/* Вид завантаженого файлу (output_kind) — кольори з семантичних токенів, не серій. */
const FILE_KIND_META = [
  { key: "visualization", label: "Візуал", color: "hsl(var(--info-foreground))" },
  { key: "layout", label: "Макет", color: "hsl(var(--success-solid))" },
  { key: "attachment", label: "Файли задачі", color: "hsl(var(--muted-foreground))" },
] as const;

/* Розширення, для яких показуємо прев'ю з превʼю-пайплайна (як у старому дровері). */
const PREVIEWABLE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "pdf", "tif", "tiff"]);

const CAPACITY_BADGE_CLASS_BY_LEVEL = {
  low: "border-success-soft-border bg-success-soft text-success-foreground",
  medium: "border-info-soft-border bg-info-soft text-info-foreground",
  high: "border-warning-soft-border bg-warning-soft text-warning-foreground",
  critical: "border-danger-soft-border bg-danger-soft text-danger-foreground",
} as const;

const CAPACITY_LABEL_BY_LEVEL = {
  low: "Вільно",
  medium: "Середнє",
  high: "Щільно",
  critical: "На межі",
} as const;

/* ---------- дельта-чип ---------- */

type DeltaTone = "good" | "bad" | "flat";

const DELTA_CLASS: Record<DeltaTone, string> = {
  good: "border-success-soft-border bg-success-soft text-success-foreground",
  bad: "border-danger-soft-border bg-danger-soft text-danger-foreground",
  flat: "border-neutral-soft-border bg-neutral-soft text-neutral-foreground",
};

/**
 * Дельта до попереднього місяця: тільки колір + стрілка + число.
 *
 * Слова («менше», «швидше», «більше правок») свідомо прибрані — вони дублювали
 * те, що вже кажуть напрямок стрілки й колір, і робили чіп таким довгим, що він
 * рвався на два рядки. Словесне пояснення лишилось у `title`: для наведення,
 * скрінрідера і випадків, коли колір не зчитується.
 */
const CHIP_BASE = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-3xs font-semibold";

function DeltaChip({
  current,
  previous,
  lowerBetter,
  format,
  upWord,
  downWord,
}: {
  current: number | null;
  previous: number | null;
  lowerBetter: boolean;
  format: (diff: number) => string;
  upWord?: string;
  downWord?: string;
}) {
  if (current == null || previous == null) {
    return (
      <span className={cn(CHIP_BASE, DELTA_CLASS.flat)} title="Немає попереднього місяця для порівняння">
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  const diff = current - previous;
  if (Math.abs(diff) < 0.001) {
    return (
      <span className={cn(CHIP_BASE, DELTA_CLASS.flat)} title="Без змін до попереднього місяця">
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  const up = diff > 0;
  const tone: DeltaTone = (lowerBetter ? !up : up) ? "good" : "bad";
  const Icon = up ? TrendingUp : TrendingDown;
  const word = lowerBetter ? (up ? upWord ?? "повільніше" : downWord ?? "швидше") : up ? upWord ?? "більше" : downWord ?? "менше";
  const value = format(Math.abs(diff));
  return (
    <span className={cn(CHIP_BASE, DELTA_CLASS[tone])} title={`${up ? "+" : "−"}${value} ${word} за попередній місяць`}>
      <Icon className="h-3 w-3" />
      {up ? "+" : "−"}
      {value}
    </span>
  );
}

/* ---------- спарклайн ---------- */

function SparkLine({ values, width = 88, height = 30 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;
  const points = values.map((value, index) => {
    const x = pad + (index * (width - pad * 2)) / (values.length - 1);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`).join(" ");
  const area = `${line} L${points[points.length - 1][0]} ${height - 1} L${points[0][0]} ${height - 1} Z`;
  const [lastX, lastY] = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      {/* chart-1, не бренд-primary: канонічний синій візуалізацій (див. index.css). */}
      <path d={area} fill="hsl(var(--chart-1))" opacity={0.1} />
      <path d={line} fill="none" stroke="hsl(var(--chart-1))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.6} fill="hsl(var(--chart-1))" />
    </svg>
  );
}

/* ---------- інтерактивний tooltip (як у Supabase: наведення → поповер) ----------
 * Один портал на body, керований станом. bind(build) повертає mouse-хендлери;
 * контент будується ліниво на mouseenter, тож рядки не рахуються щорендер.
 */
type TipRow = { color?: string; label: string; value: string; strong?: boolean; muted?: boolean };
type TipModel = { title?: string; rows: TipRow[]; note?: string };
type TipState = TipModel & { x: number; y: number };

function ChartTooltipView({ tip }: { tip: TipState }) {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const flipX = tip.x > vw * 0.66;
  const flipY = tip.y > vh * 0.72;
  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: tip.x,
        top: tip.y,
        transform: `translate(${flipX ? "calc(-100% - 14px)" : "14px"}, ${flipY ? "calc(-100% - 16px)" : "16px"})`,
        zIndex: 60,
        pointerEvents: "none",
      }}
      className="w-max max-w-[min(88vw,360px)] rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-snug shadow-[var(--shadow-menu)]"
    >
      {tip.title ? <div className="mb-1 font-semibold text-foreground">{tip.title}</div> : null}
      <div className="flex flex-col gap-1">
        {tip.rows.map((row, index) => (
          <div key={index} className="flex items-center gap-3 whitespace-nowrap">
            {row.color ? <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: row.color }} aria-hidden="true" /> : null}
            <span className={cn(row.muted ? "text-muted-foreground/70" : "text-muted-foreground")}>{row.label}</span>
            <span className={cn("ml-auto shrink-0 tabular-nums", row.strong ? "font-semibold text-foreground" : "text-foreground")}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {tip.note ? <div className="mt-1 text-3xs text-muted-foreground/80">{tip.note}</div> : null}
    </div>
  );
}

function useChartTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const bind = useCallback(
    (build: () => TipModel) => ({
      onMouseEnter: (event: ReactMouseEvent) => {
        const model = build();
        setTip({ ...model, x: event.clientX, y: event.clientY });
      },
      onMouseMove: (event: ReactMouseEvent) => {
        const x = event.clientX;
        const y = event.clientY;
        setTip((prev) => (prev ? { ...prev, x, y } : prev));
      },
      onMouseLeave: () => setTip(null),
    }),
    []
  );
  const overlay: ReactNode =
    tip && typeof document !== "undefined" ? createPortal(<ChartTooltipView tip={tip} />, document.body) : null;
  return { bind, overlay };
}

/* ---------- метрики матриці ---------- */

type MatrixMetric = {
  key: string;
  group: "Обсяг" | "⌀ час";
  label: string;
  type?: DesignTaskType;
  lowerBetter: boolean;
  teamAgg: "sum" | "avg";
  get: (agg: DesignerMonthAgg) => number | null;
  format: (value: number) => string;
  formatLong: (value: number) => string;
};

const MATRIX_METRICS: MatrixMetric[] = [
  {
    key: "hours",
    group: "Обсяг",
    label: "Години в таймері",
    lowerBetter: false,
    teamAgg: "sum",
    get: (agg) => agg.trackedSeconds,
    format: (value) => formatHours(value),
    formatLong: (value) => `${formatHours(value)} год у таймері`,
  },
  {
    key: "tasks",
    group: "Обсяг",
    label: "Задачі у роботі",
    lowerBetter: false,
    teamAgg: "sum",
    get: (agg) => agg.tasksTouched,
    format: (value) => `${Math.round(value)}`,
    formatLong: (value) => `${Math.round(value)} задач у таймері`,
  },
  {
    key: "files",
    group: "Обсяг",
    label: "Файли",
    lowerBetter: false,
    teamAgg: "sum",
    get: (agg) => agg.files,
    format: (value) => `${Math.round(value)}`,
    formatLong: (value) => `${Math.round(value)} файлів`,
  },
  {
    key: "works_visualization",
    group: "Обсяг",
    label: "Візуали",
    lowerBetter: false,
    teamAgg: "sum",
    get: (agg) => agg.worksByKind.visualization,
    format: (value) => `${Math.round(value)}`,
    formatLong: (value) => `${Math.round(value)} візуалів`,
  },
  {
    key: "works_layout",
    group: "Обсяг",
    label: "Макети",
    lowerBetter: false,
    teamAgg: "sum",
    get: (agg) => agg.worksByKind.layout,
    format: (value) => `${Math.round(value)}`,
    formatLong: (value) => `${Math.round(value)} макетів`,
  },
  ...DESIGN_TASK_TYPE_OPTIONS.map((option): MatrixMetric => ({
    key: `avg_${option.value}`,
    group: "⌀ час",
    label: TYPE_SHORT[option.value],
    type: option.value,
    lowerBetter: true,
    teamAgg: "avg",
    get: (agg) => avgSecondsForType(agg, option.value),
    format: (value) => formatHM(value),
    formatLong: (value) => `${formatHumanSeconds(value)} на задачу`,
  })),
];

/* ---------- кеш аналітики ----------
 * Вкладка «Дизайнери» рендериться умовно, тож при кожному поверненні компонент
 * монтується заново і без кешу рахував би все з нуля (4 запити + агрегація).
 * Тримаємо результат у модульному кеші на час SPA-сесії: повернення показує
 * дані миттєво, а якщо вони старші за TTL — тихо оновлюємо у фоні (SWR), без
 * спінера поверх уже показаних чисел. У sessionStorage свідомо НЕ пишемо:
 * works містить усі файли за 6 місяців — це важко й ризиковано для квоти.
 */
type AnalyticsCacheEntry = { data: DesignerAnalytics; cachedAt: number };
const analyticsCache = new Map<string, AnalyticsCacheEntry>();

/** Скелетон у формі дашборду — щоб перший показ не «стрибав» після завантаження. */
function DashboardSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-4 pb-2 sm:px-5" aria-busy="true" aria-label="Завантажуємо аналітику">
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-card">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
          <Skeleton className="h-9 w-64 rounded-xl" />
          <Skeleton className="ml-auto h-9 w-[180px] rounded-lg" />
        </div>
        <div className="px-4 pt-3">
          <Skeleton className="h-3.5 w-72 rounded-full" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-px border-t border-border/50 bg-border/50 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="bg-background/70 p-3.5">
              <Skeleton className="h-3 w-24 rounded-full" />
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="space-y-1.5">
                  <Skeleton className="h-6 w-14 rounded-md" />
                  <Skeleton className="h-3 w-20 rounded-full opacity-70" />
                </div>
                <Skeleton className="h-7 w-16 rounded-md opacity-70" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-2xl border border-border/60 bg-background/70 p-5 lg:col-span-2">
          <Skeleton className="h-4 w-56 rounded-full" />
          <Skeleton className="mt-2 h-3 w-80 rounded-full opacity-70" />
          <div className="mt-4 space-y-3.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid items-center gap-3 sm:grid-cols-[210px_minmax(0,1fr)_170px]">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-2.5 w-2.5 rounded-sm" />
                  <Skeleton className="h-3.5 w-32 rounded-full" />
                </div>
                <Skeleton className={cn("h-3.5 rounded", index % 2 === 0 ? "w-[62%]" : "w-[38%]")} />
                <Skeleton className="h-3.5 w-24 justify-self-end rounded-full opacity-70" />
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-border/60 bg-background/70 p-5">
          <Skeleton className="h-4 w-36 rounded-full" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2.5">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28 rounded-full" />
                  <Skeleton className="h-3 w-40 rounded-full opacity-70" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full opacity-70" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border/60 bg-background/70 p-5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="ml-auto h-8 w-56 rounded-full" />
        </div>
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-3.5 w-40 rounded-full" />
              <Skeleton className="ml-auto h-8 w-[46%] rounded-lg opacity-70" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- компонент ---------- */

export function DesignersDashboard({
  teamId,
  currentUserId,
  canSeeAll,
  designers,
  memberInactiveById,
  getMemberAvatar,
}: DesignersDashboardProps) {
  const visibleDesigners = useMemo(
    () => (canSeeAll ? designers : designers.filter((designer) => designer.id === currentUserId)),
    [canSeeAll, designers, currentUserId]
  );
  // Дизайнер, що дивиться власну вкладку (є у списку дизайнерів і не адмін).
  const isSelfDesigner = !canSeeAll && visibleDesigners.length > 0;

  /**
   * Ізоляція доступу — визначає і що вантажимо, і що показуємо:
   *  · canSeeAll (CEO/SEO) — усі дизайнери, повна статистика;
   *  · дизайнер — ЛИШЕ свої дані. Раніше запит ішов по всіх, а UI просто ховав
   *    чужі рядки — статистика колег усе одно приїжджала в браузер;
   *  · решта (менеджер) — лише «Баланс команди», без персональних цифр.
   */
  const loadMode: "full" | "balance" = canSeeAll || isSelfDesigner ? "full" : "balance";
  // Ключ-рядок замість масиву: `designers` пересоздається на кожному рендері
  // сторінки, і ефект на ньому перезапускав завантаження без потреби.
  const designerIdsKey = useMemo(() => {
    const source = loadMode === "balance" ? designers : visibleDesigners;
    return source.map((designer) => designer.id).sort().join(",");
  }, [loadMode, designers, visibleDesigners]);
  const cacheKey = teamId && designerIdsKey ? `${teamId}|${loadMode}|${designerIdsKey}` : null;

  const [analytics, setAnalytics] = useState<DesignerAnalytics | null>(
    () => (cacheKey ? analyticsCache.get(cacheKey)?.data ?? null : null)
  );
  // Спінер/скелетон — тільки коли показувати нічого; інакше оновлюємо тихо.
  const [loading, setLoading] = useState(() => !(cacheKey && analyticsCache.has(cacheKey)));
  const [loadError, setLoadError] = useState(false);
  const [monthIdx, setMonthIdx] = useState<number | null>(null);
  const [scope, setScope] = useState<string>("team");
  const [tableMode, setTableMode] = useState<"month" | "trend" | "files">("month");
  const [metricKey, setMetricKey] = useState<string>("avg_visualization");
  const [worksExpanded, setWorksExpanded] = useState(false);
  /** Фільтр списку робіт за наявністю таймера. */
  const [worksFilter, setWorksFilter] = useState<"all" | "timed" | "untimed" | "stuck">("all");
  /** Що міряє картка типів: середній час чи кількість зроблених робіт. */
  const [typesMetric, setTypesMetric] = useState<"time" | "count">("time");
  /** userId → monthKey → норма. Порожня, якщо глядач не має доступу до ставок. */
  const [normPlans, setNormPlans] = useState<Map<string, Map<string, MonthNormPlan>>>(() => new Map());
  /** Коли дані востаннє приїхали з БД — щоб чесно підписати «оновлено … тому». */
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  /** Який зі звітів піде на друк. Друкуємо після коміту React — див. ефект нижче. */
  const [printVariant, setPrintVariant] = useState<PrintReportVariant>("time");
  const [printPending, setPrintPending] = useState(false);
  const { bind: bindTip, overlay: tipOverlay } = useChartTooltip();

  useEffect(() => {
    if (!canSeeAll) {
      setScope(visibleDesigners[0]?.id ?? "team");
    }
  }, [canSeeAll, visibleDesigners]);

  /**
   * Друк запускаємо в ефекті, а не одразу в onClick: на момент кліку в DOM ще
   * стоїть попередній варіант звіту, і діалог друку показав би не той аркуш.
   * Ефект виконується вже після коміту React, тож на папір іде обраний звіт.
   */
  useEffect(() => {
    if (!printPending) return;
    setPrintPending(false);
    window.print();
  }, [printPending]);

  useEffect(() => {
    let cancelled = false;
    if (!teamId || !cacheKey) {
      setAnalytics(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const cached = analyticsCache.get(cacheKey);
    if (cached) {
      // Показуємо кеш миттєво (навіть протухлий) — жодного порожнього екрана.
      setAnalytics(cached.data);
      setMonthIdx((current) => current ?? cached.data.months.length - 1);
      setFetchedAt(cached.cachedAt);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setLoadError(false);
    // Оновлюємо ЗАВЖДИ, навіть якщо кеш свіжий: дизайнер щойно залив файли й
    // одразу йде дивитись цифри — п'ятихвилинна пауза читалась як «не
    // порахувало». Кеш лишається лише для миттєвого першого кадру.
    setRefreshing(true);

    loadDesignerAnalytics({ teamId, designerIds: designerIdsKey.split(","), mode: loadMode })
      .then((result) => {
        analyticsCache.set(cacheKey, { data: result, cachedAt: Date.now() });
        if (cancelled) return;
        setAnalytics(result);
        setMonthIdx((current) => current ?? result.months.length - 1);
        setFetchedAt(Date.now());
      })
      .catch((error) => {
        console.warn("Failed to load designer analytics", error);
        // Помилку показуємо лише коли показати нічого; інакше лишаємо кеш.
        if (!cancelled && !cached) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, cacheKey, designerIdsKey, loadMode, refreshNonce]);

  /**
   * Норми виробітку — окремим запитом від аналітики: вони живуть у pay-таблицях
   * (інша схема, інша RLS). Якщо глядач не має на них права, мапа лишається
   * порожньою і картка «Кількість» просто малює лічильники без норм.
   */
  useEffect(() => {
    let cancelled = false;
    const months = analytics?.months;
    if (!currentUserId || !months || months.length === 0 || visibleDesigners.length === 0) return;
    (async () => {
      const workspaceId = await resolveWorkspaceId(currentUserId);
      if (cancelled || !workspaceId) return;
      const plans = await loadNormPlans({
        workspaceId,
        userIds: visibleDesigners.map((designer) => designer.id),
        monthKeys: months.map((month) => month.value),
      });
      if (!cancelled) setNormPlans(plans);
    })().catch((error) => {
      // Норми — надбудова: без них картка показує самі лічильники.
      console.warn("Failed to load norm plans", error);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, analytics?.months, visibleDesigners]);

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    designers.forEach((designer) => map.set(designer.id, designer.label));
    return map;
  }, [designers]);

  const mi = monthIdx ?? (analytics ? analytics.months.length - 1 : 0);
  const prevIdx = mi > 0 ? mi - 1 : null;
  const isCurrentMonth = analytics ? mi === analytics.months.length - 1 : false;
  const scopedDesigner = scope !== "team" ? visibleDesigners.find((designer) => designer.id === scope) ?? null : null;
  const scopedAgg = useCallback(
    (index: number): DesignerMonthAgg | null => {
      if (!analytics) return null;
      if (!scopedDesigner) return analytics.team[index] ?? null;
      return analytics.perDesigner.get(scopedDesigner.id)?.[index] ?? null;
    },
    [analytics, scopedDesigner]
  );

  const selectScope = useCallback((next: string) => {
    setScope(next);
    setWorksExpanded(false);
  }, []);

  if (!teamId) return null;

  if (loading) return <DashboardSkeleton />;

  if (loadError || !analytics) {
    return (
      <div className="px-4 pt-4 pb-4 sm:px-5">
        <div className="rounded-section border border-dashed border-border/60 bg-muted/5 px-4 py-10 text-center text-sm text-muted-foreground">
          {loadError ? "Не вдалося порахувати аналітику. Спробуйте оновити сторінку." : "Немає даних для аналітики."}
        </div>
      </div>
    );
  }

  const months = analytics.months;
  const currentAgg = scopedAgg(mi);
  const previousAgg = prevIdx == null ? null : scopedAgg(prevIdx);

  /* ---------- KPI ---------- */
  const kpiSeries = (pick: (agg: DesignerMonthAgg) => number) =>
    months.map((_, index) => {
      const agg = scopedAgg(index);
      return agg ? pick(agg) : 0;
    });

  const avgCurrent = currentAgg ? avgSecondsPerTask(currentAgg) : null;
  const avgPrevious = previousAgg ? avgSecondsPerTask(previousAgg) : null;
  const revCurrent = currentAgg ? revisionsPerTask(currentAgg) : null;
  const revPrevious = previousAgg ? revisionsPerTask(previousAgg) : null;
  const timerTaskCount = currentAgg?.timerTaskCount ?? 0;

  const kpis: Array<{
    label: string;
    icon: typeof Target;
    value: string;
    unit?: string;
    sub?: string;
    delta: JSX.Element;
    series: number[];
    seriesFmt: (value: number) => string;
  }> = [
    {
      // Задачі, яких людина торкалась: таймер АБО заливка в «Результат».
      // Раніше рахувались лише таймерні — це половина роботи (43% задач без
      // таймера). «Закрито» звідси прибрано: у «Затверджено» переводять PM і
      // клієнт, тому в дизайнера там майже завжди 0 — підпис лише шумів.
      label: "Задач у роботі",
      icon: Target,
      value: `${currentAgg?.tasksTouched ?? 0}`,
      sub: currentAgg && currentAgg.tasksTouched > 0 ? `${currentAgg.timerTaskCount} із таймером` : undefined,
      delta: (
        <DeltaChip
          current={currentAgg?.tasksTouched ?? null}
          previous={previousAgg?.tasksTouched ?? null}
          lowerBetter={false}
          format={(diff) => `${Math.round(diff)}`}
        />
      ),
      series: kpiSeries((agg) => agg.tasksTouched),
      seriesFmt: (value) => `${value} задач`,
    },
    {
      // Не файли: перезаливи після правок і другий формат (.ai+.pdf) роздували
      // лічильник у півтора-два рази. Роботи — та сама одиниця, що в зарплаті.
      label: "Робіт залито",
      icon: FileText,
      value: `${currentAgg?.works ?? 0}`,
      sub: currentAgg
        ? `${currentAgg.worksByKind.visualization} віз · ${currentAgg.worksByKind.layout} мак`
        : undefined,
      delta: (
        <DeltaChip
          current={currentAgg?.works ?? null}
          previous={previousAgg?.works ?? null}
          lowerBetter={false}
          format={(diff) => `${Math.round(diff)}`}
        />
      ),
      series: kpiSeries((agg) => agg.works),
      seriesFmt: (value) => `${value} робіт`,
    },
    {
      label: "Годин у таймері",
      icon: Timer,
      value: formatHours(currentAgg?.trackedSeconds ?? 0),
      unit: "год",
      delta: (
        <DeltaChip
          current={currentAgg?.trackedSeconds ?? null}
          previous={previousAgg?.trackedSeconds ?? null}
          lowerBetter={false}
          format={(diff) => `${Math.round(diff / 3600)} год`}
        />
      ),
      series: kpiSeries((agg) => Math.round(agg.trackedSeconds / 3600)),
      seriesFmt: (value) => `${value} год`,
    },
    {
      label: "⌀ час / задачу",
      icon: Clock,
      value: avgCurrent == null ? "—" : formatHM(avgCurrent),
      unit: avgCurrent == null ? undefined : "год",
      delta: (
        <DeltaChip
          current={avgCurrent}
          previous={avgPrevious}
          lowerBetter
          format={(diff) => `${Math.round(diff / 60)} хв`}
        />
      ),
      series: kpiSeries((agg) => avgSecondsPerTask(agg) ?? 0),
      seriesFmt: (value) => (value > 0 ? `${formatHM(value)} год` : "—"),
    },
    {
      label: "Правок / задачу",
      icon: RotateCcw,
      value: revCurrent == null ? "—" : revCurrent.toFixed(1),
      delta: (
        <DeltaChip
          current={revCurrent}
          previous={revPrevious}
          lowerBetter
          format={(diff) => diff.toFixed(1)}
          upWord="більше правок"
          downWord="менше правок"
        />
      ),
      series: kpiSeries((agg) => revisionsPerTask(agg) ?? 0),
      seriesFmt: (value: number) => value.toFixed(1),
    },
  ];

  /* ---------- середній час за типами ----------
   * Що показуємо на треку (домовлена модель):
   *  · «Вся команда»  → бар місяця + тінь попереднього + норма;
   *  · дизайнер очима SEO/адміна → його бар + тінь ЙОГО попереднього + мітки
   *    колег + норма;
   *  · дизайнер у власному профілі → бар + тінь свого попереднього + норма,
   *    БЕЗ колег і без командного середнього (при двох дизайнерах командне
   *    середнє арифметично розкриває колегу: колега = 2×команда − я).
   *
   * Тінь попереднього місяця тепер є в усіх трьох випадках — це «сам проти
   * себе», найзрозуміліше порівняння для будь-якої ролі.
   */
  const peerDesigners = scopedDesigner
    ? visibleDesigners.filter((designer) => designer.id !== scopedDesigner.id)
    : [];
  const showPeers = canSeeAll && peerDesigners.length > 0;
  const typeRows = DESIGN_TASK_TYPE_OPTIONS.map((option) => {
    const type = option.value;
    const current = currentAgg ? avgSecondsForType(currentAgg, type) : null;
    // Порівняння = завжди попередній місяць того ж скоупу (команда або людина).
    const compare = previousAgg ? avgSecondsForType(previousAgg, type) : null;
    const peers = showPeers
      ? peerDesigners
          .map((designer) => {
            const agg = analytics.perDesigner.get(designer.id)?.[mi] ?? null;
            const value = agg ? avgSecondsForType(agg, type) : null;
            return value == null ? null : { designer, value, tasks: agg?.timerTaskCountByType[type] ?? 0 };
          })
          .filter((entry): entry is { designer: (typeof peerDesigners)[number]; value: number; tasks: number } => !!entry)
      : [];
    const taskCount = currentAgg?.timerTaskCountByType[type] ?? 0;
    const prevTaskCount = previousAgg?.timerTaskCountByType[type] ?? 0;
    const normMinutes = DESIGN_TASK_TYPE_NORM_MINUTES[type];
    const normSeconds = normMinutes == null ? null : normMinutes * 60;
    const overNorm = current != null && normSeconds != null ? current > normSeconds : null;
    return { type, option, current, compare, peers, taskCount, prevTaskCount, normMinutes, normSeconds, overNorm };
  });
  const typeScaleMax = Math.max(
    1,
    ...typeRows.flatMap((row) => [
      row.current ?? 0,
      row.compare ?? 0,
      row.normSeconds ?? 0,
      ...row.peers.map((peer) => peer.value),
    ])
  );

  /* ---------- та сама картка, метрика «Кількість» ----------
   * Норма прив'язана до ВИДУ файлу (візуал/макет), а не до типу задачі — креатив
   * теж заливає візуали, і вони йдуть у норму візуалів. Тому норми окремим
   * блоком зверху, а нижче — ті самі п'ять типів, що й у режимі часу.
   */
  const normForScope = (index: number) => {
    const monthKey = months[index]?.value;
    if (!monthKey) return null;
    const ids = scopedDesigner ? [scopedDesigner.id] : visibleDesigners.map((designer) => designer.id);
    const plans = ids
      .map((id) => normPlans.get(id)?.get(monthKey))
      .filter((plan): plan is MonthNormPlan => !!plan);
    if (plans.length === 0) return null;
    const sum = (pick: (plan: MonthNormPlan) => number) => plans.reduce((total, plan) => total + pick(plan), 0);
    // Спільне значення показуємо, лише якщо воно в усіх однакове: інакше
    // «норма 8/день» для команди з різними умовами була б неправдою.
    const shared = (pick: (plan: MonthNormPlan) => number) => {
      const values = new Set(plans.map(pick));
      return values.size === 1 ? [...values][0] : null;
    };
    return {
      people: plans.length,
      normDaysTotal: sum((plan) => plan.normDaysTotal),
      visualNormFull: sum((plan) => plan.visualNormFull),
      layoutNormFull: sum((plan) => plan.layoutNormFull),
      // Скільки людей у скоупі взагалі: якщо комусь не призначено ставку, його
      // роботи в чисельнику є, а норми в знаменнику немає — і команда показала
      // б фальшиве «понад норму». Тому різницю треба назвати вголос.
      totalPeople: ids.length,
      normDays: sum((plan) => plan.normDays),
      visualNorm: sum((plan) => plan.visualNorm),
      layoutNorm: sum((plan) => plan.layoutNorm),
      visualNormPerDay: shared((plan) => plan.visualNormPerDay),
      layoutNormPerDay: shared((plan) => plan.layoutNormPerDay),
      visualOverRate: shared((plan) => plan.visualOverRate),
      layoutOverRate: shared((plan) => plan.layoutOverRate),
    };
  };
  const currentNorm = normForScope(mi);
  const previousNorm = prevIdx == null ? null : normForScope(prevIdx);

  const normRows = currentNorm
    ? ([
        {
          kind: "visualization" as const,
          label: "Візуали",
          done: currentAgg?.worksByKind.visualization ?? 0,
          norm: currentNorm.visualNorm,
          normFull: currentNorm.visualNormFull,
          perDay: currentNorm.visualNormPerDay,
          rate: currentNorm.visualOverRate,
          // Тінь попереднього місяця — «сам проти себе», як у режимі часу.
          prevDone: previousAgg?.worksByKind.visualization ?? 0,
          prevNorm: previousNorm?.visualNorm ?? null,
        },
        {
          kind: "layout" as const,
          label: "Макети",
          done: currentAgg?.worksByKind.layout ?? 0,
          norm: currentNorm.layoutNorm,
          normFull: currentNorm.layoutNormFull,
          perDay: currentNorm.layoutNormPerDay,
          rate: currentNorm.layoutOverRate,
          prevDone: previousAgg?.worksByKind.layout ?? 0,
          prevNorm: previousNorm?.layoutNorm ?? null,
        },
      ] as const)
    : [];

  const countRows = DESIGN_TASK_TYPE_OPTIONS.map((option) => {
    const type = option.value;
    const current = currentAgg?.worksByType[type] ?? null;
    const compare = previousAgg?.worksByType[type] ?? null;
    const peers = showPeers
      ? peerDesigners
          .map((designer) => {
            const agg = analytics.perDesigner.get(designer.id)?.[mi] ?? null;
            const value = agg?.worksByType[type].works ?? 0;
            return value > 0 ? { designer, value } : null;
          })
          .filter((entry): entry is { designer: (typeof peerDesigners)[number]; value: number } => !!entry)
      : [];
    return { type, option, current, compare, peers };
  });
  const countScaleMax = Math.max(
    1,
    ...countRows.flatMap((row) => [
      row.current?.works ?? 0,
      row.compare?.works ?? 0,
      ...row.peers.map((peer) => peer.value),
    ])
  );

  /* ---------- таблиця ---------- */
  const metric = MATRIX_METRICS.find((entry) => entry.key === metricKey) ?? MATRIX_METRICS[0];
  const matrixValues: Array<number> = [];
  if (tableMode === "trend") {
    visibleDesigners.forEach((designer) => {
      const rows = analytics.perDesigner.get(designer.id);
      if (!rows) return;
      rows.forEach((agg) => {
        const value = metric.get(agg);
        if (value != null) matrixValues.push(value);
      });
    });
  }
  const matrixMin = matrixValues.length ? Math.min(...matrixValues) : 0;
  const matrixMax = matrixValues.length ? Math.max(...matrixValues) : 0;
  const matrixRange = matrixMax - matrixMin || 1;
  const heatBucket = (value: number) => Math.min(6, Math.floor(((value - matrixMin) / matrixRange) * 7));

  const monthRows = [...visibleDesigners].sort((a, b) => {
    const aggA = analytics.perDesigner.get(a.id)?.[mi];
    const aggB = analytics.perDesigner.get(b.id)?.[mi];
    return (aggB?.trackedSeconds ?? 0) - (aggA?.trackedSeconds ?? 0);
  });

  /* ---------- режим «Файли»: матриця дизайнери × розширення за обраний місяць ---------- */
  const filesRows = [...visibleDesigners]
    .map((designer) => ({ designer, agg: analytics.perDesigner.get(designer.id)?.[mi] ?? null }))
    .filter((entry): entry is { designer: (typeof visibleDesigners)[number]; agg: DesignerMonthAgg } => !!entry.agg && entry.agg.files > 0)
    .sort((a, b) => b.agg.files - a.agg.files);
  const extTotalsForMonth = new Map<string, number>();
  filesRows.forEach(({ agg }) => {
    Object.entries(agg.filesByExt).forEach(([ext, count]) => {
      if (count > 0) extTotalsForMonth.set(ext, (extTotalsForMonth.get(ext) ?? 0) + count);
    });
  });
  const sortedExts = [...extTotalsForMonth.entries()].sort((a, b) => b[1] - a[1]).map(([ext]) => ext);
  const EXT_COL_LIMIT = 12; // рідкісні формати згортаємо в «Інші», щоб матриця не розповзалась
  const fileExtColumns = sortedExts.slice(0, EXT_COL_LIMIT);
  const hasOtherExts = sortedExts.length > EXT_COL_LIMIT;
  const otherFiles = (agg: DesignerMonthAgg) => sortedExts.slice(EXT_COL_LIMIT).reduce((sum, ext) => sum + (agg.filesByExt[ext] ?? 0), 0);
  let filesHeatMax = 1;
  filesRows.forEach(({ agg }) => {
    fileExtColumns.forEach((ext) => { filesHeatMax = Math.max(filesHeatMax, agg.filesByExt[ext] ?? 0); });
    if (hasOtherExts) filesHeatMax = Math.max(filesHeatMax, otherFiles(agg));
  });
  const filesHeatBucket = (value: number) => (value <= 0 ? -1 : Math.min(6, Math.round((value / filesHeatMax) * 6)));
  const teamFilesByExt = (ext: string) => filesRows.reduce((sum, { agg }) => sum + (agg.filesByExt[ext] ?? 0), 0);
  const teamFilesTotal = filesRows.reduce((sum, { agg }) => sum + agg.files, 0);

  /* ---------- роботи ---------- */
  const WORKS_PREVIEW = 8;
  const worksList: DesignerWorkGroup[] = scopedDesigner
    ? analytics.works.get(`${scopedDesigner.id}:${mi}`) ?? []
    : [];
  /**
   * Робота без таймера — не помилка й не «нічого не робив»: файли залиті, а
   * час не міряли. Але саме ці задачі випадають із «⌀ часу» й «структури
   * часу», тому їх треба бачити явно, а не здогадуватись про різницю.
   */
  const scopeWorkGroups = scopedDesigner
    ? worksList
    : visibleDesigners.flatMap((designer) => analytics.works.get(`${designer.id}:${mi}`) ?? []);
  const untimedInScope = scopeWorkGroups.filter((group) => group.taskTrackedSeconds === 0).length;
  const worksTimed = worksList.filter((group) => group.taskTrackedSeconds > 0).length;
  const worksUntimed = worksList.length - worksTimed;
  /**
   * Забутий таймер: сесію не зупинили (особливо коли задачу вже закрито) або
   * вона тривала довше за робочий день. Такий час обрізається до 8 год і все
   * одно тягне середні вгору, тому ці задачі треба вміти дістати списком.
   */
  const isStuckTimer = (group: DesignerWorkGroup) =>
    group.timerRunning || group.longestSessionSeconds > MAX_SESSION_SECONDS;
  const worksStuck = worksList.filter(isStuckTimer).length;
  const worksFiltered =
    worksFilter === "timed"
      ? worksList.filter((group) => group.taskTrackedSeconds > 0)
      : worksFilter === "untimed"
        ? worksList.filter((group) => group.taskTrackedSeconds === 0)
        : worksFilter === "stuck"
          ? worksList.filter(isStuckTimer)
          : worksList;
  const worksVisible = worksExpanded ? worksFiltered : worksFiltered.slice(0, WORKS_PREVIEW);

  // Баланс — парність зі старою вкладкою: навантаження команди бачать усі ролі.
  const balanceSorted = [...analytics.balance].sort((a, b) => a.workload.score - b.workload.score);
  // Не-адмін без власного рядка (наприклад, менеджер) бачить лише баланс команди.
  const analyticsVisible = canSeeAll || Boolean(scopedDesigner);

  if (!analyticsVisible) {
    /* Менеджер/інші без власного рядка: як і раніше, бачать лише баланс команди. */
    return (
      <div className="space-y-3 px-4 pt-4 pb-2 sm:px-5">
        <section className="rounded-2xl border border-border/60 bg-background/70 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Баланс команди
            </h3>
            <span className="text-2xs text-muted-foreground">Кому можна ставити нову задачу зараз</span>
          </div>
          <div className="mt-2 divide-y divide-border/50">
            {balanceSorted.map((row, index) => {
              const label = labelById.get(row.designerId) ?? row.designerId.slice(0, 8);
              return (
                <div key={row.designerId} className="flex items-center gap-2.5 py-2.5">
                  <AvatarBase
                    src={getMemberAvatar(row.designerId)}
                    name={label}
                    fallback={getInitials(label)}
                    size={32}
                    className="shrink-0 border-border/70"
                    inactive={memberInactiveById[row.designerId] ?? false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-foreground">{label}</span>
                      {index === 0 ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-3xs font-medium text-primary">
                          <Star className="h-3 w-3" />
                          Рекомендуємо
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-3xs text-muted-foreground">{row.workload.recommendation}</div>
                  </div>
                  <span className="min-w-[22px] text-center text-sm font-semibold tabular-nums text-foreground" title="Активних задач зараз">
                    {row.workload.activeTaskCount}
                  </span>
                  <Badge variant="outline" className={cn("px-2 py-0.5 text-3xs", CAPACITY_BADGE_CLASS_BY_LEVEL[row.workload.level])}>
                    {CAPACITY_LABEL_BY_LEVEL[row.workload.level]}
                  </Badge>
                </div>
              );
            })}
          </div>
        </section>
        <p className="px-1 pb-2 text-2xs text-muted-foreground/80">
          Детальна аналітика дизайнерів доступна SEO та суперадмінам, а кожному дизайнеру — власна.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pt-4 pb-2 sm:px-5">
      {/* ---------- єдина панель: скоуп-перемикач + місяць + контекст + KPI ---------- */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-background/70 shadow-card">
        {/* Ряд 1 — перемикач скоупу + місяць */}
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/50 bg-muted/40 p-1 shadow-inner">
            {canSeeAll ? (
              <button
                type="button"
                onClick={() => selectScope("team")}
                aria-pressed={scope === "team"}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all",
                  "hover:text-foreground",
                  scope === "team" && "bg-background text-foreground shadow-[var(--shadow-elevated-sm)] ring-1 ring-[hsl(var(--soft-ring))]"
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Вся команда
              </button>
            ) : null}
            {visibleDesigners.map((designer) => {
              const active = scope === designer.id;
              return (
                <button
                  key={designer.id}
                  type="button"
                  onClick={() => selectScope(designer.id)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-lg py-1 pl-1.5 pr-3 text-xs font-medium text-muted-foreground transition-all",
                    "hover:text-foreground",
                    active && "bg-background text-foreground shadow-[var(--shadow-elevated-sm)] ring-1 ring-[hsl(var(--soft-ring))]"
                  )}
                >
                  <AvatarBase
                    src={getMemberAvatar(designer.id)}
                    name={designer.label}
                    fallback={getInitials(designer.label)}
                    size={22}
                    className="shrink-0 border-border/70"
                    inactive={memberInactiveById[designer.id] ?? false}
                  />
                  {firstName(designer.label)}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Пояснення, чому цифри неповні, а не попередження — нейтральний тон. */}
            {isCurrentMonth ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-3xs font-medium text-muted-foreground sm:inline-flex">
                <CalendarIcon className="h-3 w-3" />
                поточний місяць
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setRefreshNonce((value) => value + 1)}
              disabled={refreshing}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-background/60 px-2.5 text-2xs font-medium text-muted-foreground transition-colors",
                "hover:text-foreground disabled:cursor-default disabled:opacity-60"
              )}
              title="Перерахувати з бази"
            >
              <RotateCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              <span className="hidden tabular-nums sm:inline">
                {refreshing
                  ? "оновлюємо…"
                  : fetchedAt == null
                    ? "оновити"
                    : Date.now() - fetchedAt < 60_000
                      ? "щойно"
                      : `${Math.round((Date.now() - fetchedAt) / 60_000)} хв тому`}
              </span>
            </button>
            <Select value={String(mi)} onValueChange={(value) => setMonthIdx(Number(value))}>
              <SelectTrigger className="h-9 w-[180px] text-sm font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((month, index) => (
                  <SelectItem key={month.value} value={String(index)}>
                    {monthTitle(month.value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Друк порівняння — лише тим, хто бачить усіх дизайнерів. */}
            {canSeeAll ? (
              <AppDropdown
                align="end"
                contentClassName="w-[260px] p-1.5"
                trigger={
                  <Button variant="outline" size="sm" className="h-9" title={`Друк за ${monthTitle(months[mi].value)}`}>
                    <Printer className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Друк / PDF</span>
                  </Button>
                }
                content={
                  <div className="flex flex-col">
                    {(
                      [
                        {
                          key: "time" as const,
                          title: "Звіт по часу",
                          hint: "Задачі, години, середній час за типами",
                        },
                        {
                          key: "output" as const,
                          title: "Звіт по виробітку",
                          hint: "Роботи проти норми, з чого складаються",
                        },
                      ]
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setPrintVariant(option.key);
                          setPrintPending(true);
                        }}
                        className="cursor-pointer rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
                      >
                        <span className="block text-xs font-semibold text-foreground">{option.title}</span>
                        <span className="block text-3xs text-muted-foreground">{option.hint}</span>
                      </button>
                    ))}
                  </div>
                }
              />
            ) : null}
          </div>
        </div>

        {/* Ряд 2 — контекст (завжди присутній, тому висота панелі стабільна) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3 text-xs text-muted-foreground">
          {scopedDesigner ? (
            <>
              <span className="font-semibold text-foreground">{scopedDesigner.label}</span>
              <span aria-hidden="true">·</span>
              <span>
                {timerTaskCount === 0
                  ? `немає активності таймера за ${monthShort(months[mi].value)}`
                  : `середні рахуємо по ${timerTaskCount} ${timerTaskCount === 1 ? "задачі" : "задачах"} із таймером`}
              </span>
              {untimedInScope > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <TimerOff className="h-3 w-3" />
                    {untimedInScope} робіт без таймера
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">Вся команда</span>
              <span aria-hidden="true">·</span>
              <span>{visibleDesigners.length} дизайнерів</span>
              <span aria-hidden="true">·</span>
              <span>{timerTaskCount} задач у таймері за {monthShort(months[mi].value)}</span>
              {untimedInScope > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <TimerOff className="h-3 w-3" />
                    {untimedInScope} робіт без таймера
                  </span>
                </>
              ) : null}
            </>
          )}
        </div>

        {/* Ряд 3 — KPI-комірки (завжди 5, дільники через 1px-гап) */}
        <div className="mt-3 grid grid-cols-2 gap-px border-t border-border/50 bg-border/50 sm:grid-cols-3 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="bg-background/70 p-3.5">
              <div className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
                <kpi.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <span className="truncate">{kpi.label}</span>
              </div>
              <div className="mt-1.5 flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xl font-bold tracking-tight text-foreground">
                    {kpi.value}
                    {kpi.unit ? <span className="ml-1 text-xs font-medium text-muted-foreground">{kpi.unit}</span> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {kpi.delta}
                    {kpi.sub ? <span className="text-3xs tabular-nums text-muted-foreground">{kpi.sub}</span> : null}
                  </div>
                </div>
                <span
                  className="shrink-0 cursor-help"
                  {...bindTip(() => ({
                    title: kpi.label,
                    rows: months.map((month, index) => ({
                      label: monthTitle(month.value),
                      value: kpi.seriesFmt(kpi.series[index] ?? 0),
                      strong: index === mi,
                    })),
                  }))}
                >
                  <SparkLine values={kpi.series} width={64} height={28} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {analytics.truncated ? (
        <div className="rounded-section border border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          Даних дуже багато — найстаріші місяці можуть бути неповними (уперлись у ліміт вибірки).
        </div>
      ) : null}

      {/* ---------- типи + баланс/динаміка ---------- */}
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-2xl border border-border/60 bg-background/70 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              {typesMetric === "time" ? (
                <Clock className="h-4 w-4 text-primary" />
              ) : (
                <BarChart3 className="h-4 w-4 text-primary" />
              )}
              {typesMetric === "time"
                ? scopedDesigner
                  ? `Середній час за типами — ${firstName(scopedDesigner.label)}`
                  : "Середній час на задачу — за типами"
                : scopedDesigner
                  ? `Зроблено робіт за типами — ${firstName(scopedDesigner.label)}`
                  : "Зроблено робіт — за типами"}
            </h3>
            {/* Легенда з ml-auto, перемикач — останній: так він приклеєний до
                правого краю картки й НЕ їздить, коли міняється ширина заголовка
                («Середній час…» ↔ «Зроблено робіт…») чи набір міток легенди. */}
            <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded-sm bg-foreground/80" aria-hidden="true" />
                {monthShort(months[mi].value)}
              </span>
              {prevIdx != null ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-4 rounded-sm bg-foreground/25" aria-hidden="true" />
                  {monthShort(months[prevIdx].value)}
                </span>
              ) : null}
              {typesMetric === "time" || normRows.length > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 border-l-2 border-dashed border-foreground/45" aria-hidden="true" />
                  норма
                </span>
              ) : null}
              {showPeers ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border/70 bg-muted/40" aria-hidden="true" />
                  колеги
                </span>
              ) : null}
            </span>
            {/* Перемикач метрики: та сама картка, ті самі рядки — інша величина. */}
            <div className={SEGMENTED_GROUP_SM} aria-label="Метрика картки типів">
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={typesMetric === "time"}
                onClick={() => setTypesMetric("time")}
                className={SEGMENTED_TRIGGER_SM}
              >
                ⌀ час
              </Button>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={typesMetric === "count"}
                onClick={() => setTypesMetric("count")}
                className={SEGMENTED_TRIGGER_SM}
              >
                Кількість
              </Button>
            </div>
            <p className="w-full text-xs text-muted-foreground">
              {typesMetric === "time" ? (
                "Час у таймері на задачах типу ÷ кількість таких задач у таймері. Задачі без таймера в середнє не входять."
              ) : (
                <>
                  Унікальні роботи з розділу «Результат»: перезаливи одного файлу нової роботи не додають, .ai+.pdf
                  одного макета — це одна робота. З серпня робота, всі файли якої видалили того ж місяця, не
                  рахується.
                  {currentNorm ? (
                    <span className="text-muted-foreground/70">
                      {" "}
                      Норма — за {currentNorm.normDays}{" "}
                      {currentNorm.people > 1 ? `нормо-днів на ${currentNorm.people} людей` : "нормо-днів"} (відпустки й
                      лікарняні норму зменшують).
                      {currentNorm.people < currentNorm.totalPeople
                        ? ` Ставку призначено ${currentNorm.people} з ${currentNorm.totalPeople} — роботи решти в цифрах є, норми немає.`
                        : ""}
                    </span>
                  ) : null}
                </>
              )}
            </p>
          </div>
          {typesMetric === "time" ? (
          <div className="mt-2 divide-y divide-border/50">
            {typeRows.map((row) => {
              const Icon = DESIGN_TASK_TYPE_ICONS[row.type];
              const currentWidth = row.current == null ? 0 : Math.max(2, (row.current / typeScaleMax) * 100);
              const compareWidth = row.compare == null ? 0 : Math.max(2, (row.compare / typeScaleMax) * 100);
              const diff = row.current != null && row.compare != null ? row.current - row.compare : null;
              const prevMonthLabel = monthShort(months[prevIdx ?? mi].value);
              const tipRows: TipRow[] = [
                {
                  color: typeColor(row.type),
                  label: `${scopedDesigner ? firstName(scopedDesigner.label) : "Команда"} · ${monthShort(months[mi].value)}`,
                  value: row.current == null ? "—" : formatHumanSeconds(row.current),
                  strong: true,
                },
              ];
              if (row.compare != null) {
                tipRows.push({
                  label: prevMonthLabel,
                  // Кількість задач поруч — щоб було видно, наскільки база надійна:
                  // на 1–2 задачах різниця місяць-до-місяця це шум, а не тренд.
                  value: `${formatHumanSeconds(row.compare)} · ${row.prevTaskCount} задач`,
                  muted: true,
                });
              }
              row.peers.forEach((peer) => {
                tipRows.push({
                  label: firstName(peer.designer.label),
                  value: `${formatHumanSeconds(peer.value)} · ${peer.tasks} задач`,
                  muted: true,
                });
              });
              if (row.normMinutes != null) {
                tipRows.push({ label: "Норма", value: `≤ ${row.normMinutes} хв`, muted: true });
              }
              tipRows.push({ label: "Задач у таймері", value: `${row.taskCount}`, muted: true });
              return (
                <div
                  key={row.type}
                  className="grid cursor-help items-center gap-3 py-2.5 sm:grid-cols-[210px_minmax(0,1fr)_170px]"
                  {...bindTip(() => ({ title: row.option.label, rows: tipRows }))}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: typeColor(row.type) }} aria-hidden="true" />
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-foreground">{row.option.label}</span>
                      {/* whitespace-nowrap + truncate: підпис має жити рівно в один рядок,
                          інакше «норма до 15 / хв» рветься навпіл і рядок типу стрибає. */}
                      <span className="block truncate whitespace-nowrap text-3xs tabular-nums text-muted-foreground">
                        {row.taskCount} задач
                        {row.normMinutes != null ? ` · норма ≤ ${row.normMinutes} хв` : ""}
                      </span>
                    </span>
                  </div>
                  <div className="relative h-7">
                    <div className="absolute inset-0 flex justify-between" aria-hidden="true">
                      {[0, 1, 2, 3, 4].map((line) => (
                        <span key={line} className="w-px bg-foreground/5" />
                      ))}
                    </div>
                    {row.current != null ? (
                      <div
                        className="absolute top-1 h-3.5 rounded-r"
                        style={{ width: `${currentWidth}%`, background: typeColor(row.type) }}
                      />
                    ) : (
                      <span className="absolute top-1 text-3xs text-muted-foreground">немає задач із таймером</span>
                    )}
                    {/* Тінь попереднього місяця того ж скоупу — «сам проти себе». */}
                    {row.compare != null && row.current != null ? (
                      <div
                        className="absolute top-[19px] h-1.5 rounded-r opacity-30"
                        style={{ width: `${compareWidth}%`, background: typeColor(row.type) }}
                        aria-hidden="true"
                      />
                    ) : null}
                    {/* Норматив — пунктирна межа: усе, що правіше, вийшло за норму. */}
                    {row.normSeconds != null ? (
                      <span
                        className="absolute inset-y-0 border-l-2 border-dashed border-foreground/45"
                        style={{ left: `${Math.min(100, (row.normSeconds / typeScaleMax) * 100)}%` }}
                        aria-hidden="true"
                      />
                    ) : null}
                    {/* Колеги — лише для тих, хто бачить усіх (SEO/адмін), і лише
                        коли відкрито конкретного дизайнера. */}
                    {row.peers.map((peer) => (
                      <span
                        key={peer.designer.id}
                        className="absolute inset-y-0 flex -translate-x-1/2 cursor-help items-center"
                        style={{ left: `${Math.min(100, (peer.value / typeScaleMax) * 100)}%` }}
                        {...bindTip(() => ({
                          title: `${peer.designer.label} · ${row.option.label}`,
                          rows: [
                            { color: typeColor(row.type), label: "⌀ час", value: formatHumanSeconds(peer.value), strong: true },
                            { label: "Задач у таймері", value: `${peer.tasks}`, muted: true },
                            ...(row.normMinutes != null
                              ? [{ label: "Норма", value: `≤ ${row.normMinutes} хв`, muted: true }]
                              : []),
                          ],
                        }))}
                      >
                        <span className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-foreground/45" aria-hidden="true" />
                        <AvatarBase
                          src={getMemberAvatar(peer.designer.id)}
                          name={peer.designer.label}
                          fallback={getInitials(peer.designer.label)}
                          size={18}
                          className="relative z-10 shrink-0 ring-2 ring-background"
                          inactive={memberInactiveById[peer.designer.id] ?? false}
                        />
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-foreground">
                      {row.current == null ? "—" : formatHumanSeconds(row.current)}
                    </span>
                    {row.overNorm != null ? (
                      /* Короткий підпис: «+4 хв понад норму» не влазив у колонку і рвався
                         на два рядки. Що це саме норма — вже кажуть іконка, колір, пунктир
                         на треку і підпис зліва; повний текст — у title. */
                      <span
                        className={cn(CHIP_BASE, row.overNorm ? DELTA_CLASS.bad : DELTA_CLASS.good)}
                        title={
                          row.overNorm
                            ? `Норма ≤ ${row.normMinutes} хв на задачу — перевищено`
                            : `Норма ≤ ${row.normMinutes} хв на задачу — у межах`
                        }
                      >
                        {row.overNorm ? <TrendingUp className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                        {row.overNorm
                          ? `+${formatHumanMinutes(((row.current ?? 0) - (row.normSeconds ?? 0)) / 60)}`
                          : "у нормі"}
                      </span>
                    ) : diff != null ? (
                      <DeltaChip
                        current={row.current}
                        previous={row.compare}
                        lowerBetter
                        format={(value) => formatHumanMinutes(value / 60)}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          ) : (
          <div className="mt-2">
            {/* Блок норм: тільки для тих, кому RLS віддала ставки. */}
            {normRows.length > 0 ? (
              <div className="divide-y divide-border/50">
                {normRows.map((row) => {
                  const color = row.kind === "visualization" ? FILE_KIND_META[0].color : FILE_KIND_META[1].color;
                  // Тінь попереднього місяця теж має влазити у трек, інакше вона
                  // впиралась би в правий край і брехала про масштаб.
                  const scale = Math.max(1, row.done, row.norm, row.prevDone);
                  const over = Math.max(0, row.done - row.norm);
                  const normLeft = Math.min(100, (row.norm / scale) * 100);
                  const doneLeft = Math.min(100, (Math.min(row.done, row.norm) / scale) * 100);
                  const prevWidth = row.prevDone === 0 ? 0 : Math.max(2, (row.prevDone / scale) * 100);
                  const pace = currentNorm && currentNorm.normDays > 0 ? row.done / currentNorm.normDays : null;
                  /**
                   * Прогноз — лише для поточного місяця: у закритому місяці
                   * екстраполювати нема чого, там уже підсумок. Темп беремо за
                   * нормо-днями, що минули, тож відпустка його не занижує.
                   */
                  const forecastWorks =
                    isCurrentMonth && pace != null && currentNorm ? Math.round(pace * currentNorm.normDaysTotal) : null;
                  const forecastOver = forecastWorks == null ? 0 : Math.max(0, forecastWorks - row.normFull);
                  const normTip = (): TipModel => {
                    const rows: TipRow[] = [
                      {
                        color,
                        label: `${scopedDesigner ? firstName(scopedDesigner.label) : "Команда"} · ${monthShort(months[mi].value)}`,
                        value: `${row.done} робіт`,
                        strong: true,
                      },
                      {
                        label: "Норма",
                        value:
                          row.perDay != null && currentNorm
                            ? `${row.norm} = ${row.perDay}/день × ${currentNorm.normDays}`
                            : `${row.norm}`,
                        muted: true,
                      },
                    ];
                    if (pace != null) {
                      rows.push({ label: "Темп", value: `${pace.toFixed(1)}/день`, muted: true });
                    }
                    rows.push(
                      over > 0
                        ? {
                            label: "Понад норму",
                            value:
                              row.rate != null
                                ? `+${over} · ${Math.round(over * row.rate).toLocaleString("uk-UA")} ₴`
                                : `+${over}`,
                          }
                        : { label: "До норми", value: `ще ${row.norm - row.done}`, muted: true }
                    );
                    if (forecastWorks != null) {
                      rows.push({
                        label: "Прогноз на місяць",
                        value:
                          forecastOver > 0
                            ? `≈ ${forecastWorks} з ${row.normFull} · +${forecastOver} понад`
                            : `≈ ${forecastWorks} з ${row.normFull}`,
                        muted: forecastOver === 0,
                      });
                    }
                    if (prevIdx != null) {
                      rows.push({
                        label: monthShort(months[prevIdx].value),
                        value:
                          row.prevNorm != null
                            ? `${row.prevDone} робіт · норма ${row.prevNorm}`
                            : `${row.prevDone} робіт`,
                        muted: true,
                      });
                    }
                    return { title: row.label, rows };
                  };
                  return (
                    <div
                      key={row.kind}
                      className="grid cursor-help items-center gap-3 py-2.5 sm:grid-cols-[210px_minmax(0,1fr)_170px]"
                      {...bindTip(normTip)}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-foreground">{row.label}</span>
                          <span className="block truncate whitespace-nowrap text-3xs tabular-nums text-muted-foreground">
                            {row.perDay != null ? `норма ${row.perDay}/день` : "норма індивідуальна"}
                            {row.rate != null ? ` · ${row.rate} ₴ понад` : ""}
                          </span>
                        </span>
                      </div>
                      <div className="relative h-7">
                        <div className="absolute inset-0 flex justify-between" aria-hidden="true">
                          {[0, 1, 2, 3, 4].map((line) => (
                            <span key={line} className="w-px bg-foreground/5" />
                          ))}
                        </div>
                        <div className="absolute top-1 h-3.5 rounded-r" style={{ width: `${doneLeft}%`, background: color }} />
                        {over > 0 ? (
                          <div
                            className="absolute top-1 h-3.5 rounded-r bg-success-solid"
                            style={{ left: `${normLeft}%`, width: `${100 - normLeft}%` }}
                          />
                        ) : null}
                        {prevWidth > 0 ? (
                          <div
                            className="absolute top-[19px] h-1.5 rounded-r opacity-30"
                            style={{ width: `${prevWidth}%`, background: color }}
                            aria-hidden="true"
                          />
                        ) : null}
                        {/* Пунктир накриває лише смугу поточного місяця: у
                            попереднього норма своя (інша кількість нормо-днів),
                            і лінія через тінь читалася б як його норма. Норму
                            минулого місяця називає підказка. */}
                        <span
                          className="absolute top-0 h-[18px] border-l-2 border-dashed border-foreground/45"
                          style={{ left: `${normLeft}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="flex flex-col gap-1 sm:items-end">
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-foreground">
                            {row.done} <span className="font-normal text-muted-foreground">з {row.norm}</span>
                          </span>
                          {over > 0 ? (
                            <span className={cn(CHIP_BASE, DELTA_CLASS.good)}>
                              <TrendingUp className="h-3 w-3" />
                              +{over}
                              {row.rate != null ? ` · ${Math.round(over * row.rate).toLocaleString("uk-UA")} ₴` : ""}
                            </span>
                          ) : (
                            <span className={cn(CHIP_BASE, DELTA_CLASS.flat)}>ще {row.norm - row.done}</span>
                          )}
                        </div>
                        {/* Прогноз до кінця місяця: у закритому місяці його немає,
                            бо там уже підсумок, а не темп. */}
                        {forecastWorks != null ? (
                          <span
                            className={cn(
                              "whitespace-nowrap text-3xs tabular-nums",
                              forecastOver > 0 ? "font-semibold text-success-foreground" : "text-muted-foreground"
                            )}
                          >
                            за темпом ≈ {forecastWorks} з {row.normFull}
                            {forecastOver > 0
                              ? ` · +${forecastOver}${row.rate != null ? ` = ${Math.round(forecastOver * row.rate).toLocaleString("uk-UA")} ₴` : ""}`
                              : ""}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className={cn(normRows.length > 0 && "mt-3 border-t border-border/50 pt-2")}>
              <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">
                За типами задач
              </span>
              <div className="divide-y divide-border/50">
                {countRows.map((row) => {
                  const Icon = DESIGN_TASK_TYPE_ICONS[row.type];
                  const works = row.current?.works ?? 0;
                  const prevWorks = row.compare?.works ?? 0;
                  const currentWidth = works === 0 ? 0 : Math.max(2, (works / countScaleMax) * 100);
                  const compareWidth = prevWorks === 0 ? 0 : Math.max(2, (prevWorks / countScaleMax) * 100);
                  const tipRows: TipRow[] = [
                    {
                      color: typeColor(row.type),
                      label: `${scopedDesigner ? firstName(scopedDesigner.label) : "Команда"} · ${monthShort(months[mi].value)}`,
                      value: `${works} робіт`,
                      strong: true,
                    },
                    {
                      label: "З них",
                      value: `${row.current?.visualization ?? 0} візуалів · ${row.current?.layout ?? 0} макетів`,
                      muted: true,
                    },
                  ];
                  if (prevIdx != null) {
                    tipRows.push({ label: monthShort(months[prevIdx].value), value: `${prevWorks} робіт`, muted: true });
                  }
                  row.peers.forEach((peer) => {
                    tipRows.push({ label: firstName(peer.designer.label), value: `${peer.value} робіт`, muted: true });
                  });
                  return (
                    <div
                      key={row.type}
                      className="grid cursor-help items-center gap-3 py-2.5 sm:grid-cols-[210px_minmax(0,1fr)_170px]"
                      {...bindTip(() => ({ title: row.option.label, rows: tipRows }))}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: typeColor(row.type) }} aria-hidden="true" />
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-foreground">{row.option.label}</span>
                          <span className="block truncate whitespace-nowrap text-3xs tabular-nums text-muted-foreground">
                            {works > 0
                              ? `${row.current?.visualization ?? 0} віз · ${row.current?.layout ?? 0} мак`
                              : "робіт немає"}
                          </span>
                        </span>
                      </div>
                      <div className="relative h-7">
                        <div className="absolute inset-0 flex justify-between" aria-hidden="true">
                          {[0, 1, 2, 3, 4].map((line) => (
                            <span key={line} className="w-px bg-foreground/5" />
                          ))}
                        </div>
                        {works > 0 ? (
                          <div
                            className="absolute top-1 h-3.5 rounded-r"
                            style={{ width: `${currentWidth}%`, background: typeColor(row.type) }}
                          />
                        ) : null}
                        {prevWorks > 0 ? (
                          <div
                            className="absolute top-[19px] h-1.5 rounded-r opacity-30"
                            style={{ width: `${compareWidth}%`, background: typeColor(row.type) }}
                            aria-hidden="true"
                          />
                        ) : null}
                        {row.peers.map((peer) => (
                          <span
                            key={peer.designer.id}
                            className="absolute inset-y-0 flex -translate-x-1/2 cursor-help items-center"
                            style={{ left: `${Math.min(100, (peer.value / countScaleMax) * 100)}%` }}
                            {...bindTip(() => ({
                              title: `${peer.designer.label} · ${row.option.label}`,
                              rows: [{ color: typeColor(row.type), label: "Зроблено", value: `${peer.value} робіт`, strong: true }],
                            }))}
                          >
                            <span className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-foreground/45" aria-hidden="true" />
                            <AvatarBase
                              src={getMemberAvatar(peer.designer.id)}
                              name={peer.designer.label}
                              fallback={getInitials(peer.designer.label)}
                              size={18}
                              className="relative z-10 shrink-0 ring-2 ring-background"
                              inactive={memberInactiveById[peer.designer.id] ?? false}
                            />
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-foreground">
                          {works}
                        </span>
                        {works > 0 || prevWorks > 0 ? (
                          <DeltaChip
                            current={works}
                            previous={prevIdx == null ? null : prevWorks}
                            lowerBetter={false}
                            format={(value) => `${Math.round(value)}`}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {/* Роботи в задачах без типу: інакше сума рядків не сходилася б
                    із блоком норм — а це перше, що перевіряють очима. */}
                {(currentAgg?.worksByType.none.works ?? 0) > 0 ? (
                  <div className="grid items-center gap-3 py-2.5 sm:grid-cols-[210px_minmax(0,1fr)_170px]">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-muted-foreground/40" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-muted-foreground">Без типу</span>
                        <span className="block truncate whitespace-nowrap text-3xs tabular-nums text-muted-foreground">
                          {currentAgg?.worksByType.none.visualization ?? 0} віз ·{" "}
                          {currentAgg?.worksByType.none.layout ?? 0} мак
                        </span>
                      </span>
                    </div>
                    <div className="relative h-7">
                      <div
                        className="absolute top-1 h-3.5 rounded-r bg-muted-foreground/30"
                        style={{
                          width: `${Math.max(2, ((currentAgg?.worksByType.none.works ?? 0) / countScaleMax) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center sm:justify-end">
                      <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
                        {currentAgg?.worksByType.none.works ?? 0}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/60 bg-background/70 p-5">
          {scopedDesigner ? (
            <>
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                Динаміка — {firstName(scopedDesigner.label)}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Годин у таймері за місяць, у розрізі типів.</p>
              {(() => {
                const rows = analytics.perDesigner.get(scopedDesigner.id) ?? [];
                const maxSeconds = Math.max(1, ...rows.map((agg) => agg.trackedSeconds)) * 1.15;
                return (
                  <div className="mt-4">
                    <div className="grid h-40 grid-flow-col items-end gap-3">
                      {rows.map((agg, index) => {
                        const total = agg.trackedSeconds;
                        const buildTip = (): TipModel => {
                          const typeRowsTip: TipRow[] = DESIGN_TASK_TYPE_OPTIONS.filter(
                            (option) => agg.secondsByType[option.value] > 0
                          ).map((option) => ({
                            color: typeColor(option.value),
                            label: TYPE_SHORT[option.value],
                            value: formatHumanSeconds(agg.secondsByType[option.value]),
                          }));
                          if (agg.secondsByType.none > 0) {
                            typeRowsTip.push({ label: "Без типу", value: formatHumanSeconds(agg.secondsByType.none), muted: true });
                          }
                          if (typeRowsTip.length === 0) {
                            typeRowsTip.push({ label: "Немає активності таймера", value: "—", muted: true });
                          } else {
                            typeRowsTip.push({ label: "Разом", value: `${formatHours(total)} год`, strong: true });
                          }
                          return {
                            title: monthTitle(months[index].value),
                            rows: typeRowsTip,
                            note: `${agg.timerTaskCount} задач у таймері`,
                          };
                        };
                        return (
                          <div
                            key={months[index].value}
                            className="flex h-full min-w-0 cursor-help flex-col items-center justify-end gap-1.5"
                            {...bindTip(buildTip)}
                          >
                            <span className="text-3xs font-semibold tabular-nums text-muted-foreground">
                              {formatHours(total)}
                            </span>
                            <div className="flex w-full max-w-[42px] flex-col-reverse gap-0.5" style={{ height: `${(total / maxSeconds) * 100}%` }}>
                              {DESIGN_TASK_TYPE_OPTIONS.map((option) => {
                                const seconds = agg.secondsByType[option.value];
                                if (seconds <= 0 || total <= 0) return null;
                                return (
                                  <span
                                    key={option.value}
                                    className="block w-full min-h-[3px] first:rounded-b last:rounded-t"
                                    style={{ height: `${(seconds / total) * 100}%`, background: typeColor(option.value) }}
                                  />
                                );
                              })}
                            </div>
                            <span className={cn("text-3xs", index === mi ? "font-semibold text-primary" : "text-muted-foreground")}>
                              {monthShort(months[index].value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
                      {DESIGN_TASK_TYPE_OPTIONS.map((option) => (
                        <span key={option.value} className="inline-flex items-center gap-1.5 text-3xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-sm" style={{ background: typeColor(option.value) }} aria-hidden="true" />
                          {TYPE_SHORT[option.value]}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  Баланс команди
                </h3>
                <span className="text-2xs text-muted-foreground">зараз</span>
              </div>
              <div className="mt-2 divide-y divide-border/50">
                {balanceSorted.map((row, index) => {
                  const label = labelById.get(row.designerId) ?? row.designerId.slice(0, 8);
                  return (
                    <div key={row.designerId} className="flex items-center gap-2.5 py-2.5">
                      <AvatarBase
                        src={getMemberAvatar(row.designerId)}
                        name={label}
                        fallback={getInitials(label)}
                        size={32}
                        className="shrink-0 border-border/70"
                        inactive={memberInactiveById[row.designerId] ?? false}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold text-foreground">{label}</span>
                          {index === 0 ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-3xs font-medium text-primary">
                              <Star className="h-3 w-3" />
                              Рекомендуємо
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-3xs text-muted-foreground">{row.workload.recommendation}</div>
                      </div>
                      <span className="min-w-[22px] text-center text-sm font-semibold tabular-nums text-foreground" title="Активних задач зараз">
                        {row.workload.activeTaskCount}
                      </span>
                      <Badge variant="outline" className={cn("px-2 py-0.5 text-3xs", CAPACITY_BADGE_CLASS_BY_LEVEL[row.workload.level])}>
                        {CAPACITY_LABEL_BY_LEVEL[row.workload.level]}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ---------- таблиця: Місяць | По місяцях ---------- */}
      {visibleDesigners.length > 0 ? (
        <section className="rounded-2xl border border-border/60 bg-background/70">
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Команда
            </h3>
            <div className={cn(SEGMENTED_GROUP_SM, "ml-auto")} aria-label="Режим таблиці">
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={tableMode === "month"}
                onClick={() => setTableMode("month")}
                className={SEGMENTED_TRIGGER_SM}
              >
                Місяць
              </Button>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={tableMode === "trend"}
                onClick={() => setTableMode("trend")}
                className={SEGMENTED_TRIGGER_SM}
              >
                По місяцях
              </Button>
              <Button
                variant="segmented"
                size="xs"
                aria-pressed={tableMode === "files"}
                onClick={() => setTableMode("files")}
                className={SEGMENTED_TRIGGER_SM}
              >
                Файли
              </Button>
            </div>
            <p className="w-full text-xs text-muted-foreground">
              {tableMode === "month"
                ? "Показники за обраний місяць. Клік по рядку — профіль дизайнера."
                : tableMode === "files"
                  ? `Скільки файлів залив кожен за ${monthShort(months[mi].value)}, по розширеннях. Клік по імені — профіль.`
                  : `Динаміка «${metric.label}» за ${months.length} місяців. Клік по імені — профіль.`}
            </p>
          </div>

          {tableMode === "trend" ? (
            <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3">
              {MATRIX_METRICS.map((entry, index) => {
                const groupStart = index === 0 || MATRIX_METRICS[index - 1].group !== entry.group;
                const active = entry.key === metric.key;
                return (
                  <span key={entry.key} className="inline-flex items-center gap-1.5">
                    {groupStart ? (
                      <span className="ml-1 mr-0.5 text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">
                        {entry.group}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setMetricKey(entry.key)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors",
                        "hover:border-foreground/40 hover:text-foreground",
                        active && "border-primary bg-primary text-primary-foreground hover:border-primary hover:text-primary-foreground"
                      )}
                    >
                      {entry.type ? (
                        <span
                          className="h-2 w-2 rounded-sm"
                          style={{ background: active ? "hsl(var(--primary-foreground))" : typeColor(entry.type) }}
                          aria-hidden="true"
                        />
                      ) : null}
                      {entry.label}
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}

          <div className="overflow-x-auto px-3 pb-2 pt-2">
            {tableMode === "month" ? (
              <div className="min-w-[960px] px-2">
                <div className="grid grid-cols-[26px_minmax(190px,1.4fr)_60px_60px_78px_92px_minmax(150px,1fr)_22px] items-center gap-3 border-b border-border/50 px-2 py-2 text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80">
                  <span>#</span>
                  <span>Дизайнер</span>
                  <span title="Усі задачі / з них із таймером">У роботі</span>
                  <span>Роботи</span>
                  <span>Час</span>
                  <span>⌀ / задачу</span>
                  <span>Структура часу</span>
                  <span />
                </div>
                {monthRows.map((designer, index) => {
                  const agg = analytics.perDesigner.get(designer.id)?.[mi];
                  if (!agg) return null;
                  const avg = avgSecondsPerTask(agg);
                  const structureTotal = agg.trackedSeconds;
                  const selected = scope === designer.id;
                  return (
                    <button
                      key={designer.id}
                      type="button"
                      onClick={() => selectScope(selected ? "team" : designer.id)}
                      className={cn(
                        "grid w-full cursor-pointer grid-cols-[26px_minmax(190px,1.4fr)_60px_60px_78px_92px_minmax(150px,1fr)_22px] items-center gap-3 rounded-xl border border-transparent px-2 py-2.5 text-left transition-colors",
                        "hover:bg-muted/10",
                        selected && "border-primary/25 bg-primary/5 hover:bg-primary/5"
                      )}
                    >
                      <span className={cn("text-center text-xs font-semibold", index === 0 ? "text-warning-foreground" : "text-muted-foreground/70")}>
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <AvatarBase
                          src={getMemberAvatar(designer.id)}
                          name={designer.label}
                          fallback={getInitials(designer.label)}
                          size={34}
                          className="shrink-0 border-border/70"
                          inactive={memberInactiveById[designer.id] ?? false}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-foreground">{designer.label}</span>
                          <span className="text-3xs text-muted-foreground">
                            {agg.works} робіт · {agg.files} файлів
                            {agg.tasksClosed > 0 ? ` · ${agg.tasksClosed} закрито` : ""}
                          </span>
                        </span>
                      </span>
                      {/* Те саме число, що в KPI «Задач у роботі»: усі задачі, яких
                          торкались. Показувати тут лише таймерні означало б дві
                          різні цифри під однією назвою на одному екрані. */}
                      <span
                        className="text-[13px] font-semibold tabular-nums text-foreground"
                        title={`${agg.tasksTouched} задач, з них ${agg.timerTaskCount} із таймером`}
                      >
                        {agg.tasksTouched}
                        {agg.tasksTouched > agg.timerTaskCount ? (
                          <span className="text-3xs font-medium text-muted-foreground"> / {agg.timerTaskCount}</span>
                        ) : null}
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">{agg.works}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">
                        {formatHours(agg.trackedSeconds)}
                        <span className="text-3xs font-medium text-muted-foreground"> год</span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">{avg == null ? "—" : formatHM(avg)}</span>
                      <span
                        className={cn("flex h-3 gap-0.5 overflow-hidden rounded", structureTotal > 0 && "cursor-help")}
                        {...(structureTotal > 0
                          ? bindTip(() => ({
                              title: designer.label,
                              rows: DESIGN_TASK_TYPE_OPTIONS.filter((option) => agg.secondsByType[option.value] > 0).map((option) => ({
                                color: typeColor(option.value),
                                label: TYPE_SHORT[option.value],
                                value: `${formatHumanSeconds(agg.secondsByType[option.value])} · ${Math.round((agg.secondsByType[option.value] / structureTotal) * 100)}%`,
                              })),
                              note: `Разом ${formatHours(structureTotal)} год у ${monthShort(months[mi].value)}`,
                            }))
                          : {})}
                      >
                        {structureTotal > 0 ? (
                          DESIGN_TASK_TYPE_OPTIONS.map((option) => {
                            const seconds = agg.secondsByType[option.value];
                            if (seconds <= 0) return null;
                            return (
                              <span
                                key={option.value}
                                className="h-full first:rounded-l last:rounded-r"
                                style={{ width: `${(seconds / structureTotal) * 100}%`, background: typeColor(option.value) }}
                              />
                            );
                          })
                        ) : (
                          <span className="h-full w-full rounded bg-muted/40" aria-hidden="true" />
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                    </button>
                  );
                })}
              </div>
            ) : tableMode === "trend" ? (
              <table className="w-full min-w-[860px] border-separate border-spacing-0.5">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-left text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80">Дизайнер</th>
                    {months.map((month, index) => (
                      <th
                        key={month.value}
                        className={cn(
                          "px-2 py-1.5 text-center text-3xs font-semibold uppercase tracking-caps",
                          index === mi ? "text-primary" : "text-muted-foreground/80"
                        )}
                      >
                        {monthShort(month.value)}
                        {index === mi ? " •" : ""}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-center text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80">
                      Δ {months.length} міс
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map((designer) => {
                    const rows = analytics.perDesigner.get(designer.id);
                    if (!rows) return null;
                    const firstValue = metric.get(rows[0]);
                    const lastValue = metric.get(rows[rows.length - 1]);
                    const trendPct =
                      firstValue != null && lastValue != null && firstValue !== 0
                        ? Math.round(((lastValue - firstValue) / firstValue) * 100)
                        : null;
                    const trendGood = trendPct == null ? null : metric.lowerBetter ? trendPct < 0 : trendPct > 0;
                    const selected = scope === designer.id;
                    return (
                      <tr key={designer.id}>
                        <td className="pr-1">
                          <button
                            type="button"
                            onClick={() => selectScope(selected ? "team" : designer.id)}
                            className={cn(
                              "flex w-full min-w-[170px] cursor-pointer items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors hover:bg-muted/10",
                              selected && "border-primary/25 bg-primary/5"
                            )}
                          >
                            <AvatarBase
                              src={getMemberAvatar(designer.id)}
                              name={designer.label}
                              fallback={getInitials(designer.label)}
                              size={28}
                              className="shrink-0 border-border/70"
                              inactive={memberInactiveById[designer.id] ?? false}
                            />
                            <span className="truncate text-xs font-semibold text-foreground">{designer.label}</span>
                          </button>
                        </td>
                        {rows.map((agg, index) => {
                          const value = metric.get(agg);
                          const prevValue = index > 0 ? metric.get(rows[index - 1]) : null;
                          return (
                            <td key={months[index].value}>
                              {value == null ? (
                                <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border/60 text-2xs text-muted-foreground/70">
                                  —
                                </div>
                              ) : (
                                <div
                                  className="flex h-10 cursor-help items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums transition-transform hover:scale-[1.04] hover:shadow-[var(--shadow-menu)]"
                                  style={{
                                    background: `hsl(var(--heat-${heatBucket(value)}))`,
                                    color: `hsl(var(--heat-ink-${heatBucket(value)}))`,
                                  }}
                                  {...bindTip(() => {
                                    const tipRows: TipRow[] = [
                                      { color: metric.type ? typeColor(metric.type) : "hsl(var(--chart-1))", label: metric.label, value: metric.formatLong(value), strong: true },
                                    ];
                                    if (prevValue != null) {
                                      const d = value - prevValue;
                                      tipRows.push({
                                        label: `проти ${monthShort(months[index - 1].value)}`,
                                        value: `${d >= 0 ? "+" : "−"}${metric.format(Math.abs(d))}`,
                                        muted: true,
                                      });
                                    }
                                    return { title: `${designer.label} · ${monthTitle(months[index].value)}`, rows: tipRows };
                                  })}
                                >
                                  {metric.format(value)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td>
                          <div className="flex h-10 items-center justify-center">
                            {trendPct == null ? (
                              <span className="text-2xs text-muted-foreground/70">—</span>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold",
                                  trendPct === 0 ? DELTA_CLASS.flat : trendGood ? DELTA_CLASS.good : DELTA_CLASS.bad
                                )}
                              >
                                {trendPct > 0 ? <TrendingUp className="h-3 w-3" /> : trendPct < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                {trendPct > 0 ? "+" : ""}
                                {trendPct}%
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Командний підсумок — лише для тих, хто бачить усіх: інакше він
                      арифметично розкриває колегу (колега = 2×команда − я). */}
                  {canSeeAll ? (
                    <tr>
                      <td className="pr-1">
                        <div className="flex min-w-[170px] items-center gap-2 px-1.5 py-1">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/30 text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate text-xs font-semibold text-muted-foreground">
                            Команда · {metric.teamAgg === "sum" ? "разом" : "середнє"}
                          </span>
                        </div>
                      </td>
                      {months.map((month, index) => {
                        const teamAgg = analytics.team[index];
                        const value = teamAgg ? metric.get(teamAgg) : null;
                        return (
                          <td key={month.value}>
                            <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border/70 text-[13px] font-semibold tabular-nums text-muted-foreground">
                              {value == null ? "—" : metric.format(value)}
                            </div>
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : filesRows.length === 0 ? (
              <div className="mx-2 rounded-section border border-dashed border-border/60 bg-muted/5 px-4 py-10 text-center text-sm text-muted-foreground">
                За {monthShort(months[mi].value)} немає завантажених файлів.
              </div>
            ) : (
              <table className="w-full min-w-[720px] border-separate border-spacing-0.5">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-left text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80">Дизайнер</th>
                    {fileExtColumns.map((ext) => (
                      <th key={ext} className="px-2 py-1.5 text-center text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80">
                        {ext}
                      </th>
                    ))}
                    {hasOtherExts ? (
                      <th className="px-2 py-1.5 text-center text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80">Інші</th>
                    ) : null}
                    <th className="px-2 py-1.5 text-center text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80">Всього</th>
                    <th className="px-2 py-1.5 text-left text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80" style={{ minWidth: 130 }}>
                      Вид
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filesRows.map(({ designer, agg }) => {
                    const selected = scope === designer.id;
                    const heatCell = (value: number, label: string) => {
                      const bucket = filesHeatBucket(value);
                      if (bucket < 0) {
                        return (
                          <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border/60 text-2xs text-muted-foreground/50">
                            ·
                          </div>
                        );
                      }
                      return (
                        <div
                          className="flex h-10 cursor-help items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums transition-transform hover:scale-[1.04] hover:shadow-[var(--shadow-menu)]"
                          style={{ background: `hsl(var(--heat-${bucket}))`, color: `hsl(var(--heat-ink-${bucket}))` }}
                          {...bindTip(() => ({
                            title: `${designer.label} · ${label}`,
                            rows: [{ label: "Файлів", value: `${value}`, strong: true }],
                          }))}
                        >
                          {value}
                        </div>
                      );
                    };
                    return (
                      <tr key={designer.id}>
                        <td className="pr-1">
                          <button
                            type="button"
                            onClick={() => selectScope(selected ? "team" : designer.id)}
                            className={cn(
                              "flex w-full min-w-[170px] cursor-pointer items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors hover:bg-muted/10",
                              selected && "border-primary/25 bg-primary/5"
                            )}
                          >
                            <AvatarBase
                              src={getMemberAvatar(designer.id)}
                              name={designer.label}
                              fallback={getInitials(designer.label)}
                              size={28}
                              className="shrink-0 border-border/70"
                              inactive={memberInactiveById[designer.id] ?? false}
                            />
                            <span className="truncate text-xs font-semibold text-foreground">{designer.label}</span>
                          </button>
                        </td>
                        {fileExtColumns.map((ext) => (
                          <td key={ext}>{heatCell(agg.filesByExt[ext] ?? 0, ext)}</td>
                        ))}
                        {hasOtherExts ? <td>{heatCell(otherFiles(agg), "Інші формати")}</td> : null}
                        <td>
                          <div className="flex h-10 items-center justify-center rounded-lg text-[13px] font-bold tabular-nums text-foreground">
                            {agg.files}
                          </div>
                        </td>
                        <td>
                          <div className="flex h-10 items-center px-1">
                            <span
                              className="flex h-2.5 w-full cursor-help gap-0.5 overflow-hidden rounded"
                              {...bindTip(() => {
                                const kindRows: TipRow[] = FILE_KIND_META.map((kind) => ({
                                  color: kind.color,
                                  label: kind.label,
                                  value: `${agg.filesByKind[kind.key]}`,
                                }));
                                kindRows.push({ label: "Разом", value: `${agg.files}`, strong: true });
                                return { title: designer.label, rows: kindRows };
                              })}
                            >
                              {FILE_KIND_META.map((kind) =>
                                agg.filesByKind[kind.key] > 0 ? (
                                  <span
                                    key={kind.key}
                                    className="h-full first:rounded-l last:rounded-r"
                                    style={{ width: `${(agg.filesByKind[kind.key] / agg.files) * 100}%`, background: kind.color }}
                                  />
                                ) : null
                              )}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {canSeeAll ? (
                    <tr>
                      <td className="pr-1">
                        <div className="flex min-w-[170px] items-center gap-2 px-1.5 py-1">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/30 text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate text-xs font-semibold text-muted-foreground">Команда · разом</span>
                        </div>
                      </td>
                      {fileExtColumns.map((ext) => (
                        <td key={ext}>
                          <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border/70 text-[13px] font-semibold tabular-nums text-muted-foreground">
                            {teamFilesByExt(ext) || "—"}
                          </div>
                        </td>
                      ))}
                      {hasOtherExts ? (
                        <td>
                          <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border/70 text-[13px] font-semibold tabular-nums text-muted-foreground">
                            {filesRows.reduce((sum, { agg }) => sum + otherFiles(agg), 0) || "—"}
                          </div>
                        </td>
                      ) : null}
                      <td>
                        <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border/70 text-[13px] font-bold tabular-nums text-muted-foreground">
                          {teamFilesTotal}
                        </div>
                      </td>
                      <td />
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 px-5 py-3">
            {tableMode === "month" ? (
              <>
                <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">Типи:</span>
                {DESIGN_TASK_TYPE_OPTIONS.map((option) => (
                  <span key={option.value} className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
                    <span className="h-2 w-3.5 rounded-sm" style={{ background: typeColor(option.value) }} aria-hidden="true" />
                    {TYPE_SHORT[option.value]}
                  </span>
                ))}
              </>
            ) : tableMode === "files" ? (
              <>
                <span className="text-2xs text-muted-foreground">Темніше — більше файлів</span>
                <span className="flex h-2.5 w-40 overflow-hidden rounded-full" aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5, 6].map((step) => (
                    <span key={step} className="h-full flex-1" style={{ background: `hsl(var(--heat-${step}))` }} />
                  ))}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">Вид:</span>
                  {FILE_KIND_META.map((kind) => (
                    <span key={kind.key} className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
                      <span className="h-2 w-3.5 rounded-sm" style={{ background: kind.color }} aria-hidden="true" />
                      {kind.label}
                    </span>
                  ))}
                </span>
              </>
            ) : (
              <>
                <span className="text-2xs text-muted-foreground">
                  {metric.lowerBetter ? "Темніше — довше (більше часу на задачу)" : "Темніше — більше"}
                </span>
                <span className="flex h-2.5 w-40 overflow-hidden rounded-full" aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5, 6].map((step) => (
                    <span key={step} className="h-full flex-1" style={{ background: `hsl(var(--heat-${step}))` }} />
                  ))}
                </span>
                {matrixValues.length ? (
                  <span className="text-2xs tabular-nums text-muted-foreground">
                    {metric.format(matrixMin)} → {metric.format(matrixMax)}
                  </span>
                ) : null}
                <span className="ml-auto text-2xs text-muted-foreground">
                  Δ — {monthShort(months[months.length - 1].value)} проти {monthShort(months[0].value)}
                  {metric.lowerBetter ? " · для часу «менше» = краще" : ""}
                </span>
              </>
            )}
          </div>
        </section>
      ) : null}

      {/* ---------- роботи ---------- */}
      {scopedDesigner ? (
        <section className="rounded-2xl border border-border/60 bg-background/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <FileText className="h-4 w-4 text-primary" />
              Роботи — {firstName(scopedDesigner.label)}, {monthShort(months[mi].value)} {months[mi].year}
            </h3>
            <span className="text-2xs tabular-nums text-muted-foreground">
              {worksList.length} задач · {worksList.reduce((sum, group) => sum + group.files.length, 0)} файлів
              {worksUntimed > 0 ? ` · ${worksUntimed} без таймера` : ""}
            </span>
          </div>
          {/* Фільтр з'являється лише коли є що фільтрувати: якщо таймер вівся
              скрізь, три кнопки просто шумлять. */}
          {(worksUntimed > 0 && worksTimed > 0) || worksStuck > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: "all" as const, label: "Усі", count: worksList.length },
                  { key: "timed" as const, label: "З таймером", count: worksTimed },
                  { key: "untimed" as const, label: "Без таймера", count: worksUntimed },
                  // Аномалію показуємо, лише якщо вона є — це не постійна вкладка.
                  ...(worksStuck > 0 ? [{ key: "stuck" as const, label: "Забутий таймер", count: worksStuck }] : []),
                ]
              ).map((option) => {
                const active = worksFilter === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setWorksFilter(option.key);
                      setWorksExpanded(false);
                    }}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {option.key === "untimed" ? <TimerOff className="h-3 w-3" /> : null}
                    {option.key === "stuck" ? <AlertTriangle className="h-3 w-3" /> : null}
                    {option.label}
                    <span className="tabular-nums opacity-70">{option.count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {worksList.length === 0 ? (
            <div className="mt-3 rounded-section border border-dashed border-border/60 bg-muted/5 px-4 py-8 text-center text-sm text-muted-foreground">
              За цей місяць немає завантажених файлів.
            </div>
          ) : (
            <>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {worksVisible.map((group) => {
                  const TypeIcon = group.designTaskType ? DESIGN_TASK_TYPE_ICONS[group.designTaskType] : null;
                  return (
                    <div
                      key={group.taskId}
                      className="relative rounded-section border border-border/60 bg-card/70 p-3.5 transition-colors hover:border-primary/30"
                    >
                      <Link
                        to={`/design/${group.taskId}`}
                        className="absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary"
                        title={`Відкрити задачу ${group.taskNumber ?? ""}`.trim()}
                        aria-label="Відкрити задачу"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                      {group.taskNumber ? (
                        <div className="text-3xs font-medium tabular-nums text-muted-foreground/80">{group.taskNumber}</div>
                      ) : null}
                      <div className="pr-8 text-[13px] font-semibold leading-snug text-foreground">
                        {group.title ?? "Задача без назви"}
                      </div>
                      {group.customerName ? (
                        <div className="truncate text-xs text-muted-foreground">{group.customerName}</div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {group.designTaskType && TypeIcon ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-soft-border bg-neutral-soft px-2 py-0.5 text-3xs font-medium text-neutral-foreground">
                            <span className="h-2 w-2 rounded-sm" style={{ background: typeColor(group.designTaskType) }} aria-hidden="true" />
                            {TYPE_SHORT[group.designTaskType]}
                          </span>
                        ) : null}
                        {group.taskTrackedSeconds > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-soft-border bg-neutral-soft px-2 py-0.5 text-3xs font-medium tabular-nums text-neutral-foreground">
                            <Timer className="h-3 w-3" />
                            {formatHumanSeconds(group.taskTrackedSeconds)}
                          </span>
                        ) : (
                          /* Не жовтим: таймер не вівся — це прогалина в обліку,
                             а не аварія. Але позначка мусить бути, інакше така
                             картка виглядає як задача без роботи. */
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/70 bg-background/40 px-2 py-0.5 text-3xs font-medium text-muted-foreground"
                            title="Таймер не вівся — ця задача не входить у середній час і структуру часу"
                          >
                            <TimerOff className="h-3 w-3" />
                            без таймера
                          </span>
                        )}
                        {group.revisions > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-soft-border bg-neutral-soft px-2 py-0.5 text-3xs font-medium tabular-nums text-neutral-foreground">
                            <RotateCcw className="h-3 w-3" />
                            {group.revisions} {revisionsWord(group.revisions)}
                          </span>
                        ) : null}
                        {isStuckTimer(group) ? (
                          /* Ось це вже червоне: незупинена сесія на закритій
                             задачі — не стиль роботи, а зламаний облік часу. */
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold",
                              group.timerRunning && group.taskClosed
                                ? "border-danger-soft-border bg-danger-soft text-danger-foreground"
                                : "border-warning-soft-border bg-warning-soft text-warning-foreground"
                            )}
                            title={
                              group.timerRunning
                                ? group.taskClosed
                                  ? "Задача закрита, а таймер досі йде — час рахується далі"
                                  : "Таймер досі йде"
                                : `Сесія тривала ${formatHumanSeconds(group.longestSessionSeconds)} — у розрахунку обрізана до 8 год`
                            }
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {group.timerRunning ? "таймер іде" : "забутий таймер"}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {group.files.slice(0, 8).map((file) => {
                          const isImage =
                            PREVIEWABLE_EXTS.has(file.ext) && !!file.storageBucket && !!file.storagePath && !file.deleted;
                          return isImage ? (
                            <StorageObjectImage
                              key={file.id}
                              bucket={file.storageBucket}
                              path={file.storagePath}
                              alt={file.fileName}
                              variant="thumb"
                              hoverPreview
                              className="h-10 w-10 shrink-0 rounded-md border border-border/60 bg-muted/30"
                            />
                          ) : (
                            <span
                              key={file.id}
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/25 text-3xs font-semibold uppercase text-muted-foreground",
                                file.deleted && "opacity-60 line-through"
                              )}
                              title={file.deleted ? `${file.fileName} · видалено пізніше` : file.fileName}
                            >
                              {file.ext.slice(0, 4)}
                            </span>
                          );
                        })}
                        {group.files.length > 8 ? (
                          <span className="flex h-10 items-center rounded-md border border-border/60 bg-muted/25 px-2 text-3xs font-medium tabular-nums text-muted-foreground">
                            +{group.files.length - 8}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              {worksFiltered.length > WORKS_PREVIEW ? (
                <div className="mt-3 flex justify-center">
                  <Button variant="outline" size="sm" onClick={() => setWorksExpanded((value) => !value)}>
                    {worksExpanded ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        Згорнути
                      </>
                    ) : (
                      <>
                        <ChevronsDown className="h-3.5 w-3.5" />
                        Показати всі {worksFiltered.length} задач
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {/* ---------- джерела ---------- */}
      <p className="px-1 pb-2 text-2xs leading-relaxed text-muted-foreground/80">
        Дані: середні й час рахуємо за таймером задач (сесія довша за 8 год обрізається — забутий таймер) ·
        «закрито» = переведення в «Затверджено» · файли — всі завантаження за місяць, включно з видаленими згодом ·
        середній час типу = час у таймері на задачах типу ÷ кількість таких задач у таймері.
      </p>

      {tipOverlay}

      {/* Друкований звіт: на екрані прихований (.print-portal), при друку — єдине,
          що йде на папір. Портал на body, щоб print-CSS міг сховати весь застосунок. */}
      {canSeeAll && typeof document !== "undefined"
        ? createPortal(
            <div className="print-portal">
              <DesignersPrintReport
                analytics={analytics}
                monthIndex={mi}
                designers={visibleDesigners}
                variant={printVariant}
                normPlans={normPlans}
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

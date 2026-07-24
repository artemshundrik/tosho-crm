import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronsDown,
  ChevronUp,
  Clock,
  FileText,
  Minus,
  RotateCcw,
  Star,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineLoading } from "@/components/app/loading-primitives";
import { AvatarBase } from "@/components/app/avatar-kit";
import { StorageObjectImage } from "@/components/app/StorageObjectImage";
import { SEGMENTED_GROUP_SM, SEGMENTED_TRIGGER_SM } from "@/components/ui/controlStyles";
import {
  DESIGN_TASK_TYPE_ICONS,
  DESIGN_TASK_TYPE_OPTIONS,
  type DesignTaskType,
} from "@/lib/designTaskType";
import {
  avgSecondsForType,
  avgSecondsPerTask,
  estimateHitPercent,
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

/* ---------- формат ---------- */

const formatHM = (seconds: number) => {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
};

const formatHumanMinutes = (totalMinutesRaw: number) => {
  const totalMinutes = Math.round(totalMinutesRaw);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} хв`;
  if (minutes === 0) return `${hours} год`;
  return `${hours} год ${minutes} хв`;
};

const formatHumanSeconds = (seconds: number) => formatHumanMinutes(seconds / 60);

const formatHours = (seconds: number) => `${Math.round(seconds / 3600)}`;

const getInitials = (name?: string | null) => {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "•";
};

const firstName = (label: string) => label.trim().split(/\s+/)[0] || label;

const revisionsWord = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "правка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "правки";
  return "правок";
};

const monthTitle = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  const label = date.toLocaleDateString("uk-UA", { month: "long", timeZone: "UTC" });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${year}`;
};

const monthShort = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  return date.toLocaleDateString("uk-UA", { month: "short", timeZone: "UTC" }).replace(".", "");
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
  { key: "layout", label: "Макет", color: "hsl(var(--success-foreground))" },
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
      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold", DELTA_CLASS.flat)}>
        <Minus className="h-3 w-3" />
        немає бази
      </span>
    );
  }
  const diff = current - previous;
  if (Math.abs(diff) < 0.001) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold", DELTA_CLASS.flat)}>
        <Minus className="h-3 w-3" />
        без змін
      </span>
    );
  }
  const up = diff > 0;
  const tone: DeltaTone = (lowerBetter ? !up : up) ? "good" : "bad";
  const Icon = up ? TrendingUp : TrendingDown;
  const word = lowerBetter ? (up ? upWord ?? "повільніше" : downWord ?? "швидше") : up ? upWord ?? "більше" : downWord ?? "менше";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold", DELTA_CLASS[tone])}>
      <Icon className="h-3 w-3" />
      {up ? "+" : "−"}
      {format(Math.abs(diff))} · {word}
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
      <path d={area} fill="hsl(var(--primary))" opacity={0.1} />
      <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.6} fill="hsl(var(--primary))" />
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
    get: (agg) => agg.timerTaskCount,
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

/* ---------- компонент ---------- */

export function DesignersDashboard({
  teamId,
  currentUserId,
  canSeeAll,
  designers,
  memberInactiveById,
  getMemberAvatar,
}: DesignersDashboardProps) {
  const [analytics, setAnalytics] = useState<DesignerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [monthIdx, setMonthIdx] = useState<number | null>(null);
  const [scope, setScope] = useState<string>("team");
  const [tableMode, setTableMode] = useState<"month" | "trend">("month");
  const [metricKey, setMetricKey] = useState<string>("avg_visualization");
  const [worksExpanded, setWorksExpanded] = useState(false);
  const { bind: bindTip, overlay: tipOverlay } = useChartTooltip();

  const visibleDesigners = useMemo(
    () => (canSeeAll ? designers : designers.filter((designer) => designer.id === currentUserId)),
    [canSeeAll, designers, currentUserId]
  );

  useEffect(() => {
    if (!canSeeAll) {
      setScope(visibleDesigners[0]?.id ?? "team");
    }
  }, [canSeeAll, visibleDesigners]);

  useEffect(() => {
    let cancelled = false;
    if (!teamId || designers.length === 0) {
      setAnalytics(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setLoadError(false);
    loadDesignerAnalytics({ teamId, designerIds: designers.map((designer) => designer.id) })
      .then((result) => {
        if (cancelled) return;
        setAnalytics(result);
        setMonthIdx((current) => current ?? result.months.length - 1);
      })
      .catch((error) => {
        console.warn("Failed to load designer analytics", error);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, designers]);

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

  if (loading) {
    return (
      <div className="px-4 pt-6 pb-4 sm:px-5">
        <InlineLoading label="Рахуємо аналітику дизайнерів..." />
      </div>
    );
  }

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
      // Первинний обсяг = задачі, над якими дизайнер працював (таймер), а не approved:
      // закриття роблять PM/клієнт і часто = 0, тому «закрито» лишається вторинним підписом.
      label: "Задач у роботі",
      icon: Target,
      value: `${currentAgg?.timerTaskCount ?? 0}`,
      sub: `${currentAgg?.tasksClosed ?? 0} закрито`,
      delta: (
        <DeltaChip
          current={currentAgg?.timerTaskCount ?? null}
          previous={previousAgg?.timerTaskCount ?? null}
          lowerBetter={false}
          format={(diff) => `${Math.round(diff)}`}
        />
      ),
      series: kpiSeries((agg) => agg.timerTaskCount),
      seriesFmt: (value) => `${value} задач`,
    },
    {
      label: "Файлів залито",
      icon: FileText,
      value: `${currentAgg?.files ?? 0}`,
      delta: (
        <DeltaChip
          current={currentAgg?.files ?? null}
          previous={previousAgg?.files ?? null}
          lowerBetter={false}
          format={(diff) => `${Math.round(diff)}`}
        />
      ),
      series: kpiSeries((agg) => agg.files),
      seriesFmt: (value) => `${value} файлів`,
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

  /* ---------- середній час за типами ---------- */
  const teamAggCurrent = analytics.team[mi] ?? null;
  const typeRows = DESIGN_TASK_TYPE_OPTIONS.map((option) => {
    const type = option.value;
    const current = currentAgg ? avgSecondsForType(currentAgg, type) : null;
    const compare = scopedDesigner
      ? teamAggCurrent
        ? avgSecondsForType(teamAggCurrent, type)
        : null
      : previousAgg
        ? avgSecondsForType(previousAgg, type)
        : null;
    const taskCount = currentAgg?.timerTaskCountByType[type] ?? 0;
    return { type, option, current, compare, taskCount };
  });
  const typeScaleMax = Math.max(
    1,
    ...typeRows.flatMap((row) => [row.current ?? 0, row.compare ?? 0])
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

  const hitTone = (value: number) =>
    value >= 85
      ? "border-success-soft-border bg-success-soft text-success-foreground"
      : value >= 70
        ? "border-warning-soft-border bg-warning-soft text-warning-foreground"
        : "border-danger-soft-border bg-danger-soft text-danger-foreground";

  /* ---------- роботи ---------- */
  const WORKS_PREVIEW = 8;
  const worksList: DesignerWorkGroup[] = scopedDesigner
    ? analytics.works.get(`${scopedDesigner.id}:${mi}`) ?? []
    : [];
  const worksVisible = worksExpanded ? worksList : worksList.slice(0, WORKS_PREVIEW);

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
            {isCurrentMonth ? (
              <span className="hidden items-center gap-1.5 rounded-full border border-warning-soft-border bg-warning-soft px-2.5 py-1 text-3xs font-medium text-warning-foreground sm:inline-flex">
                <CalendarIcon className="h-3 w-3" />
                поточний місяць
              </span>
            ) : null}
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
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">Вся команда</span>
              <span aria-hidden="true">·</span>
              <span>{visibleDesigners.length} дизайнерів</span>
              <span aria-hidden="true">·</span>
              <span>{timerTaskCount} задач у таймері за {monthShort(months[mi].value)}</span>
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
        <div className="rounded-section border border-warning-soft-border bg-warning-soft px-4 py-2 text-xs text-warning-foreground">
          Даних дуже багато — найстаріші місяці можуть бути неповними (уперлись у ліміт вибірки).
        </div>
      ) : null}

      {/* ---------- типи + баланс/динаміка ---------- */}
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-2xl border border-border/60 bg-background/70 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              {scopedDesigner
                ? `Середній час за типами — ${firstName(scopedDesigner.label)} проти команди`
                : "Середній час на задачу — за типами"}
            </h3>
            <span className="text-2xs text-muted-foreground">
              {scopedDesigner ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-0.5 rounded-full bg-foreground/60" aria-hidden="true" />
                  середнє по команді
                </span>
              ) : (
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-4 rounded-sm bg-foreground/80" aria-hidden="true" />
                    {monthShort(months[mi].value)}
                  </span>
                  {prevIdx != null ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-4 rounded-sm bg-foreground/25" aria-hidden="true" />
                      {monthShort(months[prevIdx].value)}
                    </span>
                  ) : null}
                </span>
              )}
            </span>
            <p className="w-full text-xs text-muted-foreground">
              Час у таймері на задачах типу ÷ кількість таких задач у таймері. Задачі без таймера в середнє не входять.
            </p>
          </div>
          <div className="mt-2 divide-y divide-border/50">
            {typeRows.map((row) => {
              const Icon = DESIGN_TASK_TYPE_ICONS[row.type];
              const currentWidth = row.current == null ? 0 : Math.max(2, (row.current / typeScaleMax) * 100);
              const compareWidth = row.compare == null ? 0 : Math.max(2, (row.compare / typeScaleMax) * 100);
              const diff = row.current != null && row.compare != null ? row.current - row.compare : null;
              const compareLabel = scopedDesigner ? "Середнє по команді" : monthShort(months[prevIdx ?? mi].value);
              const tipRows: TipRow[] = [
                {
                  color: typeColor(row.type),
                  label: scopedDesigner ? firstName(scopedDesigner.label) : monthShort(months[mi].value),
                  value: row.current == null ? "—" : formatHumanSeconds(row.current),
                  strong: true,
                },
              ];
              if (row.compare != null) {
                tipRows.push({ label: compareLabel, value: formatHumanSeconds(row.compare), muted: true });
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
                      <span className="text-3xs tabular-nums text-muted-foreground">{row.taskCount} задач у таймері</span>
                    </span>
                  </div>
                  <div className="relative h-6">
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
                    {scopedDesigner ? (
                      row.compare != null ? (
                        <span
                          className="absolute inset-y-0 w-0.5 rounded-full bg-foreground/60"
                          style={{ left: `${(row.compare / typeScaleMax) * 100}%` }}
                          aria-hidden="true"
                        />
                      ) : null
                    ) : row.compare != null ? (
                      <div
                        className="absolute bottom-0 h-2 rounded-r opacity-25"
                        style={{ width: `${compareWidth}%`, background: typeColor(row.type) }}
                      />
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className="text-[13px] font-semibold tabular-nums text-foreground">
                      {row.current == null ? "—" : formatHumanSeconds(row.current)}
                    </span>
                    {diff != null ? (
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
            </div>
            <p className="w-full text-xs text-muted-foreground">
              {tableMode === "month"
                ? "Показники за обраний місяць. Клік по рядку — профіль дизайнера."
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
                <div className="grid grid-cols-[26px_minmax(190px,1.4fr)_60px_60px_78px_92px_minmax(150px,1fr)_128px_22px] items-center gap-3 border-b border-border/50 px-2 py-2 text-3xs font-semibold uppercase tracking-caps text-muted-foreground/80">
                  <span>#</span>
                  <span>Дизайнер</span>
                  <span>У роботі</span>
                  <span>Файли</span>
                  <span>Час</span>
                  <span>⌀ / задачу</span>
                  <span>Структура часу</span>
                  <span>Естімейти</span>
                  <span />
                </div>
                {monthRows.map((designer, index) => {
                  const agg = analytics.perDesigner.get(designer.id)?.[mi];
                  if (!agg) return null;
                  const avg = avgSecondsPerTask(agg);
                  const hit = estimateHitPercent(agg);
                  const structureTotal = agg.trackedSeconds;
                  const selected = scope === designer.id;
                  return (
                    <button
                      key={designer.id}
                      type="button"
                      onClick={() => selectScope(selected ? "team" : designer.id)}
                      className={cn(
                        "grid w-full cursor-pointer grid-cols-[26px_minmax(190px,1.4fr)_60px_60px_78px_92px_minmax(150px,1fr)_128px_22px] items-center gap-3 rounded-xl border border-transparent px-2 py-2.5 text-left transition-colors",
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
                            {agg.tasksClosed} закрито · {agg.files} файлів
                          </span>
                        </span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">{agg.timerTaskCount}</span>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">{agg.files}</span>
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
                      <span>
                        {hit == null ? (
                          <span className="text-3xs text-muted-foreground">без естімейтів</span>
                        ) : (
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold", hitTone(hit))}>
                            <Target className="h-3 w-3" />
                            {hit}% в естімейт
                          </span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                    </button>
                  );
                })}
              </div>
            ) : (
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
                                      { color: metric.type ? typeColor(metric.type) : "hsl(var(--primary))", label: metric.label, value: metric.formatLong(value), strong: true },
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
            </span>
          </div>
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
                        ) : null}
                        {group.revisions > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-soft-border bg-neutral-soft px-2 py-0.5 text-3xs font-medium tabular-nums text-neutral-foreground">
                            <RotateCcw className="h-3 w-3" />
                            {group.revisions} {revisionsWord(group.revisions)}
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
              {worksList.length > WORKS_PREVIEW ? (
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
                        Показати всі {worksList.length} задач
                      </>
                    )}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : (
        /* Командний аналог «Робіт»: скільки файлів залив кожен + розбивка (як старий звіт). */
        (() => {
          const rows = [...visibleDesigners]
            .map((designer) => ({ designer, agg: analytics.perDesigner.get(designer.id)?.[mi] ?? null }))
            .filter((entry): entry is { designer: (typeof visibleDesigners)[number]; agg: DesignerMonthAgg } => !!entry.agg)
            .sort((a, b) => b.agg.files - a.agg.files);
          const teamFiles = rows.reduce((sum, entry) => sum + entry.agg.files, 0);
          const withFiles = rows.filter((entry) => entry.agg.files > 0);
          return (
            <section className="rounded-2xl border border-border/60 bg-background/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                  <FileText className="h-4 w-4 text-primary" />
                  Файли за {monthShort(months[mi].value)} {months[mi].year}
                </h3>
                <span className="text-2xs tabular-nums text-muted-foreground">{teamFiles} файлів команди</span>
                <p className="w-full text-xs text-muted-foreground">
                  Скільки файлів залив кожен, з розбивкою по розширеннях і виду. Клік по рядку — профіль дизайнера.
                </p>
              </div>
              {withFiles.length === 0 ? (
                <div className="mt-3 rounded-section border border-dashed border-border/60 bg-muted/5 px-4 py-8 text-center text-sm text-muted-foreground">
                  За цей місяць немає завантажених файлів.
                </div>
              ) : (
                <div className="mt-2 divide-y divide-border/50">
                  {withFiles.map(({ designer, agg }) => {
                    const total = agg.files;
                    const exts = Object.entries(agg.filesByExt)
                      .filter(([, count]) => count > 0)
                      .sort((a, b) => b[1] - a[1]);
                    return (
                      <button
                        key={designer.id}
                        type="button"
                        onClick={() => selectScope(designer.id)}
                        className="grid w-full cursor-pointer grid-cols-1 items-center gap-x-4 gap-y-2 rounded-xl px-2 py-3 text-left transition-colors hover:bg-muted/10 sm:grid-cols-[minmax(170px,1.2fr)_64px_minmax(0,1.6fr)_150px_18px]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <AvatarBase
                            src={getMemberAvatar(designer.id)}
                            name={designer.label}
                            fallback={getInitials(designer.label)}
                            size={36}
                            className="shrink-0 border-border/70"
                            inactive={memberInactiveById[designer.id] ?? false}
                          />
                          <span className="truncate text-[13px] font-semibold text-foreground">{designer.label}</span>
                        </span>
                        <span className="text-xl font-bold tabular-nums text-foreground">
                          {total}
                          <span className="block text-3xs font-medium text-muted-foreground">файлів</span>
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          {exts.map(([ext, count]) => (
                            <span
                              key={ext}
                              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-soft-border bg-neutral-soft px-2 py-0.5 text-3xs"
                            >
                              <span className="font-semibold uppercase text-muted-foreground">{ext}</span>
                              <span className="font-semibold tabular-nums text-foreground">{count}</span>
                            </span>
                          ))}
                        </span>
                        <span className="flex flex-col gap-1.5">
                          <span
                            className="flex h-2.5 cursor-help gap-0.5 overflow-hidden rounded"
                            {...bindTip(() => {
                              const kindRows: TipRow[] = FILE_KIND_META.map((kind) => ({
                                color: kind.color,
                                label: kind.label,
                                value: `${agg.filesByKind[kind.key]}`,
                              }));
                              kindRows.push({ label: "Разом", value: `${total}`, strong: true });
                              return { title: designer.label, rows: kindRows };
                            })}
                          >
                            {FILE_KIND_META.map((kind) =>
                              agg.filesByKind[kind.key] > 0 ? (
                                <span
                                  key={kind.key}
                                  className="h-full first:rounded-l last:rounded-r"
                                  style={{ width: `${(agg.filesByKind[kind.key] / total) * 100}%`, background: kind.color }}
                                />
                              ) : null
                            )}
                          </span>
                          <span className="text-3xs text-muted-foreground">
                            Візуал {agg.filesByKind.visualization} · Макет {agg.filesByKind.layout} · Задачі {agg.filesByKind.attachment}
                          </span>
                        </span>
                        <ChevronRight className="hidden h-4 w-4 justify-self-end text-muted-foreground/60 sm:block" />
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-3">
                <span className="text-3xs font-semibold uppercase tracking-caps text-muted-foreground/70">Вид файлу:</span>
                {FILE_KIND_META.map((kind) => (
                  <span key={kind.key} className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
                    <span className="h-2 w-3.5 rounded-sm" style={{ background: kind.color }} aria-hidden="true" />
                    {kind.label}
                  </span>
                ))}
              </div>
            </section>
          );
        })()
      )}

      {/* ---------- джерела ---------- */}
      <p className="px-1 pb-2 text-2xs leading-relaxed text-muted-foreground/80">
        Дані: середні й час рахуємо за таймером задач (сесія довша за 8 год обрізається — забутий таймер) ·
        «закрито» = переведення в «Затверджено» · файли — всі завантаження за місяць, включно з видаленими згодом ·
        середній час типу = час у таймері на задачах типу ÷ кількість таких задач у таймері.
      </p>

      {tipOverlay}
    </div>
  );
}

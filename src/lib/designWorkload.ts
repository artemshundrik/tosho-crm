import type { DesignStatus } from "@/lib/designTaskStatus";

export type DesignWorkloadTask = {
  id: string;
  status: DesignStatus;
  designDeadline?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type DesignWorkloadLevel = "low" | "medium" | "high" | "critical";

export type DesignWorkloadSummary = {
  activeTaskCount: number;
  estimateMinutesTotal: number;
  effectiveMinutesTotal: number;
  inProgressCount: number;
  reviewCount: number;
  overdueCount: number;
  dueTodayCount: number;
  dueSoonCount: number;
  tasksWithoutEstimate: number;
  score: number;
  capacityPercent: number;
  level: DesignWorkloadLevel;
  queueDays: number;
  reserveMinutes: number;
  recommendation: string;
  signals: string[];
};

export const ACTIVE_DESIGN_STATUSES: DesignStatus[] = ["new", "changes", "in_progress"];

const DEFAULT_UNESTIMATED_TASK_MINUTES = 120;
const FULL_TIME_WEEKLY_CAPACITY_MINUTES = 2400;

export const getDesignTaskEstimateMinutes = (task: Pick<DesignWorkloadTask, "metadata"> | null | undefined) => {
  const raw = (task?.metadata ?? {}).estimate_minutes;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
};

const getDeadlineState = (value?: string | null) => {
  if (!value) return "none" as const;
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return "none" as const;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDeadline = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate()).getTime();
  const diffDays = Math.round((startDeadline - startToday) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue" as const;
  if (diffDays === 0) return "today" as const;
  if (diffDays <= 2) return "soon" as const;
  return "future" as const;
};

export const calculateDesignWorkload = (
  tasks: DesignWorkloadTask[],
  options?: { weeklyCapacityMinutes?: number }
): DesignWorkloadSummary => {
  const activeTasks = tasks.filter((task) => ACTIVE_DESIGN_STATUSES.includes(task.status));
  const estimateMinutesTotal = activeTasks.reduce((sum, task) => sum + (getDesignTaskEstimateMinutes(task) ?? 0), 0);
  const tasksWithoutEstimate = activeTasks.filter((task) => !getDesignTaskEstimateMinutes(task)).length;
  const effectiveMinutesTotal = activeTasks.reduce(
    (sum, task) => sum + (getDesignTaskEstimateMinutes(task) ?? DEFAULT_UNESTIMATED_TASK_MINUTES),
    0
  );
  const inProgressCount = activeTasks.filter((task) => task.status === "in_progress").length;
  const reviewCount = activeTasks.filter((task) => task.status === "pm_review" || task.status === "client_review").length;
  const overdueCount = activeTasks.filter((task) => getDeadlineState(task.designDeadline) === "overdue").length;
  const dueTodayCount = activeTasks.filter((task) => getDeadlineState(task.designDeadline) === "today").length;
  const dueSoonCount = activeTasks.filter((task) => getDeadlineState(task.designDeadline) === "soon").length;

  const rawScore =
    activeTasks.length * 7 +
    effectiveMinutesTotal / 45 +
    inProgressCount * 10 +
    reviewCount * 4 +
    overdueCount * 18 +
    dueTodayCount * 12 +
    dueSoonCount * 7 +
    tasksWithoutEstimate * 6;
  const score = Math.round(rawScore);
  const weeklyCapacityMinutes = Math.max(480, options?.weeklyCapacityMinutes ?? FULL_TIME_WEEKLY_CAPACITY_MINUTES);
  const capacityPercent = Math.max(0, Math.min(100, Math.round((rawScore / 100) * 100)));
  const queueDays = Number((effectiveMinutesTotal / 480).toFixed(1));
  const reserveMinutes = weeklyCapacityMinutes - effectiveMinutesTotal;

  let level: DesignWorkloadLevel = "low";
  if (score >= 85) level = "critical";
  else if (score >= 60) level = "high";
  else if (score >= 35) level = "medium";

  const signals: string[] = [];
  if (overdueCount > 0) signals.push(`${overdueCount} простроч.`);
  if (dueTodayCount > 0) signals.push(`${dueTodayCount} на сьогодні`);
  if (dueSoonCount > 0) signals.push(`${dueSoonCount} найближчим часом`);
  if (tasksWithoutEstimate > 0) signals.push(`${tasksWithoutEstimate} без estimate`);
  if (inProgressCount > 0) signals.push(`${inProgressCount} в роботі`);
  if (signals.length === 0) {
    signals.push(activeTasks.length === 0 ? "черга порожня" : `${activeTasks.length} активн. задач`);
  }

  const recommendation =
    activeTasks.length === 0
      ? "Можна ставити термінову задачу"
      : level === "low"
        ? "Є хороший запас"
        : level === "medium"
          ? "Можна ставити планову задачу"
          : level === "high"
            ? "Лише якщо задача справді пріоритетна"
            : "Нові задачі краще не давати";

  return {
    activeTaskCount: activeTasks.length,
    estimateMinutesTotal,
    effectiveMinutesTotal,
    inProgressCount,
    reviewCount,
    overdueCount,
    dueTodayCount,
    dueSoonCount,
    tasksWithoutEstimate,
    score,
    capacityPercent,
    level,
    queueDays,
    reserveMinutes,
    recommendation,
    signals,
  };
};

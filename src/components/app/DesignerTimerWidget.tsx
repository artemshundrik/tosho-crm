import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ExternalLink,
  GripVertical,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Timer,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppDropdown } from "@/components/app/AppDropdown";
import { Button } from "@/components/ui/button";
import { DESIGN_STATUS_LABELS } from "@/lib/designTaskStatus";
import { cn } from "@/lib/utils";
import {
  DESIGN_TASK_TIMER_UPDATED_EVENT,
  formatElapsedSeconds,
  getDesignerTimerTaskOverview,
  getTimerElapsedSeconds,
  pauseDesignTaskTimer,
  startDesignTaskTimer,
  type DesignerTimerTaskOverview,
} from "@/lib/designTaskTimer";

type DesignerTimerControllerParams = {
  teamId?: string | null;
  userId?: string | null;
  enabled: boolean;
};

type DesignerTimerController = {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  tasks: DesignerTimerTaskOverview[];
  activeTask: DesignerTimerTaskOverview | null;
  nowMs: number;
  busyTaskId: string | null;
  busyAction: "start" | "pause" | null;
  refresh: () => Promise<void>;
  startTask: (task: DesignerTimerTaskOverview) => Promise<void>;
  pauseTask: (task: DesignerTimerTaskOverview) => Promise<void>;
  canStartTask: (task: DesignerTimerTaskOverview) => boolean;
};

const TIMER_FLOATING_POSITION_KEY = "designer-timer-floating-position";
const TIMER_FLOATING_WIDTH_PX = 508;
const TIMER_FLOATING_HEIGHT_PX = 230;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function getTaskNumber(task: DesignerTimerTaskOverview) {
  return task.designTaskNumber || task.quoteNumber || task.taskId.slice(0, 8);
}

function getTaskTitle(task: DesignerTimerTaskOverview) {
  return task.title?.trim() || task.customerName?.trim() || "Дизайн-задача";
}

function isTaskRunning(task: DesignerTimerTaskOverview) {
  return Boolean(task.summary.activeSessionId && task.summary.activeStartedAt);
}

function hasTimerProgress(task: DesignerTimerTaskOverview) {
  return task.summary.totalSeconds > 0 || Boolean(task.latestStartedAt);
}

function isTaskPaused(task: DesignerTimerTaskOverview) {
  return task.status === "in_progress" && !isTaskRunning(task) && hasTimerProgress(task);
}

function isTaskReadyForTimer(task: DesignerTimerTaskOverview) {
  return task.status === "in_progress" && !isTaskRunning(task) && !hasTimerProgress(task);
}

function isQueuedTimerTask(task: DesignerTimerTaskOverview) {
  return task.status === "new" || task.status === "changes";
}

function getDesignStatusLabel(status: string | null) {
  if (!status || !(status in DESIGN_STATUS_LABELS)) return null;
  return DESIGN_STATUS_LABELS[status as keyof typeof DESIGN_STATUS_LABELS];
}

function getTimerStateLabel(task: DesignerTimerTaskOverview) {
  if (isTaskRunning(task)) return "Активний";
  if (isTaskPaused(task)) return "На паузі";
  if (isTaskReadyForTimer(task)) return "Готовий до старту";
  return getDesignStatusLabel(task.status) ?? (hasTimerProgress(task) ? "Зупинено" : "Недоступно");
}

function getPrimaryTimerTask(tasks: DesignerTimerTaskOverview[], activeTask: DesignerTimerTaskOverview | null) {
  return (
    activeTask ??
    tasks.find((task) => task.status === "in_progress") ??
    tasks.find((task) => isQueuedTimerTask(task)) ??
    tasks[0] ??
    null
  );
}

function formatShortDateTime(value?: string | null) {
  if (!value) return "Немає запусків";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getDefaultFloatingPosition() {
  if (typeof window === "undefined") return { x: 24, y: 92 };
  return {
    x: Math.max(16, window.innerWidth - TIMER_FLOATING_WIDTH_PX - 16),
    y: 88,
  };
}

function clampFloatingPosition(position: { x: number; y: number }) {
  if (typeof window === "undefined") return position;
  return {
    x: Math.min(
      Math.max(8, position.x),
      Math.max(8, window.innerWidth - TIMER_FLOATING_WIDTH_PX - 8)
    ),
    y: Math.min(
      Math.max(8, position.y),
      Math.max(8, window.innerHeight - TIMER_FLOATING_HEIGHT_PX - 8)
    ),
  };
}

function readFloatingPosition() {
  if (typeof window === "undefined") return getDefaultFloatingPosition();
  try {
    const raw = localStorage.getItem(TIMER_FLOATING_POSITION_KEY);
    if (!raw) return getDefaultFloatingPosition();
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = typeof parsed.x === "number" && Number.isFinite(parsed.x) ? parsed.x : getDefaultFloatingPosition().x;
    const y = typeof parsed.y === "number" && Number.isFinite(parsed.y) ? parsed.y : getDefaultFloatingPosition().y;
    return clampFloatingPosition({ x, y });
  } catch {
    return getDefaultFloatingPosition();
  }
}

function isFloatingTimerControl(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button,a,input,textarea,select,[role='button']"));
}

export function useDesignerTimerController({
  teamId,
  userId,
  enabled,
}: DesignerTimerControllerParams): DesignerTimerController {
  const [tasks, setTasks] = useState<DesignerTimerTaskOverview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"start" | "pause" | null>(null);

  const activeTask = useMemo(
    () => tasks.find((task) => isTaskRunning(task)) ?? null,
    [tasks]
  );

  const refresh = useCallback(async () => {
    if (!enabled || !teamId || !userId) {
      setTasks([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextTasks = await getDesignerTimerTaskOverview({ teamId, userId, limit: 3 });
      setNowMs(Date.now());
      setTasks(nextTasks);
      setError(null);
    } catch (refreshError) {
      const message = getErrorMessage(refreshError, "Не вдалося завантажити таймери");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [enabled, teamId, userId]);

  const canStartTask = useCallback(
    (task: DesignerTimerTaskOverview) =>
      task.status === "in_progress" &&
      Boolean(userId) &&
      (task.assigneeUserId === userId || task.collaboratorUserIds.includes(userId ?? "")) &&
      !isTaskRunning(task),
    [userId]
  );

  const pauseTask = useCallback(
    async (task: DesignerTimerTaskOverview) => {
      if (!enabled || !teamId || busyTaskId) return;
      setBusyTaskId(task.taskId);
      setBusyAction("pause");
      try {
        const paused = await pauseDesignTaskTimer({ teamId, taskId: task.taskId });
        await refresh();
        if (paused) toast.success("Таймер на паузі");
      } catch (pauseError) {
        toast.error(getErrorMessage(pauseError, "Не вдалося поставити таймер на паузу"));
      } finally {
        setBusyTaskId(null);
        setBusyAction(null);
      }
    },
    [busyTaskId, enabled, refresh, teamId]
  );

  const startTask = useCallback(
    async (task: DesignerTimerTaskOverview) => {
      if (!enabled || !teamId || !userId || busyTaskId) return;
      if (!canStartTask(task)) {
        toast.error("Запустити таймер можна тільки на своїй задачі у статусі «В роботі».");
        return;
      }

      setBusyTaskId(task.taskId);
      setBusyAction("start");
      try {
        if (activeTask && activeTask.taskId !== task.taskId) {
          await pauseDesignTaskTimer({ teamId, taskId: activeTask.taskId });
        }
        await startDesignTaskTimer({ teamId, taskId: task.taskId, userId });
        await refresh();
        toast.success("Таймер запущено");
      } catch (startError) {
        toast.error(getErrorMessage(startError, "Не вдалося запустити таймер"));
      } finally {
        setBusyTaskId(null);
        setBusyAction(null);
      }
    },
    [activeTask, busyTaskId, canStartTask, enabled, refresh, teamId, userId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !teamId) return;
    const handleTimerUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ teamId?: string | null }>).detail;
      if (!detail?.teamId || detail.teamId === teamId) {
        void refresh();
      }
    };
    window.addEventListener(DESIGN_TASK_TIMER_UPDATED_EVENT, handleTimerUpdated);
    window.addEventListener("focus", handleTimerUpdated);
    const intervalId = window.setInterval(() => void refresh(), 60 * 1000);
    return () => {
      window.removeEventListener(DESIGN_TASK_TIMER_UPDATED_EVENT, handleTimerUpdated);
      window.removeEventListener("focus", handleTimerUpdated);
      window.clearInterval(intervalId);
    };
  }, [enabled, refresh, teamId]);

  useEffect(() => {
    if (!activeTask) return;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [activeTask]);

  return {
    enabled,
    loading,
    error,
    tasks,
    activeTask,
    nowMs,
    busyTaskId,
    busyAction,
    refresh,
    startTask,
    pauseTask,
    canStartTask,
  };
}

function TimerTaskRow({
  task,
  controller,
  compact = false,
}: {
  task: DesignerTimerTaskOverview;
  controller: DesignerTimerController;
  compact?: boolean;
}) {
  const running = isTaskRunning(task);
  const paused = isTaskPaused(task);
  const busy = controller.busyTaskId === task.taskId;
  const elapsedLabel = formatElapsedSeconds(getTimerElapsedSeconds(task.summary, controller.nowMs));
  const canStart = controller.canStartTask(task);
  const statusLabel = getDesignStatusLabel(task.status);

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        running
          ? "border-success-soft-border bg-success-soft text-success-foreground"
          : paused
            ? "border-warning-soft-border bg-warning-soft text-warning-foreground"
          : "border-border/60 bg-muted/10 text-foreground"
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-2xs font-semibold text-muted-foreground">
              #{getTaskNumber(task)}
            </span>
            {running ? (
              <span className="shrink-0 rounded-full border border-success-soft-border bg-success-soft px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-normal text-success-foreground">
                активний
              </span>
            ) : hasTimerProgress(task) ? (
              paused ? (
                <span className="shrink-0 rounded-full border border-warning-soft-border bg-warning-soft px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-normal text-warning-foreground">
                пауза
                </span>
              ) : statusLabel ? (
                <span className="shrink-0 rounded-full border border-border/60 bg-muted/30 px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-normal text-muted-foreground">
                  {statusLabel}
                </span>
              ) : null
            ) : null}
          </div>
          <div className={cn("mt-0.5 truncate font-semibold", compact ? "text-xs" : "text-sm")}>
            {getTaskTitle(task)}
          </div>
          {!compact && task.customerName ? (
            <div className="truncate text-xs text-muted-foreground">{task.customerName}</div>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">{elapsedLabel}</span>
            <span>{running ? "запущено" : "останній запуск"} {formatShortDateTime(task.latestStartedAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {running ? (
            <Button
              type="button"
              size="iconSm"
              variant="outline"
              className="h-8 w-8"
              disabled={busy}
              onClick={() => void controller.pauseTask(task)}
              aria-label="Поставити таймер на паузу"
              title="Поставити на паузу"
            >
              {busy && controller.busyAction === "pause" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
          ) : (
            <Button
              type="button"
              size="iconSm"
              variant="outline"
              className="h-8 w-8"
              disabled={busy || !canStart}
              onClick={() => void controller.startTask(task)}
              aria-label="Запустити таймер"
              title={canStart ? "Запустити таймер" : "Доступно тільки для своєї задачі у статусі «В роботі»"}
            >
              {busy && controller.busyAction === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button asChild type="button" size="iconSm" variant="ghost" className="h-8 w-8" title="Відкрити задачу">
            <Link to={`/design/${task.taskId}`} aria-label="Відкрити задачу">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function TimerTaskList({ controller, compact = false }: { controller: DesignerTimerController; compact?: boolean }) {
  if (controller.loading && controller.tasks.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Завантажуємо таймери
      </div>
    );
  }

  if (controller.error && controller.tasks.length === 0) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-3 text-sm text-danger-foreground">
        {controller.error}
      </div>
    );
  }

  if (controller.tasks.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-4 text-sm text-muted-foreground">
        Останніх таймерів ще немає.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {controller.tasks.map((task) => (
        <TimerTaskRow key={task.taskId} task={task} controller={controller} compact={compact} />
      ))}
    </div>
  );
}

export function DesignerHeaderTimerWidget({
  controller,
  floatingOpen,
  onShowFloating,
}: {
  controller: DesignerTimerController;
  floatingOpen: boolean;
  onShowFloating: () => void;
}) {
  if (!controller.enabled) return null;

  const currentTask = getPrimaryTimerTask(controller.tasks, controller.activeTask);
  const currentRunning = currentTask ? isTaskRunning(currentTask) : false;
  const currentPaused = Boolean(currentTask && isTaskPaused(currentTask));
  const currentElapsedLabel = currentTask
    ? formatElapsedSeconds(getTimerElapsedSeconds(currentTask.summary, controller.nowMs))
    : null;
  const startableTask = currentTask && controller.canStartTask(currentTask) ? currentTask : null;
  const currentBusy = Boolean(currentTask && controller.busyTaskId === currentTask.taskId);

  const stopHeaderControlEvent = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <AppDropdown
      align="end"
      sideOffset={10}
      contentClassName="w-[360px] p-0"
      trigger={
        <div
          className={cn(
            "hidden lg:inline-flex h-10 w-[190px] items-center justify-between gap-1.5 whitespace-nowrap rounded-xl border px-2 shadow-inner transition-all duration-200 cursor-pointer",
            currentRunning
              ? "border-success-soft-border bg-success-soft text-success-foreground hover:bg-success-soft/80"
              : currentPaused
                ? "border-warning-soft-border bg-warning-soft text-warning-foreground hover:bg-warning-soft/80"
              : "border-border/50 bg-muted/40 text-foreground hover:bg-muted/60"
          )}
          aria-label="Таймер дизайнера"
          title={currentTask ? getTimerStateLabel(currentTask) : "Таймер дизайнера"}
        >
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm transition-colors disabled:cursor-not-allowed",
              startableTask && !currentRunning
                ? "border-transparent bg-success-foreground text-white hover:bg-success-foreground/90"
                : "border-transparent bg-transparent text-current/30 shadow-none"
            )}
            disabled={!startableTask || currentRunning || currentBusy}
            onPointerDown={stopHeaderControlEvent}
            onClick={(event) => {
              stopHeaderControlEvent(event);
              if (startableTask) void controller.startTask(startableTask);
            }}
            aria-label="Запустити таймер"
            title={startableTask ? "Запустити таймер" : "Немає задачі для запуску"}
          >
            {currentBusy && controller.busyAction === "start" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm transition-colors disabled:cursor-not-allowed",
              currentRunning
                ? "border-transparent bg-warning-foreground text-background hover:bg-warning-foreground/80"
                : "border-transparent bg-transparent text-current/30 shadow-none"
            )}
            disabled={!currentRunning || !currentTask || currentBusy}
            onPointerDown={stopHeaderControlEvent}
            onClick={(event) => {
              stopHeaderControlEvent(event);
              if (currentTask) void controller.pauseTask(currentTask);
            }}
            aria-label="Поставити таймер на паузу"
            title="Поставити на паузу"
          >
            {currentBusy && controller.busyAction === "pause" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </button>
          <span className="w-[92px] text-right font-mono text-[18px] font-black leading-none tabular-nums tracking-normal">
            {currentElapsedLabel ?? "00:00:00"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </div>
      }
      content={
        <div className="space-y-3 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">Таймер дизайнера</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={onShowFloating}
                title={floatingOpen ? "Floating-віджет вже відкритий" : "Показати floating-віджет"}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Віджет
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => void controller.refresh()}
                disabled={controller.loading}
              >
                {controller.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Оновити
              </Button>
            </div>
          </div>
          <TimerTaskList controller={controller} />
        </div>
      }
    />
  );
}

export function DesignerFloatingTimerWidget({
  controller,
  onClose,
}: {
  controller: DesignerTimerController;
  onClose: () => void;
}) {
  const [position, setPosition] = useState(readFloatingPosition);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const currentTask = getPrimaryTimerTask(controller.tasks, controller.activeTask);
  const currentRunning = currentTask ? isTaskRunning(currentTask) : false;
  const currentPaused = Boolean(currentTask && isTaskPaused(currentTask));
  const currentElapsedLabel = currentTask
    ? formatElapsedSeconds(getTimerElapsedSeconds(currentTask.summary, controller.nowMs))
    : "00:00:00";
  const startableTask = currentTask && controller.canStartTask(currentTask) ? currentTask : null;
  const startBusy = Boolean(startableTask && controller.busyTaskId === startableTask.taskId && controller.busyAction === "start");

  useEffect(() => {
    try {
      localStorage.setItem(TIMER_FLOATING_POSITION_KEY, JSON.stringify(position));
    } catch {
      // ignore storage failures
    }
  }, [position]);

  if (!controller.enabled) return null;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isFloatingTimerControl(event.target)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId || typeof window === "undefined") return;
    setPosition(
      clampFloatingPosition({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      })
    );
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  return (
    <div
      className={cn(
        "fixed z-floating w-[508px] max-w-[calc(100vw-16px)] select-none rounded-[26px] border bg-foreground text-background shadow-elevated-panel backdrop-blur cursor-grab active:cursor-grabbing",
        currentRunning
          ? "border-success-soft-border/55 ring-1 ring-success-soft-border/25"
          : currentPaused
            ? "border-warning-soft-border/55 ring-1 ring-warning-soft-border/25"
          : "border-background/15 ring-1 ring-background/10"
      )}
      style={{ left: position.x, top: position.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-2.5",
          "border-background/10",
          currentTask ? "text-background" : "text-background"
        )}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-background/60"
          aria-hidden="true"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 shrink-0" />
            <div className="truncate text-sm font-semibold">
              {currentTask ? `#${getTaskNumber(currentTask)} · ${getTaskTitle(currentTask)}` : "Таймер дизайнера"}
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="iconSm"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-background/70 hover:bg-background/10 hover:text-background"
          onClick={onClose}
          title="Закрити віджет"
          aria-label="Закрити віджет"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="px-3.5 pb-3.5 pt-2.5">
        <div className="rounded-[20px] border border-background/15 bg-background/[0.055] px-5 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_136px] items-center gap-5">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-normal text-background/60">
                {currentTask ? getTimerStateLabel(currentTask) : "Немає активного таймера"}
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-[48px] font-bold leading-[0.95] tabular-nums tracking-normal",
                  currentRunning
                    ? "text-success-foreground"
                    : currentPaused
                      ? "text-warning-foreground"
                    : "text-background"
                )}
              >
                {currentElapsedLabel}
              </div>
            </div>
            <div className="flex w-[136px] shrink-0 flex-col justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  "h-11 w-full justify-center rounded-xl px-3 text-[15px] font-semibold transition-all disabled:opacity-100 [&_svg]:size-4",
                  startableTask && !currentRunning
                    ? "border-transparent bg-success-foreground text-white shadow-success-glow hover:border-transparent hover:bg-success-foreground/90 hover:text-white"
                    : "border-background/20 bg-background/[0.08] text-background/40 shadow-inner hover:bg-background/[0.08] hover:text-background/40"
                )}
                disabled={!startableTask || currentRunning || startBusy}
                onClick={() => {
                  if (startableTask) void controller.startTask(startableTask);
                }}
                title={
                  currentRunning
                    ? "Таймер уже запущено"
                    : startableTask
                      ? `Запустити #${getTaskNumber(startableTask)}`
                      : "Немає задачі для запуску"
                }
              >
                {startBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Старт
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  "h-11 w-full justify-center rounded-xl px-3 text-[15px] font-semibold transition-all disabled:opacity-100 [&_svg]:size-4",
                  currentRunning
                    ? "border-transparent bg-warning-foreground text-background shadow-warning-glow hover:border-transparent hover:bg-warning-foreground/80 hover:text-background"
                    : "border-background/20 bg-background/[0.08] text-background/50 shadow-inner hover:bg-background/[0.08] hover:text-background/50"
                )}
                disabled={!currentRunning || !currentTask || controller.busyTaskId === currentTask.taskId}
                onClick={() => {
                  if (currentTask) void controller.pauseTask(currentTask);
                }}
                title="Поставити на паузу"
              >
                {currentTask && controller.busyTaskId === currentTask.taskId && controller.busyAction === "pause" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
                Пауза
              </Button>
            </div>
          </div>
          {currentTask ? (
            <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-background/60">
              <span className="truncate">
                {currentRunning
                  ? `Запущено ${formatShortDateTime(currentTask.latestStartedAt)}`
                  : currentPaused
                    ? `На паузі · ${formatShortDateTime(currentTask.latestPausedAt ?? currentTask.latestStartedAt)}`
                    : currentTask.status === "in_progress"
                      ? `Готово до запуску #${getTaskNumber(currentTask)}`
                      : getDesignStatusLabel(currentTask.status) ?? `Недоступно #${getTaskNumber(currentTask)}`}
              </span>
              <Link
                to={`/design/${currentTask.taskId}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-background hover:bg-background/10"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Задача
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

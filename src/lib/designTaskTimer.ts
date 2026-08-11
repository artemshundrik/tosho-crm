import { supabase } from "@/lib/supabaseClient";
import { ACTIVE_DESIGN_STATUSES } from "@/lib/designWorkload";

export type DesignTaskTimerSessionRow = {
  id: string;
  team_id: string;
  design_task_id: string;
  user_id: string;
  started_at: string;
  paused_at: string | null;
  created_at?: string | null;
  // Optional attribution to a specific change request (правка). NULL = general/ТЗ work.
  change_request_id?: string | null;
};

export type DesignTaskTimerBreakdown = {
  // Time on initial / general work (sessions with no change_request_id).
  generalSeconds: number;
  // Accumulated (paused) seconds per change request id.
  byChangeRequestSeconds: Record<string, number>;
  activeChangeRequestId: string | null;
  activeStartedAt: string | null;
  activeUserId: string | null;
  activeIsGeneral: boolean;
  hasActive: boolean;
};

export type DesignTaskTimerSummary = {
  totalSeconds: number;
  activeSessionId: string | null;
  activeStartedAt: string | null;
  activeUserId: string | null;
  /**
   * УСІ активні сесії задачі, а не лише найновіша.
   *
   * Одну задачу можуть вести двоє (виконавець і співвиконавець), і кожен має
   * власну сесію. Доти назовні віддавалась тільки найновіша — і сторінка не
   * могла відрізнити «мій таймер іде» від «іде чийсь». Наслідок був живий: поки
   * колега забув зупинити свій таймер, друга людина не могла ні запустити свій
   * (кнопка «Старт» ховалась), ні зупинити чужий (пауза шукає сесію за своїм
   * user_id і мовчки не робила нічого).
   */
  activeSessions: Array<{ id: string; userId: string; startedAt: string }>;
};

export type DesignerTimerTaskOverview = {
  taskId: string;
  title: string | null;
  status: string | null;
  designTaskNumber: string | null;
  quoteNumber: string | null;
  customerName: string | null;
  assigneeUserId: string | null;
  collaboratorUserIds: string[];
  latestStartedAt: string | null;
  latestPausedAt: string | null;
  summary: DesignTaskTimerSummary;
};

export const DESIGN_TASK_TIMER_UPDATED_EVENT = "design-task-timer:updated";

/**
 * Порожня зведенка: «сесій немає / ще не читали». Фабрика, а не спільна
 * константа, щоб випадково не роздати всім сторінкам один і той самий об'єкт.
 */
export function createEmptyTimerSummary(): DesignTaskTimerSummary {
  return {
    totalSeconds: 0,
    activeSessionId: null,
    activeStartedAt: null,
    activeUserId: null,
    activeSessions: [],
  };
}

const toUnixMs = (value?: string | null) => {
  if (!value) return NaN;
  return new Date(value).getTime();
};

const secondsBetween = (from?: string | null, toMs?: number) => {
  const startMs = toUnixMs(from);
  if (!Number.isFinite(startMs)) return 0;
  const endMs = Number.isFinite(toMs ?? NaN) ? (toMs as number) : Date.now();
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
};

function summarizeSessions(sessions: DesignTaskTimerSessionRow[]): DesignTaskTimerSummary {
  let totalSeconds = 0;
  let active: DesignTaskTimerSessionRow | null = null;
  const activeSessions: DesignTaskTimerSummary["activeSessions"] = [];

  sessions.forEach((session) => {
    if (session.paused_at) {
      totalSeconds += secondsBetween(session.started_at, toUnixMs(session.paused_at));
    }
    if (!session.paused_at) {
      activeSessions.push({ id: session.id, userId: session.user_id, startedAt: session.started_at });
      if (!active) {
        active = session;
      } else {
        const currentMs = toUnixMs(active.started_at);
        const nextMs = toUnixMs(session.started_at);
        if (Number.isFinite(nextMs) && (!Number.isFinite(currentMs) || nextMs > currentMs)) {
          active = session;
        }
      }
    }
  });

  const activeSession = active as DesignTaskTimerSessionRow | null;
  return {
    totalSeconds,
    activeSessionId: activeSession?.id ?? null,
    activeStartedAt: activeSession?.started_at ?? null,
    activeUserId: activeSession?.user_id ?? null,
    activeSessions,
  };
}

function dispatchTimerUpdated(detail: { teamId: string; taskId: string; userId?: string | null }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DESIGN_TASK_TIMER_UPDATED_EVENT, { detail }));
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)
    : [];
}

function parseActivityMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function getTimerTaskSortBucket(task: DesignerTimerTaskOverview) {
  if (task.summary.activeSessionId && task.summary.activeStartedAt) return 0;
  if (task.status === "in_progress") return 1;
  if (task.status === "changes" || task.status === "new") return 2;
  return 3;
}

export function formatElapsedSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function getTimerElapsedSeconds(summary: DesignTaskTimerSummary, nowMs = Date.now()) {
  // «Витрачено» під цим числом — людино-години, тож тікати мають УСІ активні
  // сесії. Доти рахувалась лише найновіша: коли задачу вели двоє, час другої
  // людини не з'являвся, поки вона не поставить паузу.
  const runningSeconds = summary.activeSessions.reduce(
    (acc, session) => acc + Math.max(0, Math.floor((nowMs - new Date(session.startedAt).getTime()) / 1000)),
    0
  );
  return summary.totalSeconds + runningSeconds;
}

export async function getDesignTaskTimerSummary(
  teamId: string,
  taskId: string
): Promise<DesignTaskTimerSummary> {
  const { data, error } = await supabase
    .from("design_task_timer_sessions")
    .select("id,team_id,design_task_id,user_id,started_at,paused_at,created_at")
    .eq("team_id", teamId)
    .eq("design_task_id", taskId)
    .order("started_at", { ascending: true });
  if (error) throw error;
  return summarizeSessions((data as DesignTaskTimerSessionRow[] | null) ?? []);
}

// Per-change-request breakdown of a task's timer. Selects change_request_id, so it
// requires the migration (scripts/design-task-timer-change-request.sql). Callers should
// guard with try/catch and degrade gracefully if the column does not yet exist.
export async function getDesignTaskTimerBreakdown(
  teamId: string,
  taskId: string
): Promise<DesignTaskTimerBreakdown> {
  const { data, error } = await supabase
    .from("design_task_timer_sessions")
    .select("id,design_task_id,user_id,started_at,paused_at,change_request_id")
    .eq("team_id", teamId)
    .eq("design_task_id", taskId)
    .order("started_at", { ascending: true });
  if (error) throw error;
  const rows = (data as DesignTaskTimerSessionRow[] | null) ?? [];

  let generalSeconds = 0;
  const byChangeRequestSeconds: Record<string, number> = {};
  let active: DesignTaskTimerSessionRow | null = null;

  rows.forEach((row) => {
    if (row.paused_at) {
      const seconds = secondsBetween(row.started_at, toUnixMs(row.paused_at));
      if (row.change_request_id) {
        byChangeRequestSeconds[row.change_request_id] =
          (byChangeRequestSeconds[row.change_request_id] ?? 0) + seconds;
      } else {
        generalSeconds += seconds;
      }
      return;
    }
    if (!active) {
      active = row;
    } else {
      const currentMs = toUnixMs(active.started_at);
      const nextMs = toUnixMs(row.started_at);
      if (Number.isFinite(nextMs) && (!Number.isFinite(currentMs) || nextMs > currentMs)) {
        active = row;
      }
    }
  });

  const activeSession = active as DesignTaskTimerSessionRow | null;
  return {
    generalSeconds,
    byChangeRequestSeconds,
    activeChangeRequestId: activeSession?.change_request_id ?? null,
    activeStartedAt: activeSession?.started_at ?? null,
    activeUserId: activeSession?.user_id ?? null,
    activeIsGeneral: !!activeSession && !activeSession.change_request_id,
    hasActive: !!activeSession,
  };
}

export async function getDesignTasksTimerSummaryMap(teamId: string, taskIds: string[]) {
  if (taskIds.length === 0) return new Map<string, DesignTaskTimerSummary>();
  const { data, error } = await supabase
    .from("design_task_timer_sessions")
    .select("id,team_id,design_task_id,user_id,started_at,paused_at,created_at")
    .eq("team_id", teamId)
    .in("design_task_id", taskIds)
    .order("started_at", { ascending: true });
  if (error) throw error;

  const grouped = new Map<string, DesignTaskTimerSessionRow[]>();
  ((data as DesignTaskTimerSessionRow[] | null) ?? []).forEach((row) => {
    const list = grouped.get(row.design_task_id) ?? [];
    list.push(row);
    grouped.set(row.design_task_id, list);
  });

  const summaryMap = new Map<string, DesignTaskTimerSummary>();
  taskIds.forEach((taskId) => {
    summaryMap.set(taskId, summarizeSessions(grouped.get(taskId) ?? []));
  });
  return summaryMap;
}

export async function getDesignerTimerTaskOverview(params: {
  teamId: string;
  userId: string;
  limit?: number;
}) {
  const limit = Math.max(3, params.limit ?? 3);
  const [
    { data: recentSessions, error: recentError },
    { data: assignedTaskRows, error: assignedTaskError },
    { data: collaboratorTaskRows, error: collaboratorTaskError },
  ] = await Promise.all([
    supabase
      .from("design_task_timer_sessions")
      .select("id,team_id,design_task_id,user_id,started_at,paused_at,created_at")
      .eq("team_id", params.teamId)
      .eq("user_id", params.userId)
      .order("started_at", { ascending: false })
      .limit(Math.max(limit * 4, 12)),
    supabase
      .from("activity_log")
      .select("id,title,metadata,created_at")
      .eq("team_id", params.teamId)
      .eq("action", "design_task")
      .eq("metadata->>assignee_user_id", params.userId)
      .in("metadata->>status", ACTIVE_DESIGN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 4, 12)),
    supabase
      .from("activity_log")
      .select("id,title,metadata,created_at")
      .eq("team_id", params.teamId)
      .eq("action", "design_task")
      .contains("metadata", { collaborator_user_ids: [params.userId] })
      .in("metadata->>status", ACTIVE_DESIGN_STATUSES)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 4, 12)),
  ]);
  if (recentError) throw recentError;
  if (assignedTaskError) throw assignedTaskError;
  if (collaboratorTaskError) throw collaboratorTaskError;

  const latestByTaskId = new Map<string, DesignTaskTimerSessionRow>();
  ((recentSessions as DesignTaskTimerSessionRow[] | null) ?? []).forEach((session) => {
    if (!latestByTaskId.has(session.design_task_id)) {
      latestByTaskId.set(session.design_task_id, session);
    }
  });

  const taskIds = Array.from(latestByTaskId.keys());
  ((assignedTaskRows as Array<{ id: string }> | null) ?? []).forEach((row) => {
    if (!taskIds.includes(row.id)) taskIds.push(row.id);
  });
  ((collaboratorTaskRows as Array<{ id: string }> | null) ?? []).forEach((row) => {
    if (!taskIds.includes(row.id)) taskIds.push(row.id);
  });
  if (taskIds.length === 0) return [];

  const [{ data: allSessions, error: sessionsError }, { data: taskRows, error: taskError }] = await Promise.all([
    supabase
      .from("design_task_timer_sessions")
      .select("id,team_id,design_task_id,user_id,started_at,paused_at,created_at")
      .eq("team_id", params.teamId)
      .in("design_task_id", taskIds)
      .order("started_at", { ascending: true }),
    supabase
      .from("activity_log")
      .select("id,title,metadata")
      .eq("team_id", params.teamId)
      .eq("action", "design_task")
      .in("id", taskIds),
  ]);
  if (sessionsError) throw sessionsError;
  if (taskError) throw taskError;

  const sessionsByTaskId = new Map<string, DesignTaskTimerSessionRow[]>();
  ((allSessions as DesignTaskTimerSessionRow[] | null) ?? []).forEach((session) => {
    const list = sessionsByTaskId.get(session.design_task_id) ?? [];
    list.push(session);
    sessionsByTaskId.set(session.design_task_id, list);
  });

  const taskById = new Map(
    ((taskRows as Array<{ id: string; title?: string | null; metadata?: unknown }> | null) ?? []).map((row) => [
      row.id,
      row,
    ])
  );

  const recentRankByTaskId = new Map(taskIds.map((taskId, index) => [taskId, index] as const));
  return taskIds.map((taskId) => {
    const task = taskById.get(taskId) ?? null;
    const metadata = parseActivityMetadata(task?.metadata);
    const latest = latestByTaskId.get(taskId) ?? null;
    return {
      taskId,
      title: task?.title ?? null,
      status: toNonEmptyString(metadata.status),
      designTaskNumber: toNonEmptyString(metadata.design_task_number),
      quoteNumber: toNonEmptyString(metadata.quote_number),
      customerName: toNonEmptyString(metadata.customer_name),
      assigneeUserId: toNonEmptyString(metadata.assignee_user_id),
      collaboratorUserIds: parseStringArray(metadata.collaborator_user_ids),
      latestStartedAt: latest?.started_at ?? null,
      latestPausedAt: latest?.paused_at ?? null,
      summary: summarizeSessions(sessionsByTaskId.get(taskId) ?? []),
    } satisfies DesignerTimerTaskOverview;
  }).sort((a, b) => {
    const bucketDiff = getTimerTaskSortBucket(a) - getTimerTaskSortBucket(b);
    if (bucketDiff !== 0) return bucketDiff;
    return (recentRankByTaskId.get(a.taskId) ?? Number.MAX_SAFE_INTEGER) - (recentRankByTaskId.get(b.taskId) ?? Number.MAX_SAFE_INTEGER);
  }).slice(0, limit);
}

/**
 * Запускає таймер задачі.
 *
 * Повертає `pausedOtherTaskId`, якщо довелося зупинити таймер цієї ж людини на
 * ІНШІЙ задачі: раніше дві сесії могли йти одночасно, і час рахувався двічі
 * (у даних знайшлося 7 таких перетинів у 3 людей). Людині про це треба сказати,
 * тому id повертаємо, а не глушимо мовчки.
 */
export async function startDesignTaskTimer(params: {
  teamId: string;
  taskId: string;
  userId: string;
  changeRequestId?: string | null;
}): Promise<{ pausedOtherTaskId: string | null }> {
  // Свій же таймер на ЦІЙ задачі — просто нічого не робимо.
  const { data: activeRows, error: activeError } = await supabase
    .from("design_task_timer_sessions")
    .select("id")
    .eq("team_id", params.teamId)
    .eq("design_task_id", params.taskId)
    .eq("user_id", params.userId)
    .is("paused_at", null)
    .limit(1);
  const activeRow = ((activeRows ?? []) as Array<{ id?: string | null }>)[0] ?? null;
  if (activeError) throw activeError;
  if (activeRow) {
    throw new Error("Таймер вже запущено.");
  }

  // Одна людина — один таймер, але задачу можуть вести двоє одночасно.
  //
  // Раніше перевірка стояла на ЗАДАЧУ без огляду на людину: поки таймер тримав
  // один дизайнер, другий не міг запустити свій. Спільні задачі в нас є (16 із
  // них мають співвиконавців), тож робота другого просто не записувалась —
  // дірка в даних, гірша за завищену суму. Аналітика й так рахує за user_id,
  // а підсумок задачі підписаний «Витрачено», тобто людино-години.
  //
  // Що лишається під забороною — власна друга сесія: її закриваємо нижче.
  let pausedOtherTaskId: string | null = null;
  const { data: otherRows, error: otherError } = await supabase
    .from("design_task_timer_sessions")
    .select("id,design_task_id")
    .eq("team_id", params.teamId)
    .eq("user_id", params.userId)
    .is("paused_at", null)
    .neq("design_task_id", params.taskId)
    .order("started_at", { ascending: false })
    .limit(5);
  if (otherError) throw otherError;

  for (const row of ((otherRows ?? []) as Array<{ id?: string | null; design_task_id?: string | null }>)) {
    if (!row.id) continue;
    const { error: pauseError } = await supabase
      .from("design_task_timer_sessions")
      .update({ paused_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("paused_at", null);
    if (pauseError) throw pauseError;
    if (!pausedOtherTaskId && row.design_task_id) pausedOtherTaskId = row.design_task_id;
  }

  const insertPayload: Record<string, unknown> = {
    team_id: params.teamId,
    design_task_id: params.taskId,
    user_id: params.userId,
    started_at: new Date().toISOString(),
    paused_at: null,
  };
  // Only attach change_request_id when timing a specific правка. Omitting it keeps
  // the general/ТЗ timer working even before the migration that adds the column.
  if (params.changeRequestId) {
    insertPayload.change_request_id = params.changeRequestId;
  }

  const { error } = await supabase.from("design_task_timer_sessions").insert(insertPayload as never);
  if (error) throw error;
  dispatchTimerUpdated({ teamId: params.teamId, taskId: params.taskId, userId: params.userId });
  return { pausedOtherTaskId };
}

/**
 * Зупиняє таймер задачі.
 *
 * `userId` ОБОВ'ЯЗКОВИЙ для ручної паузи: відколи задачу можуть вести двоє
 * одночасно, пауза без огляду на людину зупиняла б чужий таймер — раніше
 * бралася просто найновіша активна сесія на задачі.
 *
 * Без `userId` зупиняємо ВСІ активні сесії задачі. Це потрібно рівно там, де
 * задача виходить зі стану «В роботі» (зміна статусу, зміна виконавця): тоді
 * не має рахувати час ніхто, незалежно від того, хто натиснув.
 */
export async function pauseDesignTaskTimer(params: {
  teamId: string;
  taskId: string;
  userId?: string | null;
}) {
  let query = supabase
    .from("design_task_timer_sessions")
    .select("id")
    .eq("team_id", params.teamId)
    .eq("design_task_id", params.taskId)
    .is("paused_at", null);
  if (params.userId) query = query.eq("user_id", params.userId);

  const { data: activeRows, error: activeError } = await query.order("started_at", { ascending: false });
  if (activeError) throw activeError;

  const ids = ((activeRows ?? []) as Array<{ id?: string | null }>)
    .map((row) => row.id)
    .filter((id): id is string => !!id);
  if (ids.length === 0) return false;

  const { error: updateError } = await supabase
    .from("design_task_timer_sessions")
    .update({ paused_at: new Date().toISOString() })
    .in("id", ids)
    .is("paused_at", null);
  if (updateError) throw updateError;
  dispatchTimerUpdated({ teamId: params.teamId, taskId: params.taskId, userId: params.userId ?? undefined });
  return true;
}

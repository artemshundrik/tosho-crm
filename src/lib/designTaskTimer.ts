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
};

export type DesignTaskTimerSummary = {
  totalSeconds: number;
  activeSessionId: string | null;
  activeStartedAt: string | null;
  activeUserId: string | null;
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

  sessions.forEach((session) => {
    if (session.paused_at) {
      totalSeconds += secondsBetween(session.started_at, toUnixMs(session.paused_at));
    }
    if (!session.paused_at) {
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

export function formatElapsedSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function getTimerElapsedSeconds(summary: DesignTaskTimerSummary, nowMs = Date.now()) {
  return (
    summary.totalSeconds +
    (summary.activeStartedAt
      ? Math.max(0, Math.floor((nowMs - new Date(summary.activeStartedAt).getTime()) / 1000))
      : 0)
  );
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
    if (taskIds.length >= limit) return;
    if (!taskIds.includes(row.id)) taskIds.push(row.id);
  });
  ((collaboratorTaskRows as Array<{ id: string }> | null) ?? []).forEach((row) => {
    if (taskIds.length >= limit) return;
    if (!taskIds.includes(row.id)) taskIds.push(row.id);
  });
  taskIds.splice(limit);
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
  });
}

export async function startDesignTaskTimer(params: {
  teamId: string;
  taskId: string;
  userId: string;
}) {
  const { data: activeRows, error: activeError } = await supabase
    .from("design_task_timer_sessions")
    .select("id")
    .eq("team_id", params.teamId)
    .eq("design_task_id", params.taskId)
    .is("paused_at", null)
    .limit(1);
  const activeRow = ((activeRows ?? []) as Array<{ id?: string | null }>)[0] ?? null;
  if (activeError) throw activeError;
  if (activeRow) {
    throw new Error("Таймер вже запущено.");
  }

  const { error } = await supabase.from("design_task_timer_sessions").insert({
    team_id: params.teamId,
    design_task_id: params.taskId,
    user_id: params.userId,
    started_at: new Date().toISOString(),
    paused_at: null,
  });
  if (error) throw error;
  dispatchTimerUpdated({ teamId: params.teamId, taskId: params.taskId, userId: params.userId });
}

export async function pauseDesignTaskTimer(params: {
  teamId: string;
  taskId: string;
}) {
  const { data: activeRows, error: activeError } = await supabase
    .from("design_task_timer_sessions")
    .select("id,paused_at")
    .eq("team_id", params.teamId)
    .eq("design_task_id", params.taskId)
    .is("paused_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  const activeRow = ((activeRows ?? []) as Array<{ id?: string | null; paused_at?: string | null }>)[0] ?? null;
  if (activeError) throw activeError;
  if (!activeRow?.id) return false;

  const { error: updateError } = await supabase
    .from("design_task_timer_sessions")
    .update({ paused_at: new Date().toISOString() })
    .eq("id", activeRow.id)
    .is("paused_at", null);
  if (updateError) throw updateError;
  dispatchTimerUpdated({ teamId: params.teamId, taskId: params.taskId });
  return true;
}

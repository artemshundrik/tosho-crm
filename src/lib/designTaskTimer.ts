import { supabase } from "@/lib/supabaseClient";

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

function summarizeSessions(
  sessions: DesignTaskTimerSessionRow[],
  nowMs = Date.now()
): DesignTaskTimerSummary {
  let totalSeconds = 0;
  let active: DesignTaskTimerSessionRow | null = null;

  sessions.forEach((session) => {
    const endMs = session.paused_at ? toUnixMs(session.paused_at) : nowMs;
    totalSeconds += secondsBetween(session.started_at, endMs);
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

export function formatElapsedSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

export async function startDesignTaskTimer(params: {
  teamId: string;
  taskId: string;
  userId: string;
}) {
  const { data: activeRow, error: activeError } = await supabase
    .from("design_task_timer_sessions")
    .select("id")
    .eq("team_id", params.teamId)
    .eq("design_task_id", params.taskId)
    .is("paused_at", null)
    .maybeSingle();
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
}

export async function pauseDesignTaskTimer(params: {
  teamId: string;
  taskId: string;
}) {
  const { data: activeRow, error: activeError } = await supabase
    .from("design_task_timer_sessions")
    .select("id,paused_at")
    .eq("team_id", params.teamId)
    .eq("design_task_id", params.taskId)
    .is("paused_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (!activeRow?.id) return false;

  const { error: updateError } = await supabase
    .from("design_task_timer_sessions")
    .update({ paused_at: new Date().toISOString() })
    .eq("id", activeRow.id)
    .is("paused_at", null);
  if (updateError) throw updateError;
  return true;
}

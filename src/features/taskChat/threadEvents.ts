import { supabase } from "@/lib/supabaseClient";
import type { ThreadEntry } from "@/lib/taskThread";

/**
 * Події нитки беремо з НАЯВНОГО public.activity_log — окремої історії заводити
 * не треба: кожна змістовна зміна вже дописується власним рядком, і `title`
 * уже написаний українською («Статус: В роботі → Дизайн готовий»).
 *
 * Розвідка проду 2026-08-02: design_task_status 3029 рядків, brief_change_request 437,
 * deadline 534, assignment 77. Див. docs/TASK_CHAT_DESIGN.md §5.
 */
export const THREAD_EVENT_ACTIONS = [
  "design_task_status",
  "design_task_deadline",
  "design_task_assignment",
  "design_task_estimate",
  "design_task_brief_change_request",
  "design_output_upload",
  "design_task_attachment",
] as const;

/** Тон крапки поруч із подією: зелена — просування, бурштинова — правки/дедлайн. */
export function eventTone(action: string | null): "ok" | "warn" | "neutral" {
  if (action === "design_task_status" || action === "design_output_upload") return "ok";
  if (action === "design_task_brief_change_request" || action === "design_task_deadline") return "warn";
  return "neutral";
}

type ActivityRow = {
  id: string;
  action: string;
  title: string | null;
  created_at: string;
  user_id: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * `quoteRef` — те, що лежить у metadata->>quote_id. Буває виду
 * `standalone-<uuid>`, тому порівнюємо як текст без приведення до uuid.
 *
 * `actions` — білий список дій, який задає сторінка-власник нитки: у різних
 * сутностей події звуться по-різному. Порожній список означає «стрічка лише з
 * повідомлень», і тоді в базу не ходимо взагалі.
 */
export async function fetchThreadEvents(
  quoteRef: string,
  teamId: string,
  actions: readonly string[]
): Promise<ThreadEntry[]> {
  if (actions.length === 0) return [];

  const { data, error } = await supabase
    .from("activity_log")
    .select("id,action,title,created_at,user_id,metadata")
    .eq("team_id", teamId)
    .in("action", [...actions])
    .eq("metadata->>quote_id", quoteRef)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  return ((data as ActivityRow[] | null) ?? []).map((row) => ({
    id: `event-${row.id}`,
    kind: "event" as const,
    body: row.title ?? row.action,
    createdAt: row.created_at,
    createdBy: row.user_id,
    visibility: "team" as const,
    source: "crm" as const,
    eventType: row.action,
    designTaskId:
      typeof row.metadata?.design_task_id === "string" && row.metadata.design_task_id.trim()
        ? row.metadata.design_task_id.trim()
        : null,
    isPinned: false,
  }));
}

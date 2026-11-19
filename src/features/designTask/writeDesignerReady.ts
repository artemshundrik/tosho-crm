import type { Json } from "@/lib/database.types";
import { applyDesignStatusWrite } from "@/lib/designStatusIdempotency";
import { fetchDesignTaskMetadata } from "@/lib/designTaskMetadata";
import { withDesignerReady } from "@/lib/designTaskReadiness";
import { supabase } from "@/lib/supabaseClient";

export type WriteDesignerReadyResult =
  | { kind: "written"; metadata: Record<string, unknown> }
  | { kind: "not_in_progress" }
  | { kind: "conflict" };

/**
 * Пише позначку «моя версія готова» (або знімає її) у metadata задачі (REQ-365).
 *
 * Двоє дизайнерів можуть здати одночасно: кожен читає metadata й пише свою
 * позначку. Щоб друга не затерла першу, запис іде зі звіркою на мітку
 * попереднього стану готовності (`designer_ready_rev`), а програвши —
 * повторюється на свіжих даних. Плюс звірка статусу: здавати можна лише
 * «В роботі» — якщо задачу вже посунули, запису не буде.
 */
export async function writeDesignerReady(input: {
  taskId: string;
  teamId: string;
  userId: string;
  ready: boolean;
  fallbackMetadata: Record<string, unknown> | null | undefined;
}): Promise<WriteDesignerReadyResult> {
  let live = await fetchDesignTaskMetadata(input.taskId, input.teamId, input.fallbackMetadata);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (live.status !== "in_progress") return { kind: "not_in_progress" };
    const nowIso = new Date().toISOString();
    const candidate: Record<string, unknown> = {
      ...withDesignerReady(live, input.userId, input.ready, nowIso),
      designer_ready_rev: nowIso,
    };
    const previousRev = typeof live.designer_ready_rev === "string" ? live.designer_ready_rev : null;
    // Типи PostgREST не знають JSON-шляхів — так само звужено в designStatusIdempotency.ts.
    const base = supabase
      .from("activity_log")
      .update({ metadata: candidate as Json })
      .eq("id", input.taskId)
      .eq("team_id", input.teamId) as unknown as {
      eq: (column: string, value: unknown) => unknown;
      is: (column: string, value: null) => unknown;
    };
    const guarded = previousRev
      ? base.eq("metadata->>designer_ready_rev", previousRev)
      : base.is("metadata->>designer_ready_rev", null);
    const { applied } = await applyDesignStatusWrite(guarded, "in_progress");
    if (applied) return { kind: "written", metadata: candidate };
    live = await fetchDesignTaskMetadata(input.taskId, input.teamId, input.fallbackMetadata);
  }

  return live.status === "in_progress" ? { kind: "conflict" } : { kind: "not_in_progress" };
}

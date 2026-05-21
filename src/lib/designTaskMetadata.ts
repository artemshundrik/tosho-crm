import { supabase } from "@/lib/supabaseClient";

export type DesignTaskMetadata = Record<string, unknown>;

/**
 * Fetch the live `metadata` blob for a design task row in `activity_log`.
 *
 * Use this before composing the `nextMetadata` payload for any UPDATE that
 * does `metadata: { ...someTask.metadata, ...patch }`. Both DesignPage and
 * DesignTaskPage keep a stripped copy of metadata in sessionStorage for fast
 * paint, and writing back during the cache-hit window would otherwise wipe
 * the missing keys (design_brief, design_output_files, etc.).
 */
export async function fetchDesignTaskMetadata(
  taskId: string,
  teamId: string,
  fallback?: DesignTaskMetadata | null
): Promise<DesignTaskMetadata> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("metadata")
    .eq("id", taskId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw error;
  const live = (data?.metadata as DesignTaskMetadata | null) ?? null;
  return live ?? fallback ?? {};
}

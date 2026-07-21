import { supabase } from "@/lib/supabaseClient";

type ManagedWorkProbeArgs = {
  userId: string;
  teamId: string;
};

/**
 * Does this user own any managed work at all — a quote they're assigned to, or a
 * design task they manage?
 *
 * Both surfaces (QuotesPage, DesignPage) default their manager filter to «себе»
 * when this is true. It deliberately spans BOTH entities: someone who manages
 * only designs (typical for SEO) must still land on «себе» in прорахунки, and
 * vice versa. Probing a single entity per page is what kept regressing.
 *
 * Uses `head: true` COUNT probes so the answer is pagination-proof — scanning the
 * loaded rows misses owners whose rows aren't on page 1.
 *
 * Fails safe to `false` (→ «всі»), so a broken probe never hides work.
 */
export async function hasOwnManagedWork({ userId, teamId }: ManagedWorkProbeArgs): Promise<boolean> {
  const owner = userId.trim();
  const team = teamId.trim();
  if (!owner || !team) return false;

  const [quotes, designTasks] = await Promise.all([
    countOwnQuotes(owner, team),
    countOwnDesignTasks(owner, team),
  ]);

  return quotes > 0 || designTasks > 0;
}

async function countOwnQuotes(userId: string, teamId: string): Promise<number> {
  try {
    const { count } = await supabase
      .schema("tosho")
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("assigned_to", userId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function countOwnDesignTasks(userId: string, teamId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("action", "design_task")
      .eq("metadata->>manager_user_id", userId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

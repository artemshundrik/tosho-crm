import { supabase } from "@/lib/supabaseClient";

const isMissingFunctionError = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("not found in the schema cache") ||
    normalized.includes("could not find the function")
  );
};

export const getDesignTaskMonthCode = (value?: string | null) => {
  const date = value ? new Date(value) : new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${year}`;
};

export const formatDesignTaskNumber = (monthCode: string, sequence: number) =>
  `TS-${monthCode}-${String(Math.max(1, sequence)).padStart(4, "0")}`;

async function getNextDesignTaskNumberFallback(teamId: string, createdAtIso: string) {
  const date = new Date(createdAtIso);
  const monthCode = getDesignTaskMonthCode(createdAtIso);
  const monthStartIso = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
  const nextMonthStartIso = new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString();
  const { count, error } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("action", "design_task")
    .gte("created_at", monthStartIso)
    .lt("created_at", nextMonthStartIso);

  if (error) throw error;
  return formatDesignTaskNumber(monthCode, (count ?? 0) + 1);
}

export async function getNextDesignTaskNumber(teamId: string, createdAtIso: string) {
  const { data, error } = await supabase.rpc("next_design_task_number", {
    p_team_id: teamId,
    p_created_at: createdAtIso,
  });

  if (!error && typeof data === "string" && data.trim().length > 0) {
    return data.trim();
  }

  if (error && !isMissingFunctionError(error.message)) {
    throw error;
  }

  return getNextDesignTaskNumberFallback(teamId, createdAtIso);
}

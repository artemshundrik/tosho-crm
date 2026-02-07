import { supabase } from "@/lib/supabaseClient";

const WORKSPACE_RPC_CANDIDATES = ["my_workspace_id", "current_workspace_id"] as const;

const isMissingFunctionError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("not found in the schema cache") ||
    normalized.includes("could not find the function")
  );
};

const tryRpcWorkspaceId = async (rpcName: string): Promise<string | null> => {
  const { data, error } = await supabase.schema("tosho").rpc(rpcName);
  if (!error && typeof data === "string" && data.trim().length > 0) {
    return data;
  }
  if (error && !isMissingFunctionError(error.message ?? "")) {
    throw error;
  }
  return null;
};

export async function resolveWorkspaceId(userId?: string | null): Promise<string | null> {
  for (const rpcName of WORKSPACE_RPC_CANDIDATES) {
    const workspaceId = await tryRpcWorkspaceId(rpcName);
    if (workspaceId) return workspaceId;
  }

  if (!userId) return null;

  const { data: fromView, error: viewError } = await supabase
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ workspace_id?: string | null }>();

  if (!viewError && fromView?.workspace_id) {
    return fromView.workspace_id;
  }

  const membershipTables = ["memberships", "workspace_memberships"] as const;
  for (const tableName of membershipTables) {
    const { data, error } = await supabase
      .schema("tosho")
      .from(tableName)
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle<{ workspace_id?: string | null }>();

    if (!error && data?.workspace_id) {
      return data.workspace_id;
    }
  }

  return null;
}

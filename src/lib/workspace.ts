import { supabase } from "@/lib/supabaseClient";

const WORKSPACE_RPC_CANDIDATES = ["my_workspace_id", "current_workspace_id"] as const;
const workspaceIdCache = new Map<string, string | null>();
const workspaceMembershipCache = new Map<string, { accessRole: string | null; jobRole: string | null } | null>();

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

const isMissingRelationError = (message?: string | null) => {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find")
  );
};

export async function resolveWorkspaceId(userId?: string | null): Promise<string | null> {
  if (userId && workspaceIdCache.has(userId)) {
    return workspaceIdCache.get(userId) ?? null;
  }

  const membershipSchemas = ["tosho", "public"] as const;

  for (const rpcName of WORKSPACE_RPC_CANDIDATES) {
    const workspaceId = await tryRpcWorkspaceId(rpcName);
    if (workspaceId) {
      if (userId) workspaceIdCache.set(userId, workspaceId);
      return workspaceId;
    }
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
    workspaceIdCache.set(userId, fromView.workspace_id);
    return fromView.workspace_id;
  }

  const membershipTables = ["memberships", "workspace_memberships"] as const;
  for (const schemaName of membershipSchemas) {
    for (const tableName of membershipTables) {
      const { data, error } = await supabase
        .schema(schemaName)
        .from(tableName)
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<{ workspace_id?: string | null }>();

      if (!error && data?.workspace_id) {
        workspaceIdCache.set(userId, data.workspace_id);
        return data.workspace_id;
      }
    }
  }

  workspaceIdCache.set(userId, null);
  return null;
}

export async function resolveWorkspaceMembership(
  workspaceId?: string | null,
  userId?: string | null
): Promise<{ accessRole: string | null; jobRole: string | null } | null> {
  if (!workspaceId || !userId) return null;

  const cacheKey = `${workspaceId}:${userId}`;
  if (workspaceMembershipCache.has(cacheKey)) {
    return workspaceMembershipCache.get(cacheKey) ?? null;
  }

  const viewResult = await supabase
    .schema("tosho")
    .from("memberships_view")
    .select("access_role,job_role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

  if (!viewResult.error) {
    const resolved = {
      accessRole: viewResult.data?.access_role ?? null,
      jobRole: viewResult.data?.job_role ?? null,
    };
    workspaceMembershipCache.set(cacheKey, resolved);
    return resolved;
  }

  if (!isMissingRelationError(viewResult.error.message)) {
    workspaceMembershipCache.set(cacheKey, null);
    return null;
  }

  const tableCandidates = [
    { schema: "tosho", table: "memberships" },
    { schema: "public", table: "memberships" },
    { schema: "tosho", table: "workspace_memberships" },
    { schema: "public", table: "workspace_memberships" },
  ] as const;

  for (const candidate of tableCandidates) {
    const result = await supabase
      .schema(candidate.schema)
      .from(candidate.table)
      .select("access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

    if (!result.error) {
      const resolved = {
        accessRole: result.data?.access_role ?? null,
        jobRole: result.data?.job_role ?? null,
      };
      workspaceMembershipCache.set(cacheKey, resolved);
      return resolved;
    }

    if (!isMissingRelationError(result.error.message)) {
      break;
    }
  }

  workspaceMembershipCache.set(cacheKey, null);
  return null;
}

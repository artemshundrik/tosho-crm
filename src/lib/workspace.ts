import { supabase } from "@/lib/supabaseClient";
import { forgetFlight, singleFlight } from "@/lib/singleFlight";

const WORKSPACE_RPC_CANDIDATES = ["my_workspace_id", "current_workspace_id"] as const;
const workspaceIdCache = new Map<string, string | null>();

/**
 * Ключ кешу, коли викликали без userId.
 *
 * RPC `my_workspace_id` відповідає за ПОТОЧНУ сесію й аргумент ігнорує, тож
 * відповідь однакова. Без цього ключа виклики без userId не кешувались узагалі
 * — і кожен ходив у базу заново.
 */
const SELF_KEY = "__self__";

const workspaceMembershipCache = new Map<string, { accessRole: string | null; jobRole: string | null } | null>();

type WorkspaceLookupOptions = {
  forceRefresh?: boolean;
};

const isMissingFunctionError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("not found in the schema cache") ||
    normalized.includes("could not find the function")
  );
};

const tryRpcWorkspaceId = async (rpcName: string): Promise<string | null> => {
  const { data, error } = await supabase.schema("tosho").rpc(rpcName as "my_workspace_id");
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

export function invalidateWorkspaceResolution(userId?: string | null, workspaceId?: string | null) {
  workspaceIdCache.delete(SELF_KEY);
  if (userId) {
    workspaceIdCache.delete(userId);
  }
  if (userId && workspaceId) {
    workspaceMembershipCache.delete(`${workspaceId}:${userId}`);
  }
}

export async function resolveWorkspaceId(
  userId?: string | null,
  options?: WorkspaceLookupOptions
): Promise<string | null> {
  const cacheKey = userId ?? SELF_KEY;
  if (!options?.forceRefresh && workspaceIdCache.has(cacheKey)) {
    return workspaceIdCache.get(cacheKey) ?? null;
  }
  if (options?.forceRefresh) forgetFlight(`ws:${cacheKey}`);

  return singleFlight(`ws:${cacheKey}`, async () => {
    const resolved = await lookupWorkspaceId(userId);
    workspaceIdCache.set(cacheKey, resolved);
    return resolved;
  });
}

async function lookupWorkspaceId(userId?: string | null): Promise<string | null> {
  const membershipSchemas = ["tosho", "public"] as const;

  for (const rpcName of WORKSPACE_RPC_CANDIDATES) {
    const workspaceId = await tryRpcWorkspaceId(rpcName);
    if (workspaceId) {
      if (userId) workspaceIdCache.set(userId, workspaceId);
      return workspaceId;
    }
  }

  if (!userId) return null;

  const { data: fromViewRows, error: viewError } = await supabase
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1);
  const fromView = ((fromViewRows ?? []) as Array<{ workspace_id?: string | null }>)[0] ?? null;

  if (!viewError && fromView?.workspace_id) {
    workspaceIdCache.set(userId, fromView.workspace_id);
    return fromView.workspace_id;
  }

  const membershipTables = ["memberships", "workspace_memberships"] as const;
  for (const schemaName of membershipSchemas) {
    for (const tableName of membershipTables) {
      const { data: rows, error } = await supabase
        .schema(schemaName)
        .from(tableName as never)
        .select("workspace_id")
        .eq("user_id", userId)
        .limit(1);
      const data = ((rows ?? []) as Array<{ workspace_id?: string | null }>)[0] ?? null;

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
  userId?: string | null,
  options?: WorkspaceLookupOptions
): Promise<{ accessRole: string | null; jobRole: string | null } | null> {
  if (!workspaceId || !userId) return null;

  const cacheKey = `${workspaceId}:${userId}`;
  if (!options?.forceRefresh && workspaceMembershipCache.has(cacheKey)) {
    return workspaceMembershipCache.get(cacheKey) ?? null;
  }
  if (options?.forceRefresh) forgetFlight(`mem:${cacheKey}`);

  return singleFlight(`mem:${cacheKey}`, () => lookupWorkspaceMembership(workspaceId, userId, cacheKey));
}

async function lookupWorkspaceMembership(
  workspaceId: string,
  userId: string,
  cacheKey: string
): Promise<{ accessRole: string | null; jobRole: string | null } | null> {
  const viewResult = await supabase
    .schema("tosho")
    .from("memberships_view")
    .select("access_role,job_role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .limit(1);
  const viewRow = ((viewResult.data ?? []) as Array<{ access_role?: string | null; job_role?: string | null }>)[0] ?? null;

  if (!viewResult.error) {
    const resolved = {
      accessRole: viewRow?.access_role ?? null,
      jobRole: viewRow?.job_role ?? null,
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
      .from(candidate.table as never)
      .select("access_role,job_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .limit(1);
    const row = ((result.data ?? []) as Array<{ access_role?: string | null; job_role?: string | null }>)[0] ?? null;

    if (!result.error) {
      const resolved = {
        accessRole: row?.access_role ?? null,
        jobRole: row?.job_role ?? null,
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

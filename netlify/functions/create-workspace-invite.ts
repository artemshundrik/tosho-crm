import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type InviteRequest = {
  mode?: "create_invite" | "update_member_roles";
  email?: string;
  accessRole?: string;
  jobRole?: string | null;
  expiresInDays?: number;
  userId?: string;
};

const normalizeRole = (value?: string | null) => {
  if (!value || value === "member") return null;
  return value;
};

const sameRole = (value: string | null | undefined, expected: string | null) => {
  const normalized = value === "member" ? null : value ?? null;
  return normalized === expected;
};

const isRecoverableError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("cannot update view") ||
    normalized.includes("could not find the table")
  );
};

const resolveWorkspaceId = async (userClient: ReturnType<typeof createClient>, userId: string) => {
  const rpcCandidates = ["my_workspace_id", "current_workspace_id"] as const;

  for (const rpcName of rpcCandidates) {
    const { data, error } = await userClient.schema("tosho").rpc(rpcName);
    if (!error && data) {
      return data as string;
    }
  }

  const { data: membershipView } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ workspace_id?: string | null }>();

  if (membershipView?.workspace_id) {
    return membershipView.workspace_id;
  }

  const membershipTables = ["memberships", "workspace_memberships"] as const;
  for (const tableName of membershipTables) {
    const { data } = await userClient
      .schema("tosho")
      .from(tableName)
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle<{ workspace_id?: string | null }>();

    if (data?.workspace_id) {
      return data.workspace_id;
    }
  }

  return null;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: any) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization token" });
  }

  let payload: InviteRequest;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const workspaceId = await resolveWorkspaceId(userClient, userData.user.id);

  if (!workspaceId) {
    return jsonResponse(400, { error: "Workspace not found" });
  }

  if (payload.mode === "update_member_roles") {
    const targetUserId = payload.userId?.trim();
    if (!targetUserId) {
      return jsonResponse(400, { error: "Missing userId" });
    }
    if (targetUserId === userData.user.id) {
      return jsonResponse(400, { error: "You cannot change your own roles" });
    }

    const nextAccessRole = normalizeRole(payload.accessRole ?? "member");
    const nextJobRole = normalizeRole(payload.jobRole);

    const { data: actorMembership, error: actorMembershipError } = await userClient
      .schema("tosho")
      .from("memberships_view")
      .select("access_role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle<{ access_role?: string | null }>();

    if (actorMembershipError) {
      return jsonResponse(500, { error: actorMembershipError.message });
    }
    if ((actorMembership?.access_role ?? null) !== "owner") {
      return jsonResponse(403, { error: "Only Super Admin can update roles" });
    }

    const recoverableErrors: string[] = [];

    const verifyUpdated = async () => {
      const { data: row, error: checkError } = await adminClient
        .schema("tosho")
        .from("memberships_view")
        .select("access_role,job_role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", targetUserId)
        .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

      if (checkError) throw new Error(checkError.message);
      if (!row) return false;
      const ok = sameRole(row.access_role, nextAccessRole) && sameRole(row.job_role, nextJobRole);
      return ok;
    };

    const tryUpdateWorkspaceScoped = async (
      tableName: string,
      updatePayload: Record<string, string | null>
    ) => {
      const { error } = await adminClient
        .schema("tosho")
        .from(tableName)
        .update(updatePayload)
        .eq("workspace_id", workspaceId)
        .eq("user_id", targetUserId);

      if (error) {
        if (!isRecoverableError(error.message)) throw new Error(error.message);
        recoverableErrors.push(`${tableName}(${Object.keys(updatePayload).join(",")}): ${error.message}`);
        return false;
      }

      return verifyUpdated();
    };

    try {
      const updateAttempts: Array<{ tableName: string; payload: Record<string, string | null> }> = [
        { tableName: "memberships", payload: { access_role: nextAccessRole, job_role: nextJobRole } },
        { tableName: "memberships", payload: { role: nextAccessRole, job_role: nextJobRole } },
        { tableName: "workspace_members", payload: { access_role: nextAccessRole, job_role: nextJobRole } },
        { tableName: "workspace_members", payload: { role: nextAccessRole, job_role: nextJobRole } },
        { tableName: "workspace_memberships", payload: { access_role: nextAccessRole, job_role: nextJobRole } },
        { tableName: "workspace_memberships", payload: { role: nextAccessRole, job_role: nextJobRole } },
      ];

      let updated = false;
      for (const attempt of updateAttempts) {
        updated = await tryUpdateWorkspaceScoped(attempt.tableName, attempt.payload);
        if (updated) break;
      }

      if (!updated) {
        return jsonResponse(500, {
          error:
            recoverableErrors[recoverableErrors.length - 1] ||
            "Could not update roles. Check memberships table and exposed columns in PostgREST.",
        });
      }

      return jsonResponse(200, {
        success: true,
        userId: targetUserId,
        accessRole: nextAccessRole,
        jobRole: nextJobRole,
      });
    } catch (error: any) {
      return jsonResponse(500, { error: error?.message ?? "Could not update roles" });
    }
  }

  const email = payload.email?.trim().toLowerCase();
  if (!email) {
    return jsonResponse(400, { error: "Missing email" });
  }

  const accessRole = payload.accessRole || "member";
  const jobRole = payload.jobRole ?? null;
  const expiresInDays =
    typeof payload.expiresInDays === "number" && payload.expiresInDays > 0
      ? payload.expiresInDays
      : 7;

  const tokenValue = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: inviteInsertError } = await adminClient
    .schema("tosho")
    .from("workspace_invites")
    .insert({
      workspace_id: workspaceId,
      email,
      access_role: accessRole,
      job_role: jobRole,
      token: tokenValue,
      created_by: userData.user.id,
      expires_at: expiresAt,
    });

  let finalToken = tokenValue;
  let finalExpiresAt = expiresAt;
  let reusedExistingInvite = false;

  if (inviteInsertError) {
    const isDuplicateActiveInvite =
      inviteInsertError.code === "23505" &&
      inviteInsertError.message.includes("workspace_invites_unique_active_per_email");

    if (!isDuplicateActiveInvite) {
      return jsonResponse(500, { error: inviteInsertError.message });
    }

    const now = new Date().toISOString();
    const { data: existingInvite, error: existingInviteError } = await adminClient
      .schema("tosho")
      .from("workspace_invites")
      .select("token,expires_at")
      .eq("workspace_id", workspaceId)
      .eq("email", email)
      .is("accepted_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInviteError || !existingInvite?.token) {
      return jsonResponse(500, { error: inviteInsertError.message });
    }

    finalToken = existingInvite.token as string;
    finalExpiresAt = (existingInvite.expires_at as string) ?? expiresAt;
    reusedExistingInvite = true;
  }

  const appUrl =
    process.env.APP_URL || process.env.URL || process.env.SITE_URL || undefined;
  const redirectTo = appUrl ? `${appUrl}/invite?token=${finalToken}` : undefined;

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { workspace_invite_token: finalToken },
  });

  if (inviteError) {
    return jsonResponse(500, { error: inviteError.message });
  }

  return jsonResponse(200, {
    token: finalToken,
    email,
    expiresAt: finalExpiresAt,
    reusedExistingInvite,
  });
};

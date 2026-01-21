import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type InviteRequest = {
  email: string;
  accessRole: string;
  jobRole?: string | null;
  expiresInDays?: number;
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

  let workspaceId: string | null = null;
  const { data: workspaceRpcData, error: workspaceRpcError } = await userClient
    .schema("tosho")
    .rpc("current_workspace_id");

  if (!workspaceRpcError && workspaceRpcData) {
    workspaceId = workspaceRpcData as string;
  }

  if (!workspaceId) {
    const { data: workspaceRow, error: workspaceError } = await userClient
      .schema("tosho")
      .from("workspaces")
      .select("id")
      .limit(1)
      .single();

    if (!workspaceError && workspaceRow?.id) {
      workspaceId = workspaceRow.id as string;
    }
  }

  if (!workspaceId) {
    return jsonResponse(400, { error: "Workspace not found" });
  }

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

  if (inviteInsertError) {
    return jsonResponse(500, { error: inviteInsertError.message });
  }

  const appUrl =
    process.env.APP_URL || process.env.URL || process.env.SITE_URL || undefined;
  const redirectTo = appUrl ? `${appUrl}/invite?token=${tokenValue}` : undefined;

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { workspace_invite_token: tokenValue },
  });

  if (inviteError) {
    return jsonResponse(500, { error: inviteError.message });
  }

  return jsonResponse(200, {
    token: tokenValue,
    email,
    expiresAt,
  });
};

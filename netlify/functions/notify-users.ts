import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

type RequestBody = {
  userIds?: string[];
  title?: string;
  body?: string | null;
  href?: string | null;
  type?: "info" | "success" | "warning";
  dedupeByHref?: boolean;
  category?: string;
};

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
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

export const handler = async (event: HttpEvent) => {
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
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization token" });
  }

  let payload: RequestBody;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const title = (payload.title ?? "").trim();
  if (!title) {
    return jsonResponse(400, { error: "Missing title" });
  }

  const userIds = Array.from(
    new Set(
      (Array.isArray(payload.userIds) ? payload.userIds : [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
  if (userIds.length === 0) {
    return jsonResponse(200, { success: true, delivered: 0 });
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

  // Authorization: a caller may only notify users who share one of their workspaces.
  // Recipients are resolved server-side against tosho.memberships — the body-supplied
  // userIds are filtered to that set, never trusted directly.
  const { data: callerWorkspaces } = await adminClient
    .schema("tosho")
    .from("memberships")
    .select("workspace_id")
    .eq("user_id", userData.user.id);
  const workspaceIds = Array.from(
    new Set(
      (callerWorkspaces ?? [])
        .map((row: { workspace_id?: string | null }) => row.workspace_id)
        .filter((id: string | null | undefined): id is string => typeof id === "string" && id.length > 0)
    )
  );
  if (workspaceIds.length === 0) {
    return jsonResponse(403, { error: "Caller is not a workspace member" });
  }
  const { data: allowedRows } = await adminClient
    .schema("tosho")
    .from("memberships")
    .select("user_id")
    .in("workspace_id", workspaceIds)
    .in("user_id", userIds);
  const allowedRecipients = new Set(
    (allowedRows ?? [])
      .map((row: { user_id?: string | null }) => row.user_id)
      .filter((id: string | null | undefined): id is string => typeof id === "string" && id.length > 0)
  );
  const authorizedUserIds = userIds.filter((id) => allowedRecipients.has(id));
  if (authorizedUserIds.length === 0) {
    return jsonResponse(200, { success: true, delivered: 0 });
  }

  const rows = authorizedUserIds.map((userId) => ({
    user_id: userId,
    title,
    body: payload.body ?? null,
    href: payload.href ?? null,
    type: payload.type ?? "info",
  }));

  // Категорія для гейтингу каналів: явна або виведена з href.
  // Дизайн-сповіщення мають href виду «/design/...» → категорія "design".
  const category =
    payload.category ?? (typeof payload.href === "string" && payload.href.startsWith("/design") ? "design" : undefined);

  try {
    const result = await deliverNotifications(adminClient, rows, {
      dedupeByHref: payload.dedupeByHref === true,
      category,
    });
    return jsonResponse(200, { success: true, ...result });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Failed to deliver notifications",
    });
  }
};

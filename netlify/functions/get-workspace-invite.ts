import { createClient } from "@supabase/supabase-js";

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: any) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const token = event.queryStringParameters?.token;
  if (!token) {
    return jsonResponse(400, { error: "Missing token" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await adminClient
    .schema("tosho")
    .from("workspace_invites")
    .select("email,expires_at,accepted_at,access_role,job_role")
    .eq("token", token)
    .single();

  if (error || !data) {
    return jsonResponse(404, { error: "Invite not found" });
  }

  return jsonResponse(200, {
    email: data.email,
    expiresAt: data.expires_at,
    acceptedAt: data.accepted_at,
    accessRole: data.access_role,
    jobRole: data.job_role,
  });
};

import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

type Decision = "inactive" | "reactivate";

type RequestBody = {
  userId?: string;
  decision?: Decision;
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

const normalizeJobRole = (value?: string | null) => (value ?? "").trim().toLowerCase();

const canManageEmployment = (membership?: { access_role?: string | null; job_role?: string | null } | null) => {
  if (!membership) return false;
  return (
    membership.access_role === "owner" ||
    membership.access_role === "admin" ||
    normalizeJobRole(membership.job_role) === "seo"
  );
};

async function resolveWorkspaceId(userClient: ReturnType<typeof createClient>, userId: string) {
  const { data } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<{ workspace_id?: string | null }>();

  return data?.workspace_id ?? null;
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  let payload: RequestBody;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const targetUserId = payload.userId?.trim();
  const decision = payload.decision;
  if (!targetUserId || !decision || !["inactive", "reactivate"].includes(decision)) {
    return jsonResponse(400, { error: "Missing userId or decision" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });

  const workspaceId = await resolveWorkspaceId(userClient, userData.user.id);
  if (!workspaceId) return jsonResponse(404, { error: "Workspace not found" });

  const { data: actorMembership, error: actorMembershipError } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("access_role,job_role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userData.user.id)
    .maybeSingle<{ access_role?: string | null; job_role?: string | null }>();

  if (actorMembershipError) return jsonResponse(500, { error: actorMembershipError.message });
  if (!canManageEmployment(actorMembership)) {
    return jsonResponse(403, { error: "Only owner, admin or SEO can update employment status" });
  }

  const { data: targetProfile, error: targetProfileError } = await adminClient
    .schema("tosho")
    .from("team_member_profiles")
    .select(
      "workspace_id,user_id,full_name,first_name,last_name,start_date,probation_end_date,employment_status,probation_review_notified_at,probation_reviewed_at,probation_reviewed_by,probation_extension_count"
    )
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId)
    .maybeSingle<{
      workspace_id: string;
      user_id: string;
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      start_date?: string | null;
      probation_end_date?: string | null;
      employment_status?: string | null;
      probation_review_notified_at?: string | null;
      probation_reviewed_at?: string | null;
      probation_reviewed_by?: string | null;
      probation_extension_count?: number | null;
    }>();

  if (targetProfileError) return jsonResponse(500, { error: targetProfileError.message });
  if (!targetProfile) return jsonResponse(404, { error: "Team member profile not found" });

  const currentStatus = (targetProfile.employment_status ?? "").trim();
  if (decision === "inactive" && currentStatus !== "active") {
    return jsonResponse(400, { error: "Only active employees can be marked inactive" });
  }
  if (decision === "reactivate" && currentStatus !== "inactive") {
    return jsonResponse(400, { error: "Only inactive employees can be reactivated" });
  }

  const nextEmploymentStatus = decision === "inactive" ? "inactive" : "active";
  const updatePayload = {
    employment_status: nextEmploymentStatus,
    updated_by: userData.user.id,
  };

  const { error: updateError } = await adminClient
    .schema("tosho")
    .from("team_member_profiles")
    .update(updatePayload)
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId);

  if (updateError) return jsonResponse(500, { error: updateError.message });

  await adminClient.schema("tosho").from("team_member_employment_events").insert({
    workspace_id: workspaceId,
    user_id: targetUserId,
    decision,
    previous_employment_status: currentStatus || null,
    next_employment_status: nextEmploymentStatus,
    decided_by: userData.user.id,
  });

  const targetName =
    targetProfile.full_name?.trim() ||
    [targetProfile.first_name?.trim(), targetProfile.last_name?.trim()].filter(Boolean).join(" ") ||
    "Співробітник";

  const title = decision === "inactive" ? "Співпрацю завершено" : "Вас повернули в штат";
  const body =
    decision === "inactive"
      ? `${targetName}, у профілі зафіксовано, що співпрацю з компанією завершено.`
      : `${targetName}, вас знову переведено в штатний статус.`;

  await deliverNotifications(adminClient, [
    {
      user_id: targetUserId,
      title,
      body,
      href: "/profile",
      type: decision === "inactive" ? "warning" : "success",
    },
  ]);

  return jsonResponse(200, {
    success: true,
    profile: {
      startDate: targetProfile.start_date ?? "",
      probationEndDate: targetProfile.probation_end_date ?? "",
      employmentStatus: nextEmploymentStatus,
      probationReviewNotifiedAt: targetProfile.probation_review_notified_at ?? "",
      probationReviewedAt: targetProfile.probation_reviewed_at ?? "",
      probationReviewedBy: targetProfile.probation_reviewed_by ?? "",
      probationExtensionCount: targetProfile.probation_extension_count ?? 0,
    },
  });
};

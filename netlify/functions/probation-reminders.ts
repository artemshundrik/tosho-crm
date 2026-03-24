import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

type HttpEvent = {
  httpMethod?: string;
};

type DueProfileRow = {
  workspace_id: string;
  user_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  probation_end_date?: string | null;
  employment_status?: string | null;
  probation_review_notified_at?: string | null;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

const normalizeJobRole = (value?: string | null) => (value ?? "").trim().toLowerCase();

export const config = {
  schedule: "0 9 * * *",
};

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const { data: profiles, error: profilesError } = await adminClient
      .schema("tosho")
      .from("team_member_profiles")
      .select(
        "workspace_id,user_id,full_name,first_name,last_name,probation_end_date,employment_status,probation_review_notified_at"
      )
      .eq("employment_status", "probation")
      .not("probation_end_date", "is", null)
      .lte("probation_end_date", todayIso)
      .is("probation_review_notified_at", null)
      .limit(200);

    if (profilesError) throw profilesError;

    const dueProfiles = (profiles ?? []) as DueProfileRow[];
    if (dueProfiles.length === 0) {
      return jsonResponse(200, { success: true, scanned: 0, delivered: 0 });
    }

    const workspaceIds = Array.from(new Set(dueProfiles.map((row) => row.workspace_id)));
    const { data: memberships, error: membershipsError } = await adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("workspace_id,user_id,access_role,job_role")
      .in("workspace_id", workspaceIds);

    if (membershipsError) throw membershipsError;

    const membershipRows = (memberships ?? []) as Array<{
      workspace_id: string;
      user_id: string;
      access_role?: string | null;
      job_role?: string | null;
    }>;

    const rowsToDeliver: Array<{
      user_id: string;
      title: string;
      body: string;
      href: string;
      type: "warning";
    }> = [];

    for (const profile of dueProfiles) {
      const targetName =
        profile.full_name?.trim() ||
        [profile.first_name?.trim(), profile.last_name?.trim()].filter(Boolean).join(" ") ||
        "Співробітник";

      const workspaceMembers = membershipRows.filter((row) => row.workspace_id === profile.workspace_id);
      const seoRecipients = workspaceMembers.filter((row) => normalizeJobRole(row.job_role) === "seo");
      const fallbackRecipients = workspaceMembers.filter(
        (row) => row.access_role === "owner" || row.access_role === "admin"
      );
      const recipients = (seoRecipients.length > 0 ? seoRecipients : fallbackRecipients).map((row) => row.user_id);
      const uniqueRecipients = Array.from(new Set(recipients.filter(Boolean)));
      if (uniqueRecipients.length === 0) continue;

      const href = `/settings/members?tab=members&member=${encodeURIComponent(profile.user_id)}&review=probation`;
      for (const recipient of uniqueRecipients) {
        rowsToDeliver.push({
          user_id: recipient,
          title: `Закінчився випробувальний термін: ${targetName}`,
          body: "Відкрий картку співробітника і прийми рішення: взяти в штат, продовжити ще на місяць або не брати.",
          href,
          type: "warning",
        });
      }
    }

    if (rowsToDeliver.length > 0) {
      await deliverNotifications(adminClient, rowsToDeliver);
      const dueUserIds = dueProfiles.map((row) => row.user_id);
      await adminClient
        .schema("tosho")
        .from("team_member_profiles")
        .update({ probation_review_notified_at: new Date().toISOString() })
        .in("user_id", dueUserIds)
        .in("workspace_id", workspaceIds);
    }

    return jsonResponse(200, {
      success: true,
      scanned: dueProfiles.length,
      delivered: rowsToDeliver.length,
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};

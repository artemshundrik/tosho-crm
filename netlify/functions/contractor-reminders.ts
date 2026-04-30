import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

type HttpEvent = {
  httpMethod?: string;
};

type ContractorReminderRow = {
  id: string;
  team_id: string;
  kind?: "contractor" | "supplier" | null;
  name?: string | null;
  services?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
};

type MembershipRow = {
  workspace_id: string;
  user_id: string;
};

type ProfileRow = {
  workspace_id: string;
  user_id: string;
  employment_status?: string | null;
};

type PendingNotificationRow = {
  user_id: string;
  title: string;
  body: string;
  href: string;
  type: "warning";
};

const REMINDER_LOOKBACK_DAYS = 30;
const EXISTING_NOTIFICATION_LOOKBACK_DAYS = 45;

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

function normalizeIdentity(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function formatDateTimeUA(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const datePart = new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart} • ${timePart}`;
}

function reminderKeyFromHref(href?: string | null) {
  if (!href) return null;
  const queryIndex = href.indexOf("?");
  if (queryIndex === -1) return null;
  const params = new URLSearchParams(href.slice(queryIndex + 1));
  const value = params.get("reminder");
  return value?.trim() || null;
}

function isDeliverableProfile(profile?: ProfileRow) {
  if (!profile) return true;
  const status = normalizeIdentity(profile.employment_status);
  return status !== "inactive" && status !== "rejected";
}

export const config = {
  schedule: "*/5 * * * *",
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
    const now = new Date();
    const nowIso = now.toISOString();
    const reminderFromIso = new Date(now.getTime() - REMINDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const notificationFromIso = new Date(
      now.getTime() - EXISTING_NOTIFICATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const [contractorsResult, existingNotificationsResult] = await Promise.all([
      adminClient
        .schema("tosho")
        .from("contractors")
        .select("id,team_id,kind,name,services,reminder_at,reminder_comment")
        .not("reminder_at", "is", null)
        .lte("reminder_at", nowIso)
        .gte("reminder_at", reminderFromIso)
        .order("reminder_at", { ascending: true })
        .limit(1000),
      adminClient
        .from("notifications")
        .select("user_id,href")
        .not("href", "is", null)
        .like("href", "/contractors%")
        .gte("created_at", notificationFromIso)
        .limit(5000),
    ]);

    if (contractorsResult.error) throw contractorsResult.error;
    if (existingNotificationsResult.error) throw existingNotificationsResult.error;

    const contractors = (contractorsResult.data ?? []) as ContractorReminderRow[];
    const teamIds = Array.from(
      new Set(contractors.map((row) => row.team_id?.trim()).filter((value): value is string => Boolean(value)))
    );

    if (teamIds.length === 0) {
      return jsonResponse(200, { success: true, scanned: 0, delivered: 0 });
    }

    const [membershipsResult, profilesResult] = await Promise.all([
      adminClient
        .schema("tosho")
        .from("memberships_view")
        .select("workspace_id,user_id")
        .in("workspace_id", teamIds)
        .limit(10000),
      adminClient
        .schema("tosho")
        .from("team_member_profiles")
        .select("workspace_id,user_id,employment_status")
        .in("workspace_id", teamIds)
        .limit(10000),
    ]);

    if (membershipsResult.error) throw membershipsResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const profileByMember = new Map(
      ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
        `${profile.workspace_id}:${profile.user_id}`,
        profile,
      ])
    );
    const recipientsByTeam = new Map<string, Set<string>>();
    for (const membership of (membershipsResult.data ?? []) as MembershipRow[]) {
      const workspaceId = membership.workspace_id?.trim();
      const userId = membership.user_id?.trim();
      if (!workspaceId || !userId) continue;
      if (!isDeliverableProfile(profileByMember.get(`${workspaceId}:${userId}`))) continue;
      const recipients = recipientsByTeam.get(workspaceId) ?? new Set<string>();
      recipients.add(userId);
      recipientsByTeam.set(workspaceId, recipients);
    }

    const existingKeys = new Set(
      ((existingNotificationsResult.data ?? []) as Array<{ user_id?: string | null; href?: string | null }>)
        .map((row) => {
          const userId = row.user_id?.trim();
          const reminderKey = reminderKeyFromHref(row.href);
          return userId && reminderKey ? `${userId}::${reminderKey}` : null;
        })
        .filter((value): value is string => Boolean(value))
    );
    const pendingRows: PendingNotificationRow[] = [];

    for (const contractor of contractors) {
      if (!contractor.id || !contractor.team_id || !contractor.reminder_at) continue;

      const reminderKey = `contractor:${contractor.id}:${contractor.reminder_at}`;
      const params = new URLSearchParams({
        reminder: reminderKey,
        tab: contractor.kind === "supplier" ? "suppliers" : "contractors",
        contractorId: contractor.id,
      });
      const name = contractor.name?.trim() || (contractor.kind === "supplier" ? "Постачальник" : "Підрядник");
      const title = `Нагадування: ${name}`;
      const bodyParts = [
        contractor.kind === "supplier" ? "Постачальник" : "Підрядник",
        contractor.services?.trim() ? `Послуги: ${contractor.services.trim()}` : null,
        contractor.reminder_comment?.trim() || null,
        `Заплановано на ${formatDateTimeUA(contractor.reminder_at)}`,
      ].filter(Boolean);
      const href = `/contractors?${params.toString()}`;
      const recipients = recipientsByTeam.get(contractor.team_id) ?? new Set<string>();

      for (const userId of recipients) {
        const dedupeKey = `${userId}::${reminderKey}`;
        if (existingKeys.has(dedupeKey)) continue;
        existingKeys.add(dedupeKey);
        pendingRows.push({
          user_id: userId,
          title,
          body: bodyParts.join("\n"),
          href,
          type: "warning",
        });
      }
    }

    let pushDelivered = 0;
    let pushFailed = 0;
    if (pendingRows.length > 0) {
      const delivery = await deliverNotifications(adminClient, pendingRows);
      pushDelivered = delivery.pushDelivered;
      pushFailed = delivery.pushFailed;
    }

    return jsonResponse(200, {
      success: true,
      scanned: contractors.length,
      delivered: pendingRows.length,
      pushDelivered,
      pushFailed,
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};

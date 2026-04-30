import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

type HttpEvent = {
  httpMethod?: string;
};

type PartyKind = "customer" | "lead";

type CustomerReminderRow = {
  id: string;
  team_id: string;
  name?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
};

type LeadReminderRow = {
  id: string;
  team_id: string;
  company_name?: string | null;
  legal_name?: string | null;
  manager?: string | null;
  manager_user_id?: string | null;
  reminder_at?: string | null;
  reminder_comment?: string | null;
};

type MemberProfileRow = {
  workspace_id: string;
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
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

function isDeliverableMember(profile: MemberProfileRow) {
  const status = normalizeIdentity(profile.employment_status);
  return status !== "inactive" && status !== "rejected";
}

function memberIdentityKeys(profile: MemberProfileRow) {
  const fullName = profile.full_name?.trim() ?? "";
  const firstName = profile.first_name?.trim() ?? "";
  const lastName = profile.last_name?.trim() ?? "";
  const combined = [firstName, lastName].filter(Boolean).join(" ");
  const email = profile.email?.trim() ?? "";
  const emailLocalPart = email.split("@")[0] ?? "";

  return [fullName, combined, firstName, lastName, email, emailLocalPart]
    .map(normalizeIdentity)
    .filter(Boolean);
}

function buildMemberIndex(profiles: MemberProfileRow[]) {
  const index = new Map<string, Set<string>>();

  for (const profile of profiles) {
    if (!profile.workspace_id || !profile.user_id || !isDeliverableMember(profile)) continue;
    for (const key of memberIdentityKeys(profile)) {
      const indexKey = `${profile.workspace_id}:${key}`;
      const userIds = index.get(indexKey) ?? new Set<string>();
      userIds.add(profile.user_id);
      index.set(indexKey, userIds);
    }
  }

  return index;
}

async function loadMemberProfiles(adminClient: ReturnType<typeof createClient>, teamIds: string[]) {
  const selects = [
    "workspace_id,user_id,email,full_name,first_name,last_name,employment_status",
    "workspace_id,user_id,full_name,first_name,last_name,employment_status",
    "workspace_id,user_id,full_name,first_name,last_name",
  ];
  let lastError: { message?: string } | null = null;

  for (const columns of selects) {
    const result = await adminClient
      .schema("tosho")
      .from("team_member_profiles")
      .select(columns)
      .in("workspace_id", teamIds)
      .limit(10000);

    if (!result.error) return (result.data ?? []) as MemberProfileRow[];

    lastError = result.error;
    if (!/column/i.test(result.error.message ?? "")) {
      throw result.error;
    }
  }

  throw lastError ?? new Error("Не вдалося завантажити профілі команди.");
}

function resolveRecipients(params: {
  teamId: string;
  managerUserId?: string | null;
  manager?: string | null;
  memberIndex: Map<string, Set<string>>;
}) {
  const managerUserId = params.managerUserId?.trim();
  if (managerUserId) return [managerUserId];

  const managerKey = normalizeIdentity(params.manager);
  if (!managerKey) return [];

  return Array.from(params.memberIndex.get(`${params.teamId}:${managerKey}`) ?? []);
}

function buildReminderNotification(params: {
  kind: PartyKind;
  id: string;
  name: string;
  reminderAt: string;
  comment?: string | null;
}) {
  const reminderKey = `${params.kind}:${params.id}:${params.reminderAt}`;
  const search = new URLSearchParams({
    reminder: reminderKey,
    tab: params.kind === "lead" ? "leads" : "customers",
    [params.kind === "lead" ? "leadId" : "customerId"]: params.id,
  });
  const body = params.comment?.trim()
    ? `${params.comment.trim()}\nЗаплановано на ${formatDateTimeUA(params.reminderAt)}`
    : `Заплановано на ${formatDateTimeUA(params.reminderAt)}`;

  return {
    reminderKey,
    title: `Нагадування: ${params.name}`,
    body,
    href: `/orders/customers?${search.toString()}`,
  };
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

    const [customersResult, leadsResult, existingNotificationsResult] = await Promise.all([
      adminClient
        .schema("tosho")
        .from("customers")
        .select("id,team_id,name,manager,manager_user_id,reminder_at,reminder_comment")
        .not("reminder_at", "is", null)
        .lte("reminder_at", nowIso)
        .gte("reminder_at", reminderFromIso)
        .order("reminder_at", { ascending: true })
        .limit(1000),
      adminClient
        .schema("tosho")
        .from("leads")
        .select("id,team_id,company_name,legal_name,manager,manager_user_id,reminder_at,reminder_comment")
        .not("reminder_at", "is", null)
        .lte("reminder_at", nowIso)
        .gte("reminder_at", reminderFromIso)
        .order("reminder_at", { ascending: true })
        .limit(1000),
      adminClient
        .from("notifications")
        .select("user_id,href")
        .not("href", "is", null)
        .like("href", "/orders/customers%")
        .gte("created_at", notificationFromIso)
        .limit(5000),
    ]);

    if (customersResult.error) throw customersResult.error;
    if (leadsResult.error) throw leadsResult.error;
    if (existingNotificationsResult.error) throw existingNotificationsResult.error;

    const customers = (customersResult.data ?? []) as CustomerReminderRow[];
    const leads = (leadsResult.data ?? []) as LeadReminderRow[];
    const teamIds = Array.from(
      new Set(
        [...customers.map((row) => row.team_id), ...leads.map((row) => row.team_id)]
          .map((value) => value?.trim())
          .filter(Boolean)
      )
    );

    if (teamIds.length === 0) {
      return jsonResponse(200, { success: true, scanned: 0, delivered: 0 });
    }

    const profiles = await loadMemberProfiles(adminClient, teamIds);
    const memberIndex = buildMemberIndex(profiles);
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

    const enqueue = (params: {
      kind: PartyKind;
      id: string;
      teamId: string;
      name: string;
      manager?: string | null;
      managerUserId?: string | null;
      reminderAt?: string | null;
      comment?: string | null;
    }) => {
      if (!params.id || !params.teamId || !params.reminderAt) return;
      const notification = buildReminderNotification({
        kind: params.kind,
        id: params.id,
        name: params.name,
        reminderAt: params.reminderAt,
        comment: params.comment,
      });
      const recipients = resolveRecipients({
        teamId: params.teamId,
        managerUserId: params.managerUserId,
        manager: params.manager,
        memberIndex,
      });

      for (const userId of recipients) {
        const dedupeKey = `${userId}::${notification.reminderKey}`;
        if (existingKeys.has(dedupeKey)) continue;
        existingKeys.add(dedupeKey);
        pendingRows.push({
          user_id: userId,
          title: notification.title,
          body: notification.body,
          href: notification.href,
          type: "warning",
        });
      }
    };

    for (const row of customers) {
      enqueue({
        kind: "customer",
        id: row.id,
        teamId: row.team_id,
        name: row.name?.trim() || "Замовник",
        manager: row.manager,
        managerUserId: row.manager_user_id,
        reminderAt: row.reminder_at,
        comment: row.reminder_comment,
      });
    }

    for (const row of leads) {
      enqueue({
        kind: "lead",
        id: row.id,
        teamId: row.team_id,
        name: row.company_name?.trim() || row.legal_name?.trim() || "Лід",
        manager: row.manager,
        managerUserId: row.manager_user_id,
        reminderAt: row.reminder_at,
        comment: row.reminder_comment,
      });
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
      scanned: customers.length + leads.length,
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

import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

type HttpEvent = {
  httpMethod?: string;
};

type TeamProfileRow = {
  workspace_id: string;
  user_id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  start_date?: string | null;
  availability_status?: string | null;
  availability_start_date?: string | null;
  availability_end_date?: string | null;
  employment_status?: string | null;
};

type MembershipRow = {
  workspace_id: string;
  user_id: string;
};

type NotificationRow = {
  user_id?: string | null;
  href?: string | null;
};

type TeamEventKind = "birthday" | "anniversary" | "vacation-start" | "vacation-end";

type PendingNotificationRow = {
  user_id: string;
  title: string;
  body: string;
  href: string;
  type: "info" | "success";
};

const TEAM_EVENTS_TIME_ZONE = "Europe/Kiev";

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

function formatDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function formatDateKeyInTimeZone(date: Date, timeZone: string) {
  const { year, month, day } = formatDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateUA(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const [year, month, day] = trimmed.split("-");
  if (!year || !month || !day) return trimmed;
  return `${day}.${month}.${year}`;
}

function getDisplayName(profile: TeamProfileRow) {
  const fullName = profile.full_name?.trim();
  if (fullName) return fullName;
  const combined = [profile.first_name?.trim(), profile.last_name?.trim()].filter(Boolean).join(" ");
  return combined || "Співробітник";
}

function normalizeEmploymentStatus(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || "active";
}

function isDeliverableMember(profile?: TeamProfileRow) {
  if (!profile) return true;
  const employmentStatus = normalizeEmploymentStatus(profile.employment_status);
  return employmentStatus !== "inactive" && employmentStatus !== "rejected";
}

function getBirthdayAgeTurningToday(birthDate?: string | null, todayKey?: string) {
  const trimmed = birthDate?.trim();
  if (!trimmed || !todayKey) return null;
  const birthMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const todayMatch = todayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!birthMatch || !todayMatch) return null;
  if (birthMatch[2] !== todayMatch[2] || birthMatch[3] !== todayMatch[3]) return null;
  return Math.max(0, Number(todayMatch[1]) - Number(birthMatch[1]));
}

function getAnniversaryYearsToday(startDate?: string | null, todayKey?: string) {
  const trimmed = startDate?.trim();
  if (!trimmed || !todayKey) return null;
  const startMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const todayMatch = todayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!startMatch || !todayMatch) return null;
  if (startMatch[2] !== todayMatch[2] || startMatch[3] !== todayMatch[3]) return null;
  const years = Number(todayMatch[1]) - Number(startMatch[1]);
  return years > 0 ? years : null;
}

function formatYearsLabel(value: number) {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${value} років`;
  if (last === 1) return `${value} рік`;
  if (last >= 2 && last <= 4) return `${value} роки`;
  return `${value} років`;
}

function buildVacationCaption(profile: TeamProfileRow) {
  const start = formatDateUA(profile.availability_start_date);
  const end = formatDateUA(profile.availability_end_date);
  if (start && end) return `Період: ${start} - ${end}`;
  if (end) return `До ${end}`;
  if (start) return `З ${start}`;
  return "Подія зі сторінки команди";
}

function buildEventNotification(
  profile: TeamProfileRow,
  kind: TeamEventKind,
  todayKey: string
): Omit<PendingNotificationRow, "user_id"> | null {
  const name = getDisplayName(profile);

  if (kind === "birthday") {
    const age = getBirthdayAgeTurningToday(profile.birth_date, todayKey);
    return {
      title: `Сьогодні день народження у ${name}`,
      body: age && age > 0 ? `${name} виповнюється ${age} років.` : `${name} святкує день народження сьогодні.`,
      href: `/team?reminder=${encodeURIComponent(`team-event:birthday:${profile.user_id}:${todayKey}`)}`,
      type: "success",
    };
  }

  if (kind === "anniversary") {
    const years = getAnniversaryYearsToday(profile.start_date, todayKey);
    if (!years) return null;
    return {
      title: `Сьогодні річниця роботи у ${name}`,
      body: `${name} вже ${formatYearsLabel(years)} в компанії.`,
      href: `/team?reminder=${encodeURIComponent(`team-event:anniversary:${profile.user_id}:${todayKey}`)}`,
      type: "success",
    };
  }

  if (kind === "vacation-start") {
    return {
      title: `Сьогодні почалась відпустка у ${name}`,
      body: buildVacationCaption(profile),
      href: `/team?reminder=${encodeURIComponent(`team-event:vacation-start:${profile.user_id}:${todayKey}`)}`,
      type: "info",
    };
  }

  return {
    title: `Сьогодні завершується відпустка у ${name}`,
    body: buildVacationCaption(profile),
    href: `/team?reminder=${encodeURIComponent(`team-event:vacation-end:${profile.user_id}:${todayKey}`)}`,
    type: "info",
  };
}

export const config = {
  schedule: "5 * * * *",
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
    const todayKey = formatDateKeyInTimeZone(now, TEAM_EVENTS_TIME_ZONE);

    const { data: profiles, error: profilesError } = await adminClient
      .schema("tosho")
      .from("team_member_profiles")
      .select(
        "workspace_id,user_id,full_name,first_name,last_name,birth_date,start_date,availability_status,availability_start_date,availability_end_date,employment_status"
      )
      .limit(5000);

    if (profilesError) throw profilesError;

    const profileRows = ((profiles ?? []) as TeamProfileRow[]).filter((profile) => {
      if (!profile.workspace_id || !profile.user_id) return false;
      return isDeliverableMember(profile);
    });

    if (profileRows.length === 0) {
      return jsonResponse(200, { success: true, scanned: 0, events: 0, delivered: 0 });
    }

    const workspaceIds = Array.from(new Set(profileRows.map((profile) => profile.workspace_id)));
    const [membershipsResult, existingNotificationsResult] = await Promise.all([
      adminClient
        .schema("tosho")
        .from("memberships_view")
        .select("workspace_id,user_id")
        .in("workspace_id", workspaceIds)
        .limit(10000),
      adminClient
        .from("notifications")
        .select("user_id,href")
        .not("href", "is", null)
        .like("href", "/team?reminder=team-event:%")
        .gte("created_at", new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .limit(10000),
    ]);

    if (membershipsResult.error) throw membershipsResult.error;
    if (existingNotificationsResult.error) throw existingNotificationsResult.error;

    const memberships = (membershipsResult.data ?? []) as MembershipRow[];
    const existingNotifications = (existingNotificationsResult.data ?? []) as NotificationRow[];
    const profileByUserKey = new Map(profileRows.map((profile) => [`${profile.workspace_id}:${profile.user_id}`, profile]));
    const recipientIdsByWorkspace = new Map<string, string[]>();

    for (const membership of memberships) {
      const workspaceId = membership.workspace_id?.trim();
      const userId = membership.user_id?.trim();
      if (!workspaceId || !userId) continue;

      const recipientProfile = profileByUserKey.get(`${workspaceId}:${userId}`);
      if (!isDeliverableMember(recipientProfile)) continue;

      const list = recipientIdsByWorkspace.get(workspaceId) ?? [];
      list.push(userId);
      recipientIdsByWorkspace.set(workspaceId, list);
    }

    const existingKeys = new Set(
      existingNotifications
        .map((row) => {
          const userId = row.user_id?.trim();
          const href = row.href?.trim();
          return userId && href ? `${userId}::${href}` : null;
        })
        .filter((value): value is string => Boolean(value))
    );

    const pendingRows: PendingNotificationRow[] = [];
    let emittedEvents = 0;

    for (const profile of profileRows) {
      const workspaceRecipients = Array.from(new Set(recipientIdsByWorkspace.get(profile.workspace_id) ?? []));
      if (workspaceRecipients.length === 0) continue;

      const events: TeamEventKind[] = [];
      if (getBirthdayAgeTurningToday(profile.birth_date, todayKey) !== null) {
        events.push("birthday");
      }
      if (getAnniversaryYearsToday(profile.start_date, todayKey) !== null) {
        events.push("anniversary");
      }
      if ((profile.availability_status ?? "").trim() === "vacation" && profile.availability_start_date?.trim() === todayKey) {
        events.push("vacation-start");
      }
      if ((profile.availability_status ?? "").trim() === "vacation" && profile.availability_end_date?.trim() === todayKey) {
        events.push("vacation-end");
      }

      for (const eventKind of events) {
        const baseNotification = buildEventNotification(profile, eventKind, todayKey);
        if (!baseNotification) continue;
        emittedEvents += 1;

        for (const recipientId of workspaceRecipients) {
          const dedupeKey = `${recipientId}::${baseNotification.href}`;
          if (existingKeys.has(dedupeKey)) continue;
          existingKeys.add(dedupeKey);
          pendingRows.push({
            user_id: recipientId,
            ...baseNotification,
          });
        }
      }
    }

    if (pendingRows.length > 0) {
      await deliverNotifications(adminClient, pendingRows);
    }

    return jsonResponse(200, {
      success: true,
      scanned: profileRows.length,
      events: emittedEvents,
      delivered: pendingRows.length,
      today: todayKey,
      timeZone: TEAM_EVENTS_TIME_ZONE,
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};

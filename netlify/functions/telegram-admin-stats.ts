import { createClient } from "@supabase/supabase-js";

// Адмін-статистика Telegram-адопції (owner/admin). Service-role, бо рядки
// user_notification_settings під RLS «лише свій» — крос-юзерну агрегацію
// інакше не зробити з клієнта.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

const PROMO_SHOWN = "telegram_promo_shown";
const PROMO_CLICKED = "telegram_promo_clicked";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function fullName(first?: string | null, last?: string | null, fallback?: string | null) {
  const name = [first?.trim(), last?.trim()].filter(Boolean).join(" ").trim();
  return name || (fallback ?? "Без імені");
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json(500, { error: "Missing Supabase env vars" });

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return json(401, { error: "Missing token" });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const callerId = userData?.user?.id;
  if (userError || !callerId) return json(401, { error: "Unauthorized" });

  // Роль + воркспейс викликача.
  const { data: memberships } = await admin
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id,access_role,job_role")
    .eq("user_id", callerId);

  const adminRow = ((memberships ?? []) as Array<{ workspace_id: string; access_role: string | null }>).find(
    (m) => ["owner", "admin"].includes((m.access_role ?? "").trim().toLowerCase())
  );
  if (!adminRow) return json(403, { error: "Forbidden" });
  const teamId = adminRow.workspace_id;

  try {
    // 1) Учасники воркспейсу.
    const { data: profiles } = await admin
      .schema("tosho")
      .from("team_member_profiles")
      .select("user_id,first_name,last_name,employment_status")
      .eq("workspace_id", teamId)
      .limit(5000);

    const memberRows = ((profiles ?? []) as Array<{
      user_id: string;
      first_name?: string | null;
      last_name?: string | null;
      employment_status?: string | null;
    }>).filter((p) => {
      const s = (p.employment_status ?? "").trim().toLowerCase();
      return s !== "inactive" && s !== "rejected";
    });
    const memberIds = memberRows.map((m) => m.user_id);

    // Ролі учасників.
    const { data: roleRows } = await admin
      .schema("tosho")
      .from("memberships_view")
      .select("user_id,access_role,job_role")
      .eq("workspace_id", teamId);
    const roleByUser = new Map<string, { accessRole: string | null; jobRole: string | null }>();
    for (const r of ((roleRows ?? []) as Array<{ user_id: string; access_role: string | null; job_role: string | null }>)) {
      roleByUser.set(r.user_id, { accessRole: r.access_role, jobRole: r.job_role });
    }

    // 2) Telegram-налаштування учасників.
    const { data: settings } = await admin
      .schema("tosho")
      .from("user_notification_settings")
      .select("user_id,telegram_chat_id,telegram_enabled,telegram_linked_at,telegram_username,channel_prefs")
      .in("user_id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
    const settingByUser = new Map<string, {
      telegram_chat_id: number | null;
      telegram_enabled: boolean | null;
      telegram_linked_at: string | null;
      telegram_username: string | null;
      channel_prefs: Record<string, Record<string, boolean>> | null;
    }>();
    for (const s of ((settings ?? []) as Array<{ user_id: string } & Record<string, unknown>>)) {
      settingByUser.set(s.user_id, s as never);
    }

    // 3) Воронка з activity_log (унікальні користувачі).
    const { data: events } = await admin
      .from("activity_log")
      .select("user_id,action")
      .eq("team_id", teamId)
      .in("action", [PROMO_SHOWN, PROMO_CLICKED])
      .limit(20000);
    const shownUsers = new Set<string>();
    const clickedUsers = new Set<string>();
    for (const e of ((events ?? []) as Array<{ user_id: string | null; action: string }>)) {
      if (!e.user_id) continue;
      if (e.action === PROMO_SHOWN) shownUsers.add(e.user_id);
      else if (e.action === PROMO_CLICKED) clickedUsers.add(e.user_id);
    }

    // 4) Складання.
    const members = memberRows.map((m) => {
      const s = settingByUser.get(m.user_id);
      const linked = s?.telegram_chat_id != null;
      const enabled = linked && s?.telegram_enabled !== false;
      return {
        userId: m.user_id,
        name: fullName(m.first_name, m.last_name, m.user_id.slice(0, 8)),
        accessRole: roleByUser.get(m.user_id)?.accessRole ?? null,
        jobRole: roleByUser.get(m.user_id)?.jobRole ?? null,
        linked,
        enabled,
        linkedAt: s?.telegram_linked_at ?? null,
        username: s?.telegram_username ?? null,
      };
    });

    const linkedCount = members.filter((m) => m.linked).length;
    const enabledCount = members.filter((m) => m.enabled).length;

    // Opt-out по категоріях серед підключених.
    const categoryOptOuts: Record<string, number> = {};
    for (const m of memberRows) {
      const s = settingByUser.get(m.user_id);
      if (s?.telegram_chat_id == null) continue;
      const prefs = s.channel_prefs ?? {};
      for (const [key, ch] of Object.entries(prefs)) {
        if (ch && ch.telegram === false) categoryOptOuts[key] = (categoryOptOuts[key] ?? 0) + 1;
      }
    }

    const clickedNotLinked = Array.from(clickedUsers).filter((u) => {
      const s = settingByUser.get(u);
      return s?.telegram_chat_id == null;
    }).length;

    return json(200, {
      totals: {
        members: members.length,
        linked: linkedCount,
        enabled: enabledCount,
        notLinked: members.length - linkedCount,
        clickedNotLinked,
      },
      funnel: {
        shown: shownUsers.size,
        clicked: clickedUsers.size,
        linked: linkedCount,
        enabled: enabledCount,
      },
      categoryOptOuts,
      members: members.sort((a, b) => Number(b.linked) - Number(a.linked) || a.name.localeCompare(b.name)),
    });
  } catch (error: unknown) {
    return json(500, { error: error instanceof Error ? error.message : "Failed" });
  }
};

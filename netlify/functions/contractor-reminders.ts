import { createClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

type ContractorReminderRow = {
  id: string;
  team_id: string;
  kind?: "contractor" | "supplier" | null;
  name?: string | null;
  services?: string | null;
  reminder_at?: string | null;
  reminder_repeat?: string | null;
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

const TIME_ZONE = "Europe/Kiev";

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** Київський настінний час для UTC-моменту. */
function kyivWallClock(date: Date): WallClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24, // о півночі Intl подекуди віддає 24
    minute: get("minute"),
    second: get("second"),
  };
}

const asUtcMillis = (w: WallClock) => Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);

/**
 * UTC-момент, київський настінний час якого дорівнює переданому.
 *
 * Ітерація, а не формула: зсув Києва залежить від самого моменту (літній/зимовий
 * час), тож перше наближення коригуємо різницею й перевіряємо ще раз.
 */
function kyivWallClockToUtc(target: WallClock): Date {
  let guess = asUtcMillis(target);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const diff = asUtcMillis(kyivWallClock(new Date(guess))) - asUtcMillis(target);
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/**
 * Наступне спрацювання періодичного нагадування — перше, що ще попереду.
 *
 * Крок рахуємо в київському настінному часі: reminder_at зберігається справжнім
 * UTC, і додавання рівно 7×24 годин зсунуло б «щотижня о 10:00» на 09:00 або
 * 11:00 після переводу годинників.
 *
 * Місячний крок тримається за день, на який людина поставила нагадування:
 * 31 січня + місяць = 28 лютого, а не 3 березня, і наступного місяця знову 31-ше.
 */
export function rollReminderForward(iso: string, repeat: "weekly" | "monthly", now: Date): string | null {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;

  const base = kyivWallClock(start);
  const anchorDay = base.day;
  let next = start;
  let steps = 0;

  while (next.getTime() <= now.getTime() && steps < 400) {
    steps += 1;
    let target: WallClock;
    if (repeat === "weekly") {
      target = { ...base, day: anchorDay + steps * 7 };
    } else {
      const monthIndex = base.month - 1 + steps;
      const year = base.year + Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      // День 0 наступного місяця = останній день цільового.
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      target = { ...base, year, month, day: Math.min(anchorDay, lastDay) };
    }
    next = kyivWallClockToUtc(target);
  }

  return next.getTime() > now.getTime() ? next.toISOString() : null;
}

function isDeliverableProfile(profile?: ProfileRow) {
  if (!profile) return true;
  const status = normalizeIdentity(profile.employment_status);
  return status !== "inactive" && status !== "rejected";
}

// Розкладу тут НЕМАЄ навмисно. Планувальник Netlify перестав будити ці функції
// 18.06.2026 (f7414689) — нагадування мовчали, поки розклад не переїхав у
// Supabase pg_cron. Рядок `schedule` лишався мертвим вантажем: він нічого не
// запускав, але обіцяв, що запускає, і при кожній спробі порахувати виклики
// доводилось наново з'ясовувати, хто ж насправді смикає функцію. Тепер її
// будить джоб reminders-minute через reminders-dispatch
// (scripts/reminders-cron.sql).

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const cronDenied = assertCronAuthorized(event);
  if (cronDenied) return cronDenied;

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
        .select("id,team_id,kind,name,services,reminder_at,reminder_repeat,reminder_comment")
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
    const rolled: Array<{ id: string; next: string }> = [];

    for (const contractor of contractors) {
      if (!contractor.id || !contractor.team_id || !contractor.reminder_at) continue;

      // Ключ дедупу рахуємо ДО прокрутки — він мусить вказувати на спрацювання,
      // що саме сталось, а не на наступне.
      const reminderKey = `contractor:${contractor.id}:${contractor.reminder_at}`;

      // Періодичне нагадування: посуваємо дату вперед, поки вона не стане
      // майбутньою. Крок рахуємо в КИЇВСЬКОМУ настінному часі, щоб «щомісяця
      // о 10:00» лишалось 10:00 і після переводу годинників — reminder_at
      // зберігається справжнім UTC, і додавання рівно 24×7 годин з'їхало б на
      // годину двічі на рік.
      const repeat = contractor.reminder_repeat === "weekly" || contractor.reminder_repeat === "monthly"
        ? contractor.reminder_repeat
        : null;
      if (repeat) {
        const next = rollReminderForward(contractor.reminder_at, repeat, now);
        if (next && next !== contractor.reminder_at) {
          rolled.push({ id: contractor.id, next });
        }
      }
      const params = new URLSearchParams({
        reminder: reminderKey,
        tab: contractor.kind === "supplier" ? "suppliers" : "contractors",
        contractorId: contractor.id,
      });
      const name = contractor.name?.trim() || (contractor.kind === "supplier" ? "Постачальник" : "Підрядник");
      const title = `Нагадування: ${name}`;
      const nextRun = rolled.find((entry) => entry.id === contractor.id)?.next ?? null;
      const bodyParts = [
        contractor.kind === "supplier" ? "Постачальник" : "Підрядник",
        contractor.services?.trim() ? `Послуги: ${contractor.services.trim()}` : null,
        contractor.reminder_comment?.trim() || null,
        `Заплановано на ${formatDateTimeUA(contractor.reminder_at)}`,
        // Періодичне нагадування має одразу казати, коли прийде наступне —
        // інакше незрозуміло, чи це разовий пінг, чи воно повернеться.
        nextRun ? `Повторно нагадаємо ${formatDateTimeUA(nextRun)}` : null,
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
    let delivered = 0;
    if (pendingRows.length > 0) {
      const delivery = await deliverNotifications(adminClient, pendingRows, { dedupeByHref: true, category: "contractor" });
      delivered = delivery.delivered;
      pushDelivered = delivery.pushDelivered;
      pushFailed = delivery.pushFailed;
    }

    // Прокрутку пишемо ПІСЛЯ доставки: якщо доставка впаде, дата лишиться
    // старою і наступний запуск (раз на хвилину) спробує ще раз. Зворотний
    // порядок мовчки з'їдав би нагадування.
    if (rolled.length > 0) {
      await Promise.all(
        rolled.map((entry) =>
          adminClient
            .schema("tosho")
            .from("contractors")
            .update({ reminder_at: entry.next })
            .eq("id", entry.id)
        )
      );
    }

    return jsonResponse(200, {
      success: true,
      scanned: contractors.length,
      rolled: rolled.length,
      delivered,
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

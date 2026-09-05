import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
};

type QuoteReminderRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  customer_name?: string | null;
  title?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  deadline_at?: string | null;
  deadline_note?: string | null;
  deadline_reminder_offset_minutes?: number | null;
  deadline_reminder_comment?: string | null;
};

const REMINDER_LOOKBACK_DAYS = 30;
const DEADLINE_SCAN_AHEAD_DAYS = 35;
const EXISTING_NOTIFICATION_LOOKBACK_DAYS = 45;
// Internal quote deadlines are stored as "floating" wall-clock times — the time
// the user picked (e.g. 10:00) labelled with a +00 offset rather than a true UTC
// instant. To fire the reminder at the right real-world moment we reinterpret
// that wall clock in the company timezone (DST-aware).
const DEADLINE_TIME_ZONE = "Europe/Kiev";

function zonedWallClockOffsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcMs;
}

function wallClockToInstant(value: string, timeZone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(value);
  const [, y, mo, d, hh, mm, ss] = match;
  const base = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? "0"));
  let instant = base - zonedWallClockOffsetMs(base, timeZone);
  // refine once so DST-transition boundaries resolve correctly
  instant = base - zonedWallClockOffsetMs(instant, timeZone);
  return new Date(instant);
}

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

async function loadQuotes(
  adminClient: SupabaseClient,
  deadlineLowerBoundIso: string,
  deadlineUpperBoundIso: string
) {
  const selectWithCreator =
    "id,number,status,customer_name,title,assigned_to,created_by,deadline_at,deadline_note,deadline_reminder_offset_minutes,deadline_reminder_comment";
  const selectWithoutCreator =
    "id,number,status,customer_name,title,assigned_to,deadline_at,deadline_note,deadline_reminder_offset_minutes,deadline_reminder_comment";

  // Один запит, дві колонки на вибір. Раніше обидві гілки були виписані
  // повністю, і це коштувало не лише дублювання: `select` із рядка-літерала
  // виводить РІЗНІ типи рядка для кожного переліку колонок, тож запасна гілка
  // (без created_by) не присвоювалась у ту саму змінну. Спільний параметр
  // `columns: string` прибирає розбіжність — форму рядка все одно задає
  // QuoteReminderRow нижче.
  // Перелік колонок збирається в рантаймі, тож вивести з нього форму рядка
  // неможливо — Supabase у такому разі віддає GenericStringError. Форму задаємо
  // тут, поруч із самими переліками: обидва вони — підмножина QuoteReminderRow,
  // у якій created_by необов'язковий рівно тому, що запасна гілка його не бере.
  const queryByColumns = async (columns: string) => {
    const { data, error } = await adminClient
      .schema("tosho")
      .from("quotes")
      .select(columns)
      .not("deadline_at", "is", null)
      .not("deadline_reminder_offset_minutes", "is", null)
      .lte("deadline_at", deadlineUpperBoundIso)
      .gte("deadline_at", deadlineLowerBoundIso)
      .order("deadline_at", { ascending: true })
      .limit(500);
    return { data: (data ?? []) as unknown as QuoteReminderRow[], error };
  };

  let result = await queryByColumns(selectWithCreator);

  if (
    result.error &&
    /column/i.test(result.error.message ?? "") &&
    /created_by/i.test(result.error.message ?? "")
  ) {
    result = await queryByColumns(selectWithoutCreator);
  }

  if (result.error) throw result.error;
  return result.data;
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
    const reminderFromIso = new Date(now.getTime() - REMINDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const deadlineLowerBoundIso = reminderFromIso;
    const deadlineUpperBoundIso = new Date(now.getTime() + DEADLINE_SCAN_AHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [quotes, existingNotificationsResult] = await Promise.all([
      loadQuotes(adminClient, deadlineLowerBoundIso, deadlineUpperBoundIso),
      adminClient
        .from("notifications")
        .select("user_id,href")
        .not("href", "is", null)
        .like("href", "/orders/estimates/%?reminder=quote-deadline:%")
        .gte("created_at", new Date(now.getTime() - EXISTING_NOTIFICATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString())
        .limit(2000),
    ]);

    if (existingNotificationsResult.error) throw existingNotificationsResult.error;

    const existingKeys = new Set(
      ((existingNotificationsResult.data ?? []) as Array<{ user_id?: string | null; href?: string | null }>)
        .map((row) => {
          const userId = row.user_id?.trim();
          const href = row.href?.trim();
          return userId && href ? `${userId}::${href}` : null;
        })
        .filter((value): value is string => Boolean(value))
    );

    const pendingRows: Array<{
      user_id: string;
      title: string;
      body: string;
      href: string;
      type: "warning";
    }> = [];

    for (const quote of quotes) {
      if (!quote.id || !quote.deadline_at) continue;
      if (["approved", "cancelled"].includes((quote.status ?? "").trim().toLowerCase())) continue;

      const deadline = wallClockToInstant(quote.deadline_at, DEADLINE_TIME_ZONE);
      if (Number.isNaN(deadline.getTime())) continue;

      const offsetMinutes = Number(quote.deadline_reminder_offset_minutes ?? NaN);
      if (!Number.isFinite(offsetMinutes) || offsetMinutes < 0) continue;

      const reminderAt = new Date(deadline.getTime() - offsetMinutes * 60 * 1000);
      if (Number.isNaN(reminderAt.getTime())) continue;
      if (reminderAt.getTime() > now.getTime()) continue;
      if (reminderAt.getTime() < new Date(reminderFromIso).getTime()) continue;

      const recipientIds = Array.from(
        new Set(
          [quote.assigned_to, quote.created_by]
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
        )
      );
      if (recipientIds.length === 0) continue;

      const reminderKey = `quote-deadline:${quote.id}:${reminderAt.toISOString()}`;
      const href = `/orders/estimates/${quote.id}?reminder=${encodeURIComponent(reminderKey)}`;
      const quoteLabel = quote.number?.trim() ? `#${quote.number.trim()}` : quote.id.slice(0, 8);
      const partyLabel = (quote.customer_name ?? quote.title ?? "").trim();
      const title = `Нагадування по дедлайну ${quoteLabel}`;
      const bodyParts = [
        partyLabel ? `Замовник: ${partyLabel}` : null,
        `Дедлайн: ${formatDateTimeUA(quote.deadline_at)}`,
        quote.deadline_reminder_comment?.trim()
          ? quote.deadline_reminder_comment.trim()
          : quote.deadline_note?.trim()
          ? quote.deadline_note.trim()
          : null,
      ].filter(Boolean);
      const body = bodyParts.join("\n");

      for (const userId of recipientIds) {
        const dedupeKey = `${userId}::${href}`;
        if (existingKeys.has(dedupeKey)) continue;
        existingKeys.add(dedupeKey);
        pendingRows.push({
          user_id: userId,
          title,
          body,
          href,
          type: "warning",
        });
      }
    }

    const delivery =
      pendingRows.length > 0
        ? await deliverNotifications(adminClient, pendingRows, { dedupeByHref: true, category: "quote_deadline" })
        : { delivered: 0 };

    return jsonResponse(200, {
      success: true,
      scanned: quotes.length,
      delivered: delivery.delivered,
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};

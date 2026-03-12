import { createClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";

type HttpEvent = {
  httpMethod?: string;
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
  adminClient: ReturnType<typeof createClient>,
  deadlineLowerBoundIso: string,
  deadlineUpperBoundIso: string
) {
  const selectWithCreator =
    "id,number,status,customer_name,title,assigned_to,created_by,deadline_at,deadline_note,deadline_reminder_offset_minutes,deadline_reminder_comment";
  const selectWithoutCreator =
    "id,number,status,customer_name,title,assigned_to,deadline_at,deadline_note,deadline_reminder_offset_minutes,deadline_reminder_comment";

  let result = await adminClient
    .schema("tosho")
    .from("quotes")
    .select(selectWithCreator)
    .not("deadline_at", "is", null)
    .not("deadline_reminder_offset_minutes", "is", null)
    .lte("deadline_at", deadlineUpperBoundIso)
    .gte("deadline_at", deadlineLowerBoundIso)
    .order("deadline_at", { ascending: true })
    .limit(500);

  if (
    result.error &&
    /column/i.test(result.error.message ?? "") &&
    /created_by/i.test(result.error.message ?? "")
  ) {
    result = await adminClient
      .schema("tosho")
      .from("quotes")
      .select(selectWithoutCreator)
      .not("deadline_at", "is", null)
      .not("deadline_reminder_offset_minutes", "is", null)
      .lte("deadline_at", deadlineUpperBoundIso)
      .gte("deadline_at", deadlineLowerBoundIso)
      .order("deadline_at", { ascending: true })
      .limit(500);
  }

  if (result.error) throw result.error;
  return (result.data ?? []) as QuoteReminderRow[];
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
    const fromIso = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const deadlineLowerBoundIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const deadlineUpperBoundIso = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();

    const [quotes, existingNotificationsResult] = await Promise.all([
      loadQuotes(adminClient, deadlineLowerBoundIso, deadlineUpperBoundIso),
      adminClient
        .from("notifications")
        .select("user_id,href")
        .not("href", "is", null)
        .like("href", "/orders/estimates/%?reminder=quote-deadline:%")
        .gte("created_at", new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
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

      const deadline = new Date(quote.deadline_at);
      if (Number.isNaN(deadline.getTime())) continue;

      const offsetMinutes = Number(quote.deadline_reminder_offset_minutes ?? NaN);
      if (!Number.isFinite(offsetMinutes) || offsetMinutes < 0) continue;

      const reminderAt = new Date(deadline.getTime() - offsetMinutes * 60 * 1000);
      if (Number.isNaN(reminderAt.getTime())) continue;
      if (reminderAt.getTime() > now.getTime()) continue;
      if (reminderAt.getTime() < new Date(fromIso).getTime()) continue;

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

    if (pendingRows.length > 0) {
      await deliverNotifications(adminClient, pendingRows);
    }

    return jsonResponse(200, {
      success: true,
      scanned: quotes.length,
      delivered: pendingRows.length,
    });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};

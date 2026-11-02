import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";
import {
  isDeliverable,
  mergeTeamMembers,
  type MembershipSource,
  type ProfileSource,
  type TeamMemberRow,
} from "./_lib/teamMembers";
import {
  CLOSED_ORDER_STATUSES,
  ORDER_REMINDER_COLUMNS,
  buildDigestLinks,
  buildHeadDigest,
  buildManagerDigest,
  collectOrderReminders,
  headDigestHref,
  kyivToday,
  managerDigestHref,
  orderDocsDigestPause,
  type DocumentReminderItem,
  type ReminderApprovalRow,
  type ReminderDispatchRow,
  type ReminderOrderRow,
} from "./_lib/orderDocumentReminders";

/**
 * Ранкове зведення документів замовникам (REQ-343#p6, p10, p12, p13).
 *
 * Що й чому — див. _lib/orderDocumentReminders.ts. Тут лише збирання:
 * замовлення, погодження, позначки надсилання, адресати — і доставка.
 *
 * Розкладу немає: функцію будить reminders-dispatch кожні п'ять хвилин. Поза
 * 10-ю годиною за Києвом і на вихідних тік закінчується на годиннику. О 10-й
 * перший тік шле, решта впирається в дедуплікацію (ключ дня в `reminder=`):
 * перечитати замовлення дешевше, ніж загубити зведення, якщо перший тік упав
 * посеред розсилки.
 *
 * ?dry=1 — повернути, що було б надіслано, нічого не пишучи.
 */

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

type DigestRow = {
  user_id: string;
  title: string;
  body: string;
  href: string;
  type: "warning";
  telegramLinks: Array<{ text: string; href: string }>;
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

/** Керівник у сенсі зведення — власник і СЕО (рішення СЕО, 02.11). */
const isHead = (member: TeamMemberRow) =>
  (member.accessRole ?? "").trim().toLowerCase() === "owner" || (member.jobRole ?? "").trim().toLowerCase() === "seo";

/** Таблиці позначок ще немає (SQL не застосовано) — PostgREST відповідає PGRST205 / 42P01. */
const isMissingTable = (error: { code?: string; message?: string }) =>
  error.code === "PGRST205" || error.code === "42P01" || /order_document_dispatches/.test(error.message ?? "");

export async function buildOrderDocumentDigests(
  adminClient: SupabaseClient,
  today: string
): Promise<{ rows: DigestRow[]; items: number; skipped?: string }> {
  const { data: orderData, error: ordersError } = await adminClient
    .schema("tosho")
    .from("orders")
    .select(ORDER_REMINDER_COLUMNS)
    .not("order_status", "in", `(${CLOSED_ORDER_STATUSES.join(",")})`)
    .limit(3000);
  if (ordersError) throw ordersError;
  const orders = (orderData ?? []) as unknown as ReminderOrderRow[];
  const teamIds = Array.from(new Set(orders.map((row) => row.team_id).filter(Boolean)));
  if (teamIds.length === 0) return { rows: [], items: 0 };

  // За командою, а не за списком id: сотні uuid у ?in= впираються в межу адреси PostgREST.
  const [approvalsResult, dispatchesResult, teamLinksResult] = await Promise.all([
    adminClient
      .schema("tosho")
      .from("order_approvals")
      .select("order_id,kind,status,document_stamp,requested_at,decided_at")
      .in("team_id", teamIds)
      .in("kind", ["contract", "specification"]),
    adminClient
      .schema("tosho")
      .from("order_document_dispatches")
      .select("order_id,document,event,document_stamp,created_at")
      .in("team_id", teamIds),
    adminClient.from("team_members").select("team_id,user_id").in("team_id", teamIds),
  ]);
  if (approvalsResult.error) throw approvalsResult.error;
  // Без журналу надсилань КОЖЕН погоджений документ виглядав би ненадісланим —
  // краще промовчати день, ніж засипати менеджерів хибними нагадуваннями.
  if (dispatchesResult.error) {
    if (isMissingTable(dispatchesResult.error)) return { rows: [], items: 0, skipped: "dispatch-table-missing" };
    throw dispatchesResult.error;
  }
  if (teamLinksResult.error) throw teamLinksResult.error;

  const approvalsByOrder = new Map<string, ReminderApprovalRow[]>();
  for (const row of (approvalsResult.data ?? []) as ReminderApprovalRow[]) {
    approvalsByOrder.set(row.order_id, [...(approvalsByOrder.get(row.order_id) ?? []), row]);
  }
  const dispatchesByOrder = new Map<string, ReminderDispatchRow[]>();
  for (const row of (dispatchesResult.data ?? []) as ReminderDispatchRow[]) {
    dispatchesByOrder.set(row.order_id, [...(dispatchesByOrder.get(row.order_id) ?? []), row]);
  }

  const items: DocumentReminderItem[] = orders.flatMap((order) =>
    collectOrderReminders(order, approvalsByOrder.get(order.id) ?? [], dispatchesByOrder.get(order.id) ?? [], today)
  );
  if (items.length === 0) return { rows: [], items: 0 };

  const teamLinks = (teamLinksResult.data ?? []) as Array<{ team_id: string; user_id: string | null }>;
  const userIds = Array.from(
    new Set(
      [...teamLinks.map((row) => row.user_id), ...items.map((item) => item.managerUserId)].filter(
        (value): value is string => Boolean(value)
      )
    )
  );
  // Звільнених відсіює isDeliverable: сервісний ключ бачить у memberships_view
  // усіх, а бот звільненої людини лишається прив'язаним.
  const [membershipsResult, profilesResult] = await Promise.all([
    adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("user_id,workspace_id,access_role,job_role")
      .in("user_id", userIds),
    adminClient
      .schema("tosho")
      .from("team_member_profiles")
      .select("user_id,employment_status,first_name,last_name")
      .in("user_id", userIds),
  ]);
  if (membershipsResult.error) throw membershipsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const members = mergeTeamMembers({
    memberships: (membershipsResult.data ?? []) as MembershipSource[],
    profiles: (profilesResult.data ?? []) as ProfileSource[],
    teamLinks,
  });
  const memberByTeamUser = new Map(members.map((member) => [`${member.teamId}::${member.userId}`, member]));
  const nameOf = (userId: string | null) =>
    (userId ? members.find((member) => member.userId === userId)?.fullName?.trim() : null) || "Без менеджера";

  const rows: DigestRow[] = [];
  const headItemsByTeam = new Map<string, DocumentReminderItem[]>();
  const managerItems = new Map<string, DocumentReminderItem[]>();

  for (const item of items) {
    const manager = item.managerUserId ? memberByTeamUser.get(`${item.teamId}::${item.managerUserId}`) : undefined;
    const managerReachable = Boolean(manager && isDeliverable(manager));
    if (managerReachable && item.managerUserId) {
      managerItems.set(item.managerUserId, [...(managerItems.get(item.managerUserId) ?? []), item]);
    }
    // Замовлення без менеджера (звільнений, не призначений) нікому не нагадає
    // саме — тож воно йде керівнику одразу, не чекаючи п'яти днів.
    if (item.escalate || !managerReachable) {
      headItemsByTeam.set(item.teamId, [...(headItemsByTeam.get(item.teamId) ?? []), item]);
    }
  }

  for (const [userId, own] of managerItems) {
    rows.push({
      user_id: userId,
      ...buildManagerDigest(own),
      href: managerDigestHref(userId, today),
      type: "warning",
      telegramLinks: buildDigestLinks(own),
    });
  }

  for (const [teamId, own] of headItemsByTeam) {
    const heads = members.filter((member) => member.teamId === teamId && isDeliverable(member) && isHead(member));
    const digest = buildHeadDigest(own, nameOf);
    for (const head of heads) {
      rows.push({
        user_id: head.userId,
        ...digest,
        href: headDigestHref(head.userId, today),
        type: "warning",
        telegramLinks: buildDigestLinks(own),
      });
    }
  }

  return { rows, items: items.length };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // ?dry=1 віддає назви замовників і номери замовлень, а assertCronAuthorized
  // без секрету пропускає всіх — тож без секрету не відповідаємо зовсім.
  if (!process.env.CRON_SHARED_SECRET) {
    return jsonResponse(503, { error: "CRON_SHARED_SECRET is not configured" });
  }
  const cronDenied = assertCronAuthorized(event);
  if (cronDenied) return cronDenied;

  const dryRun = event.queryStringParameters?.dry === "1";
  const now = new Date();

  // Спершу годинник, потім база: поза 10-ю годиною тік нічого не читає.
  // Сухий прогін годинник пропускає — щоб перевірити текст будь-коли.
  const pause = orderDocsDigestPause(now);
  if (pause && !dryRun) return jsonResponse(200, { success: true, skipped: pause });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const today = kyivToday(now);

  try {
    const { rows, items, skipped } = await buildOrderDocumentDigests(adminClient, today);
    if (skipped) return jsonResponse(200, { success: true, skipped });

    if (dryRun) return jsonResponse(200, { success: true, dryRun: true, items, rows });

    const delivery =
      rows.length > 0
        ? await deliverNotifications(adminClient, rows, { dedupeByHref: true, category: "order_documents" })
        : { delivered: 0 };

    return jsonResponse(200, { success: true, items, sent: delivery.delivered });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};

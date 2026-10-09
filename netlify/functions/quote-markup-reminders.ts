import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { deliverNotifications } from "./_notificationDelivery";
import {
  isDeliverable,
  mergeTeamMembers,
  type MembershipSource,
  type ProfileSource,
} from "./_lib/teamMembers";
import {
  MARKUP_REMINDER_KEY_PREFIX,
  buildMarkupReminder,
  isMarkupReminderDue,
  markupReminderHref,
  markupReminderPause,
} from "./_lib/quoteMarkupReminder";
import { minMarkupRateFor, resolveQuoteDealType } from "../../src/lib/quoteDealType";
import {
  formatMarkupPrice,
  formatMarkupRunLabel,
  resolveMarkupApproverIds,
} from "../../src/lib/quoteMarkupNotice";

/**
 * Щоденне нагадування погоджувачам про запит на ціну нижче дна (REQ-328).
 *
 * Чому й коли — див. _lib/quoteMarkupReminder.ts. Тут лише збирання: запити,
 * що висять, їхні прорахунки й тиражі, адресати — і доставка.
 *
 * Розкладу немає: функцію будить reminders-dispatch (джоб reminders-minute,
 * кожні п'ять хвилин). Окремий джоб означав би ще 288 викликів Netlify на
 * добу заради кількох повідомлень на тиждень. Більшість тіків закінчується
 * на першому ж запиті (нічого не висить) або взагалі без запитів (тихі години
 * й вихідні).
 *
 * ?dry=1 — повернути, що було б надіслано, нічого не пишучи.
 */

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

export type ApprovalRow = {
  id: string;
  quote_id: string;
  run_id: string;
  markup_rate: number | string | null;
  cost_total: number | string | null;
  requested_by: string | null;
  requested_at: string;
};

type QuoteRow = {
  id: string;
  number: string | null;
  status: string | null;
  team_id: string | null;
  quote_type: string | null;
  deal_type: string | null;
  currency: string | null;
};

type NotificationRow = {
  user_id: string;
  title: string;
  body: string;
  href: string;
  type: "warning";
};

/** Скасований прорахунок нікуди не піде — питати про його ціну нема сенсу. */
const CLOSED_QUOTE_STATUSES = new Set(["cancelled"]);

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

const uniq = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));

/**
 * Нагадування для запитів, які вже пора нагадати: по одному на прорахунок і
 * погоджувача, без тих, що сьогодні вже пішли.
 *
 * Окремо від обробника, щоб його можна було прогнати на живих даних без
 * надсилання — так перевірялось на справжньому запиті з TS-1026-0002.
 */
export async function buildMarkupReminderRows(
  adminClient: SupabaseClient,
  due: ApprovalRow[],
  now: Date
): Promise<NotificationRow[]> {
  const quoteIds = uniq(due.map((row) => row.quote_id));
  const runIds = uniq(due.map((row) => row.run_id));

  const [quotesResult, runsResult] = await Promise.all([
    adminClient
      .schema("tosho")
      .from("quotes")
      .select("id,number,status,team_id,quote_type,deal_type,currency")
      .in("id", quoteIds),
    adminClient.schema("tosho").from("quote_item_runs").select("id,quote_item_id,quantity").in("id", runIds),
  ]);
  if (quotesResult.error) throw quotesResult.error;
  if (runsResult.error) throw runsResult.error;

  const quotes = new Map(((quotesResult.data ?? []) as QuoteRow[]).map((row) => [row.id, row]));
  const runs = new Map(
    ((runsResult.data ?? []) as Array<{ id: string; quote_item_id: string | null; quantity: number | string | null }>).map(
      (row) => [row.id, row]
    )
  );

  const itemIds = uniq(Array.from(runs.values()).map((row) => row.quote_item_id));
  const teamIds = uniq(Array.from(quotes.values()).map((row) => row.team_id));

  const [itemsResult, teamMembersResult] = await Promise.all([
    itemIds.length > 0
      ? adminClient.schema("tosho").from("quote_items").select("id,name,unit").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    teamIds.length > 0
      ? adminClient.from("team_members").select("team_id,user_id").in("team_id", teamIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (teamMembersResult.error) throw teamMembersResult.error;

  const items = new Map(
    ((itemsResult.data ?? []) as Array<{ id: string; name: string | null; unit: string | null }>).map((row) => [
      row.id,
      row,
    ])
  );
  const teamLinks = (teamMembersResult.data ?? []) as Array<{ team_id: string; user_id: string | null }>;

  // Ролі — з memberships_view, статус і ім'я — з профілю; зводить їх канонічний
  // резолвер (_lib/teamMembers.ts). Звільнених відсіює isDeliverable: сервісний
  // ключ бачить у memberships_view УСІХ, а бот і пуш звільненої людини лишаються
  // прив'язаними — без фільтра колишній СЕО щоранку отримував би ціни клієнтів.
  const userIds = uniq([...teamLinks.map((row) => row.user_id), ...due.map((row) => row.requested_by)]);
  const [membershipsResult, profilesResult, ratesResult, existingResult] = await Promise.all([
    userIds.length > 0
      ? adminClient
          .schema("tosho")
          .from("memberships_view")
          .select("user_id,workspace_id,access_role,job_role")
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length > 0
      ? adminClient
          .schema("tosho")
          .from("team_member_profiles")
          .select("user_id,employment_status,first_name,last_name")
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    adminClient.schema("tosho").from("company_pricing_rates").select("workspace_id,print_markup_approver_user_id"),
    adminClient
      .from("notifications")
      .select("user_id,href")
      .like("href", `/orders/estimates/%?reminder=${MARKUP_REMINDER_KEY_PREFIX}%`)
      .gte("created_at", new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .limit(2000),
  ]);
  if (membershipsResult.error) throw membershipsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (ratesResult.error) throw ratesResult.error;
  if (existingResult.error) throw existingResult.error;

  const members = mergeTeamMembers({
    memberships: (membershipsResult.data ?? []) as MembershipSource[],
    profiles: (profilesResult.data ?? []) as ProfileSource[],
    teamLinks,
  });
  const memberById = new Map(members.map((member) => [member.userId, member]));
  const printApproverByWorkspace = new Map(
    ((ratesResult.data ?? []) as Array<{ workspace_id: string; print_markup_approver_user_id: string | null }>).map(
      (row) => [row.workspace_id, row.print_markup_approver_user_id]
    )
  );
  const existingKeys = new Set(
    ((existingResult.data ?? []) as Array<{ user_id: string | null; href: string | null }>)
      .filter((row) => row.user_id && row.href)
      .map((row) => `${row.user_id}::${row.href}`)
  );

  // Одне нагадування на прорахунок, а не на тираж — так само, як перший пінг.
  const byQuote = new Map<string, ApprovalRow[]>();
  for (const row of due) byQuote.set(row.quote_id, [...(byQuote.get(row.quote_id) ?? []), row]);

  const rows: NotificationRow[] = [];
  for (const [quoteId, approvals] of byQuote) {
    const quote = quotes.get(quoteId);
    if (!quote?.team_id) continue;
    if (CLOSED_QUOTE_STATUSES.has((quote.status ?? "").trim().toLowerCase())) continue;

    const dealType = resolveQuoteDealType(quote.quote_type, quote.deal_type);
    const teamMembers = members.filter((member) => member.teamId === quote.team_id && isDeliverable(member));
    const deliverableIds = new Set(teamMembers.map((member) => member.userId));
    const workspaceId = teamMembers.find((member) => member.workspaceId)?.workspaceId ?? null;
    const printApprover = workspaceId ? printApproverByWorkspace.get(workspaceId) ?? null : null;
    const askedBy = new Set(uniq(approvals.map((row) => row.requested_by)));
    const recipients = resolveMarkupApproverIds({
      members: teamMembers.map((member) => ({
        user_id: member.userId,
        access_role: member.accessRole,
        job_role: member.jobRole,
      })),
      isPrint: dealType !== null,
      // Погоджувач поліграфії, що вже не працює, — не адресат: нагадування
      // піде СЕО, які можуть хоча б перепризначити.
      printApproverUserId: printApprover && deliverableIds.has(printApprover) ? printApprover : null,
    }).filter((userId) => !askedBy.has(userId));
    if (recipients.length === 0) continue;

    const first = approvals[0];
    const text = buildMarkupReminder({
      quoteNumber: quote.number,
      requesterName: first.requested_by ? memberById.get(first.requested_by)?.fullName ?? null : null,
      runs: approvals.map((approval) => {
        const run = runs.get(approval.run_id);
        const item = run?.quote_item_id ? items.get(run.quote_item_id) : undefined;
        const quantity = Number(run?.quantity) || 0;
        return {
          label: formatMarkupRunLabel({ itemTitle: item?.name, quantity, unit: item?.unit }),
          // Ціна на собівартості, ПРИ ЯКІЙ просили: рішення стосується саме її.
          price: formatMarkupPrice({
            quantity,
            costTotal: Number(approval.cost_total) || 0,
            markupRate: Number(approval.markup_rate) || 0,
            unit: item?.unit,
            currency: quote.currency,
          }).label,
        };
      }),
      floorRate: minMarkupRateFor(dealType),
      requestedAt: first.requested_at,
      now,
    });
    const href = markupReminderHref(quoteId, now);

    for (const userId of recipients) {
      const key = `${userId}::${href}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      rows.push({ user_id: userId, ...text, href, type: "warning" });
    }
  }
  return rows;
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && !["GET", "POST"].includes(event.httpMethod)) {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // ?dry=1 віддає імена, ціни й номери прорахунків, а assertCronAuthorized без
  // секрету пропускає всіх — тож без секрету не відповідаємо зовсім (як daily-digest).
  if (!process.env.CRON_SHARED_SECRET) {
    return jsonResponse(503, { error: "CRON_SHARED_SECRET is not configured" });
  }
  const cronDenied = assertCronAuthorized(event);
  if (cronDenied) return cronDenied;

  const dryRun = event.queryStringParameters?.dry === "1";
  const now = new Date();

  // Спершу годинник, потім база: уночі й на вихідних цей тік нічого не читає.
  const pause = markupReminderPause(now);
  if (pause) return jsonResponse(200, { success: true, skipped: pause });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const { data: pendingData, error: pendingError } = await adminClient
      .schema("tosho")
      .from("quote_run_markup_approvals")
      .select("id,quote_id,run_id,markup_rate,cost_total,requested_by,requested_at")
      .eq("status", "pending")
      .order("requested_at", { ascending: true })
      .limit(500);
    if (pendingError) throw pendingError;

    const due = ((pendingData ?? []) as ApprovalRow[]).filter((row) => isMarkupReminderDue(row.requested_at, now));
    if (due.length === 0) return jsonResponse(200, { success: true, pending: pendingData?.length ?? 0, sent: 0 });

    const rows = await buildMarkupReminderRows(adminClient, due, now);

    if (dryRun) {
      return jsonResponse(200, { success: true, dryRun: true, pending: pendingData?.length ?? 0, rows });
    }

    const delivery =
      rows.length > 0
        ? await deliverNotifications(adminClient, rows, { dedupeByHref: true, category: "quote_markup_request" })
        : { delivered: 0 };

    return jsonResponse(200, { success: true, pending: pendingData?.length ?? 0, sent: delivery.delivered });
  } catch (error: unknown) {
    const message =
      typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Unknown error";
    return jsonResponse(500, { error: message });
  }
};

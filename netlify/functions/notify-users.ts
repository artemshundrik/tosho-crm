import { z } from "zod";

import { parseBody } from "./_lib/parseBody";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deliverNotifications } from "./_notificationDelivery";
import { loadOrderApprovalWidget, orderApprovalCallbackData } from "./_lib/orderApprovalWidget";

/**
 * Форма запиту — і перевірка, і тип (REQ-137).
 *
 * Стеля на `userIds` не косметична: функція розсилає сповіщення всім
 * переліченим, тож без межі один запит міг би засипати всю команду.
 */
const requestSchema = z
  .object({
    userIds: z.array(z.string().min(1)).max(200).optional(),
    title: z.string().optional(),
    body: z.string().nullable().optional(),
    href: z.string().nullable().optional(),
    type: z.enum(["info", "success", "warning"]).optional(),
    dedupeByHref: z.boolean().optional(),
    category: z.string().optional(),
    /**
     * Про що подія — щоб у Telegram прийшов віджет замість тексту (REQ-356).
     * Сервер нічого з цього не бере на віру: запит погодження перечитується
     * з бази й мусить бути заведений самим викликачем і ще не вирішений.
     */
    context: z
      .object({
        orderApprovalId: z.string().uuid().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

type RequestBody = z.infer<typeof requestSchema>;

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(204, {});
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization token" });
  }

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const payload: RequestBody = parsed.data;

  const title = (payload.title ?? "").trim();
  if (!title) {
    return jsonResponse(400, { error: "Missing title" });
  }

  const userIds = Array.from(
    new Set(
      (Array.isArray(payload.userIds) ? payload.userIds : [])
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
  if (userIds.length === 0) {
    return jsonResponse(200, { success: true, delivered: 0 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  // Authorization: a caller may only notify users who share one of their workspaces.
  // Recipients are resolved server-side against tosho.memberships — the body-supplied
  // userIds are filtered to that set, never trusted directly.
  const { data: callerWorkspaces } = await adminClient
    .schema("tosho")
    .from("memberships")
    .select("workspace_id")
    .eq("user_id", userData.user.id);
  const workspaceIds = Array.from(
    new Set(
      (callerWorkspaces ?? [])
        .map((row: { workspace_id?: string | null }) => row.workspace_id)
        .filter((id: string | null | undefined): id is string => typeof id === "string" && id.length > 0)
    )
  );
  if (workspaceIds.length === 0) {
    return jsonResponse(403, { error: "Caller is not a workspace member" });
  }
  const { data: allowedRows } = await adminClient
    .schema("tosho")
    .from("memberships")
    .select("user_id")
    .in("workspace_id", workspaceIds)
    .in("user_id", userIds);
  const allowedRecipients = new Set(
    (allowedRows ?? [])
      .map((row: { user_id?: string | null }) => row.user_id)
      .filter((id: string | null | undefined): id is string => typeof id === "string" && id.length > 0)
  );
  const authorizedUserIds = userIds.filter((id) => allowedRecipients.has(id));
  if (authorizedUserIds.length === 0) {
    return jsonResponse(200, { success: true, delivered: 0 });
  }

  const baseRows = authorizedUserIds.map((userId) => ({
    user_id: userId,
    title,
    body: payload.body ?? null,
    href: payload.href ?? null,
    type: payload.type ?? "info",
  }));
  const rows = await withOrderApprovalWidget(adminClient, baseRows, {
    callerUserId: userData.user.id,
    category: payload.category,
    approvalId: payload.context?.orderApprovalId,
  });

  // Категорія для гейтингу каналів: явна або виведена з href.
  // Дизайн-сповіщення мають href виду «/design/...» → категорія "design".
  const category =
    payload.category ?? (typeof payload.href === "string" && payload.href.startsWith("/design") ? "design" : undefined);

  try {
    const result = await deliverNotifications(adminClient, rows, {
      dedupeByHref: payload.dedupeByHref === true,
      category,
    });
    return jsonResponse(200, { success: true, ...result });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Failed to deliver notifications",
    });
  }
};

type BaseRow = {
  user_id: string;
  title: string;
  body: string | null;
  href: string | null;
  type: "info" | "success" | "warning";
};

/** Хто може погодити СП чи договір — дзеркало tosho.is_order_invoice_issuer. */
const ORDER_APPROVER_JOB_ROLES = new Set(["seo", "accountant", "chief_accountant"]);

/**
 * Запит погодити СП/договір: тим, хто може погодити, — віджет із кнопкою
 * «✅ Погодити»; решті — звичайний текст. Права на самому натисканні все
 * одно перевіряє база (tosho.bot_decide_order_approval), тут лише не
 * показуємо кнопку тому, кому вона нічого не дасть.
 *
 * Не вдалось зібрати — повертаємо рядки як є: сповіщення важливіше за вигляд.
 */
async function withOrderApprovalWidget(
  adminClient: SupabaseClient,
  rows: BaseRow[],
  params: { callerUserId: string; category?: string; approvalId?: string }
) {
  if (params.category !== "order_approval_request" || !params.approvalId) return rows;
  try {
    const { data: teamRows } = await adminClient
      .from("team_members")
      .select("team_id")
      .eq("user_id", params.callerUserId);
    const teamIds = ((teamRows ?? []) as Array<{ team_id: string | null }>)
      .map((row) => row.team_id)
      .filter((id): id is string => !!id);
    if (teamIds.length === 0) return rows;

    const loaded = await loadOrderApprovalWidget(adminClient, params.approvalId, {
      teamIds,
      requestedBy: params.callerUserId,
    });
    if (!loaded?.html) return rows;

    const { data: approverRows } = await adminClient
      .schema("tosho")
      .from("memberships")
      .select("user_id,role,job_role")
      .in(
        "user_id",
        rows.map((row) => row.user_id)
      );
    const approvers = new Set(
      ((approverRows ?? []) as Array<{ user_id: string; role?: string | null; job_role?: string | null }>)
        .filter(
          (row) =>
            String(row.role ?? "").toLowerCase() === "owner" ||
            ORDER_APPROVER_JOB_ROLES.has(String(row.job_role ?? "").toLowerCase())
        )
        .map((row) => row.user_id)
    );
    const widget = { html: loaded.html, chatData: "{}", caption: loaded.caption };
    return rows.map((row) =>
      approvers.has(row.user_id)
        ? {
            ...row,
            telegramWidget: widget,
            telegramActions: [
              { text: "✅ Погодити", callbackData: orderApprovalCallbackData(loaded.approval.id) },
              { text: "↩️ Повернути", href: loaded.href },
            ],
          }
        : row
    );
  } catch (error) {
    console.warn("[notify-users] approval widget skipped", error instanceof Error ? error.message : error);
    return rows;
  }
}

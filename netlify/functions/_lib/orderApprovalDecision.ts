import type { SupabaseClient } from "@supabase/supabase-js";

import type { InlineKeyboard } from "../_telegram";
import { deliverNotifications } from "../_notificationDelivery";

import { ORDER_APPROVAL_CALLBACK_PREFIX, shortPersonName } from "./orderApprovalWidget";

/**
 * «✅ Погодити» під віджетом СП чи договору (REQ-356#p1).
 *
 * Рішення пише tosho.bot_decide_order_approval — перевтіленням у людину, тож
 * хто може погоджувати й хто записаний у decided_by, вирішує той самий тригер,
 * що й у CRM. Після рішення робимо те, що робить CRM: запис у журнал дій і
 * сповіщення автору запиту.
 */

const SUBJECT: Record<string, string> = { contract: "договір", specification: "СП" };
const SUBJECT_TITLE: Record<string, string> = { contract: "Договір", specification: "СП" };

/** Кнопка-підпис після рішення: натискання лише показує, що вже погоджено. */
export const ORDER_APPROVAL_INFO_CALLBACK = `${ORDER_APPROVAL_CALLBACK_PREFIX}:i`;

type DecidedRow = {
  id: string;
  team_id: string;
  order_id: string;
  kind: string;
  status: string;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
};

export type BotApprovalResult =
  | { ok: true; toast: string; keyboard: InlineKeyboard }
  | { ok: false; toast: string; keyboard?: InlineKeyboard };

async function memberName(admin: SupabaseClient, userId: string | null): Promise<string> {
  if (!userId) return "";
  const { data } = await admin
    .schema("tosho")
    .from("team_member_profiles")
    .select("full_name,first_name,last_name")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const row = data as { full_name?: string | null; first_name?: string | null; last_name?: string | null } | null;
  return (row?.full_name ?? "").trim() || `${row?.first_name ?? ""} ${row?.last_name ?? ""}`.trim();
}

function kyivTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit" });
}

export function decidedKeyboard(params: { deciderName: string; decidedAt: string | null; crmUrl: string }): InlineKeyboard {
  const who = shortPersonName(params.deciderName);
  const time = kyivTime(params.decidedAt);
  const label = ["✅ Погоджено", [who, time].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  return [[{ text: label, callback_data: ORDER_APPROVAL_INFO_CALLBACK }], [{ text: "Відкрити в CRM", url: params.crmUrl }]];
}

/** Тексти помилок тригера вже людські; решту не показуємо як є. */
function humanError(message: string | undefined): string {
  const text = (message ?? "").trim();
  if (/може бухгалтер або СЕО|Рішення вже ухвалене|Невідомий стан/.test(text)) return text;
  return "Не вдалось погодити. Відкрийте замовлення в CRM";
}

export async function decideOrderApprovalFromBot(params: {
  admin: SupabaseClient;
  userId: string;
  approvalId: string;
  buildUrl: (path: string) => string;
}): Promise<BotApprovalResult> {
  const { admin, userId, approvalId } = params;
  const { data, error } = await admin
    .schema("tosho")
    .rpc("bot_decide_order_approval", { p_user_id: userId, p_approval_id: approvalId });
  if (error) {
    console.warn("[order-approval-bot] decide failed", error.code, error.message);
    return { ok: false, toast: humanError(error.message) };
  }

  const decided = data as DecidedRow | null;
  if (!decided) {
    // Погодили з CRM, інший бухгалтер з бота або запит відкликали.
    const { data: current } = await admin
      .schema("tosho")
      .from("order_approvals")
      .select("status,order_id,decided_by,decided_at")
      .eq("id", approvalId)
      .maybeSingle();
    const row = current as { status: string; order_id: string; decided_by: string | null; decided_at: string | null } | null;
    if (!row) return { ok: false, toast: "Запит не знайдено" };
    const crmUrl = params.buildUrl(`/orders/production/${row.order_id}`);
    if (row.status === "approved") {
      const name = await memberName(admin, row.decided_by);
      return {
        ok: false,
        toast: `Уже погоджено${name ? ` · ${shortPersonName(name)}` : ""}`,
        keyboard: decidedKeyboard({ deciderName: name, decidedAt: row.decided_at, crmUrl }),
      };
    }
    const toast = row.status === "withdrawn" ? "Запит відкликали — менеджер виправляє документ" : "Запит уже повернули на правки";
    return { ok: false, toast, keyboard: [[{ text: "Відкрити в CRM", url: crmUrl }]] };
  }

  const href = `/orders/production/${decided.order_id}`;
  const [{ data: orderData }, deciderName] = await Promise.all([
    admin.schema("tosho").from("orders").select("quote_number,quote_id").eq("id", decided.order_id).maybeSingle(),
    memberName(admin, userId),
  ]);
  const order = orderData as { quote_number?: string | null; quote_id?: string | null } | null;
  const subject = SUBJECT[decided.kind] ?? "документ";
  const orderNumber = order?.quote_number ?? "Замовлення";

  // Журнал і сповіщення — як у CRM (useOrderApprovalFlow). Рішення вже
  // записане, тож їхній збій не скасовує його, лише лишає слід у логах.
  const followUps = await Promise.allSettled([
    admin.from("activity_log").insert({
      team_id: decided.team_id,
      user_id: userId,
      actor_name: deciderName || "Telegram",
      action: "order_approval",
      entity_type: "orders",
      entity_id: decided.order_id,
      title: `Погодив(ла) ${subject}`,
      href,
      metadata: { quote_id: order?.quote_id ?? decided.order_id, order_id: decided.order_id, source: "telegram" },
    }),
    decided.requested_by && decided.requested_by !== userId
      ? deliverNotifications(
          admin,
          [
            {
              user_id: decided.requested_by,
              title: `${orderNumber}: ${subject} погоджено`,
              body: `${deciderName || "Погоджувач"} погодив(ла) ${subject} — можна надсилати замовнику.`,
              href,
              type: "success",
            },
          ],
          { category: "order_approval_decision" }
        )
      : Promise.resolve(null),
  ]);
  for (const result of followUps) {
    if (result.status === "rejected") console.warn("[order-approval-bot] follow-up failed", result.reason);
    else if (result.value && "error" in result.value && result.value.error) {
      console.warn("[order-approval-bot] activity log failed", result.value.error.message);
    }
  }

  return {
    ok: true,
    toast: `${SUBJECT_TITLE[decided.kind] ?? "Документ"} погоджено — менеджер отримав сповіщення`,
    keyboard: decidedKeyboard({ deciderName, decidedAt: decided.decided_at, crmUrl: params.buildUrl(href) }),
  };
}

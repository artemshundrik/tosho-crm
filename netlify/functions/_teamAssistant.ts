import type { SupabaseClient } from "@supabase/supabase-js";

// Люди: список команди й зведення по конкретній людині.
//
// Назви посад беремо з канонічного src/lib/jobRoles.ts — того самого, що
// показує інтерфейс. Своя копія тут рано чи пізно розійшлася б із UI.

import { escapeTelegramHtml } from "./_telegram";
import { formatJobRole } from "../../src/lib/jobRoles";
// Людські підписи дій — той самий довідник, що показує вкладка «Пульс».
// Без нього у відповідь летіли сирі ключі на кшталт design_task_brief_change_request.
import { actionLabel, isNoiseActivity } from "../../src/components/team/activityCategories";
import { runSaleTotal, type QuoteRunPricingRow } from "./_lib/quotePricing";
import { resolvePeriod, type DesignPeriod } from "./_designAssistant";

export type TeamIntent = "team_list" | "person_summary";

// Групи посад для фільтра «дай список менеджерів».
const ROLE_GROUPS: Record<string, string[]> = {
  менеджер: ["manager", "sales_manager", "junior_sales_manager", "top_manager", "office_manager"],
  дизайнер: ["designer"],
  бухгалтер: ["accountant", "chief_accountant"],
  логіст: ["logistics", "head_of_logistics"],
  маркетолог: ["marketer", "smm", "seo"],
  pm: ["pm"],
};

// Емодзі за посадою — щоб список читався оком, а не вичитувався.
const ROLE_EMOJI: Record<string, string> = {
  manager: "💼",
  sales_manager: "💼",
  junior_sales_manager: "💼",
  top_manager: "💼",
  office_manager: "🗂",
  designer: "🎨",
  pm: "🧭",
  seo: "📈",
  smm: "📣",
  marketer: "📣",
  accountant: "🧮",
  chief_accountant: "🧮",
  logistics: "🚚",
  head_of_logistics: "🚚",
  head_of_production: "🏭",
  printer: "🖨",
  packer: "📦",
};

function roleEmoji(jobRole: string | null): string {
  return ROLE_EMOJI[(jobRole ?? "").trim().toLowerCase()] ?? "👤";
}

export type TeamMember = {
  userId: string;
  name: string;
  jobRole: string | null;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[ʼ‘’`´]/g, "'").replace(/\s+/g, " ");
}

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(amount))} ₴`;
}

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName.trim();
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

/** Які посади просять: «менеджерів» → manager+sales_manager+…; порожньо → усі. */
function resolveRoleFilter(raw: string | null): string[] | null {
  const needle = normalize(raw ?? "");
  if (!needle) return null;
  for (const [key, roles] of Object.entries(ROLE_GROUPS)) {
    // «менеджери», «менеджерів», «менеджер» — усе через основу слова.
    if (needle.includes(key.slice(0, Math.max(3, key.length - 1)))) return roles;
  }
  return null;
}

export function renderTeamList(members: TeamMember[], roleQuery: string | null): string {
  const filter = resolveRoleFilter(roleQuery);
  const filtered = filter
    ? members.filter((m) => filter.includes((m.jobRole ?? "").trim().toLowerCase()))
    : members;

  if (filtered.length === 0) {
    return roleQuery
      ? `Не знайшов нікого за «${escapeTelegramHtml(roleQuery)}».`
      : "У команді нікого не знайшов.";
  }

  // Групуємо за посадою — так список читається, а не зливається.
  const byRole = new Map<string, TeamMember[]>();
  for (const member of filtered) {
    const label = formatJobRole(member.jobRole) || "Без посади";
    const list = byRole.get(label) ?? [];
    list.push(member);
    byRole.set(label, list);
  }

  const lines = [`👥 <b>Команда — ${filtered.length}</b>`];
  for (const [role, list] of Array.from(byRole.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const emoji = roleEmoji(list[0]?.jobRole ?? null);
    lines.push("", `${emoji} <b>${escapeTelegramHtml(role)}</b>`);
    for (const member of list.sort((a, b) => a.name.localeCompare(b.name, "uk"))) {
      lines.push(`   ${escapeTelegramHtml(member.name || "(без імені)")}`);
    }
  }
  return lines.join("\n");
}

async function sumByQuote(admin: SupabaseClient, quoteIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (quoteIds.length === 0) return totals;
  const { data, error } = await admin
    .schema("tosho")
    .from("quote_item_runs")
    .select(
      "quote_id,quantity,unit_price_model,unit_price_print,logistics_cost,desired_manager_income,manager_rate,fixed_cost_rate,vat_rate"
    )
    .in("quote_id", quoteIds)
    .limit(20000);
  if (error) throw new Error(`quote_item_runs: ${error.message}`);
  for (const run of ((data ?? []) as QuoteRunPricingRow[])) {
    if (!run.quote_id) continue;
    totals.set(run.quote_id, (totals.get(run.quote_id) ?? 0) + runSaleTotal(run));
  }
  return totals;
}

/**
 * Зведення по людині за період: продажі, дизайн, активність.
 *
 * Свідомо НЕ прив'язане до посади: показуємо ті блоки, де є дані. Так відповідь
 * однаково працює і для менеджера, і для дизайнера, і для того, хто робить
 * і те, і те — не треба вгадувати роль наперед.
 */
export async function renderPersonSummary(params: {
  admin: SupabaseClient;
  teamIds: string[];
  person: TeamMember;
  period: DesignPeriod | null;
  now: Date;
}): Promise<string> {
  const { admin, teamIds, person, period, now } = params;
  const resolved = resolvePeriod(period ?? "this_month", now);
  const userId = person.userId;

  const [createdResult, approvedResult, ordersResult, customersResult, leadsResult, activityResult] =
    await Promise.all([
      (() => {
        let q = admin
          .schema("tosho")
          .from("quotes")
          .select("id")
          .in("team_id", teamIds)
          .eq("assigned_to", userId)
          .limit(2000);
        if (resolved.startIso) q = q.gte("created_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("created_at", resolved.endIso);
        return q;
      })(),
      (() => {
        let q = admin
          .schema("tosho")
          .from("quotes")
          .select("id")
          .in("team_id", teamIds)
          .eq("assigned_to", userId)
          .eq("status", "approved")
          .limit(2000);
        if (resolved.startIso) q = q.gte("decided_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("decided_at", resolved.endIso);
        return q;
      })(),
      (() => {
        let q = admin
          .schema("tosho")
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("team_id", teamIds)
          .eq("manager_user_id", userId);
        if (resolved.startIso) q = q.gte("created_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("created_at", resolved.endIso);
        return q;
      })(),
      admin
        .schema("tosho")
        .from("customers")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .eq("manager_user_id", userId),
      admin
        .schema("tosho")
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("team_id", teamIds)
        .eq("manager_user_id", userId),
      (() => {
        let q = admin.from("activity_log").select("action").eq("user_id", userId).limit(5000);
        if (resolved.startIso) q = q.gte("created_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("created_at", resolved.endIso);
        return q;
      })(),
    ]);

  if (createdResult.error) throw new Error(`quotes (created): ${createdResult.error.message}`);
  if (approvedResult.error) throw new Error(`quotes (approved): ${approvedResult.error.message}`);

  const createdIds = ((createdResult.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  const approvedIds = ((approvedResult.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  const totals = await sumByQuote(admin, Array.from(new Set([...createdIds, ...approvedIds])));
  const sumOf = (ids: string[]) => ids.reduce((sum, id) => sum + (totals.get(id) ?? 0), 0);

  const role = formatJobRole(person.jobRole);
  const lines = [
    `${roleEmoji(person.jobRole)} <b>${escapeTelegramHtml(person.name || "—")}</b>${role ? ` · ${escapeTelegramHtml(role)}` : ""}`,
    `🗓 ${escapeTelegramHtml(resolved.label)}`,
  ];

  const sales: string[] = [];
  if (createdIds.length > 0) {
    sales.push(`🧾 Прорахунків: <b>${createdIds.length}</b> на ${escapeTelegramHtml(formatMoney(sumOf(createdIds)))}`);
  }
  if (approvedIds.length > 0) {
    sales.push(`✅ Затверджено: <b>${approvedIds.length}</b> на ${escapeTelegramHtml(formatMoney(sumOf(approvedIds)))}`);
  }
  if ((ordersResult.count ?? 0) > 0) sales.push(`📦 Замовлень: <b>${ordersResult.count}</b>`);
  if (sales.length > 0) lines.push("", "💰 <b>Продажі</b>", ...sales);

  const base: string[] = [];
  if ((customersResult.count ?? 0) > 0) base.push(`🤝 Клієнтів: <b>${customersResult.count}</b>`);
  if ((leadsResult.count ?? 0) > 0) base.push(`🌱 Лідів: <b>${leadsResult.count}</b>`);
  if (base.length > 0) lines.push("", "📇 <b>База</b>", ...base);

  // Активність показує, що людина взагалі робила — навіть коли продажів нема.
  // Підписи ЛЮДСЬКІ: сирі ключі на кшталт design_task_brief_change_request
  // читати неможливо.
  const actions = ((activityResult.data ?? []) as Array<{ action?: string | null }>)
    .map((r) => (r.action ?? "").trim())
    .filter((a) => a && !isNoiseActivity(a, null));
  if (actions.length > 0) {
    const counts = new Map<string, number>();
    for (const action of actions) {
      const label = actionLabel(action);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    lines.push("", `⚡️ <b>Чим займався</b> — ${actions.length} дій`);
    for (const [label, count] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      lines.push(`   ${escapeTelegramHtml(label)}: <b>${count}</b>`);
    }
  }

  if (lines.length === 2) {
    lines.push("", `😴 Активності ${escapeTelegramHtml(resolved.label)} не знайшов.`);
  }
  return lines.join("\n");
}

export { shortName };

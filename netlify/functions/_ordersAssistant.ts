import type { SupabaseClient } from "@supabase/supabase-js";

// Асистент по замовленнях. Той самий принцип, що в дизайні й прорахунках:
// модель лише розбирає питання, всі числа рахує цей код.
//
// ГРОШІ. `orders.total` — снапшот на момент створення замовлення, і він бреше:
// прогін по базі показав замовлення з `total = 0` там, де по runs виходить
// 300 000 ₴, і розходження 74 300 проти 73 300 на іншому. Тому сума рахується
// з `quote_item_runs` через `runSaleTotal` — те саме джерело правди, що в
// прорахунках і дайджестах. `orders.total` лишається запасним варіантом лише
// для ручних замовлень, у яких прорахунку немає взагалі й брати більше нізвідки.

import { escapeTelegramHtml } from "./_telegram";
import { runSaleTotal, type QuoteRunPricingRow } from "./_lib/quotePricing";
import { resolvePeriod, type DesignPeriod } from "./_designAssistant";

const APP_URL = process.env.PUBLIC_APP_URL || "https://tosho.pro";

export type OrdersIntent = "orders_list";

/**
 * Ярлики дублюють `ORDER_STATUS_SECTIONS` із src/features/orders/config.ts —
 * функції не поділяють код із фронтом, тож мапа тут своя (та сама конвенція,
 * що в `_quotesAssistant`). Джерело правди — конфіг; сюди назви копіюються.
 */
const STATUS_LABELS: Record<string, string> = {
  new: "Нове",
  on_calculation: "На прорахунку",
  in_progress: "В роботі",
  approved: "Погоджено",
  send_to_production: "Відправити у виробництво",
  production_started: "Запущено у виробництво",
  in_production: "У виробництві",
  ready: "Готово",
  shipped: "Відвантажено",
  completed: "Виконано",
};

const STATUS_EMOJI: Record<string, string> = {
  new: "🆕",
  on_calculation: "🧮",
  in_progress: "⚙️",
  approved: "🤝",
  send_to_production: "📤",
  production_started: "🏭",
  in_production: "🏭",
  ready: "📦",
  shipped: "🚚",
  completed: "✅",
};

/** Статуси, після яких замовлення більше не в роботі. */
const CLOSED_STATUSES = new Set(["completed", "cancelled", "canceled"]);

type OrderRow = {
  id: string;
  quote_id?: string | null;
  quote_number?: string | null;
  customer_name?: string | null;
  order_status?: string | null;
  payment_status?: string | null;
  total?: number | string | null;
  created_at?: string | null;
};

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(amount))} ₴`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[ʼ‘’`´]/g, "'").replace(/\s+/g, " ");
}

function statusKey(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Суми з runs по прорахунках, з яких виросли замовлення. */
async function sumByQuote(admin: SupabaseClient, quoteIds: string[]): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (quoteIds.length === 0) return totals;
  const { data, error } = await admin
    .schema("tosho")
    .from("quote_item_runs")
    .select(
      "quote_id,quantity,unit_price_model,unit_price_print,logistics_cost,desired_manager_income,markup_rate,manager_rate,fixed_cost_rate,vat_rate"
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
 * Сума замовлення: спершу runs прорахунку, і лише якщо їх немає — снапшот.
 * Порядок саме такий, бо снапшот застаріває, а runs — ні.
 */
function orderAmount(order: OrderRow, runTotals: Map<string, number>): number {
  const fromRuns = order.quote_id ? runTotals.get(order.quote_id) : undefined;
  if (fromRuns !== undefined && fromRuns > 0) return fromRuns;
  const snapshot = typeof order.total === "string" ? Number(order.total) : order.total;
  return Number.isFinite(snapshot) && snapshot ? Number(snapshot) : 0;
}

function orderLine(order: OrderRow, amount: number): string {
  const label = [order.quote_number, (order.customer_name ?? "").trim() || "(без клієнта)"]
    .filter(Boolean)
    .join(" · ");
  const key = statusKey(order.order_status);
  const status = STATUS_LABELS[key] ?? order.order_status ?? "—";
  return (
    `${STATUS_EMOJI[key] ?? "•"} <a href="${APP_URL}/orders/production/${order.id}">${escapeTelegramHtml(label)}</a>\n` +
    `  ${escapeTelegramHtml(status)}${amount > 0 ? ` · ${escapeTelegramHtml(formatMoney(amount))}` : ""}`
  );
}

export async function answerOrdersQuery(params: {
  admin: SupabaseClient;
  teamIds: string[];
  intent: OrdersIntent;
  /** Статус зі слів користувача; null — усі активні. */
  status: string | null;
  period: DesignPeriod | null;
  /** Назва клієнта, якщо питали про конкретного. */
  query: string | null;
  limit: number;
  now: Date;
}): Promise<string> {
  const { admin, teamIds, period, now } = params;
  const limit = Math.min(Math.max(params.limit || 8, 1), 15);

  let request = admin
    .schema("tosho")
    .from("orders")
    .select("id,quote_id,quote_number,customer_name,order_status,payment_status,total,created_at")
    .in("team_id", teamIds)
    .order("created_at", { ascending: false })
    .limit(2000);

  // Період фільтрує лише коли його назвали: «покажи замовлення» без періоду
  // має показати все відкрите, а не тільки заведене цього місяця.
  const resolved = period ? resolvePeriod(period, now) : null;
  if (resolved?.startIso) request = request.gte("created_at", resolved.startIso);
  if (resolved?.endIso) request = request.lt("created_at", resolved.endIso);

  const needle = normalize(params.query ?? "");
  // Шукаємо по знормалізованому, показуємо як написав користувач: «pöttinger»
  // у заголовку замість «PÖTTINGER» виглядає як помилка бота.
  const needleLabel = (params.query ?? "").trim();
  if (needle) request = request.ilike("customer_name", `%${needle}%`);

  const requestedStatus = statusKey(params.status);
  if (requestedStatus && STATUS_LABELS[requestedStatus]) request = request.eq("order_status", requestedStatus);

  const { data, error } = await request;
  if (error) throw new Error(`orders: ${error.message}`);

  let rows = (data ?? []) as OrderRow[];
  // Без явного статусу показуємо те, що ще в роботі — закриті замовлення в
  // «покажи замовлення» лише заважають.
  const activeOnly = !requestedStatus;
  if (activeOnly) rows = rows.filter((row) => !CLOSED_STATUSES.has(statusKey(row.order_status)));

  const scope = [
    requestedStatus ? STATUS_LABELS[requestedStatus].toLowerCase() : null,
    needle ? `по «${needleLabel}»` : null,
    resolved ? resolved.label : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (rows.length === 0) {
    return scope
      ? `Замовлень ${escapeTelegramHtml(scope)} не знайшов.`
      : "Активних замовлень зараз немає.";
  }

  const runTotals = await sumByQuote(
    admin,
    Array.from(new Set(rows.map((row) => row.quote_id).filter((id): id is string => Boolean(id))))
  );
  const amounts = new Map(rows.map((row) => [row.id, orderAmount(row, runTotals)]));
  const sum = rows.reduce((acc, row) => acc + (amounts.get(row.id) ?? 0), 0);

  const heading = activeOnly && !needle && !resolved ? "Активні замовлення" : `Замовлення ${scope}`.trim();
  const lines = [
    `📦 <b>${escapeTelegramHtml(heading)}</b> — ${rows.length} на ${escapeTelegramHtml(formatMoney(sum))}`,
    "",
  ];
  for (const row of rows.slice(0, limit)) lines.push(orderLine(row, amounts.get(row.id) ?? 0));
  if (rows.length > limit) lines.push("", `…і ще ${rows.length - limit}`);
  return lines.join("\n");
}

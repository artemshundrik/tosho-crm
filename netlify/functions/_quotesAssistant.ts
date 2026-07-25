import type { SupabaseClient } from "@supabase/supabase-js";

// Асистент по прорахунках. Той самий принцип, що й у дизайн-модулі: модель
// лише розбирає питання, всі числа рахує цей код.
//
// Суми ЗАВЖДИ з quote_item_runs через runSaleTotal. `quotes.total` — застарілий
// снапшот і реальною ціною не є (та сама пастка, що в дайджестах).

import { escapeTelegramHtml } from "./_telegram";
import { runSaleTotal, type QuoteRunPricingRow } from "./_lib/quotePricing";
import { resolvePeriod, type DesignPeriod } from "./_designAssistant";

const APP_URL = process.env.PUBLIC_APP_URL || "https://tosho.pro";

export type QuotesIntent =
  | "quotes_pipeline"
  | "quotes_created"
  | "quotes_approved"
  | "quotes_overdue"
  | "customer_summary";

// Статуси, які означають «більше не в роботі».
const CLOSED_STATUSES = ["approved", "cancelled", "canceled", "rejected"];

const STATUS_LABELS: Record<string, string> = {
  new: "Новий",
  estimating: "На прорахунку",
  estimated: "Пораховано",
  awaiting_approval: "На погодженні",
  approved: "Затверджено",
  cancelled: "Скасовано",
  canceled: "Скасовано",
  rejected: "Скасовано",
  draft: "Новий",
  in_progress: "На прорахунку",
  sent: "Пораховано",
};

const STATUS_EMOJI: Record<string, string> = {
  new: "🆕",
  estimating: "🧮",
  estimated: "🧾",
  awaiting_approval: "🤝",
  approved: "✅",
  cancelled: "🚫",
};

type QuoteRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  customer_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deadline_at?: string | null;
};

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Math.round(amount))} ₴`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[ʼ‘’`´]/g, "'").replace(/\s+/g, " ");
}

/** Суми по прорахунках із runs. Прорахунки без runs дають 0. */
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

function quoteLine(quote: QuoteRow, amount: number): string {
  const label = [quote.number, (quote.customer_name ?? "").trim() || "(без клієнта)"].filter(Boolean).join(" · ");
  const status = STATUS_LABELS[(quote.status ?? "").trim()] ?? quote.status ?? "—";
  return (
    `• <a href="${APP_URL}/orders/estimates/${quote.id}">${escapeTelegramHtml(label)}</a>\n` +
    `  ${escapeTelegramHtml(status)}${amount > 0 ? ` · ${escapeTelegramHtml(formatMoney(amount))}` : ""}`
  );
}

export async function answerQuotesQuery(params: {
  admin: SupabaseClient;
  teamIds: string[];
  intent: QuotesIntent;
  period: DesignPeriod | null;
  query: string | null;
  limit: number;
  now: Date;
}): Promise<string> {
  const { admin, teamIds, intent, period, now } = params;
  const limit = Math.min(Math.max(params.limit || 8, 1), 15);
  const resolved = resolvePeriod(period ?? "this_month", now);

  switch (intent) {
    case "quotes_pipeline": {
      const { data, error } = await admin
        .schema("tosho")
        .from("quotes")
        .select("id,status,updated_at")
        .in("team_id", teamIds)
        .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
        .limit(5000);
      if (error) throw new Error(`quotes (pipeline): ${error.message}`);

      const open = (data ?? []) as QuoteRow[];
      if (open.length === 0) return "У воронці зараз порожньо.";

      const byStatus = new Map<string, number>();
      for (const q of open) byStatus.set((q.status ?? "—").trim(), (byStatus.get((q.status ?? "—").trim()) ?? 0) + 1);

      const totals = await sumByQuote(admin, open.map((q) => q.id));
      const openSum = open.reduce((sum, q) => sum + (totals.get(q.id) ?? 0), 0);

      const oldestDays = open.reduce((oldest, q) => {
        if (!q.updated_at) return oldest;
        const days = Math.floor((now.getTime() - new Date(q.updated_at).getTime()) / 86_400_000);
        return days > oldest ? days : oldest;
      }, 0);

      const lines = [`📊 <b>Воронка</b> — ${open.length} відкритих на ${escapeTelegramHtml(formatMoney(openSum))}`, ""];
      for (const [status, count] of Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1])) {
        lines.push(`   ${STATUS_EMOJI[status] ?? "•"} ${escapeTelegramHtml(STATUS_LABELS[status] ?? status)}: <b>${count}</b>`);
      }
      if (oldestDays > 0) lines.push("", `🕰 Найстарішому без руху: <b>${oldestDays} дн</b>`);
      return lines.join("\n");
    }

    case "quotes_created":
    case "quotes_approved": {
      const isApproved = intent === "quotes_approved";
      let q = admin
        .schema("tosho")
        .from("quotes")
        .select("id,number,status,customer_name,created_at")
        .in("team_id", teamIds)
        .limit(2000);
      if (isApproved) {
        // decided_at надійно проставляє тригер аудиту; для старих записів
        // (до тригера) лишається запасний шлях через updated_at.
        q = q.eq("status", "approved");
        if (resolved.startIso) q = q.gte("decided_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("decided_at", resolved.endIso);
      } else {
        if (resolved.startIso) q = q.gte("created_at", resolved.startIso);
        if (resolved.endIso) q = q.lt("created_at", resolved.endIso);
      }
      const { data, error } = await q;
      if (error) throw new Error(`quotes: ${error.message}`);

      const rows = (data ?? []) as QuoteRow[];
      const what = isApproved ? "Затверджено" : "Створено";
      if (rows.length === 0) {
        return `${what} прорахунків ${escapeTelegramHtml(resolved.label)}: 0.`;
      }
      const totals = await sumByQuote(admin, rows.map((r) => r.id));
      const sum = rows.reduce((acc, r) => acc + (totals.get(r.id) ?? 0), 0);

      const lines = [
        `${isApproved ? "✅" : "🧾"} <b>${what} ${escapeTelegramHtml(resolved.label)}</b>: ${rows.length} на ${escapeTelegramHtml(formatMoney(sum))}`,
        "",
      ];
      for (const row of rows.slice(0, limit)) lines.push(quoteLine(row, totals.get(row.id) ?? 0));
      if (rows.length > limit) lines.push("", `…і ще ${rows.length - limit}`);
      return lines.join("\n");
    }

    case "quotes_overdue": {
      // Вікно 30 днів: у базі повно давно покинутих прорахунків із дедлайнами
      // дворічної давнини, без вікна цифра стає шумом.
      const fromIso = new Date(now.getTime() - 30 * 86_400_000).toISOString();
      const { data, error } = await admin
        .schema("tosho")
        .from("quotes")
        .select("id,number,status,customer_name,deadline_at")
        .in("team_id", teamIds)
        .not("deadline_at", "is", null)
        .gte("deadline_at", fromIso)
        .lt("deadline_at", now.toISOString())
        .limit(2000);
      if (error) throw new Error(`quotes (overdue): ${error.message}`);

      const rows = ((data ?? []) as QuoteRow[]).filter(
        (r) => !CLOSED_STATUSES.includes((r.status ?? "").trim().toLowerCase())
      );
      if (rows.length === 0) return "Прострочених прорахунків за останні 30 днів немає.";

      const totals = await sumByQuote(admin, rows.map((r) => r.id));
      const lines = [`🔥 <b>Прострочено</b> — ${rows.length}`, ""];
      for (const row of rows.slice(0, limit)) lines.push(quoteLine(row, totals.get(row.id) ?? 0));
      if (rows.length > limit) lines.push("", `…і ще ${rows.length - limit}`);
      return lines.join("\n");
    }

    case "customer_summary":
    default: {
      const needle = normalize(params.query ?? "");
      if (!needle) return "Уточни назву клієнта.";

      const { data, error } = await admin
        .schema("tosho")
        .from("quotes")
        .select("id,number,status,customer_name,created_at")
        .in("team_id", teamIds)
        .ilike("customer_name", `%${needle}%`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(`quotes (customer): ${error.message}`);

      const rows = (data ?? []) as QuoteRow[];
      if (rows.length === 0) return `Прорахунків для «${escapeTelegramHtml(needle)}» не знайшов.`;

      const totals = await sumByQuote(admin, rows.map((r) => r.id));
      const approved = rows.filter((r) => (r.status ?? "") === "approved");
      const approvedSum = approved.reduce((sum, r) => sum + (totals.get(r.id) ?? 0), 0);
      const allSum = rows.reduce((sum, r) => sum + (totals.get(r.id) ?? 0), 0);
      const name = (rows[0].customer_name ?? "").trim() || needle;

      const lines = [
        `🏢 <b>${escapeTelegramHtml(name)}</b>`,
        "",
        `🧾 Прорахунків: <b>${rows.length}</b> на ${escapeTelegramHtml(formatMoney(allSum))}`,
        `✅ Затверджено: <b>${approved.length}</b> на ${escapeTelegramHtml(formatMoney(approvedSum))}`,
        "",
      ];
      for (const row of rows.slice(0, limit)) lines.push(quoteLine(row, totals.get(row.id) ?? 0));
      if (rows.length > limit) lines.push("", `…і ще ${rows.length - limit}`);
      return lines.join("\n");
    }
  }
}

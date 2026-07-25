import type { SupabaseClient } from "@supabase/supabase-js";

// Адмін-інтенти асистента: AI-кости, стан системи, «що не працює».
// Доступ — лише власник (гейт у telegram-webhook.ts).
//
// Сигнали здоров'я беруться з _systemHealth, тобто з ТОГО САМОГО набору, що
// йде в ранковий тех-звіт. Це навмисно: інакше бот і звіт розійдуться в оцінках.

import { escapeTelegramHtml } from "./_telegram";
import { TONE_EMOJI, collectSystemSignals, isProblem, worstTone } from "./_systemHealth";
import { resolvePeriod, type DesignPeriod } from "./_designAssistant";

const APP_URL = process.env.PUBLIC_APP_URL || "https://tosho.pro";

export type AdminIntent = "ai_usage" | "system_health" | "whats_broken";

function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

const KIND_LABELS: Record<string, string> = {
  chat: "чат",
  transcription: "розпізнавання голосу",
  embedding: "індексація",
};

/** AI-кости за період: сума, розбивка за типом і за людьми. */
async function answerAiUsage(params: {
  admin: SupabaseClient;
  workspaceId: string;
  period: DesignPeriod | null;
  now: Date;
}): Promise<string> {
  const { admin, workspaceId, period, now } = params;
  const resolved = resolvePeriod(period ?? "this_month", now);

  let query = admin
    .schema("tosho")
    .from("ai_usage")
    .select("kind,model,cost_usd,total_tokens,actor_name,user_id")
    .eq("workspace_id", workspaceId)
    .limit(50000);
  if (resolved.startIso) query = query.gte("created_at", resolved.startIso);
  if (resolved.endIso) query = query.lt("created_at", resolved.endIso);
  const { data, error } = await query;
  if (error) throw new Error(`ai_usage: ${error.message}`);

  const rows = (data ?? []) as Array<{
    kind?: string | null;
    model?: string | null;
    cost_usd?: number | string | null;
    total_tokens?: number | string | null;
    actor_name?: string | null;
  }>;

  if (rows.length === 0) {
    return `AI ${escapeTelegramHtml(resolved.label)} не використовувався.`;
  }

  let total = 0;
  let tokens = 0;
  const byKind = new Map<string, { cost: number; calls: number }>();
  const byActor = new Map<string, number>();
  const models = new Set<string>();

  for (const row of rows) {
    const cost = num(row.cost_usd);
    total += cost;
    tokens += num(row.total_tokens);
    const kind = (row.kind ?? "—").trim();
    const kindEntry = byKind.get(kind) ?? { cost: 0, calls: 0 };
    kindEntry.cost += cost;
    kindEntry.calls += 1;
    byKind.set(kind, kindEntry);
    const actor = (row.actor_name ?? "").trim();
    if (actor) byActor.set(actor, (byActor.get(actor) ?? 0) + cost);
    if (row.model) models.add(row.model.trim());
  }

  const lines = [
    `<b>AI-кости ${escapeTelegramHtml(resolved.label)}: $${total.toFixed(2)}</b>`,
    "",
    `• Викликів: ${rows.length}`,
    `• Токенів: ${new Intl.NumberFormat("uk-UA").format(tokens)}`,
  ];

  if (byKind.size > 0) {
    lines.push("", "<b>За типом</b>");
    for (const [kind, entry] of Array.from(byKind.entries()).sort((a, b) => b[1].cost - a[1].cost)) {
      lines.push(`• ${escapeTelegramHtml(KIND_LABELS[kind] ?? kind)}: $${entry.cost.toFixed(2)} (${entry.calls})`);
    }
  }

  if (byActor.size > 1) {
    lines.push("", "<b>За людьми</b>");
    for (const [actor, cost] of Array.from(byActor.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      lines.push(`• ${escapeTelegramHtml(actor)}: $${cost.toFixed(2)}`);
    }
  }

  if (models.size > 0) {
    lines.push("", `Моделі: ${escapeTelegramHtml(Array.from(models).join(", "))}`);
  }

  // Прайси в _aiPricing.ts частково поставлені «на око» — краще сказати прямо,
  // ніж видавати оцінку за точну суму.
  lines.push("", "<i>Суми орієнтовні: частина тарифів у прайс-таблиці — заглушки.</i>");
  return lines.join("\n");
}

/** Повний стан системи — те саме, що в ранковому звіті, але на вимогу. */
async function answerSystemHealth(params: {
  admin: SupabaseClient;
  teamIds: string[];
  now: Date;
}): Promise<string> {
  const { admin, teamIds, now } = params;
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const signals = await collectSystemSignals(admin, now, {
    aiFromIso: dayAgo,
    aiToIso: now.toISOString(),
    aiLabel: "за добу",
    teamIds,
  });

  const tone = worstTone(signals);
  const lines = [`<b>${TONE_EMOJI[tone]} Стан системи</b>`, ""];
  for (const signal of signals) {
    lines.push(`${TONE_EMOJI[signal.tone]} ${escapeTelegramHtml(signal.text)}`);
  }
  return lines.join("\n");
}

/** Тільки проблеми. Якщо їх немає — так і кажемо, без списку зеленого. */
async function answerWhatsBroken(params: {
  admin: SupabaseClient;
  teamIds: string[];
  now: Date;
}): Promise<string> {
  const { admin, teamIds, now } = params;
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const signals = await collectSystemSignals(admin, now, {
    aiFromIso: dayAgo,
    aiToIso: now.toISOString(),
    aiLabel: "за добу",
    teamIds,
  });

  const problems = signals.filter(isProblem);
  if (problems.length === 0) {
    return `${TONE_EMOJI.good} Проблем не бачу: бекапи свіжі, cron живий, база й storage у нормі.`;
  }

  const danger = problems.filter((s) => s.tone === "danger");
  const warning = problems.filter((s) => s.tone === "warning");
  const lines = [`<b>${TONE_EMOJI[worstTone(problems)]} Проблем: ${problems.length}</b>`];

  if (danger.length > 0) {
    lines.push("", "<b>Критично</b>");
    for (const s of danger) lines.push(`🔴 ${escapeTelegramHtml(s.text)}`);
  }
  if (warning.length > 0) {
    lines.push("", "<b>Варто глянути</b>");
    for (const s of warning) lines.push(`🟡 ${escapeTelegramHtml(s.text)}`);
  }
  lines.push("", `Деталі: ${APP_URL}/admin/observability`);
  return lines.join("\n");
}

export async function answerAdminQuery(params: {
  admin: SupabaseClient;
  intent: AdminIntent;
  workspaceId: string;
  teamIds: string[];
  period: DesignPeriod | null;
  now: Date;
}): Promise<string> {
  const { admin, intent, workspaceId, teamIds, period, now } = params;
  switch (intent) {
    case "ai_usage":
      return answerAiUsage({ admin, workspaceId, period, now });
    case "system_health":
      return answerSystemHealth({ admin, teamIds, now });
    case "whats_broken":
    default:
      return answerWhatsBroken({ admin, teamIds, now });
  }
}

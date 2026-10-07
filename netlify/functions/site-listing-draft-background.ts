import { z } from "zod";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assembleDraft, DraftInputError, parseDraftModelOutput, prepareDraft } from "../../src/lib/siteListing/draft";
import type { DraftContext, SiteListingDraft, SizeTable } from "../../src/lib/siteListing/types";

import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";
import { fetchProductPage } from "./_lib/externalFetch";
import { extractResponseOutputText, extractUsage } from "./_lib/openAiResponses";
import { parseBody } from "./_lib/parseBody";
import { buildDraftUserMessage, DRAFT_DEVELOPER_PROMPT, DRAFT_OPENAI_SCHEMA } from "./_lib/siteListingPrompt";
import { parseTotobiSizeTable } from "./_lib/totobiSizeTable";

/**
 * Чернетка картки avanprint.ua для моделі постачальника (REQ-311#p5).
 * Спека: docs/superpowers/specs/2026-10-01-site-autolisting-design.md §4.
 *
 * ЩО РОБИТЬ. Людина тисне «Беремо» в черзі на сторінці постачальника; фронт
 * ставить рядку `draft_status = 'pending'` і кличе цю функцію з `itemId`. Вона
 * збирає дані моделі одним RPC, рахує кодом ціни, кольори, фото й розділ,
 * просить мовну модель написати назву й опис і кладе чернетку в рядок —
 * `ready` або `failed` із текстом для людини.
 *
 * ЧОМУ ФОНОВА. Виклик моделі з прикладами — 10–40 с, а для одягу ще й похід
 * на сторінку Тотобі по таблицю розмірів. Людина не чекає: черга сама
 * перепитує рядок, поки він «готується».
 *
 * ЧИТАЄ Й ПИШЕ ТОКЕНОМ ЛЮДИНИ, а не службовим ключем. Рядок рішення закриває
 * RLS (`has_site_listing_access`), тож усе, що функція бачить і пише, — рівно
 * те, що бачить і пише сама людина в CRM. Службовий клієнт лишається на одне:
 * рядок обліку AI-витрат (`tosho.ai_usage` записується лише ним — так само,
 * як у quote-import-parse).
 */

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

const requestSchema = z.object({ itemId: z.string().uuid() }).strict();

/** Таблицю розмірів беремо лише зі сторінок самого Тотобі. */
const SIZE_TABLE_HOST = /^https:\/\/totobi\.com\.ua\//i;

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

function actorLabel(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  const metadata = user.user_metadata ?? {};
  const name = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  return name || user.email || "Користувач";
}

/**
 * Запис результату. `.select()` обов'язковий: update без нього мовчить, навіть
 * коли RLS не пустила, — і рядок вічно стояв би «готується».
 */
async function writeResult(
  client: SupabaseClient,
  itemId: string,
  patch: { draft?: SiteListingDraft; draft_status: "ready" | "failed"; draft_error: string | null }
) {
  // Лише поверх «running» цього ж виклику: якщо людина тим часом натиснула
  // «Спробувати ще», новий виклик пише сам, а цей не затирає його результат.
  const { data, error } = await client
    .schema("tosho")
    .from("site_listing_items")
    .update(patch)
    .eq("id", itemId)
    .eq("draft_status", "running")
    .select("id");
  if (error) console.error("site-listing-draft: запис не ліг", error.message);
  else if (!data?.length) console.error("site-listing-draft: запис не ліг — RLS не пустила");
}

async function loadSizeTable(url: string | null): Promise<{ table: SizeTable | null; warning: string | null }> {
  const missing = "Таблицю розмірів зі сторінки Тотобі не дістали — додайте її в Хорошопі.";
  if (!url || !SIZE_TABLE_HOST.test(url)) return { table: null, warning: missing };
  try {
    const page = await fetchProductPage(url, { timeoutMs: 10_000, proxyTimeoutMs: 10_000, maxBytes: 3 * 1024 * 1024 });
    const table = page.status === "ok" ? parseTotobiSizeTable(page.html) : null;
    return { table, warning: table ? null : missing };
  } catch {
    return { table: null, warning: missing };
  }
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return jsonResponse(500, { error: "Missing Supabase env vars" });

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const { itemId } = parsed.data;

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });
  const user = userData.user;

  // Рядок читається під RLS: чужого або недоступного «не існує».
  const { data: item, error: itemError } = await userClient
    .schema("tosho")
    .from("site_listing_items")
    .select("id, team_id, decision, draft_status")
    .eq("id", itemId)
    .maybeSingle<{ id: string; team_id: string; decision: string | null; draft_status: string }>();
  if (itemError) {
    console.error("site-listing-draft: рядок не прочитався", itemError.message);
    return jsonResponse(500, { error: "Не вдалося перевірити доступ." });
  }
  if (!item) return jsonResponse(403, { error: "Модель недоступна." });

  // І окремо — саме право (спека §4): та сама функція, що стоїть у RLS.
  const { data: allowed, error: accessError } = await userClient
    .schema("tosho")
    .rpc("has_site_listing_access", { _team_id: item.team_id });
  if (accessError) {
    console.error("site-listing-draft: перевірка доступу впала", accessError.message);
    return jsonResponse(500, { error: "Не вдалося перевірити доступ." });
  }
  if (allowed !== true) return jsonResponse(403, { error: "Немає доступу до автоперенесення." });

  if (item.decision !== "take") {
    return jsonResponse(409, { error: "Чернетка для цієї моделі зараз не замовлена." });
  }

  // ЗАХОПЛЕННЯ ДО ОПЛАТИ: «pending» → «running» одним умовним записом. Два
  // виклики поспіль (подвійний клік, повтор запиту) обидва бачили б «pending»
  // і обидва платили б за модель; так проходить лише перший, другий отримує
  // нуль рядків. Зразок — dev-news-background.
  const { data: claimed, error: claimError } = await userClient
    .schema("tosho")
    .from("site_listing_items")
    .update({ draft_status: "running", draft_error: null })
    .eq("id", itemId)
    .eq("draft_status", "pending")
    .select("id");
  if (claimError) {
    console.error("site-listing-draft: захоплення не вдалося", claimError.message);
    return jsonResponse(500, { error: "Не вдалося почати чернетку." });
  }
  if (!claimed?.length) {
    return jsonResponse(409, { error: "Чернетка для цієї моделі зараз не замовлена або вже готується." });
  }

  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    await writeResult(userClient, itemId, {
      draft_status: "failed",
      draft_error: "Мовна модель недоступна: на сервері не налаштований ключ OpenAI.",
    });
    return jsonResponse(503, { error: "OPENAI_API_KEY не налаштований." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const model = (process.env.SITE_LISTING_OPENAI_MODEL ?? "").trim() || "gpt-5.6-terra";
  const effort = (process.env.SITE_LISTING_OPENAI_EFFORT ?? "").trim() || "low";

  try {
    const { data: contextData, error: contextError } = await userClient
      .schema("tosho")
      .rpc("site_listing_draft_context", { p_item_id: itemId });
    if (contextError) {
      console.error("site-listing-draft: контекст не прочитався", contextError.message);
      throw new DraftInputError("Дані моделі не прочитались — спробуйте ще раз.");
    }
    const context = contextData as DraftContext | null;
    if (!context) throw new DraftInputError("Моделі вже немає в пулі постачальника.");

    const prepared = prepareDraft(context);
    const extraWarnings: string[] = [];
    let sizeTable: SizeTable | null = null;
    if (prepared.textile && prepared.sizes.length > 0) {
      const loaded = await loadSizeTable(context.model?.url ?? null);
      sizeTable = loaded.table;
      if (loaded.warning) extraWarnings.push(loaded.warning);
    }

    const { data: membershipRows } = await userClient
      .schema("tosho")
      .from("memberships_view")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1);
    const workspaceId = ((membershipRows ?? []) as Array<{ workspace_id?: string | null }>)[0]?.workspace_id ?? null;
    // Без команди витрату нікуди записати — і платний виклик не робимо, як і
    // quote-import-parse.
    if (!workspaceId) throw new DraftInputError("Не знайдено команду для обліку витрат — перезайдіть у CRM.");

    const startedAt = Date.now();
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort },
        input: [
          { role: "developer", content: DRAFT_DEVELOPER_PROMPT },
          { role: "user", content: [{ type: "input_text", text: buildDraftUserMessage(context, prepared) }] },
        ],
        max_output_tokens: 4_000,
        text: {
          format: { type: "json_schema", name: "site_listing_draft", strict: true, schema: DRAFT_OPENAI_SCHEMA },
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    // Облік — і на невдалій відповіді: токени вона однаково з'їла.
    const usage = extractUsage(payload);
    const { costUsd, priceKnown } = chatCostUsd(model, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens);
    await logAiUsage(adminClient, {
      workspaceId,
      userId: user.id,
      actorName: actorLabel(user),
      kind: "chat",
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      costUsd,
      metadata: {
        source: "site-listing-draft",
        itemId,
        latencyMs: Date.now() - startedAt,
        ok: response.ok,
        cachedInputTokens: usage.cachedInputTokens,
        priceKnown,
      },
    });

    if (!response.ok) throw new Error(`Мовна модель відповіла ${response.status}. Спробуйте ще раз.`);
    const rawText = extractResponseOutputText(payload);
    let decoded: unknown = null;
    try {
      decoded = rawText ? JSON.parse(rawText) : null;
    } catch {
      decoded = null;
    }

    const output = parseDraftModelOutput(decoded, prepared.categoryChoices);
    const draft = assembleDraft({ prepared, output, sizeTable, model, now: new Date(), warnings: extraWarnings });
    await writeResult(userClient, itemId, { draft, draft_status: "ready", draft_error: null });
    return jsonResponse(200, { ok: true });
  } catch (error) {
    // Людині — лише наші тексти: DraftInputError і відповідь моделі з кодом.
    // Чуже повідомлення (мережа, PostgREST) іде в журнал функції, не в чергу.
    const ours = error instanceof DraftInputError || (error instanceof Error && error.message.startsWith("Мовна модель"));
    if (!ours) console.error("site-listing-draft: чернетка впала", error instanceof Error ? error.message : error);
    const message = ours && error instanceof Error ? error.message : "Чернетка не вдалася — спробуйте ще раз.";
    await writeResult(userClient, itemId, { draft_status: "failed", draft_error: message.slice(0, 500) });
    return jsonResponse(502, { error: message });
  }
};

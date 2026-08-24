import { z } from "zod";

import { parseBody } from "./_lib/parseBody";

import { createClient } from "@supabase/supabase-js";

import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";
import { clampDraftText, draftDevRequest } from "./_lib/devRequestDraft";

// Надиктований запит → охайна картка розділу «Запити». На вхід приходить сирий
// текст розпізнавання (клієнт свідомо кличе диктування з clean: false — чистку
// від «еее» робить цей самий виклик разом зі структуруванням, інакше платимо
// двічі за той самий текст) і назви відкритих карток, щоб модель могла вказати
// на очевидний дубль.
//
// Сам розбір (промпт, карта CRM, схема, валідація напрямку) живе в
// _lib/devRequestDraft.ts — його ділять цей HTTP-вхід і Telegram-бот, який JWT
// не має взагалі. Тут лишається рівно те, що властиве саме HTTP-входу:
// гейт користувача й журнал вартості.
//
// Контур env/auth/fetch — той самий, що в transcribe.ts: OPENAI_API_KEY лишається
// на сервері, кожен виклик іде під валідним Supabase JWT, а користувача
// перевіряємо ДО того, як витрачати кредити OpenAI.

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

/** Форма запиту — і перевірка, і тип (REQ-137). Стеля на список назв — щоб промпт не роздувся. */
const requestSchema = z
  .object({
    text: z.string().optional(),
    openTitles: z
      .array(
        z
          .object({
            label: z.string().nullable().optional(),
            title: z.string().nullable().optional(),
          })
          .strict()
      )
      .max(500)
      .optional(),
  })
  .strict();

type RequestBody = z.infer<typeof requestSchema>;

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

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return jsonResponse(503, { error: "OPENAI_API_KEY is not configured." });
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
  const body: RequestBody = parsed.data;

  // Гейт користувача — до витрат на OpenAI.
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }
  const user = userData.user;

  const rawText = clampDraftText(body.text);
  if (!rawText) {
    return jsonResponse(400, { error: "Missing text" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Workspace для журналу костів. Службовим клієнтом, щоб RLS на memberships_view
  // не з'їв рядок мовчки.
  const { data: membershipRows } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = normalizeText(
    (membershipRows as Array<{ workspace_id?: string | null }> | null)?.[0]?.workspace_id
  );
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const actorName =
    normalizeText(typeof meta.full_name === "string" ? meta.full_name : "") ||
    normalizeText(user.email) ||
    user.id;

  const model = normalizeText(process.env.OPENAI_MODEL) || "gpt-5.6-luna";

  const result = await draftDevRequest({
    text: rawText,
    openTitles: body.openTitles,
    apiKey,
    model,
  });

  // Кости логуємо ДО перевірки на успіх: виклик оплачений незалежно від того, чи
  // вдалось розібрати відповідь (той самий підхід, що в telegram-assistant-background.ts).
  const cost = chatCostUsd(model, result.usage.inputTokens, result.usage.outputTokens);
  if (workspaceId) {
    // Await обов'язковий: на Lambda контейнер засинає одразу після return, тож
    // fire-and-forget не встиг би дійти до бази.
    await logAiUsage(adminClient, {
      workspaceId,
      userId: user.id,
      actorName,
      kind: "chat",
      model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      costUsd: cost.costUsd,
      metadata: {
        source: "dev_request_draft",
        priceKnown: cost.priceKnown,
        chars: result.text.length,
        openTitles: result.openTitlesCount,
      },
    });
  } else {
    console.error("ai_usage skipped: could not resolve workspace_id for user", user.id);
  }

  return jsonResponse(200, result.draft);
};

import { z } from "zod";

import { parseBody } from "./_lib/parseBody";

import { createClient } from "@supabase/supabase-js";
import { logAiUsage } from "./_aiUsageLog";
import { chatCostUsd } from "./_aiPricing";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

/** Форма запиту — і перевірка, і тип (REQ-137). */
const requestSchema = z
  .object({ source: z.string().optional(), case: z.string().optional() })
  .strict();

type DeclineRequest = z.infer<typeof requestSchema>;

type OpenAiResponseShape = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string };
};

type DeclineUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
};

const EMPTY_USAGE: DeclineUsage = {
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  cachedInputTokens: null,
};

const toNullableNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const DEFAULT_MODEL = process.env.OPENAI_NAME_DECLENSION_MODEL || "gpt-5.6-luna";
const SUPPORTED_CASES = new Set(["genitive"]); // extend later if needed (dative, etc.)

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const normalizeWhitespace = (value: string) => value.replace(/\s+/gu, " ").trim();

const buildDeveloperPrompt = (targetCase: string) => {
  const caseLabel =
    targetCase === "genitive"
      ? "родовий відмінок (Кого? Чого?)"
      : targetCase;
  return [
    `Ти — лінгвіст-морфолог української мови.`,
    `Завдання: відмінюй українські слова та словосполучення (ПІБ, посади, назви) у ${caseLabel}.`,
    `Поверни ВИКЛЮЧНО провідміняну форму без коментарів, лапок, пунктуації навколо чи будь-якого іншого тексту.`,
    `Якщо вхід не є українським текстом або не піддається відмінюванню — поверни його незмінним.`,
    `Для ПІБ зберігай велику літеру на початку кожної частини імені. Для посад зберігай оригінальний регістр (велика чи мала літера на початку).`,
    `Приклади (Кого? Чого?):`,
    `Вхід: "Андрущак Вадим Іванович" → Вихід: "Андрущака Вадима Івановича"`,
    `Вхід: "Борщ Олена Вікторівна" → Вихід: "Борщ Олени Вікторівни"`,
    `Вхід: "Коваленко Сергій Петрович" → Вихід: "Коваленка Сергія Петровича"`,
    `Вхід: "Директор" → Вихід: "Директора"`,
    `Вхід: "директор" → Вихід: "директора"`,
    `Вхід: "Генеральний директор" → Вихід: "Генерального директора"`,
    `Вхід: "ФОП" → Вихід: "ФОП"`,
    `Вхід: "уповноваженої особи" → Вихід: "уповноваженої особи"`,
  ].join("\n");
};

const extractOutputText = (payload: OpenAiResponseShape) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const blocks = Array.isArray(payload.output) ? payload.output : [];
  for (const block of blocks) {
    const content = Array.isArray(block.content) ? block.content : [];
    for (const part of content) {
      if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return "";
};

async function callOpenAi(params: {
  apiKey: string;
  model: string;
  source: string;
  targetCase: string;
}): Promise<{ text: string; usage: DeclineUsage }> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      input: [
        { role: "developer", content: buildDeveloperPrompt(params.targetCase) },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: params.source,
            },
          ],
        },
      ],
      max_output_tokens: 80,
      temperature: 0,
    }),
  });
  const payload = (await response.json()) as OpenAiResponseShape;
  const usage: DeclineUsage = {
    inputTokens: toNullableNumber(payload.usage?.input_tokens),
    outputTokens: toNullableNumber(payload.usage?.output_tokens),
    totalTokens: toNullableNumber(payload.usage?.total_tokens),
    cachedInputTokens: toNullableNumber(payload.usage?.input_tokens_details?.cached_tokens),
  };
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI HTTP ${response.status}`;
    const failure = new Error(message) as Error & { usage?: DeclineUsage };
    failure.usage = usage;
    throw failure;
  }
  return { text: normalizeWhitespace(extractOutputText(payload)), usage };
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
  const openAiKey = normalizeText(process.env.OPENAI_API_KEY);

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
  const payload: DeclineRequest = parsed.data;

  const source = normalizeWhitespace(normalizeText(payload.source));
  const targetCase = normalizeText(payload.case) || "genitive";
  if (!source) {
    return jsonResponse(400, { error: "Missing 'source' (text to decline)" });
  }
  if (!SUPPORTED_CASES.has(targetCase)) {
    return jsonResponse(400, { error: `Unsupported case '${targetCase}'` });
  }

  // Auth: any signed-in user can call this.
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1) Try the cache.
  try {
    const { data: cached } = await adminClient
      .schema("tosho")
      .from("name_declensions")
      .select("result")
      .eq("source", source)
      .eq("target_case", targetCase)
      .maybeSingle();
    if (cached?.result) {
      return jsonResponse(200, { source, case: targetCase, result: cached.result, cached: true });
    }
  } catch (cacheError) {
    // If the table doesn't exist yet, fall through to OpenAI but skip caching.
    console.warn("[decline-name] cache lookup failed", cacheError);
  }

  // 2) Cache miss → call OpenAI (if configured).
  if (!openAiKey) {
    // Graceful fallback: return source unchanged so docs don't break.
    return jsonResponse(200, {
      source,
      case: targetCase,
      result: source,
      cached: false,
      warning: "OPENAI_API_KEY is not configured; returning source unchanged.",
    });
  }

  // Журнал вартості. Виклик оплачений незалежно від того, чи розібралась
  // відповідь, тож пишемо і на невдалій спробі — саме такі виклики раніше
  // зникали зі звіту, а рахунок від OpenAI їх пам'ятав.
  const logCost = async (usage: DeclineUsage, ok: boolean) => {
    const { data: membershipRows } = await adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("workspace_id")
      .eq("user_id", userData.user.id)
      .limit(1);
    const workspaceId =
      ((membershipRows ?? []) as Array<{ workspace_id?: string | null }>)[0]?.workspace_id ?? null;
    if (!workspaceId) {
      console.error("[decline-name] ai_usage skipped: no workspace for", userData.user.id);
      return;
    }
    const { costUsd, priceKnown } = chatCostUsd(
      DEFAULT_MODEL,
      usage.inputTokens,
      usage.outputTokens,
      usage.cachedInputTokens
    );
    await logAiUsage(adminClient, {
      workspaceId,
      userId: userData.user.id,
      actorName: userData.user.email ?? null,
      kind: "chat",
      model: DEFAULT_MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      costUsd,
      metadata: {
        source: "decline-name",
        targetCase,
        chars: source.length,
        ok,
        cachedInputTokens: usage.cachedInputTokens,
        priceKnown,
      },
    });
  };

  let declined: string;
  try {
    const call = await callOpenAi({ apiKey: openAiKey, model: DEFAULT_MODEL, source, targetCase });
    declined = call.text;
    await logCost(call.usage, true);
  } catch (error) {
    console.error("[decline-name] OpenAI call failed", error);
    await logCost((error as { usage?: DeclineUsage })?.usage ?? EMPTY_USAGE, false);
    return jsonResponse(200, {
      source,
      case: targetCase,
      result: source,
      cached: false,
      warning: error instanceof Error ? error.message : "OpenAI call failed",
    });
  }

  if (!declined) {
    return jsonResponse(200, {
      source,
      case: targetCase,
      result: source,
      cached: false,
      warning: "OpenAI returned empty response",
    });
  }

  // 3) Store in cache (best-effort).
  try {
    await adminClient
      .schema("tosho")
      .from("name_declensions")
      .upsert(
        {
          source,
          target_case: targetCase,
          result: declined,
          model: DEFAULT_MODEL,
        },
        { onConflict: "source,target_case" }
      );
  } catch (cacheWriteError) {
    console.warn("[decline-name] cache write failed", cacheWriteError);
  }

  return jsonResponse(200, { source, case: targetCase, result: declined, cached: false });
};

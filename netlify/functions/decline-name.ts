import { createClient } from "@supabase/supabase-js";

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type DeclineRequest = {
  source?: string;
  case?: string;
};

type OpenAiResponseShape = {
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  output_text?: string;
  error?: { message?: string };
};

const DEFAULT_MODEL = process.env.OPENAI_NAME_DECLENSION_MODEL || "gpt-4o-mini";
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
      ? "родовий відмінок (Кого?)"
      : targetCase;
  return [
    `Ти — лінгвіст-морфолог української мови.`,
    `Завдання: відмінюй українські повні імена (Прізвище Імʼя По-батькові) у ${caseLabel}.`,
    `Поверни ВИКЛЮЧНО провідміняне ПІБ без коментарів, лапок, пунктуації навколо чи будь-якого іншого тексту.`,
    `Якщо вхід не є українським ПІБ або не піддається відмінюванню — поверни його незмінним.`,
    `Зберігай оригінальний порядок слів і регістр (велика літера на початку кожної частини імені).`,
    `Приклади:`,
    `Вхід: "Андрущак Вадим Іванович" → Вихід: "Андрущака Вадима Івановича"`,
    `Вхід: "Борщ Олена Вікторівна" → Вихід: "Борщ Олени Вікторівни"`,
    `Вхід: "Коваленко Сергій Петрович" → Вихід: "Коваленка Сергія Петровича"`,
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

async function callOpenAi(params: { apiKey: string; model: string; source: string; targetCase: string }) {
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
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI HTTP ${response.status}`;
    throw new Error(message);
  }
  const text = extractOutputText(payload);
  return normalizeWhitespace(text);
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

  let payload: DeclineRequest;
  try {
    payload = JSON.parse(event.body ?? "{}") as DeclineRequest;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

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

  let declined = "";
  try {
    declined = await callOpenAi({ apiKey: openAiKey, model: DEFAULT_MODEL, source, targetCase });
  } catch (error) {
    console.error("[decline-name] OpenAI call failed", error);
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

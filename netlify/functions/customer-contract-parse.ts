import { z } from "zod";

import { createClient } from "@supabase/supabase-js";

import { parseBody } from "./_lib/parseBody";
import { extractResponseOutputText, extractUsage } from "./_lib/openAiResponses";
import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";

/**
 * Розпізнавання договору, підписаного поза CRM (REQ-322#p39): номер, дата, термін
 * дії й автопролонгація з PDF чи фото.
 *
 * ФУНКЦІЯ НІЧОГО НЕ ПИШЕ В БАЗУ, крім рядка обліку витрат. Поля лише
 * підставляються у форму, бухгалтер звіряє їх із файлом і зберігає сам під своїм
 * RLS: номер договору далі друкується в кожному рахунку й СП, і мовчазна помилка
 * розпізнавання розійшлась би всіма документами замовника.
 */

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

/** ~4 МБ файла в base64; тіло Netlify-функції — до 6 МБ. */
const MAX_BASE64_CHARS = 5_600_000;

const MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

const requestSchema = z
  .object({
    fileName: z.string().min(1).max(200),
    mimeType: z.enum(MIME_TYPES),
    fileBase64: z.string().min(100).max(MAX_BASE64_CHARS).regex(/^[A-Za-z0-9+/=]+$/),
  })
  .strict();

type RequestBody = z.infer<typeof requestSchema>;

const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["number", "date", "validUntil", "autoProlongation", "customerName", "customerCode", "warnings"],
  properties: {
    number: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    validUntil: { type: ["string", "null"] },
    autoProlongation: { type: ["boolean", "null"] },
    customerName: { type: ["string", "null"] },
    customerCode: { type: ["string", "null"] },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

const DEVELOPER_PROMPT = [
  "You read a signed Ukrainian supply or services contract (договір поставки / надання послуг) between ToSho (our company, the supplier) and a customer.",
  "number = the contract number exactly as printed after '№' in the title (e.g. '12/05/2026-003', '45-П'); null if absent. Never invent one.",
  "date = the contract date from the title or the first lines, as YYYY-MM-DD; null if absent.",
  "validUntil = the date until which the contract is valid, from the term section ('діє до', 'строк дії'), as YYYY-MM-DD; null if the contract is open-ended or the term is not stated. If the term is relative ('один рік з дати підписання'), compute it from date.",
  "autoProlongation = true when the contract renews automatically ('вважається пролонгованим', 'автоматично продовжується'), false when it states it does not, null when silent.",
  "customerName = the customer's legal name as written (the party that is not ToSho); customerCode = its ЄДРПОУ or РНОКПП digits; null when absent.",
  "warnings = short Ukrainian sentences about anything unclear: unreadable scan, several numbers or dates, a missing page, signatures absent. Empty array when everything was clear.",
].join(" ");

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

const isoDateOrNull = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;

const textOrNull = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(204, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method Not Allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse(500, { error: "Missing Supabase env vars" });
  }

  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return jsonResponse(503, { error: "Розпізнавання недоступне: не налаштований OPENAI_API_KEY." });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  if (!token) return jsonResponse(401, { error: "Missing Authorization token" });

  const parsed = parseBody(event.body, requestSchema);
  if (!parsed.ok) return jsonResponse(400, { error: parsed.error });
  const body: RequestBody = parsed.data;

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return jsonResponse(401, { error: "Unauthorized" });
  const user = userData.user;

  const { data: membershipRows } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId = ((membershipRows ?? []) as Array<{ workspace_id?: string | null }>)[0]?.workspace_id ?? null;
  if (!workspaceId) return jsonResponse(403, { error: "Workspace not found" });

  // Розпізнавання коштує грошей і потрібне лише тим, хто вносить договори
  // (REQ-322#p41) — те саме коло, що його пускає RLS таблиці договорів.
  const { data: isClerk, error: clerkError } = await userClient
    .schema("tosho")
    .rpc("is_order_document_clerk", { _user_id: user.id });
  if (clerkError) {
    console.error("customer-contract-parse: clerk check failed", clerkError);
    return jsonResponse(500, { error: "Не вдалося перевірити права." });
  }
  if (isClerk !== true) return jsonResponse(403, { error: "Вносити договори можуть СЕО і бухгалтерія." });

  const model =
    (process.env.CONTRACT_PARSE_OPENAI_MODEL ?? "").trim() ||
    (process.env.QUOTE_IMPORT_OPENAI_MODEL ?? "").trim() ||
    "gpt-5.6-terra";
  const startedAt = Date.now();
  const dataUrl = `data:${body.mimeType};base64,${body.fileBase64}`;
  const fileInput =
    body.mimeType === "application/pdf"
      ? { type: "input_file", filename: body.fileName, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl, detail: "high" };

  let payload: Record<string, unknown>;
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        input: [
          { role: "developer", content: DEVELOPER_PROMPT },
          { role: "user", content: [fileInput] },
        ],
        max_output_tokens: 4_000,
        text: {
          format: {
            type: "json_schema",
            name: "customer_contract",
            strict: true,
            schema: OPENAI_SCHEMA,
          },
        },
      }),
    });
    payload = (await response.json()) as Record<string, unknown>;
  } catch (error) {
    // Текст збою до клієнта не йде: у ньому буває фрагмент ключа чи адреса.
    console.error("customer-contract-parse: OpenAI request failed", error);
    return jsonResponse(502, { error: "Розпізнавання тимчасово недоступне — впишіть поля самі." });
  }

  const usage = extractUsage(payload);
  const { costUsd, priceKnown } = chatCostUsd(
    model,
    usage.inputTokens,
    usage.outputTokens,
    usage.cachedInputTokens
  );

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
      source: "customer-contract-parse",
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileChars: body.fileBase64.length,
      latencyMs: Date.now() - startedAt,
      ok: response.ok,
      cachedInputTokens: usage.cachedInputTokens,
      priceKnown,
    },
  });

  if (!response.ok) {
    console.error("customer-contract-parse: OpenAI responded", response.status, payload?.error);
    return jsonResponse(502, { error: "Розпізнавання тимчасово недоступне — впишіть поля самі." });
  }

  const rawText = extractResponseOutputText(payload);
  if (!rawText) return jsonResponse(502, { error: "Модель не повернула результат. Спробуйте ще раз." });

  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return jsonResponse(502, { error: "Розпізнаний договір прийшов не у форматі JSON." });
  }

  return jsonResponse(200, {
    number: textOrNull(decoded.number, 80),
    date: isoDateOrNull(decoded.date),
    validUntil: isoDateOrNull(decoded.validUntil),
    autoProlongation: typeof decoded.autoProlongation === "boolean" ? decoded.autoProlongation : null,
    customerName: textOrNull(decoded.customerName, 300),
    customerCode: textOrNull(decoded.customerCode, 20),
    warnings: Array.isArray(decoded.warnings)
      ? decoded.warnings.filter((line): line is string => typeof line === "string").slice(0, 10)
      : [],
    model,
    costUsd,
  });
};

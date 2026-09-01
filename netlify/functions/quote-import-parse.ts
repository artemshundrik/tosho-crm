import { z } from "zod";

import { createClient } from "@supabase/supabase-js";

import { parseBody } from "./_lib/parseBody";
import { extractResponseOutputText, extractUsage } from "./_lib/openAiResponses";
import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";

/**
 * Розшифровка ексельки в позиції прорахунку (REQ-233, docs/QUOTE_IMPORT_DESIGN.md).
 *
 * ФУНКЦІЯ НІЧОГО НЕ ПИШЕ В БАЗУ, крім рядка обліку витрат. Позиції й тиражі
 * створює фронт наявними мутаціями під RLS користувача — після того, як людина
 * подивилась прев'ю. Це не обережність заради обережності: вхідні дані брудні
 * (ціни текстом, діапазони тиражу, альтернативи в сусідніх рядках), а тиражі в
 * CRM автозберігаються, тож мовчазний запис зіпсував би прорахунок швидше, ніж
 * його встигли б відкрити.
 *
 * Файл сюди не їде — тільки текстовий дамп аркуша, зібраний у браузері.
 */

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

/** Стеля дампа, та сама, що на фронті (`sheetDump.ts`) плюс запас на службові рядки. */
const MAX_DUMP_CHARS = 260_000;

/** Скільки позицій узагалі приймаємо з однієї відповіді. */
const MAX_ITEMS = 200;

const requestSchema = z
  .object({
    quoteId: z.string().uuid(),
    fileName: z.string().min(1).max(200),
    sheetDump: z.string().min(10).max(MAX_DUMP_CHARS),
  })
  .strict();

type RequestBody = z.infer<typeof requestSchema>;

const FLAGS = ["price_missing", "ask_supplier", "quantity_range", "alternative"] as const;

const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "warnings"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceRows", "name", "comment", "links", "runs", "flags", "notes"],
        properties: {
          sourceRows: { type: "array", items: { type: "integer" } },
          name: { type: "string" },
          comment: { type: ["string", "null"] },
          links: { type: "array", items: { type: "string" } },
          runs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quantity", "unitPriceModel", "modelPriceIncludesVat", "unitPricePrint"],
              properties: {
                quantity: { type: "number" },
                unitPriceModel: { type: ["number", "null"] },
                modelPriceIncludesVat: { type: ["boolean", "null"] },
                unitPricePrint: { type: ["number", "null"] },
              },
            },
          },
          flags: { type: "array", items: { type: "string", enum: FLAGS } },
          notes: { type: ["string", "null"] },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * Правила розбору — погоджені в docs/QUOTE_IMPORT_DESIGN.md §4.
 *
 * Головне тут — заборона вигадувати ціну. У референсному файлі KMZ є рядки
 * «прохання запитати підрядника», і саме вони найдорожчі: підставлена моделлю
 * правдоподібна цифра поїхала б клієнту як наша ціна.
 */
const DEVELOPER_PROMPT = [
  "You extract quote line items from a spreadsheet dump of a client's request (Ukrainian print/merch industry).",
  "Each dump line starts with the row number from the file, then tab-separated cell values.",
  "A section '=== Посилання (рядок → адреса)' maps row numbers to hyperlinks found in that row.",
  "Return ONE item per product. sourceRows must list the dump row numbers the item came from.",
  "PRICES: use only numbers present in the file. Never invent or estimate a price.",
  "If the price cell holds text instead of a number (e.g. 'прохання запитати підрядника'), leave the price null and set flag 'ask_supplier'.",
  "If there is no price at all, leave it null and set flag 'price_missing'.",
  "QUANTITIES: '300-500 шт.' means two runs of the same item (300 and 500) — runs are mutually exclusive variants, not a sum. Set flag 'quantity_range'.",
  "VAT: 'без ПДВ' next to a price → modelPriceIncludesVat false; 'з ПДВ' → true; a column header like 'Вартість виробу (з ПДВ)' is the default for that column; otherwise null.",
  "ALTERNATIVES: a neighbouring row with the same item number but a different product/link/price is a separate item with flag 'alternative'.",
  "comment = the client's own comment for that row, verbatim and short. notes = your remark about what was unclear.",
  "links: every hyperlink that belongs to the item's rows, most relevant first.",
  "Skip header, total and empty rows entirely, and mention what you skipped in warnings.",
  "warnings: short Ukrainian sentences about anything you could not parse. Empty array when everything was clear.",
  "All text you produce (name, comment, notes, warnings) must be Ukrainian, matching the file.",
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
    return jsonResponse(503, { error: "Розшифровка недоступна: не налаштований OPENAI_API_KEY." });
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

  // Доступ до прорахунку перевіряє САМА БАЗА: запит іде клієнтом користувача,
  // тож RLS віддасть рядок лише тому, хто його й так бачить у CRM. Порожньо —
  // прорахунку для цієї людини не існує, і розшифровку замовляти нема для чого.
  const { data: quoteRow, error: quoteError } = await userClient
    .schema("tosho")
    .from("quotes")
    .select("id, team_id")
    .eq("id", body.quoteId)
    .maybeSingle<{ id: string; team_id: string | null }>();
  if (quoteError) return jsonResponse(500, { error: quoteError.message });
  if (!quoteRow) return jsonResponse(403, { error: "Прорахунок недоступний." });

  const { data: membershipRows } = await userClient
    .schema("tosho")
    .from("memberships_view")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  const workspaceId =
    ((membershipRows ?? []) as Array<{ workspace_id?: string | null }>)[0]?.workspace_id ??
    quoteRow.team_id ??
    null;
  if (!workspaceId) return jsonResponse(403, { error: "Workspace not found" });

  const model = (process.env.QUOTE_IMPORT_OPENAI_MODEL ?? "").trim() || "gpt-5.6-terra";
  // Витяг із таблиці — робота механічна: глибина міркування тут дає не якість, а
  // рахунок. Env лишається на випадок справді заплутаного файлу.
  const effort = (process.env.QUOTE_IMPORT_OPENAI_EFFORT ?? "").trim() || "low";
  const startedAt = Date.now();

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
        reasoning: { effort },
        input: [
          { role: "developer", content: DEVELOPER_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `FILE: ${body.fileName}\n\nSHEET DUMP:\n${body.sheetDump}`,
              },
            ],
          },
        ],
        max_output_tokens: 16_000,
        text: {
          format: {
            type: "json_schema",
            name: "quote_import_items",
            strict: true,
            schema: OPENAI_SCHEMA,
          },
        },
      }),
    });
    payload = (await response.json()) as Record<string, unknown>;
  } catch (error) {
    return jsonResponse(502, {
      error: error instanceof Error ? error.message : "Не вдалося звернутися до OpenAI.",
    });
  }

  const usage = extractUsage(payload);
  const { costUsd, priceKnown } = chatCostUsd(model, usage.inputTokens, usage.outputTokens);

  // Облік пишемо і на невдалій спробі: невдача теж коштує токенів, і саме такі
  // виклики раніше зникали зі звіту, а рахунок від OpenAI їх пам'ятав.
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
      source: "quote-import-parse",
      quoteId: body.quoteId,
      fileName: body.fileName,
      dumpChars: body.sheetDump.length,
      latencyMs: Date.now() - startedAt,
      ok: response.ok,
      priceKnown,
    },
  });

  if (!response.ok) {
    const message =
      payload && typeof payload.error === "object" && payload.error && "message" in payload.error
        ? String((payload.error as { message?: unknown }).message ?? "")
        : "";
    return jsonResponse(502, { error: message || `OpenAI відповів ${response.status}.` });
  }

  const rawText = extractResponseOutputText(payload);
  if (!rawText) {
    return jsonResponse(502, { error: "Модель не повернула розшифровку. Спробуйте ще раз." });
  }

  let decoded: { items?: unknown; warnings?: unknown };
  try {
    decoded = JSON.parse(rawText) as { items?: unknown; warnings?: unknown };
  } catch {
    return jsonResponse(502, { error: "Розшифровка прийшла не у форматі JSON." });
  }

  const items = Array.isArray(decoded.items) ? decoded.items.slice(0, MAX_ITEMS) : [];
  const warnings = Array.isArray(decoded.warnings)
    ? decoded.warnings.filter((line): line is string => typeof line === "string").slice(0, 50)
    : [];
  if (Array.isArray(decoded.items) && decoded.items.length > MAX_ITEMS) {
    warnings.push(`У файлі більше ${MAX_ITEMS} позицій — показано перші ${MAX_ITEMS}.`);
  }

  return jsonResponse(200, {
    items,
    warnings,
    model,
    costUsd,
    fileName: body.fileName,
  });
};

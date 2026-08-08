import { createClient } from "@supabase/supabase-js";

import { buildProjectMap, isKnownModuleKey } from "../../src/lib/projectMap";
import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";

// Надиктований запит → охайна картка розділу «Запити». На вхід приходить сирий
// текст розпізнавання (клієнт свідомо кличе диктування з clean: false — чистку
// від «еее» робить цей самий виклик разом зі структуруванням, інакше платимо
// двічі за той самий текст) і назви відкритих карток, щоб модель могла вказати
// на очевидний дубль.
//
// Разом із текстом у промпт іде карта CRM (src/lib/projectMap.ts) — перелік
// напрямків і того, що застосунок уже вміє. Без неї модель охайно переказувала
// сказане, але не могла ні поставити напрямок, ні помітити, що просять уже
// наявне.
//
// Контур env/auth/fetch — той самий, що в transcribe.ts: OPENAI_API_KEY лишається
// на сервері, кожен виклик іде під валідним Supabase JWT, а користувача
// перевіряємо ДО того, як витрачати кредити OpenAI.

type HttpEvent = {
  httpMethod?: string;
  body?: string | null;
  headers?: Record<string, string | undefined>;
};

type OpenTitleInput = {
  label?: string | null;
  title?: string | null;
};

type RequestBody = {
  text?: string;
  openTitles?: OpenTitleInput[];
};

const KINDS = ["bug", "friction", "feature"] as const;
type Kind = (typeof KINDS)[number];

const PRIORITIES = ["low", "normal", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

type Draft = {
  title: string;
  body: string;
  kind: Kind;
  duplicateOf: string | null;
  /** Ключ напрямку з реєстру модулів. Вигаданий моделлю — обнуляється. */
  moduleKey: string | null;
  priority: Priority;
  /** «Схоже, це вже працює: …» — назва наявної можливості й де її шукати. */
  existingFeature: string | null;
};

/** Хвилина мовлення ≈ 900 знаків; 6000 — це вже дуже довга розповідь. */
const MAX_TEXT_CHARS = 6000;
/** Довший список карток нічого не додає до підказки про дубль, лише коштує токенів. */
const MAX_OPEN_TITLES = 50;
/** Назва в базі — text без обмеження, але захист від «полотна» замість заголовка. */
const MAX_TITLE_CHARS = 200;
/** Скільки знаків тексту стають назвою, коли розбір не вдався. */
const FALLBACK_TITLE_CHARS = 80;
/** Підказка «це вже працює» має бути рядком, а не переказом половини карти. */
const MAX_EXISTING_FEATURE_CHARS = 160;

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

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const SYSTEM_PROMPT = [
  "Ти перетворюєш усний запит українського співробітника на картку задачі для CRM.",
  "",
  "Поверни JSON:",
  "{",
  '  "title": "одне речення до 80 символів, з великої літери, без крапки в кінці",',
  '  "body": "структурований опис: що не так, де саме це видно, як має бути. Абзаци через \\n\\n. Якщо чогось не сказали — не вигадуй",',
  '  "kind": "bug | friction | feature",',
  '  "duplicateOf": "label наявної картки або null",',
  '  "moduleKey": "ключ напрямку з карти CRM нижче або null",',
  '  "priority": "low | normal | high",',
  '  "existingFeature": "коротко: назва наявної можливості й де її шукати, або null"',
  "}",
  "",
  "Правила:",
  "- Назва описує СУТЬ з погляду людини, яка користується CRM, а не спосіб реалізації.",
  '- Прибирай слова-паразити, повтори й самовиправлення ("ну", "тобто", "ой ні, не так").',
  "- Не додавай того, чого не було сказано. Порожній опис кращий за вигаданий.",
  '- kind: "bug" — щось зламано; "friction" — працює, але незручно; "feature" — нового немає.',
  "- duplicateOf став лише за очевидного збігу теми, інакше null.",
  "- moduleKey бери ДОСЛІВНО з переліку напрямків у карті CRM і став, лише якщо впевнений. Не впевнений — null. Свої ключі не вигадуй.",
  "- Порожній напрямок кращий за неправильний: порожнє поле змусить людину глянути самій, а неправильне введе в оману й зіпсує статистику.",
  '- priority: "high" — щось зламано й заважає працювати прямо зараз; "normal" — звичайна доробка; "low" — косметика й «колись було б добре». За замовчуванням "normal".',
  "- existingFeature заповнюй, лише якщо в списку «що CRM уже вміє» справді є те, що робить рівно це. Схожа назва — не привід. Список неповний, тож відсутність у ньому нічого не доводить: сумніваєшся — null.",
].join("\n");

// Карта збирається один раз на холодний старт: реєстри статичні, а платити
// токенами за її перезбирання на кожен виклик не треба.
const DEVELOPER_PROMPT = `${SYSTEM_PROMPT}\n\nКАРТА CRM\n${buildProjectMap()}`;

// Структурований вихід задається так само, як у tosho-ai.ts — це єдине місце в
// проєкті, де Responses API просять про JSON (transcribe.ts повертає простий
// текст, telegram-assistant-background.ts ходить через tool call).
const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "body", "kind", "duplicateOf", "moduleKey", "priority", "existingFeature"],
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    kind: { type: "string", enum: [...KINDS] },
    // strict: true вимагає, щоб поле було в required, тож «немає дубля» — це
    // саме null, а не відсутнє поле. Те саме стосується moduleKey й
    // existingFeature: «не знаю» треба вміти сказати явно.
    duplicateOf: { type: ["string", "null"] },
    // Перелік ключів не дублюємо в схему enum-ом: він уже є в карті, а
    // правдивість відповіді все одно звіряє isKnownModuleKey — схема не
    // врятує від «схожого, але не того» ключа краще за реєстр.
    moduleKey: { type: ["string", "null"] },
    priority: { type: "string", enum: [...PRIORITIES] },
    existingFeature: { type: ["string", "null"] },
  },
} as const;

function buildUserPrompt(text: string, openTitles: Array<{ label: string; title: string }>): string {
  const parts = [`ЩО СКАЗАЛИ:\n${text}`];
  if (openTitles.length > 0) {
    const lines = openTitles.map((entry) => `${entry.label}: ${entry.title}`).join("\n");
    parts.push(`ВІДКРИТІ КАРТКИ (для duplicateOf):\n${lines}`);
  }
  return parts.join("\n\n");
}

function asKind(value: unknown): Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value)
    ? (value as Kind)
    : "friction";
}

/** Незрозумілий пріоритет — це «звичайна доробка», а не «горить». */
function asPriority(value: unknown): Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value)
    ? (value as Priority)
    : "normal";
}

/**
 * Спільна нормалізація — і для розібраної відповіді, і для аварійного варіанта.
 *
 * Порожня назва сюди не доходить: людині лишається дописати рівно те, що модель
 * не змогла стиснути, а не згадувати, про що вона взагалі говорила. Тому назвою
 * стають перші 80 знаків сказаного.
 */
function normalizeDraft(draft: Partial<Draft>, rawText: string): Draft {
  const title = normalizeText(draft.title).slice(0, MAX_TITLE_CHARS);
  return {
    title: title || normalizeText(rawText.slice(0, FALLBACK_TITLE_CHARS)),
    body: normalizeText(draft.body),
    kind: asKind(draft.kind),
    duplicateOf: normalizeText(draft.duplicateOf) || null,
    // Єдине місце, де напрямок звіряється з реєстром модулів. Модель
    // регулярно вигадує правдоподібні ключі («payments», «tasks»), і такий
    // напрямок нікуди не веде, зате виглядає як робота розбору — картка
    // здається класифікованою, а статистика по напрямках бреше. Порожньо
    // краще: людина побачить пусте поле й обере сама.
    moduleKey: isKnownModuleKey(draft.moduleKey) ? draft.moduleKey : null,
    priority: asPriority(draft.priority),
    existingFeature:
      normalizeText(draft.existingFeature).slice(0, MAX_EXISTING_FEATURE_CHARS) || null,
  };
}

/** Аварійний варіант: надиктоване не має пропадати, навіть коли розбір упав. */
function fallbackDraft(rawText: string): Draft {
  return normalizeDraft(
    {
      title: "",
      body: rawText,
      kind: "friction",
      duplicateOf: null,
      // Розбору не було — вигадувати напрямок і підказку нема з чого.
      moduleKey: null,
      priority: "normal",
      existingFeature: null,
    },
    rawText
  );
}

/** Витягнути текст відповіді Responses API: спершу зручний output_text, потім структура. */
function extractOutputText(payload: {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
}): string {
  const direct = normalizeText(payload.output_text);
  if (direct) return direct;
  return normalizeText(
    (payload.output ?? [])
      .flatMap((item) => item.content ?? [])
      .filter((part) => part?.type === "output_text")
      .map((part) => normalizeText(part.text))
      .filter(Boolean)
      .join("\n")
  );
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

  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

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

  const rawText = normalizeText(body.text).slice(0, MAX_TEXT_CHARS);
  if (!rawText) {
    return jsonResponse(400, { error: "Missing text" });
  }

  const openTitles = (Array.isArray(body.openTitles) ? body.openTitles : [])
    .map((entry) => ({ label: normalizeText(entry?.label), title: normalizeText(entry?.title) }))
    .filter((entry) => entry.label && entry.title)
    .slice(0, MAX_OPEN_TITLES);
  const knownLabels = new Set(openTitles.map((entry) => entry.label.toLowerCase()));

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

  const model = normalizeText(process.env.OPENAI_MODEL) || "gpt-5.4";

  let payload: {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  } = {};
  let ok = false;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
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
          { role: "user", content: [{ type: "input_text", text: buildUserPrompt(rawText, openTitles) }] },
        ],
        max_output_tokens: 1600,
        text: {
          format: {
            type: "json_schema",
            name: "dev_request_draft",
            strict: true,
            schema: DRAFT_SCHEMA,
          },
        },
      }),
    });
    payload = (await response.json().catch(() => ({}))) as typeof payload;
    ok = response.ok;
  } catch (error) {
    console.error(
      "dev-request-draft: OpenAI request threw:",
      error instanceof Error ? error.message : error
    );
  }

  // Кости логуємо ДО перевірки на успіх: виклик оплачений незалежно від того, чи
  // вдалось розібрати відповідь (той самий підхід, що в telegram-assistant-background.ts).
  const usage = {
    inputTokens: toNullableNumber(payload.usage?.input_tokens),
    outputTokens: toNullableNumber(payload.usage?.output_tokens),
    totalTokens: toNullableNumber(payload.usage?.total_tokens),
  };
  const cost = chatCostUsd(model, usage.inputTokens, usage.outputTokens);
  if (workspaceId) {
    // Await обов'язковий: на Lambda контейнер засинає одразу після return, тож
    // fire-and-forget не встиг би дійти до бази.
    await logAiUsage(adminClient, {
      workspaceId,
      userId: user.id,
      actorName,
      kind: "chat",
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      costUsd: cost.costUsd,
      metadata: {
        source: "dev_request_draft",
        priceKnown: cost.priceKnown,
        chars: rawText.length,
        openTitles: openTitles.length,
      },
    });
  } else {
    console.error("ai_usage skipped: could not resolve workspace_id for user", user.id);
  }

  if (!ok) {
    return jsonResponse(200, fallbackDraft(rawText));
  }

  const outputText = extractOutputText(payload);
  let parsed: Partial<Draft>;
  try {
    parsed = JSON.parse(outputText) as Partial<Draft>;
  } catch {
    // Не JSON (порожній вихід, відмова моделі, обрізання по max_output_tokens) —
    // краще віддати сире надиктоване, ніж нічого.
    return jsonResponse(200, fallbackDraft(rawText));
  }

  const draft = normalizeDraft(parsed, rawText);
  // Модель інколи «згадує» картку, якої не було в списку — таку підказку гасимо,
  // інакше людина шукатиме неіснуючий REQ.
  if (draft.duplicateOf && !knownLabels.has(draft.duplicateOf.toLowerCase())) {
    draft.duplicateOf = null;
  }
  return jsonResponse(200, draft);
};

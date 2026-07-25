import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";
import { sendTelegramMessage } from "./_telegram";
import {
  answerDesignQuery,
  HELP_TEXT,
  type DesignIntent,
  type DesignPeriod,
  type DesignQuery,
} from "./_designAssistant";
import { answerAdminQuery, type AdminIntent } from "./_adminAssistant";
import { answerQuotesQuery, type QuotesIntent } from "./_quotesAssistant";

// Асистент по дизайн-задачах у Telegram (docs/TELEGRAM_ASSISTANT_DESIGN.md).
//
// Суфікс -background — конвенція Netlify: функція викликається асинхронно і має
// власний бюджет часу. Це принципово: Telegram чекає відповіді на вебхук
// секунди й повторює запит, а модель + запити займають 5–20 с. Вебхук тому
// одразу віддає 200 і делегує роботу сюди.
//
// Модель НЕ рахує цифри — вона лише перекладає питання у DesignQuery. Усі
// підрахунки в _designAssistant.ts по SQL.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type Payload = {
  chatId?: number;
  userId?: string;
  workspaceId?: string;
  teamId?: string;
  actorName?: string | null;
  question?: string;
  /** true — власник; лише йому доступні адмін-інтенти. */
  isOwner?: boolean;
  /** Кнопка-заготовка: інтент відомий, модель не потрібна (і не оплачується). */
  directIntent?: string;
};

const ADMIN_INTENTS: AdminIntent[] = ["ai_usage", "system_health", "whats_broken"];
const QUOTES_INTENTS: QuotesIntent[] = [
  "quotes_pipeline",
  "quotes_created",
  "quotes_approved",
  "quotes_overdue",
  "customer_summary",
];

function isAdminIntent(value: string): value is AdminIntent {
  return (ADMIN_INTENTS as string[]).includes(value);
}

function isQuotesIntent(value: string): value is QuotesIntent {
  return (QUOTES_INTENTS as string[]).includes(value);
}

/** Скільки хвилин контекст діалогу лишається чинним. */
const CONTEXT_TTL_MINUTES = 30;

type AdminClient = SupabaseClient;

/**
 * Останній розібраний запит цього чату — щоб «а вчора?» доповнювало попереднє
 * питання, а не падало в довідку. Протухає за CONTEXT_TTL_MINUTES: завтрашнє
 * «а вчора?» не повинно підхоплювати вчорашню тему.
 */
async function loadContext(admin: AdminClient, chatId: number): Promise<DesignQuery | null> {
  const { data } = await admin
    .schema("tosho")
    .from("assistant_context")
    .select("last_query,updated_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  const row = data as { last_query?: unknown; updated_at?: string } | null;
  if (!row?.last_query || !row.updated_at) return null;
  const ageMinutes = (Date.now() - new Date(row.updated_at).getTime()) / 60_000;
  if (ageMinutes > CONTEXT_TTL_MINUTES) return null;
  return row.last_query as DesignQuery;
}

async function saveContext(admin: AdminClient, chatId: number, query: DesignQuery): Promise<void> {
  // Довідку не запам'ятовуємо: доповнювати «нічого» немає сенсу.
  if (query.intent === "help") return;
  await admin
    .schema("tosho")
    .from("assistant_context")
    .upsert(
      { chat_id: chatId, last_query: query, updated_at: new Date().toISOString() },
      { onConflict: "chat_id" }
    );
}

const INTENTS: DesignIntent[] = [
  "workload_now",
  "designer_workload",
  "team_workload",
  "task_details",
  "tasks_list",
  "created_count",
  "approved_count",
  "revisions",
  "time_spent",
  "deadlines",
  "designer_summary",
  "stuck",
  "help",
];

const PERIODS: DesignPeriod[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "all",
];

const TOOL = {
  type: "function",
  name: "answer_crm_question",
  description:
    "Перекласти питання користувача про CRM (дизайн-задачі, прорахунки, стан системи) у структуровані параметри. Використовувати ЗАВЖДИ. Якщо питання поза цими темами або незрозуміле — intent='help'.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["intent", "designer", "status", "period", "limit", "query"],
    properties: {
      intent: {
        type: "string",
        enum: [...INTENTS, ...ADMIN_INTENTS, ...QUOTES_INTENTS],
        description:
          "workload_now — скільки задач зараз активно (без конкретної людини); designer_workload — скільки зараз у конкретного дизайнера; tasks_list — просять показати список задач; created_count — скільки СТВОРЕНО за період; approved_count — скільки ЗАТВЕРДЖЕНО/зроблено за період; revisions — правки; time_spent — час за таймерами; deadlines — дедлайни або прострочене; designer_summary — загальне «як справи» по людині; stuck — що найдовше висить; team_workload — хто чим завантажений, розподіл по всіх дизайнерах; task_details — питають про КОНКРЕТНУ задачу за номером або назвою; quotes_pipeline — воронка прорахунків, скільки відкритих; quotes_created — скільки прорахунків завели за період; quotes_approved — скільки прорахунків затвердили за період; quotes_overdue — прострочені прорахунки; customer_summary — усе по конкретному КЛІЄНТУ; ai_usage — витрати на AI; system_health — загальний стан системи, бекапи, база, storage, cron; whats_broken — «що не працює», «які проблеми»; help — незрозуміло або поза цим списком.",
      },
      designer: {
        type: ["string", "null"],
        description: "Ім'я людини, якщо названа. Тільки ім'я, без слів «дизайнер», «у», «в».",
      },
      status: {
        type: ["string", "null"],
        description:
          "Статус задачі, якщо названий: new, changes, in_progress, pm_review, client_review, approved, cancelled. «в роботі»/«в прогресі» → in_progress, «правки» → changes.",
      },
      period: {
        type: ["string", "null"],
        enum: [...PERIODS, null],
        description: "Період. Якщо не названий — null (код візьме сьогодні там, де це має сенс).",
      },
      limit: {
        type: ["integer", "null"],
        description: "Скільки позицій показати в списку, якщо просять «топ N». Інакше null.",
      },
      query: {
        type: ["string", "null"],
        description:
          "Вільний текст для пошукових інтентів: номер або назва задачі (task_details), назва клієнта (customer_summary). Інакше null.",
      },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  "Ти — розбирач питань про дизайн-задачі в CRM ToSho. Твоя ЄДИНА робота — викликати",
  "answer_design_question з правильними параметрами. Ніколи не відповідай текстом і ніколи",
  "не вигадуй цифри — їх рахує код.",
  "",
  "Підказки:",
  "• «в прогресі», «в роботі» = status in_progress",
  "• «скільки задач було на тому тижні» = created_count + period last_week",
  "• «скільки зробив/затвердив» = approved_count",
  "• «скільки зараз у Ірини» = designer_workload",
  "• «покажи», «список», «які саме» = tasks_list",
  "• «що по AI», «скільки витратили на AI» = ai_usage",
  "• «що не працює», «є проблеми?», «все ок?» = whats_broken",
  "• «як система», «стан», «бекапи», «cron» = system_health",
  "• «воронка», «скільки відкритих прорахунків» = quotes_pipeline",
  "• «скільки прорахунків завели» = quotes_created; «скільки затвердили» = quotes_approved",
  "• «що по клієнту X» = customer_summary, назву клієнта клади в query",
  "• «покажи задачу DZ-0412» = task_details, номер або назву клади в query",
  "• «хто чим завантажений», «розподіл по дизайнерах» = team_workload",
  "• якщо питання поза цим — intent help",
  "",
  "КОНТЕКСТ. Якщо нижче дано попереднє питання, а нове є уточненням («а вчора?»,",
  "«а за тиждень?», «а по Марʼяні?», «покажи їх»), ДОПОВНИ попереднє: візьми з нього",
  "все, що користувач не змінив, і заміни лише назване. «а вчора?» після питання про",
  "задачі Лєни = той самий інтент і той самий дизайнер, лише period=yesterday.",
  "Якщо нове питання самостійне — попереднє ігноруй повністю.",
].join("\n");

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function parseToolCall(payload: Record<string, unknown>): DesignQuery | null {
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const typed = item as { type?: unknown; name?: unknown; arguments?: unknown };
    if (typed.type !== "function_call" || typed.name !== TOOL.name) continue;
    try {
      const args = JSON.parse(typeof typed.arguments === "string" ? typed.arguments : "{}") as Record<string, unknown>;
      const rawIntent = typeof args.intent === "string" ? args.intent : "";
      const known =
        INTENTS.includes(rawIntent as DesignIntent) || isAdminIntent(rawIntent) || isQuotesIntent(rawIntent);
      const intent = (known ? rawIntent : "help") as DesignIntent;
      const period = PERIODS.includes(args.period as DesignPeriod) ? (args.period as DesignPeriod) : null;
      return {
        intent,
        designer: typeof args.designer === "string" && args.designer.trim() ? args.designer.trim() : null,
        status: typeof args.status === "string" && args.status.trim() ? args.status.trim() : null,
        period,
        limit: typeof args.limit === "number" && Number.isFinite(args.limit) ? args.limit : null,
        query: typeof args.query === "string" && args.query.trim() ? args.query.trim() : null,
      };
    } catch {
      return null;
    }
  }
  return null;
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  // Внутрішній виклик із вебхука. Той самий спільний секрет, що й у cron —
  // без нього функція не працює взагалі (fail-closed).
  if (!process.env.CRON_SHARED_SECRET) return json(503, { error: "CRON_SHARED_SECRET is not configured" });
  const denial = assertCronAuthorized(event);
  if (denial) return denial;

  let payload: Payload;
  try {
    payload = JSON.parse(event.body ?? "{}") as Payload;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { chatId, userId, workspaceId, teamId } = payload;
  const question = payload.question?.trim() ?? "";
  const directIntent = payload.directIntent?.trim() ?? "";
  if (!chatId || !userId || !workspaceId || !teamId || (!question && !directIntent)) {
    return json(400, { error: "Missing chatId/userId/workspaceId/teamId and question/directIntent" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing Supabase env vars" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const model = (process.env.OPENAI_MODEL || "").trim() || "gpt-5.4";

  const now = new Date();

  /** Виконання вже відомого інтенту. Спільний хвіст для кнопок і для моделі. */
  const runQuery = async (query: DesignQuery): Promise<string> => {
    if (isAdminIntent(query.intent)) {
      // Адмін-інтенти — внутрішня кухня (кости, бекапи, cron). Тільки власнику.
      if (!payload.isOwner) {
        return "Це питання доступне лише власнику. Про дизайн-задачі питай вільно — «що ти вмієш?».";
      }
      return answerAdminQuery({
        admin,
        intent: query.intent,
        workspaceId,
        teamIds: [teamId],
        period: query.period ?? null,
        now,
      });
    }
    if (isQuotesIntent(query.intent)) {
      return answerQuotesQuery({
        admin,
        teamIds: [teamId],
        intent: query.intent,
        period: query.period ?? null,
        query: query.query ?? null,
        limit: query.limit ?? 8,
        now,
      });
    }
    const answer = await answerDesignQuery({ admin, teamId, workspaceId, query, now });
    return answer.text;
  };

  const reply = async (text: string) => {
    // Telegram ріже повідомлення на 4096 символах.
    const safe = text.length > 4000 ? `${text.slice(0, 3900)}\n\n…обрізано` : text;
    await sendTelegramMessage(chatId, safe, { parseMode: "HTML", disablePreview: true });
  };

  try {
    // Кнопка-заготовка: інтент уже відомий, модель не потрібна — і не оплачується.
    if (directIntent) {
      const known =
        isAdminIntent(directIntent) || isQuotesIntent(directIntent) || INTENTS.includes(directIntent as DesignIntent)
          ? (directIntent as DesignIntent)
          : null;
      if (!known) return json(400, { error: `Unknown directIntent: ${directIntent}` });
      await reply(
        await runQuery({ intent: known, designer: null, status: null, period: null, limit: null, query: null })
      );
      return json(200, { ok: true, intent: known, viaButton: true });
    }

    if (!apiKey) {
      await sendTelegramMessage(chatId, HELP_TEXT, { parseMode: "HTML", disablePreview: true });
      return json(200, { ok: true, note: "no OPENAI_API_KEY — sent help" });
    }

    // 1. Розбір питання моделлю — разом із попереднім запитом, щоб уточнення
    //    («а вчора?») доповнювало його, а не падало в довідку.
    const previous = await loadContext(admin, chatId);
    const userText = previous
      ? `ПОПЕРЕДНЄ ПИТАННЯ (для доповнення): ${JSON.stringify(previous)}\n\nНОВЕ ПИТАННЯ: ${question.slice(0, 1000)}`
      : question.slice(0, 1000);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: userText }] },
        ],
        tools: [TOOL],
        tool_choice: "required",
        max_output_tokens: 300,
      }),
    });
    const aiPayload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    // Кости логуємо навіть коли розбір не вдався — виклик усе одно оплачений.
    const usage = (aiPayload.usage ?? {}) as { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    const cost = chatCostUsd(model, usage.input_tokens, usage.output_tokens);
    await logAiUsage(admin, {
      workspaceId,
      userId,
      actorName: payload.actorName ?? null,
      kind: "chat",
      model,
      inputTokens: usage.input_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
      costUsd: cost.costUsd,
      metadata: { source: "telegram_assistant", question: question.trim().slice(0, 500) },
    });

    if (!response.ok) {
      await sendTelegramMessage(chatId, "Не зміг обробити питання — спробуй ще раз за хвилину.", {
        parseMode: "HTML",
      });
      return json(200, { ok: false, error: "openai request failed" });
    }

    const query = parseToolCall(aiPayload);
    if (!query) {
      await sendTelegramMessage(chatId, HELP_TEXT, { parseMode: "HTML", disablePreview: true });
      return json(200, { ok: true, note: "no tool call — sent help" });
    }

    // 2. Детермінована відповідь.
    await reply(await runQuery(query));
    await saveContext(admin, chatId, query);
    return json(200, { ok: true, intent: query.intent, hadContext: Boolean(previous) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    await sendTelegramMessage(chatId, "Щось зламалось на моєму боці. Спробуй ще раз.", { parseMode: "HTML" });
    return json(500, { error: message });
  }
};

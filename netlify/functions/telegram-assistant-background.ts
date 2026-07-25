import { createClient } from "@supabase/supabase-js";
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
};

const INTENTS: DesignIntent[] = [
  "workload_now",
  "designer_workload",
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
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "all",
];

const TOOL = {
  type: "function",
  name: "answer_design_question",
  description:
    "Перекласти питання користувача про дизайн-задачі у структуровані параметри. Використовувати ЗАВЖДИ. Якщо питання не про дизайн-задачі або незрозуміле — intent='help'.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["intent", "designer", "status", "period", "limit"],
    properties: {
      intent: {
        type: "string",
        enum: INTENTS,
        description:
          "workload_now — скільки задач зараз активно (без конкретної людини); designer_workload — скільки зараз у конкретного дизайнера; tasks_list — просять показати список задач; created_count — скільки СТВОРЕНО за період; approved_count — скільки ЗАТВЕРДЖЕНО/зроблено за період; revisions — правки; time_spent — час за таймерами; deadlines — дедлайни або прострочене; designer_summary — загальне «як справи» по людині; stuck — що найдовше висить; help — не про дизайн-задачі чи незрозуміло.",
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
  "• якщо питання не про дизайн-задачі (прорахунки, гроші, клієнти) — intent help",
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
      const intent = INTENTS.includes(args.intent as DesignIntent) ? (args.intent as DesignIntent) : "help";
      const period = PERIODS.includes(args.period as DesignPeriod) ? (args.period as DesignPeriod) : null;
      return {
        intent,
        designer: typeof args.designer === "string" && args.designer.trim() ? args.designer.trim() : null,
        status: typeof args.status === "string" && args.status.trim() ? args.status.trim() : null,
        period,
        limit: typeof args.limit === "number" && Number.isFinite(args.limit) ? args.limit : null,
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

  const { chatId, userId, workspaceId, teamId, question } = payload;
  if (!chatId || !userId || !workspaceId || !teamId || !question?.trim()) {
    return json(400, { error: "Missing chatId/userId/workspaceId/teamId/question" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing Supabase env vars" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const model = (process.env.OPENAI_MODEL || "").trim() || "gpt-5.4";

  try {
    if (!apiKey) {
      await sendTelegramMessage(chatId, HELP_TEXT, { parseMode: "HTML", disablePreview: true });
      return json(200, { ok: true, note: "no OPENAI_API_KEY — sent help" });
    }

    // 1. Розбір питання моделлю.
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: question.trim().slice(0, 1000) }] },
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
    const answer = await answerDesignQuery({ admin, teamId, workspaceId, query, now: new Date() });

    // Telegram ріже повідомлення на 4096 символах.
    const text = answer.text.length > 4000 ? `${answer.text.slice(0, 3900)}\n\n…-обрізано` : answer.text;
    await sendTelegramMessage(chatId, text, { parseMode: "HTML", disablePreview: true });

    return json(200, { ok: true, intent: query.intent });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    await sendTelegramMessage(chatId, "Щось зламалось на моєму боці. Спробуй ще раз.", { parseMode: "HTML" });
    return json(500, { error: message });
  }
};

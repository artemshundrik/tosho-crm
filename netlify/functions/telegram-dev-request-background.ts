import { createClient } from "@supabase/supabase-js";

import { chatCostUsd } from "./_aiPricing";
import { logAiUsage } from "./_aiUsageLog";
import { assertCronAuthorized } from "./_cronAuth";
import { sendTelegramMessage } from "./_telegram";
import { buildAppUrl } from "./_lib/appUrl";
import {
  ALREADY_CAPTURED_MESSAGE,
  buildDevRequestBody,
  buildDevRequestReply,
} from "./_lib/devRequestBot";
import { clampDraftText, draftDevRequest } from "./_lib/devRequestDraft";

// Картка розділу «Запити» з Telegram: переслане повідомлення або «/задача …».
//
// Суфікс -background — конвенція Netlify, і тут вона обов'язкова: Telegram чекає
// відповіді на вебхук секунди й повторює запит, а розбір моделлю займає 5–20 с.
// Вебхук резолвить людину (це дешево і має відповісти одразу), віддає 200 і
// делегує решту сюди — той самий контур, що в telegram-assistant-background.ts.
//
// Гейт доступу зроблено ДО виклику: сюди приходить уже резолвлений і
// перевірений на активність користувач. Власного гейта в цієї функції немає,
// крім спільного секрету, тож викликати її може лише наш же код.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type Payload = {
  chatId?: number;
  messageId?: number;
  /** Резолвлений користувач CRM — автор картки. */
  userId?: string;
  /** Операційний team_id: RLS-ключ картки й ключ лічильника номерів. */
  teamId?: string;
  /** Не для політик — лише щоб історія картки читалась через get_audit_log. */
  workspaceId?: string | null;
  actorName?: string | null;
  tgUserId?: number | null;
  tgUsername?: string | null;
  displayName?: string | null;
  text?: string;
  forwarded?: boolean;
  forwardedFrom?: string | null;
};

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

function trimmed(value?: string | null): string {
  return (value ?? "").trim();
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

  const { chatId, messageId, userId, teamId } = payload;
  const text = clampDraftText(payload.text);
  if (!chatId || !userId || !teamId || !text) {
    return json(400, { error: "Missing chatId/userId/teamId/text" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing Supabase env vars" });

  const apiKey = trimmed(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    await sendTelegramMessage(chatId, "Розбір задач зараз недоступний. Спробуй трохи пізніше.");
    return json(503, { error: "OPENAI_API_KEY is not configured" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const model = trimmed(process.env.OPENAI_MODEL) || "gpt-5.4";

  // Список відкритих карток боту не передаємо: у чаті людина не бачить дошки, і
  // підказка «схоже на REQ-17» без можливості туди глянути тільки заплутує.
  // Дублікати зводить людина на дошці.
  const result = await draftDevRequest({ text, apiKey, model });

  // Кости логуємо ДО перевірки на успіх: виклик оплачений незалежно від того,
  // чи вдалось розібрати відповідь.
  const workspaceId = trimmed(payload.workspaceId);
  const cost = chatCostUsd(model, result.usage.inputTokens, result.usage.outputTokens);
  if (workspaceId) {
    await logAiUsage(admin, {
      workspaceId,
      userId,
      actorName: trimmed(payload.actorName) || null,
      kind: "chat",
      model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      costUsd: cost.costUsd,
      metadata: {
        source: "dev_request_telegram",
        priceKnown: cost.priceKnown,
        chars: result.text.length,
        forwarded: Boolean(payload.forwarded),
      },
    });
  } else {
    console.error("ai_usage skipped: could not resolve workspace_id for user", userId);
  }

  const draft = result.draft;

  // Номер видає окрема функція для service_role: наявна next_document_number
  // перевіряє членство через auth.uid(), якого в бота немає (див.
  // scripts/dev-requests-bot-number.sql).
  const { data: rawNumber, error: numberError } = await admin
    .schema("tosho")
    .rpc("next_dev_request_number", { p_team_id: teamId });
  // bigint приїжджає числом (див. Returns у src/lib/database.types.ts), але
  // рядок теж приймаємо: перетворення дешеве, а втратити вже оплачений розбір
  // через формат числа було б безглуздо.
  const nextNumber = typeof rawNumber === "string" ? Number(rawNumber) : rawNumber;
  if (numberError || typeof nextNumber !== "number" || !Number.isFinite(nextNumber)) {
    console.error("dev request number failed:", numberError?.message ?? "no number returned");
    await sendTelegramMessage(chatId, "Не зміг записати задачу. Спробуй ще раз за хвилину.");
    return json(500, { error: "Could not allocate number" });
  }

  const { error: insertError } = await admin
    .schema("tosho")
    .from("dev_requests")
    .insert({
      number: nextNumber,
      team_id: teamId,
      workspace_id: workspaceId || null,
      title: draft.title,
      body: buildDevRequestBody({
        body: draft.body,
        forwarded: Boolean(payload.forwarded),
        forwardedFrom: payload.forwardedFrom,
      }) || null,
      kind: draft.kind,
      // Вхідний кошик, а не черга. Картку з дошки людина заводить свідомо й
      // одразу ставить у чергу; ця ж прилетіла на бігу, з класифікацією від
      // моделі — її ще має побачити людина.
      status: "triage",
      module_key: draft.moduleKey,
      priority: draft.priority,
      auto_classified: true,
      // Приватність — рішення, яке ухвалюють свідомо на дошці. З чату картка
      // завжди командна: людина в Telegram не бачить, кому вона буде видна.
      is_private: false,
      author_user_id: userId,
      created_by: userId,
      tg_user_id: payload.tgUserId ?? null,
      tg_username: trimmed(payload.tgUsername) || null,
      display_name: trimmed(payload.displayName) || null,
      tg_chat_id: chatId,
      tg_message_id: messageId ?? null,
    });

  if (insertError) {
    // 23505 — унікальний індекс (tg_chat_id, tg_message_id): те саме
    // повідомлення прилетіло вдруге (ретрай Telegram або повторний запуск цієї
    // функції). Для людини це не помилка, а факт. Номер при цьому згорає —
    // діра в нумерації нешкідлива, а зайва картка ні.
    if (insertError.code === "23505") {
      await sendTelegramMessage(chatId, ALREADY_CAPTURED_MESSAGE);
      return json(200, { ok: true, duplicate: true });
    }
    console.error("dev request insert failed:", insertError.message);
    await sendTelegramMessage(chatId, "Не зміг записати задачу. Спробуй ще раз за хвилину.");
    return json(500, { error: "Insert failed" });
  }

  await sendTelegramMessage(
    chatId,
    buildDevRequestReply({
      number: nextNumber,
      title: draft.title,
      kind: draft.kind,
      moduleKey: draft.moduleKey,
      priority: draft.priority,
      existingFeature: draft.existingFeature,
    }),
    {
      parseMode: "HTML",
      replyMarkup: {
        inline_keyboard: [[{ text: "Відкрити в CRM", url: buildAppUrl("/dev-requests") }]],
      },
    }
  );

  return json(200, { ok: true, number: nextNumber, drafted: result.ok });
};

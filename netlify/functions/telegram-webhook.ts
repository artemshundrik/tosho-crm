import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "./_telegram";

// Telegram webhook: прив'язка акаунта (/start <nonce>) та відписка (/stop).
// Реєстрація: див. docs/TELEGRAM_NOTIFICATIONS_DESIGN.md §12 (setWebhook + secret_token).

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { username?: string };
  };
};

const LINK_GREETING =
  "Привіт! Це бот сповіщень ToSho CRM.\n\nЩоб підключити свій акаунт — відкрий профіль у CRM і натисни «Підключити Telegram». Звідти прийдеш сюди з персональним посиланням.";

function ok(body = "ok") {
  return { statusCode: 200, headers: { "Cache-Control": "no-store" }, body };
}

export const handler = async (event: HttpEvent) => {
  // Telegram завжди шле POST. На решту відповідаємо 200, щоб не плодити ретраї.
  if (event.httpMethod && event.httpMethod !== "POST") return ok();

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = event.headers?.["x-telegram-bot-api-secret-token"];
    if (got !== expectedSecret) return { statusCode: 401, body: "unauthorized" };
  }

  let update: TelegramUpdate;
  try {
    update = JSON.parse(event.body ?? "{}") as TelegramUpdate;
  } catch {
    return ok();
  }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return ok();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return ok();
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const [command, arg] = text.split(/\s+/);
  const username = message?.from?.username ?? null;
  const nowIso = new Date().toISOString();

  try {
    if (command === "/start") {
      const nonce = arg?.trim();
      if (!nonce) {
        await sendTelegramMessage(chatId, LINK_GREETING);
        return ok();
      }

      const { data: tokenRow } = await adminClient
        .schema("tosho")
        .from("telegram_link_tokens")
        .select("nonce,user_id,expires_at,used_at")
        .eq("nonce", nonce)
        .maybeSingle();

      const expired = tokenRow ? new Date(tokenRow.expires_at as string).getTime() < Date.now() : true;
      if (!tokenRow || tokenRow.used_at || expired) {
        await sendTelegramMessage(
          chatId,
          "Посилання недійсне або застаріле. Згенеруй нове в профілі CRM → «Підключити Telegram»."
        );
        return ok();
      }

      await adminClient
        .schema("tosho")
        .from("user_notification_settings")
        .upsert(
          {
            user_id: tokenRow.user_id,
            telegram_chat_id: chatId,
            telegram_username: username,
            telegram_linked_at: nowIso,
            telegram_enabled: true,
            updated_at: nowIso,
          },
          { onConflict: "user_id" }
        );

      await adminClient
        .schema("tosho")
        .from("telegram_link_tokens")
        .update({ used_at: nowIso })
        .eq("nonce", nonce);

      await sendTelegramMessage(
        chatId,
        "✅ Telegram підключено! Сповіщення CRM тепер приходитимуть сюди.\n\nВимкнути будь-коли — /stop."
      );
      return ok();
    }

    if (command === "/stop") {
      await adminClient
        .schema("tosho")
        .from("user_notification_settings")
        .update({ telegram_chat_id: null, telegram_enabled: false, updated_at: nowIso })
        .eq("telegram_chat_id", chatId);
      await sendTelegramMessage(
        chatId,
        "Відключено. Сповіщення більше не надходитимуть. Підключити знову — у профілі CRM."
      );
      return ok();
    }

    await sendTelegramMessage(
      chatId,
      "Доступні команди: /stop — відписатись. Підключення та налаштування сповіщень — у профілі CRM."
    );
    return ok();
  } catch {
    // Не зриваємо вебхук помилкою — інакше Telegram буде ретраїти.
    return ok();
  }
};

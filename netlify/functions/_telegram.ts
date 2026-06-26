// Тонкий клієнт Telegram Bot API. Спільний для webhook та доставки сповіщень.

const TELEGRAM_API = "https://api.telegram.org";

export function getTelegramBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

/** Екранування під parse_mode=HTML (https://core.telegram.org/bots/api#html-style). */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };
export type InlineKeyboard = InlineKeyboardButton[][];
type ReplyMarkup = { inline_keyboard: InlineKeyboard };

export type TelegramApiResult = {
  ok: boolean;
  status: number;
  errorCode?: number;
  description?: string;
};

async function callTelegram(method: string, payload: Record<string, unknown>): Promise<TelegramApiResult> {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, status: 0, description: "TELEGRAM_BOT_TOKEN missing" };
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error_code?: number; description?: string }
      | null;
    return {
      ok: Boolean(data?.ok),
      status: res.status,
      errorCode: data?.error_code,
      description: data?.description,
    };
  } catch (error: unknown) {
    return { ok: false, status: 0, description: error instanceof Error ? error.message : "fetch failed" };
  }
}

type SendOptions = {
  parseMode?: "HTML";
  replyMarkup?: ReplyMarkup;
  disablePreview?: boolean;
};

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: SendOptions
): Promise<TelegramApiResult> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parseMode,
    disable_web_page_preview: options?.disablePreview ?? true,
    reply_markup: options?.replyMarkup,
  });
}

export async function editTelegramReplyMarkup(
  chatId: number | string,
  messageId: number,
  keyboard: InlineKeyboard
): Promise<TelegramApiResult> {
  return callTelegram("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function answerTelegramCallback(callbackQueryId: string, text?: string): Promise<TelegramApiResult> {
  return callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

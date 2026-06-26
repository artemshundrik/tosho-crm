// Тонкий клієнт Telegram Bot API. Спільний для webhook та доставки сповіщень.

const TELEGRAM_API = "https://api.telegram.org";

export function getTelegramBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

/** Екранування під parse_mode=HTML (https://core.telegram.org/bots/api#html-style). */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type InlineKeyboardButton = { text: string; url: string };
type ReplyMarkup = { inline_keyboard: InlineKeyboardButton[][] };

type SendOptions = {
  parseMode?: "HTML";
  replyMarkup?: ReplyMarkup;
  disablePreview?: boolean;
};

export type TelegramSendResult = {
  ok: boolean;
  status: number;
  errorCode?: number;
  description?: string;
};

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: SendOptions
): Promise<TelegramSendResult> {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, status: 0, description: "TELEGRAM_BOT_TOKEN missing" };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode,
        disable_web_page_preview: options?.disablePreview ?? true,
        reply_markup: options?.replyMarkup,
      }),
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
    const description = error instanceof Error ? error.message : "fetch failed";
    return { ok: false, status: 0, description };
  }
}

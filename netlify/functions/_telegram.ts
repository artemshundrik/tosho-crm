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

/**
 * Постійна клавіатура під полем введення (Bot API 6.4+). Кнопки надсилають
 * звичайний текст, тому їхні підписи треба перехоплювати у вебхуці, інакше
 * питання полетить у модель і буде оплачене.
 */
export type PersistentKeyboard = {
  keyboard: Array<Array<{ text: string }>>;
  resize_keyboard: true;
  is_persistent: true;
};

type ReplyMarkup = { inline_keyboard: InlineKeyboard } | PersistentKeyboard;

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

/** «печатає…» у чаті. Живе ~5 с — достатньо, поки асистент думає. */
export async function sendTelegramChatAction(
  chatId: number | string,
  action: "typing" = "typing"
): Promise<TelegramApiResult> {
  return callTelegram("sendChatAction", { chat_id: chatId, action });
}

/**
 * Заміна тексту повідомлення разом із кнопками — багатокрокові флоу (як-от
 * оформлення відсутності) живуть в ОДНОМУ повідомленні замість простирадла.
 */
export async function editTelegramMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  options?: { replyMarkup?: { inline_keyboard: InlineKeyboard } }
): Promise<TelegramApiResult> {
  return callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
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

/**
 * Список команд бота. Саме він і вмикає нативну кнопку «Меню» біля поля
 * введення: без зареєстрованих команд Telegram її не показує взагалі.
 * Викликається один раз на бота, не на користувача.
 */
export async function setTelegramCommands(
  commands: Array<{ command: string; description: string }>
): Promise<TelegramApiResult> {
  return callTelegram("setMyCommands", { commands, scope: { type: "default" }, language_code: "" });
}

/** Опис на порожньому екрані чату («Що вміє цей бот?»). Раз на бота. */
export async function setTelegramDescription(description: string): Promise<TelegramApiResult> {
  return callTelegram("setMyDescription", { description });
}

/** Короткий опис у профілі бота і в шерингу. */
export async function setTelegramShortDescription(shortDescription: string): Promise<TelegramApiResult> {
  return callTelegram("setMyShortDescription", { short_description: shortDescription });
}

/** Явно вмикаємо режим «Меню = список команд» (це і так дефолт, але хай буде). */
export async function setTelegramMenuButtonToCommands(): Promise<TelegramApiResult> {
  return callTelegram("setChatMenuButton", { menu_button: { type: "commands" } });
}

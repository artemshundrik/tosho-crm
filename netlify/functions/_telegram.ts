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

/**
 * Просить клієнт одразу відкрити поле вводу з наведенням на цю відповідь.
 *
 * Потрібен там, де тап по команді в меню Telegram відправляє її одразу й
 * дописати аргумент нема як.
 */
type ForceReply = {
  force_reply: true;
  /** Підказка в порожньому полі вводу. Bot API: до 64 символів. */
  input_field_placeholder?: string;
  selective?: boolean;
};

type ReplyMarkup = { inline_keyboard: InlineKeyboard } | PersistentKeyboard | ForceReply;

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
  silent?: boolean;
};

/**
 * Вміст Rich Message (Bot API 10.1+): html у форматі rich і необов'язкова
 * картка-картинка над ним. Картка їде файлом, а не посиланням: на ній гроші й
 * імена, і вони не мають лежати за адресою, яку Telegram міг би завантажити.
 */
export type RichContent = {
  html: string;
  photo?: Buffer | null;
  keyboard?: InlineKeyboard;
  silent?: boolean;
};

const RICH_PHOTO_ID = "card";

function richForm(content: RichContent, target: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(target)) form.set(key, value);
  const html = content.photo ? `<img src="tg://photo?id=${RICH_PHOTO_ID}"/>${content.html}` : content.html;
  form.set(
    "rich_message",
    JSON.stringify({
      html,
      ...(content.photo
        ? { media: [{ id: RICH_PHOTO_ID, media: { type: "photo", media: "attach://card_file" } }] }
        : {}),
    })
  );
  if (content.photo) {
    form.set("card_file", new Blob([new Uint8Array(content.photo)], { type: "image/png" }), "card.png");
  }
  if (content.keyboard) form.set("reply_markup", JSON.stringify({ inline_keyboard: content.keyboard }));
  return form;
}

async function callTelegramForm(method: string, form: FormData): Promise<TelegramApiResult> {
  const token = getTelegramBotToken();
  if (!token) return { ok: false, status: 0, description: "TELEGRAM_BOT_TOKEN missing" };
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error_code?: number; description?: string }
      | null;
    return { ok: Boolean(data?.ok), status: res.status, errorCode: data?.error_code, description: data?.description };
  } catch (error: unknown) {
    return { ok: false, status: 0, description: error instanceof Error ? error.message : "fetch failed" };
  }
}

export async function sendTelegramRichMessage(
  chatId: number | string,
  content: RichContent
): Promise<TelegramApiResult> {
  const form = richForm(content, { chat_id: String(chatId) });
  if (content.silent) form.set("disable_notification", "true");
  return callTelegramForm("sendRichMessage", form);
}

/** Перемальовує те саме повідомлення — так працюють вкладки. */
export async function editTelegramRichMessage(
  chatId: number | string,
  messageId: number,
  content: RichContent
): Promise<TelegramApiResult> {
  return callTelegramForm(
    "editMessageText",
    richForm(content, { chat_id: String(chatId), message_id: String(messageId) })
  );
}

/**
 * Надсилає Rich Message, а якщо Telegram його відхилив — звичайний текст.
 * Людина має отримати звіт за будь-яких обставин. Виняток — 403: бота
 * заблоковано, і повторна спроба нічого не дасть.
 */
export async function sendTelegramRichWithFallback(
  chatId: number | string,
  content: RichContent,
  fallbackText: string,
  fallbackKeyboard?: InlineKeyboard
): Promise<TelegramApiResult> {
  const rich = await sendTelegramRichMessage(chatId, content);
  if (rich.ok || rich.status === 403 || rich.errorCode === 403) return rich;
  console.warn("[telegram] rich message rejected, sending plain text", rich.errorCode, rich.description);
  return sendTelegramMessage(chatId, fallbackText, {
    parseMode: "HTML",
    disablePreview: true,
    silent: content.silent,
    replyMarkup: fallbackKeyboard ? { inline_keyboard: fallbackKeyboard } : undefined,
  });
}

/**
 * Віджет (Bot API 10.4): HTML зі скриптом, що живе в повідомленні. Telegram
 * сам робить його непересилним; protect_content ставимо явно, бо там гроші
 * й імена.
 */
export async function sendTelegramWidget(
  chatId: number | string,
  widget: { html: string; chatData: string; caption: string },
  options?: { keyboard?: InlineKeyboard; silent?: boolean }
): Promise<TelegramApiResult> {
  return callTelegram("sendWidget", {
    chat_id: chatId,
    html: widget.html,
    chat_data: widget.chatData,
    caption: widget.caption,
    parse_mode: "HTML",
    protect_content: true,
    disable_notification: options?.silent,
    reply_markup: options?.keyboard ? { inline_keyboard: options.keyboard } : undefined,
  });
}

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
    disable_notification: options?.silent,
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

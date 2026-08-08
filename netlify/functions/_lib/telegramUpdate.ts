/**
 * Чисті розбирачі апдейта Telegram.
 *
 * Живуть окремо від telegram-webhook.ts саме тому, що це логіка без вводу-виводу:
 * її можна накрити тестами, а вебхук живцем не тестується — для цього потрібен
 * справжній Telegram.
 *
 * Формат апдейта: https://core.telegram.org/bots/api#message
 */

export type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramChat = {
  id?: number;
  /** "private" | "group" | "supergroup" | "channel". Bot API шле завжди. */
  type?: string;
  title?: string;
};

/**
 * Джерело пересланого повідомлення (Bot API 7.0+, MessageOrigin).
 *
 * Поля тримаємо плоскими, а не розміченим об'єднанням: тип «channel» додали
 * пізніше за «user», і наступний новий тип не має ламати розбір — невідоме
 * джерело просто лишиться без імені.
 */
export type TelegramForwardOrigin = {
  type?: string;
  sender_user?: TelegramUser | null;
  sender_user_name?: string | null;
  sender_chat?: TelegramChat | null;
  chat?: TelegramChat | null;
  author_signature?: string | null;
};

export type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
  /** Актуальне поле пересилання. */
  forward_origin?: TelegramForwardOrigin | null;
  /** Запасні поля: старіші апдейти й старіші клієнти. */
  forward_from?: TelegramUser | null;
  forward_from_chat?: TelegramChat | null;
  forward_sender_name?: string | null;
  forward_date?: number | null;
};

function trimmed(value?: string | null): string {
  return (value ?? "").trim();
}

/**
 * Чи це особистий чат із ботом.
 *
 * Групи бот не обслуговує взагалі: у групі chat.id ≠ from.id, тож зв'язка
 * людини (user_notification_settings.telegram_chat_id) там не працює, а
 * «/start <nonce>» узагалі записав би id ГРУПИ в персональні налаштування — і
 * приватні сповіщення полетіли б у загальний чат.
 *
 * Тип у Bot API обов'язковий, тож «немає типу» трактуємо як «не приватний»:
 * помилково промовчати в особистих дешевше, ніж помилково заговорити в групі.
 */
export function isPrivateChat(chat?: TelegramChat | null): boolean {
  return chat?.type === "private";
}

export type ParsedCommand = {
  /** Команда з косою й у нижньому регістрі («/task»). null — це не команда. */
  command: string | null;
  /** Усе після команди, обрізане по краях. Порожній рядок, якщо нічого немає. */
  args: string;
};

/**
 * Перше слово повідомлення як команда.
 *
 * Зрізає «@botname»: Telegram дописує його до команд у групах, а копіпаст
 * такої команди в особистий чат — звична річ, і без зрізання жодна команда не
 * спрацювала б.
 *
 * Кирилична «/задача» — теж команда: клієнт її не підсвічує (Telegram знає
 * лише латиницю), але текст доходить як є, і розбирається так само.
 */
export function parseCommand(rawText?: string | null): ParsedCommand {
  const text = trimmed(rawText);
  if (!text.startsWith("/")) return { command: null, args: "" };

  const separator = text.search(/\s/);
  const head = separator === -1 ? text : text.slice(0, separator);
  const args = separator === -1 ? "" : text.slice(separator).trim();

  const command = head.split("@")[0].toLowerCase();
  // «/» саме по собі командою не є.
  if (command.length < 2) return { command: null, args: "" };
  return { command, args };
}

/**
 * Чи повідомлення переслали.
 *
 * Пересилають, щоб зафіксувати, а не щоб спитати, — тож для бота це однозначний
 * сигнал «зроби картку», без жодних команд. Перевіряємо і нове forward_origin,
 * і старі поля: апдейти зі старих клієнтів іще трапляються.
 */
export function isForwardedMessage(message?: TelegramMessage | null): boolean {
  if (!message) return false;
  if (message.forward_origin && typeof message.forward_origin === "object") return true;
  if (message.forward_from || message.forward_from_chat) return true;
  if (trimmed(message.forward_sender_name)) return true;
  return typeof message.forward_date === "number" && Number.isFinite(message.forward_date);
}

/** «Ім'я Прізвище» або «@username». null, якщо не з чого зібрати. */
export function telegramUserName(user?: TelegramUser | null): string | null {
  if (!user) return null;
  const full = [user.first_name, user.last_name].map((part) => trimmed(part)).filter(Boolean).join(" ");
  if (full) return full;
  const username = trimmed(user.username);
  return username ? `@${username}` : null;
}

/**
 * Хто написав вихідне повідомлення.
 *
 * null — це нормальний результат, а не помилка: у Telegram можна заборонити
 * посилання на свій акаунт у пересланих повідомленнях, і тоді джерело
 * приховане навіть від бота.
 */
export function forwardOriginName(message?: TelegramMessage | null): string | null {
  if (!message) return null;

  const origin = message.forward_origin;
  if (origin && typeof origin === "object") {
    const fromUser = telegramUserName(origin.sender_user);
    if (fromUser) return fromUser;
    const hidden = trimmed(origin.sender_user_name);
    if (hidden) return hidden;
    const chatTitle = trimmed(origin.sender_chat?.title) || trimmed(origin.chat?.title);
    if (chatTitle) return chatTitle;
    const signature = trimmed(origin.author_signature);
    if (signature) return signature;
  }

  const legacyUser = telegramUserName(message.forward_from);
  if (legacyUser) return legacyUser;
  const legacyHidden = trimmed(message.forward_sender_name);
  if (legacyHidden) return legacyHidden;
  const legacyChat = trimmed(message.forward_from_chat?.title);
  return legacyChat || null;
}

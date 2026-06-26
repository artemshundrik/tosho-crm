import { createClient } from "@supabase/supabase-js";
import {
  answerTelegramCallback,
  editTelegramReplyMarkup,
  sendTelegramMessage,
  type InlineKeyboard,
} from "./_telegram";
import {
  visibleNotificationCategories,
  type NotificationCategory,
  type RoleContext,
} from "./_notificationCategories";

// Telegram webhook:
//  - /start <nonce> — прив'язка акаунта, /stop — відписка (фаза 1)
//  - /settings + callback-кнопки — налаштування каналів усередині бота (фаза 3)
// Синхронізація з CRM безкоштовна: і бот, і CRM пишуть один рядок
// tosho.user_notification_settings (channel_prefs / telegram_enabled).
// Реєстрація: setWebhook з allowed_updates ["message","callback_query"] (див. §12).

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
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id?: number; chat?: { id?: number } };
  };
};

type ChannelPrefs = Record<string, Record<string, boolean>>;
type SettingsRow = {
  user_id: string;
  telegram_enabled: boolean | null;
  channel_prefs: ChannelPrefs | null;
};

type AdminClient = ReturnType<typeof createClient>;

const LINK_GREETING =
  "Привіт! Це бот сповіщень ToSho CRM.\n\nЩоб підключити акаунт — відкрий профіль у CRM і натисни «Підключити Telegram». Звідти прийдеш сюди з персональним посиланням.";

const NOT_LINKED =
  "Акаунт не підключено. Відкрий профіль у CRM → «Підключити Telegram».";

function ok(body = "ok") {
  return { statusCode: 200, headers: { "Cache-Control": "no-store" }, body };
}

function categoryEnabled(prefs: ChannelPrefs | null, key: string): boolean {
  const entry = prefs?.[key];
  if (!entry) return true;
  return entry.telegram !== false;
}

function buildSettingsKeyboard(row: SettingsRow, categories: NotificationCategory[]): InlineKeyboard {
  const masterOn = row.telegram_enabled !== false;
  const keyboard: InlineKeyboard = [
    [{ text: `${masterOn ? "🔔" : "🔕"} Усі сповіщення: ${masterOn ? "увімкнені" : "вимкнені"}`, callback_data: "m" }],
  ];
  for (const cat of categories) {
    const on = categoryEnabled(row.channel_prefs, cat.key);
    keyboard.push([{ text: `${on ? "✅" : "⬜"} ${cat.label}`, callback_data: `c:${cat.key}` }]);
  }
  return keyboard;
}

async function loadSettingsByChat(adminClient: AdminClient, chatId: number): Promise<SettingsRow | null> {
  const { data } = await adminClient
    .schema("tosho")
    .from("user_notification_settings")
    .select("user_id,telegram_enabled,channel_prefs")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return (data as SettingsRow | null) ?? null;
}

async function loadRole(adminClient: AdminClient, userId: string): Promise<RoleContext> {
  const { data } = await adminClient
    .schema("tosho")
    .from("memberships_view")
    .select("access_role,job_role")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    accessRole: (data?.access_role as string | null) ?? null,
    jobRole: (data?.job_role as string | null) ?? null,
  };
}

async function handleMessage(adminClient: AdminClient, message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = message.chat?.id;
  const text = message.text?.trim();
  if (!chatId || !text) return;

  const [command, arg] = text.split(/\s+/);
  const username = message.from?.username ?? null;
  const nowIso = new Date().toISOString();

  if (command === "/start") {
    const nonce = arg?.trim();
    if (!nonce) {
      await sendTelegramMessage(chatId, LINK_GREETING);
      return;
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
      return;
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
      "✅ Telegram підключено! Сповіщення CRM приходитимуть сюди.\n\nНалаштувати, що саме слати — /settings. Вимкнути все — /stop."
    );
    return;
  }

  if (command === "/settings") {
    const row = await loadSettingsByChat(adminClient, chatId);
    if (!row) {
      await sendTelegramMessage(chatId, NOT_LINKED);
      return;
    }
    const cats = visibleNotificationCategories(await loadRole(adminClient, row.user_id));
    await sendTelegramMessage(chatId, "Які сповіщення слати в Telegram:", {
      replyMarkup: { inline_keyboard: buildSettingsKeyboard(row, cats) },
    });
    return;
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
    return;
  }

  await sendTelegramMessage(
    chatId,
    "Команди: /settings — що слати, /stop — відписатись. Підключення — у профілі CRM."
  );
}

async function handleCallback(adminClient: AdminClient, cb: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const data = cb.data;
  if (!chatId || !messageId || !data) {
    await answerTelegramCallback(cb.id);
    return;
  }

  const row = await loadSettingsByChat(adminClient, chatId);
  if (!row) {
    await answerTelegramCallback(cb.id, "Акаунт не підключено");
    return;
  }

  const cats = visibleNotificationCategories(await loadRole(adminClient, row.user_id));
  const nowIso = new Date().toISOString();
  let toastText = "Збережено";

  if (data === "m") {
    const next = row.telegram_enabled === false; // інвертуємо
    await adminClient
      .schema("tosho")
      .from("user_notification_settings")
      .update({ telegram_enabled: next, updated_at: nowIso })
      .eq("user_id", row.user_id);
    row.telegram_enabled = next;
    toastText = next ? "Усі сповіщення увімкнені" : "Усі сповіщення вимкнені";
  } else if (data.startsWith("c:")) {
    const key = data.slice(2);
    const known = cats.some((c) => c.key === key);
    if (known) {
      const prefs: ChannelPrefs = { ...(row.channel_prefs ?? {}) };
      const current = prefs[key]?.telegram !== false;
      prefs[key] = { ...(prefs[key] ?? {}), telegram: !current };
      await adminClient
        .schema("tosho")
        .from("user_notification_settings")
        .update({ channel_prefs: prefs, updated_at: nowIso })
        .eq("user_id", row.user_id);
      row.channel_prefs = prefs;
    }
  }

  await editTelegramReplyMarkup(chatId, messageId, buildSettingsKeyboard(row, cats));
  await answerTelegramCallback(cb.id, toastText);
}

export const handler = async (event: HttpEvent) => {
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return ok();
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    if (update.callback_query) {
      await handleCallback(adminClient, update.callback_query);
    } else if (update.message) {
      await handleMessage(adminClient, update.message);
    }
  } catch {
    // Не зриваємо вебхук помилкою — інакше Telegram ретраїтиме.
  }
  return ok();
};

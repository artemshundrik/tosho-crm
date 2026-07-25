import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  answerTelegramCallback,
  editTelegramReplyMarkup,
  sendTelegramChatAction,
  sendTelegramMessage,
  type InlineKeyboard,
  type PersistentKeyboard,
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

// SupabaseClient, а не ReturnType<typeof createClient>: другий резолвить
// схему в never, через що .schema("tosho") не типізується.
type AdminClient = SupabaseClient;

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
      // Уже підключеним «/start» служить перевстановленням постійної кнопки:
      // вона з'являється лише разом із повідомленням, тож у тих, кто
      // підключився до її появи, іншого способу її отримати немає.
      const existing = await loadSettingsByChat(adminClient, chatId);
      if (existing) {
        const role = await loadRole(adminClient, existing.user_id);
        const allowed = isAssistantAllowed(role);
        await sendTelegramMessage(
          chatId,
          allowed
            ? "Акаунт уже підключено. Питання можна писати текстом, швидкі — у «Меню»."
            : "Акаунт уже підключено. Налаштування — /settings, відписатись — /stop.",
          allowed ? { replyMarkup: PERSISTENT_MENU } : undefined
        );
        return;
      }
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

    // Постійну клавіатуру віддаємо лише тим, хто має доступ до асистента —
    // решті вона була б кнопкою в нікуди.
    const role = await loadRole(adminClient, tokenRow.user_id as string);
    await sendTelegramMessage(
      chatId,
      "✅ Telegram підключено! Сповіщення CRM приходитимуть сюди.\n\n" +
        (isAssistantAllowed(role)
          ? "Питання про дизайн-задачі можна писати просто текстом, а швидкі — у «Меню».\n\n"
          : "") +
        "Налаштувати, що саме слати — /settings. Вимкнути все — /stop.",
      isAssistantAllowed(role) ? { replyMarkup: PERSISTENT_MENU } : undefined
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

  // Постійна кнопка надсилає свій підпис як звичайний текст — ловимо тут.
  if (command === "/menu" || text === MENU_BUTTON_LABEL) {
    const settings = await loadSettingsByChat(adminClient, chatId);
    if (!settings) {
      await sendTelegramMessage(chatId, NOT_LINKED);
      return;
    }
    const role = await loadRole(adminClient, settings.user_id);
    if (!isAssistantAllowed(role)) {
      await sendTelegramMessage(chatId, ASSISTANT_FORBIDDEN);
      return;
    }
    await sendTelegramMessage(chatId, "Швидкі питання — тисни, або просто напиши своє:", {
      replyMarkup: { inline_keyboard: buildQuickKeyboard(role) },
    });
    return;
  }

  if (command === "/help") {
    await handleAssistantQuestion(adminClient, chatId, { directIntent: "help" });
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

  // Не команда — віддаємо асистенту.
  await handleAssistantQuestion(adminClient, chatId, { question: text });
}

/** Хто може ставити питання асистенту: власник і SEO. */
function isAssistantAllowed(role: RoleContext): boolean {
  const access = (role.accessRole ?? "").trim().toLowerCase();
  const job = (role.jobRole ?? "").trim().toLowerCase();
  return access === "owner" || job === "seo";
}

function isOwnerRole(role: RoleContext): boolean {
  return (role.accessRole ?? "").trim().toLowerCase() === "owner";
}

const ASSISTANT_FORBIDDEN =
  "Я поки відповідаю на питання лише керівництву. Команди: /settings — що слати, /stop — відписатись.";

/**
 * Підпис постійної кнопки під полем введення. Вона надсилає звичайний текст,
 * тому перехоплюємо його ДО моделі — інакше кожен тап був би оплаченим
 * запитом до OpenAI замість безкоштовного відкриття меню.
 */
const MENU_BUTTON_LABEL = "📋 Меню";

const PERSISTENT_MENU: PersistentKeyboard = {
  keyboard: [[{ text: MENU_BUTTON_LABEL }]],
  resize_keyboard: true,
  is_persistent: true,
};

/**
 * Заготовки. callback_data несе інтент напряму, тож натискання кнопки не
 * витрачає виклик моделі взагалі — відповідь збирається одразу по базі.
 * Префікс «qa:» відрізняє їх від тоглів налаштувань («cat:», «all:»).
 */
function buildQuickKeyboard(role: RoleContext): InlineKeyboard {
  const rows: InlineKeyboard = [
    [
      { text: "🎨 Задачі в роботі", callback_data: "qa:workload_now" },
      { text: "📋 Список задач", callback_data: "qa:tasks_list" },
    ],
    [
      { text: "⏰ Дедлайни", callback_data: "qa:deadlines" },
      { text: "✏️ Правки", callback_data: "qa:revisions" },
    ],
    [
      { text: "⏱ Час за таймерами", callback_data: "qa:time_spent" },
      { text: "🐌 Найдовше висить", callback_data: "qa:stuck" },
    ],
    [
      { text: "👥 Хто чим зайнятий", callback_data: "qa:team_workload" },
      { text: "📊 Воронка", callback_data: "qa:quotes_pipeline" },
    ],
    [
      { text: "🟢 Хто в системі", callback_data: "qa:who_is_online" },
      { text: "🧑\u200d💼 Команда", callback_data: "qa:team_list" },
    ],
  ];
  if (isOwnerRole(role)) {
    rows.push([
      { text: "🚨 Що не працює", callback_data: "qa:whats_broken" },
      { text: "💰 AI-кости", callback_data: "qa:ai_usage" },
    ]);
    rows.push([{ text: "🩺 Стан системи", callback_data: "qa:system_health" }]);
  }
  rows.push([{ text: "❓ Що можна питати", callback_data: "qa:help" }]);
  return rows;
}

/**
 * Вільний текст → асистент (docs/TELEGRAM_ASSISTANT_DESIGN.md).
 *
 * Дані асистент читає service-role ключем, тому цей рольовий гейт — ЄДИНИЙ
 * захист. Він мусить бути тут, ДО будь-якого виклику моделі.
 *
 * Саму роботу віддаємо background-функції: Telegram чекає відповіді на вебхук
 * секунди й повторює запит, а модель думає 5–20 с.
 */
async function handleAssistantQuestion(
  adminClient: AdminClient,
  chatId: number,
  input: { question?: string; directIntent?: string }
) {
  const settings = await loadSettingsByChat(adminClient, chatId);
  if (!settings) {
    await sendTelegramMessage(chatId, NOT_LINKED);
    return;
  }

  const role = await loadRole(adminClient, settings.user_id);
  if (!isAssistantAllowed(role)) {
    await sendTelegramMessage(chatId, ASSISTANT_FORBIDDEN);
    return;
  }

  // workspace_id для ролей і team_id для даних — це РІЗНІ ідентифікатори.
  // Ім'я беремо з team_member_profiles: memberships_view.full_name порожній.
  const [membership, profile, teamMember] = await Promise.all([
    adminClient
      .schema("tosho")
      .from("memberships_view")
      .select("workspace_id")
      .eq("user_id", settings.user_id)
      .maybeSingle(),
    adminClient
      .schema("tosho")
      .from("team_member_profiles")
      .select("first_name,last_name")
      .eq("user_id", settings.user_id)
      .maybeSingle(),
    adminClient.from("team_members").select("team_id").eq("user_id", settings.user_id).maybeSingle(),
  ]);

  const workspaceId = (membership.data?.workspace_id as string | undefined) ?? null;
  const teamId = (teamMember.data?.team_id as string | undefined) ?? null;
  if (!workspaceId || !teamId) {
    await sendTelegramMessage(chatId, "Не можу визначити твою команду в CRM. Напиши адміну.");
    return;
  }
  const actorName =
    [profile.data?.first_name, profile.data?.last_name]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean)
      .join(" ") || null;

  await sendTelegramChatAction(chatId, "typing");

  const base = process.env.PUBLIC_APP_URL || "https://tosho.pro";
  const secret = process.env.CRON_SHARED_SECRET ?? "";
  try {
    // Fire-and-forget: -background функція відповідає 202 одразу, роботу робить
    // сама. Await тут лише на віддачу запиту, не на результат аналізу.
    await fetch(`${base}/.netlify/functions/telegram-assistant-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-key": secret },
      body: JSON.stringify({
        chatId,
        userId: settings.user_id,
        workspaceId,
        teamId,
        actorName,
        isOwner: isOwnerRole(role),
        question: input.question,
        directIntent: input.directIntent,
      }),
    });
  } catch {
    await sendTelegramMessage(chatId, "Не зміг прийняти питання. Спробуй ще раз.");
  }
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

  // Кнопка-заготовка асистента. Відповідаємо на callback одразу (щоб Telegram
  // зняв «годинник»), а сам інтент виконує background-функція.
  if (data.startsWith("qa:")) {
    await answerTelegramCallback(cb.id);
    await handleAssistantQuestion(adminClient, chatId, { directIntent: data.slice(3) });
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

function secretMatches(expected: string, got: string | undefined): boolean {
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod && event.httpMethod !== "POST") return ok();

  // Fail-closed: без налаштованого секрету вебхук не приймає жодного апдейту,
  // інакше будь-хто міг би слати фейкові апдейти на публічний ендпоінт.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) return { statusCode: 401, body: "unauthorized" };
  const got = event.headers?.["x-telegram-bot-api-secret-token"];
  if (!secretMatches(expectedSecret, got)) {
    return { statusCode: 401, body: "unauthorized" };
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

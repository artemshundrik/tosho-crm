import { timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  answerTelegramCallback,
  editTelegramMessageText,
  editTelegramReplyMarkup,
  escapeTelegramHtml,
  sendTelegramChatAction,
  sendTelegramMessage,
  type InlineKeyboard,
  type InlineKeyboardButton,
  type PersistentKeyboard,
} from "./_telegram";
import {
  confirmScreen,
  countQuotaDaysForUser,
  isAbsenceBotKind,
  kindMenuScreen,
  parseAbsenceText,
  presetMenuScreen,
  presetRange,
  submitAbsenceFromBot,
} from "./_absenceBotFlow";
import { resolveMemberWorkspaceId } from "./_lib/absenceSubmit";
import { decideAbsenceRequest } from "./_lib/absenceDecision";
import {
  visibleNotificationCategories,
  type NotificationCategory,
  type RoleContext,
} from "./_notificationCategories";
import { canSeeAiCosts,
  canSeeReleases, canUseQuotes, resolveAccessLevel, type AccessLevel } from "./_lib/assistantAccess";
import { collectDropboxHealth, formatDropboxHealthForTelegram } from "./_lib/dropboxHealth";
import { buildAppUrl } from "./_lib/appUrl";
import {
  EMPTY_TASK_COMMAND_MESSAGE,
  NON_TEXT_FORWARD_MESSAGE,
  isTaskCommand,
} from "./_lib/devRequestBot";
import {
  BOARD_PATH,
  fetchBoardCard,
  fetchOpenBoardCards,
  moveBoardCard,
} from "./_lib/devRequestBoard";
import {
  isOwnerOrSeo,
  isQueueCommand,
  moveToast,
  parseQueueCallback,
  queueCardGoneScreen,
  queueCardScreen,
  queueListScreen,
  QUEUE_CARD_GONE_TOAST,
  QUEUE_FAILED_TOAST,
  QUEUE_FORBIDDEN_MESSAGE,
  QUEUE_FORBIDDEN_TOAST,
  QUEUE_RELEASED_TOAST,
  QUEUE_UNKNOWN_TOAST,
} from "./_lib/devRequestQueue";
import {
  forwardOriginName,
  isForwardedMessage,
  isPrivateChat,
  parseCommand,
  telegramUserName,
  type TelegramChat,
  type TelegramMessage,
} from "./_lib/telegramUpdate";

// Telegram webhook:
//  - /start <nonce> — прив'язка акаунта, /stop — відписка (фаза 1)
//  - /settings + callback-кнопки — налаштування каналів усередині бота (фаза 3)
//  - переслане повідомлення або /задача — картка розділу «Запити»
// Синхронізація з CRM безкоштовна: і бот, і CRM пишуть один рядок
// tosho.user_notification_settings (channel_prefs / telegram_enabled).
// Реєстрація: setWebhook з allowed_updates ["message","callback_query"] (див. §12).
//
// ЛИШЕ ОСОБИСТИЙ ЧАТ. У групах бот мовчить повністю (isPrivateChat нижче):
// зв'язка людини тримається на chat_id, який у групі дорівнює id ГРУПИ, тож там
// не працює ні резолв, ні прив'язка.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id?: number; chat?: TelegramChat };
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
  "👋 <b>Привіт! Це бот ToSho CRM.</b>\n\nЩоб підключити акаунт — відкрий свій профіль у CRM і натисни «Підключити Telegram». Звідти прийдеш сюди з персональним посиланням.";

const NOT_LINKED =
  "🔗 <b>Акаунт не підключено.</b>\n\nВідкрий профіль у CRM → «Підключити Telegram».";

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

/**
 * Чи працює людина досі.
 *
 * Критично саме для бота: він ходить під service-role і тому ОБХОДИТЬ RLS, на
 * якій тримається блокування звільнених у самій CRM. Без цієї перевірки
 * звільнений співробітник із прив'язаним Telegram продовжував би отримувати
 * дані компанії — інтерфейс йому закритий, а бот ні.
 */
async function isActiveMember(adminClient: AdminClient, userId: string): Promise<boolean> {
  const { data } = await adminClient
    .schema("tosho")
    .from("team_member_profiles")
    .select("employment_status")
    .eq("user_id", userId)
    .maybeSingle();
  const status = ((data?.employment_status as string | null) ?? "").trim().toLowerCase();
  return status !== "inactive" && status !== "rejected";
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
  if (!chatId) return;

  const text = message.text?.trim();
  if (!text) {
    // Переслали не текст — голосове, фото, стікер. Картку з цього не зробити:
    // ланки «завантажити файл → розпізнати» в боті свідомо немає (диктувати
    // можна просто в поле введення, і боту прийде звичайний текст). Мовчати не
    // можна: людина щойно зробила дію й чекає слід.
    if (isForwardedMessage(message)) {
      await sendTelegramMessage(chatId, NON_TEXT_FORWARD_MESSAGE);
    }
    return;
  }

  // Зрізає «@botname» — інакше скопійована з групи команда не спрацювала б.
  const { command, args } = parseCommand(text);
  const username = message.from?.username ?? null;
  const nowIso = new Date().toISOString();

  if (command === "/start") {
    const nonce = args.split(/\s+/)[0]?.trim();
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
            ? "Акаунт уже підключено ✅\n\n💬 Питання — текстом, швидкі дії — у «Меню»\n🏝 /away — хто відсутній · 📝 /absence — оформити відсутність"
            : "Акаунт уже підключено ✅\n\n⚙️ /settings — налаштування · /stop — відписатись",
          allowed ? { replyMarkup: PERSISTENT_MENU } : undefined
        );
        return;
      }
      await sendTelegramMessage(chatId, LINK_GREETING, { parseMode: "HTML" });
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
        "⚠️ Посилання недійсне або застаріле.\n\nЗгенеруй нове: профіль у CRM → «Підключити Telegram»."
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
      "✅ <b>Telegram підключено!</b>\n\n" +
        "📣 Сповіщення CRM тепер приходитимуть сюди\n" +
        "🏝 «Хто сьогодні відсутній» — /away\n" +
        "📝 «Хворію» чи «day-off 15.08» — лікарняний або заявка без відкриття CRM\n" +
        (isAssistantAllowed(role) ? "💬 Питання про задачі й цифри — просто текстом\n" : "") +
        "\n⚙️ Що саме слати — /settings · вимкнути все — /stop",
      isAssistantAllowed(role) ? { parseMode: "HTML", replyMarkup: PERSISTENT_MENU } : { parseMode: "HTML" }
    );
    return;
  }

  // Переслане повідомлення → картка. Сигнал однозначний і команди не потребує:
  // пересилають, щоб зафіксувати, а не щоб спитати. Стоїть ПІСЛЯ /start
  // навмисно — переслане посилання прив'язки має лишитись прив'язкою, а не
  // осісти токеном у тілі командної картки.
  if (isForwardedMessage(message)) {
    await handleDevRequestCapture(adminClient, message, {
      text,
      forwarded: true,
      forwardedFrom: forwardOriginName(message),
    });
    return;
  }

  // Власна думка: «/задача …» (або «/task …» латиницею).
  if (isTaskCommand(command)) {
    if (!args) {
      await sendTelegramMessage(chatId, EMPTY_TASK_COMMAND_MESSAGE);
      return;
    }
    await handleDevRequestCapture(adminClient, message, { text: args, forwarded: false });
    return;
  }

  // Черга запитів: подивитись відкриті картки й посунути їх (_lib/devRequestQueue).
  //
  // Гейт по ролі всередині resolveQueueAccess і він ОБОВ'ЯЗКОВИЙ: бот ходить
  // під service-role, тобто RLS обходить, і політика dev_requests_privileged_read
  // для нього не діє. Без цієї перевірки будь-хто з підключеним ботом побачив
  // би приватні картки.
  if (isQueueCommand(command)) {
    const settings = await loadSettingsByChat(adminClient, chatId);
    if (!settings) {
      await sendTelegramMessage(chatId, NOT_LINKED, { parseMode: "HTML" });
      return;
    }
    const access = await resolveQueueAccess(adminClient, settings.user_id);
    if (!access.ok) {
      await sendTelegramMessage(chatId, access.message);
      return;
    }

    try {
      const { cards, hasMore } = await fetchOpenBoardCards(adminClient, access.teamId);
      const screen = queueListScreen({ cards, hasMore });
      await sendTelegramMessage(chatId, screen.text, {
        parseMode: "HTML",
        replyMarkup: screen.keyboard.length > 0 ? { inline_keyboard: screen.keyboard } : undefined,
      });
    } catch {
      await sendTelegramMessage(chatId, "Не зміг прочитати чергу. Спробуй ще раз за хвилину.");
    }
    return;
  }

  /**
   * Стан зв'язку CRM ↔ Dropbox однією командою.
   *
   * Лише власнику: у звіті видно назви всіх замовників і лідів, а це не та
   * інформація, яку варто віддавати кожному, хто підключив бота.
   *
   * Рахуємо на льоту, а не з кешу: перевірку відкривають, коли щось запідозрили,
   * і тоді вчорашній знімок гірший за відсутність відповіді. Один запит у
   * Dropbox і два в базу — вкладаємось у ліміт функції.
   */
  if (command === "/dropbox") {
    const settings = await loadSettingsByChat(adminClient, chatId);
    if (!settings) {
      await sendTelegramMessage(chatId, NOT_LINKED, { parseMode: "HTML" });
      return;
    }
    if (!(await isActiveMember(adminClient, settings.user_id))) {
      await sendTelegramMessage(chatId, DEACTIVATED_MESSAGE);
      return;
    }
    const role = await loadRole(adminClient, settings.user_id);
    if (!isOwnerRole(role)) {
      await sendTelegramMessage(chatId, "Ця команда доступна лише керівнику.");
      return;
    }

    await sendTelegramChatAction(chatId, "typing");
    try {
      const health = await collectDropboxHealth(adminClient as never, { verifyLinks: true });
      await sendTelegramMessage(chatId, formatDropboxHealthForTelegram(health));
    } catch (error) {
      const message = error instanceof Error ? error.message : "невідома помилка";
      await sendTelegramMessage(chatId, `Не вдалося зібрати стан Dropbox: ${message}`);
    }
    return;
  }

  // Оформлення відсутності: лікарняний / day-off / відпустка (_absenceBotFlow).
  if (command === "/absence") {
    const settings = await loadSettingsByChat(adminClient, chatId);
    if (!settings) {
      await sendTelegramMessage(chatId, NOT_LINKED, { parseMode: "HTML" });
      return;
    }
    if (!(await isActiveMember(adminClient, settings.user_id))) {
      await sendTelegramMessage(chatId, DEACTIVATED_MESSAGE);
      return;
    }
    const screen = kindMenuScreen();
    await sendTelegramMessage(chatId, screen.text, {
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: screen.keyboard },
    });
    return;
  }

  // «Хто сьогодні відсутній» — той самий інтент, що й кнопка/вільне питання.
  if (command === "/away") {
    await handleAssistantQuestion(adminClient, chatId, { directIntent: "who_is_absent" });
    return;
  }

  if (command === "/settings") {
    const row = await loadSettingsByChat(adminClient, chatId);
    if (!row) {
      await sendTelegramMessage(chatId, NOT_LINKED, { parseMode: "HTML" });
      return;
    }
    const cats = visibleNotificationCategories(await loadRole(adminClient, row.user_id));
    await sendTelegramMessage(chatId, "⚙️ <b>Сповіщення в Telegram</b>\n\nТисни категорію, щоб увімкнути чи вимкнути:", {
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: buildSettingsKeyboard(row, cats) },
    });
    return;
  }

  // Постійна кнопка надсилає свій підпис як звичайний текст — ловимо тут.
  if (command === "/menu" || text === MENU_BUTTON_LABEL) {
    const settings = await loadSettingsByChat(adminClient, chatId);
    if (!settings) {
      await sendTelegramMessage(chatId, NOT_LINKED, { parseMode: "HTML" });
      return;
    }
    if (!(await isActiveMember(adminClient, settings.user_id))) {
      await sendTelegramMessage(chatId, DEACTIVATED_MESSAGE);
      return;
    }
    const role = await loadRole(adminClient, settings.user_id);
    if (!isAssistantAllowed(role)) {
      await sendTelegramMessage(chatId, ASSISTANT_FORBIDDEN);
      return;
    }
    await sendTelegramMessage(chatId, "⚡️ <b>Швидкі дії</b>\n\nТисни кнопку — або просто напиши питання текстом:", {
      parseMode: "HTML",
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
      "🔕 Відключено — сповіщення більше не надходитимуть.\n\nПовернутись: профіль у CRM → «Підключити Telegram»."
    );
    return;
  }

  // «лікарняний 05.08–08.08», «хворію», «day-off 15.08» — форма подання, а не
  // питання: перехоплюємо ДО асистента, щоб не палити виклик моделі. Ловить
  // лише тексти, що ПОЧИНАЮТЬСЯ з ключового слова: «хто у відпустці?» піде
  // асистенту як who_is_absent.
  const absenceDraft = parseAbsenceText(text, new Date());
  if (absenceDraft) {
    const settings = await loadSettingsByChat(adminClient, chatId);
    if (!settings) {
      await sendTelegramMessage(chatId, NOT_LINKED, { parseMode: "HTML" });
      return;
    }
    if (!(await isActiveMember(adminClient, settings.user_id))) {
      await sendTelegramMessage(chatId, DEACTIVATED_MESSAGE);
      return;
    }
    if (!absenceDraft.start || !absenceDraft.end) {
      const screen = presetMenuScreen(absenceDraft.kind);
      await sendTelegramMessage(chatId, screen.text, {
        parseMode: "HTML",
        replyMarkup: { inline_keyboard: screen.keyboard },
      });
      return;
    }
    const workspaceId = await resolveMemberWorkspaceId(adminClient, settings.user_id);
    const [days, textFlowRole] = await Promise.all([
      countQuotaDaysForUser(adminClient, workspaceId, absenceDraft.kind, absenceDraft.start, absenceDraft.end),
      loadRole(adminClient, settings.user_id),
    ]);
    const screen = confirmScreen(
      absenceDraft.kind,
      absenceDraft.start,
      absenceDraft.end,
      days,
      isOwnerRole(textFlowRole)
    );
    await sendTelegramMessage(chatId, screen.text, {
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: screen.keyboard },
    });
    return;
  }

  // Не команда — віддаємо асистенту.
  await handleAssistantQuestion(adminClient, chatId, { question: text });
}

/**
 * Асистент доступний усій прив'язаній команді. Обсяг видимого визначає рівень
 * доступу (_lib/assistantAccess.ts), а не сам факт входу: дизайнер не побачить
 * грошей, а менеджер — чужої статистики.
 */
function isAssistantAllowed(_role: RoleContext): boolean {
  return true;
}

function isOwnerRole(role: RoleContext): boolean {
  return (role.accessRole ?? "").trim().toLowerCase() === "owner";
}

type QueueAccess =
  | { ok: true; teamId: string }
  | { ok: false; message: string; toast: string };

/**
 * Гейт черги запитів: людина працює, має роль owner/SEO — і в неї є команда.
 *
 * ОДИН резолв на всі входи: і на «/черга», і на КОЖНЕ натискання кнопки.
 * Перевіряти лише на команді було б діркою: кнопку можна переслати іншій
 * людині, і натиснути її здатен будь-хто, у кого підключений бот (той самий
 * урок, що з погодженням заявок — див. handleAbsenceDecisionCallback).
 *
 * Повертає і текст для чату, і короткий toast для callback — щоб місце виклику
 * не гадало причину відмови за рядком повідомлення.
 */
async function resolveQueueAccess(adminClient: AdminClient, userId: string): Promise<QueueAccess> {
  if (!(await isActiveMember(adminClient, userId))) {
    return { ok: false, message: DEACTIVATED_MESSAGE, toast: "Доступ призупинено" };
  }

  const role = await loadRole(adminClient, userId);
  if (!isOwnerOrSeo(role)) {
    return { ok: false, message: QUEUE_FORBIDDEN_MESSAGE, toast: QUEUE_FORBIDDEN_TOAST };
  }

  // team_id — ключ, на якому живуть картки. workspace_id тут не потрібен.
  const { data } = await adminClient
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();
  const teamId = (data?.team_id as string | undefined) ?? null;
  if (!teamId) {
    return {
      ok: false,
      message: "Не можу визначити твою команду в CRM. Напиши адміну.",
      toast: "Не бачу твоєї команди",
    };
  }

  return { ok: true, teamId };
}

const DEACTIVATED_MESSAGE =
  "Доступ до CRM призупинено. Якщо це помилка — напиши керівнику.";

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
  const level: AccessLevel = resolveAccessLevel(role);
  // Плоский список у пріоритетному порядку, який нижче ріжеться по ДВІ кнопки
  // в ряд: рядки-сироти впереміш із парами виглядали неохайно (рішення CEO
  // 2026-08-02). Усі дії з відсутностями живуть САМЕ тут, у плитках — з меню
  // команд їх прибрано, щоб воно лишалось коротким службовим списком.
  //
  // Кнопки показуємо тільки ті, що людина справді може натиснути: кнопка, яка
  // відповідає «немає доступу», дратує більше, ніж її відсутність.
  const buttons: InlineKeyboardButton[] = [
    { text: "🎨 Задачі в роботі", callback_data: "qa:workload_now" },
    { text: "📋 Список задач", callback_data: "qa:tasks_list" },
    { text: "⏰ Дедлайни", callback_data: "qa:deadlines" },
    { text: "✏️ Правки", callback_data: "qa:revisions" },
    { text: "⏱ Час за таймерами", callback_data: "qa:time_spent" },
    { text: "🐌 Найдовше висить", callback_data: "qa:stuck" },
    { text: "👥 Хто чим зайнятий", callback_data: "qa:team_workload" },
    { text: "🟢 Хто в системі", callback_data: "qa:who_is_online" },
    { text: "🏝 Хто відсутній", callback_data: "qa:who_is_absent" },
    { text: "📝 Оформити відсутність", callback_data: "abs:open" },
    { text: "🧑\u200d💼 Команда", callback_data: "qa:team_list" },
  ];
  if (canUseQuotes(level)) {
    // Воронка дає цифри по статусах, список — самі прорахунки з сумами.
    // Це різні питання, тож і кнопки різні.
    buttons.push(
      { text: "📊 Воронка", callback_data: "qa:quotes_pipeline" },
      { text: "🧾 Список прорахунків", callback_data: "qa:quotes_list" },
      { text: "📦 Замовлення", callback_data: "qa:orders_list" }
    );
  }
  if (canSeeReleases(level)) {
    buttons.push({ text: "🚀 Що викотили", callback_data: "qa:releases" });
  }
  if (canSeeAiCosts(level)) {
    buttons.push({ text: "💰 AI-кости", callback_data: "qa:ai_usage" });
  }
  if (isOwnerRole(role)) {
    buttons.push(
      { text: "🚨 Що не працює", callback_data: "qa:whats_broken" },
      { text: "💬 Що це значить", callback_data: "qa:explain_problem" },
      { text: "🩺 Стан системи", callback_data: "qa:system_health" }
    );
  }

  const rows: InlineKeyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  // «Що можна питати» — завжди одна широка в кінці.
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
    await sendTelegramMessage(chatId, NOT_LINKED, { parseMode: "HTML" });
    return;
  }

  if (!(await isActiveMember(adminClient, settings.user_id))) {
    await sendTelegramMessage(chatId, DEACTIVATED_MESSAGE);
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
        access: resolveAccessLevel(role),
        question: input.question,
        directIntent: input.directIntent,
      }),
    });
  } catch {
    await sendTelegramMessage(chatId, "Не зміг прийняти питання. Спробуй ще раз.");
  }
}

/**
 * Переслане повідомлення або «/задача …» → картка розділу «Запити».
 *
 * Тут лише те, що має статись швидко: резолв людини й ввічлива відмова, якщо
 * акаунт не підключено або доступ призупинено. Розбір моделлю (5–20 с) і запис
 * ідуть у -background функцію, бо Telegram чекає відповіді на вебхук секунди й
 * повторює запит — той самий контур, що в асистента.
 *
 * Обмежень за роллю немає навмисно: «нічого не губиться» — це мета фічі, і
 * найгучніше русло скарг тут якраз рядові співробітники. Картка з чату завжди
 * командна (is_private = false), тож нічого зайвого вона не відкриває.
 */
async function handleDevRequestCapture(
  adminClient: AdminClient,
  message: NonNullable<TelegramUpdate["message"]>,
  input: { text: string; forwarded: boolean; forwardedFrom?: string | null }
) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  const settings = await loadSettingsByChat(adminClient, chatId);
  if (!settings) {
    await sendTelegramMessage(chatId, NOT_LINKED, { parseMode: "HTML" });
    return;
  }
  if (!(await isActiveMember(adminClient, settings.user_id))) {
    await sendTelegramMessage(chatId, DEACTIVATED_MESSAGE);
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

  // team_id обов'язковий: на ньому і RLS картки, і лічильник номерів.
  // workspace_id — ні: без нього картка жива, лише історія змін нечитабельна.
  const teamId = (teamMember.data?.team_id as string | undefined) ?? null;
  if (!teamId) {
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
    // Fire-and-forget: -background функція відповідає 202 одразу.
    await fetch(`${base}/.netlify/functions/telegram-dev-request-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-key": secret },
      body: JSON.stringify({
        chatId,
        messageId: message.message_id,
        userId: settings.user_id,
        teamId,
        workspaceId: (membership.data?.workspace_id as string | undefined) ?? null,
        actorName,
        // Ім'я з Telegram зберігаємо навіть для підключеної людини: у картці
        // видно, хто саме її надіслав, тим самим підписом, що в чаті.
        tgUserId: message.from?.id ?? null,
        tgUsername: message.from?.username ?? null,
        displayName: telegramUserName(message.from),
        text: input.text,
        forwarded: input.forwarded,
        forwardedFrom: input.forwardedFrom ?? null,
      }),
    });
  } catch {
    await sendTelegramMessage(chatId, "Не зміг прийняти задачу. Спробуй ще раз.");
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

  // Погодження заявки прямо з повідомлення. Права перевіряє decideAbsenceRequest —
  // кнопку ми надсилаємо тому, хто може вирішувати, але натиснути її здатен
  // будь-хто, кому повідомлення переслали, тож довіряти самій кнопці не можна.
  if (data.startsWith("absd:")) {
    if (!(await isActiveMember(adminClient, row.user_id))) {
      await answerTelegramCallback(cb.id, "Доступ призупинено");
      return;
    }
    await handleAbsenceDecisionCallback(adminClient, cb.id, chatId, messageId, row.user_id, data);
    return;
  }

  // Черга запитів. Права перевіряємо тут щоразу — з тієї ж причини, що й у
  // гілці absd: кнопку зі списком карток можна переслати кому завгодно.
  if (data.startsWith("dq:")) {
    const access = await resolveQueueAccess(adminClient, row.user_id);
    if (!access.ok) {
      await answerTelegramCallback(cb.id, access.toast);
      return;
    }
    await handleQueueCallback(adminClient, cb.id, chatId, messageId, access.teamId, data);
    return;
  }

  // Флоу оформлення відсутності (_absenceBotFlow): кнопки редагують одне
  // повідомлення, подання йде через RPC-перевтілення з усіма RLS/квотами.
  if (data.startsWith("abs:")) {
    if (!(await isActiveMember(adminClient, row.user_id))) {
      await answerTelegramCallback(cb.id, "Доступ призупинено");
      return;
    }
    await answerTelegramCallback(cb.id);
    await handleAbsenceCallback(adminClient, chatId, messageId, row.user_id, data);
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

/**
 * Кнопка «Підтвердити» під сповіщенням про заявку.
 *
 * Відповідь на callback тримаємо ДО кінця роботи (а не одразу, як у флоу
 * оформлення): рішення — це запис у базу, і людині треба показати саме його
 * результат, включно з «заявку вже опрацювали», якщо хтось натиснув першим.
 * Telegram дає на це ~10 секунд, чого вистачає.
 *
 * Після успіху кнопки прибираємо: повторний клік по тій самій заявці все одно
 * впав би на перевірці статусу, але порожня кнопка виглядає як «не спрацювало».
 */
async function handleAbsenceDecisionCallback(
  adminClient: AdminClient,
  callbackId: string,
  chatId: number,
  messageId: number,
  userId: string,
  data: string
) {
  const parts = data.split(":"); // ["absd", verb, absenceId]
  const absenceId = parts[2]?.trim();
  if (parts[1] !== "a" || !absenceId) {
    await answerTelegramCallback(callbackId, "Невідома дія");
    return;
  }

  const result = await decideAbsenceRequest({
    adminClient,
    // Бот не має JWT: членство читаємо адмінським клієнтом, але лише після
    // isActiveMember вище — блокований співробітник сюди не доходить.
    actorClient: adminClient,
    actorId: userId,
    absenceId,
    decision: "approved",
  });

  if (!result.ok) {
    await answerTelegramCallback(callbackId, result.error);
    return;
  }

  await answerTelegramCallback(callbackId, "Погоджено");
  await editTelegramReplyMarkup(chatId, messageId, [
    [{ text: "Відкрити в CRM", url: buildAppUrl("/team?tab=requests") }],
  ]);
  await sendTelegramMessage(chatId, `✅ Погоджено: ${escapeTelegramHtml(result.summary)}`, { parseMode: "HTML" });
}

/**
 * Кроки черги запитів: список → картка → зміна статусу.
 *
 * Стан їде в callback_data (номер картки + статус), тож сервер нічого не
 * тримає, а кожен крок — це editMessageText ТОГО САМОГО повідомлення: у чаті
 * не росте стрічка з десяти списків, які потім гортати.
 *
 * Права сюди приходять уже перевіреними (resolveQueueAccess у місці виклику),
 * а teamId — не з кнопки, а з людини: підроблений callback_data не дотягнеться
 * до чужої команди.
 */
async function handleQueueCallback(
  adminClient: AdminClient,
  callbackId: string,
  chatId: number,
  messageId: number,
  teamId: string,
  data: string
) {
  const parsed = parseQueueCallback(data);
  if (!parsed) {
    await answerTelegramCallback(callbackId, QUEUE_UNKNOWN_TOAST);
    return;
  }

  const boardUrl = buildAppUrl(BOARD_PATH);

  try {
    if (parsed.kind === "list") {
      const { cards, hasMore } = await fetchOpenBoardCards(adminClient, teamId);
      const screen = queueListScreen({ cards, hasMore });
      await answerTelegramCallback(callbackId);
      await editTelegramMessageText(chatId, messageId, screen.text, {
        replyMarkup: { inline_keyboard: screen.keyboard },
      });
      return;
    }

    if (parsed.kind === "card") {
      const card = await fetchBoardCard(adminClient, teamId, parsed.number);
      await answerTelegramCallback(callbackId, card ? undefined : QUEUE_CARD_GONE_TOAST);
      const screen = card ? queueCardScreen(card, boardUrl) : queueCardGoneScreen(parsed.number);
      await editTelegramMessageText(chatId, messageId, screen.text, {
        replyMarkup: { inline_keyboard: screen.keyboard },
      });
      return;
    }

    // Зміна статусу — це запис у базу, тож на callback відповідаємо ПІСЛЯ
    // нього: людині треба побачити результат, а не «прийнято». Telegram дає на
    // це ~10 секунд, чого вистачає з запасом.
    const result = await moveBoardCard(adminClient, teamId, parsed.number, parsed.status);
    if (!result.ok) {
      if (result.reason === "not_found") {
        await answerTelegramCallback(callbackId, QUEUE_CARD_GONE_TOAST);
        const gone = queueCardGoneScreen(parsed.number);
        await editTelegramMessageText(chatId, messageId, gone.text, {
          replyMarkup: { inline_keyboard: gone.keyboard },
        });
        return;
      }
      // Картку встигли викотити між показом і натисканням (або кнопку зібрали
      // руками). Перемальовуємо її — на екрані буде видно, чому дій немає.
      if (result.reason === "released") {
        await answerTelegramCallback(callbackId, QUEUE_RELEASED_TOAST);
        const card = await fetchBoardCard(adminClient, teamId, parsed.number);
        if (card) {
          const screen = queueCardScreen(card, boardUrl);
          await editTelegramMessageText(chatId, messageId, screen.text, {
            replyMarkup: { inline_keyboard: screen.keyboard },
          });
        }
        return;
      }
      console.error("dev request move failed:", result.message);
      await answerTelegramCallback(callbackId, QUEUE_FAILED_TOAST);
      return;
    }

    await answerTelegramCallback(callbackId, moveToast(parsed.status));
    const screen = queueCardScreen(result.card, boardUrl);
    await editTelegramMessageText(chatId, messageId, screen.text, {
      replyMarkup: { inline_keyboard: screen.keyboard },
    });
  } catch (error) {
    console.error("queue callback failed:", error instanceof Error ? error.message : error);
    await answerTelegramCallback(callbackId, QUEUE_FAILED_TOAST);
  }
}

/**
 * Кроки флоу відсутності. Стан їде в callback_data (тип + дати), тож сервер
 * нічого не тримає, а кожен крок — це editMessageText того самого повідомлення.
 */
async function handleAbsenceCallback(
  adminClient: AdminClient,
  chatId: number,
  messageId: number,
  userId: string,
  data: string
) {
  const parts = data.split(":"); // ["abs", verb, ...]
  const verb = parts[1];

  if (verb === "open") {
    const screen = kindMenuScreen();
    await sendTelegramMessage(chatId, screen.text, {
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: screen.keyboard },
    });
    return;
  }

  if (verb === "menu") {
    const screen = kindMenuScreen();
    await editTelegramMessageText(chatId, messageId, screen.text, {
      replyMarkup: { inline_keyboard: screen.keyboard },
    });
    return;
  }

  if (verb === "k" && parts[2] && isAbsenceBotKind(parts[2])) {
    const screen = presetMenuScreen(parts[2]);
    await editTelegramMessageText(chatId, messageId, screen.text, {
      replyMarkup: { inline_keyboard: screen.keyboard },
    });
    return;
  }

  if (verb === "s" && parts[2] && isAbsenceBotKind(parts[2]) && parts[3] && parts[4]) {
    const kind = parts[2];
    const range = presetRange({ a: parts[3], b: parts[4] }, new Date());
    if (!range) {
      await editTelegramMessageText(chatId, messageId, "⚠️ Не зрозумів дати — спробуй /absence ще раз.");
      return;
    }
    const workspaceId = await resolveMemberWorkspaceId(adminClient, userId);
    const [days, actorRole] = await Promise.all([
      countQuotaDaysForUser(adminClient, workspaceId, kind, range.start, range.end),
      loadRole(adminClient, userId),
    ]);
    const screen = confirmScreen(kind, range.start, range.end, days, isOwnerRole(actorRole));
    await editTelegramMessageText(chatId, messageId, screen.text, {
      replyMarkup: { inline_keyboard: screen.keyboard },
    });
    return;
  }

  if (verb === "c" && parts[2] && isAbsenceBotKind(parts[2]) && parts[3] && parts[4]) {
    const result = await submitAbsenceFromBot({
      admin: adminClient,
      userId,
      kind: parts[2],
      start: parts[3],
      end: parts[4],
    });
    await editTelegramMessageText(chatId, messageId, result.text);
    return;
  }

  if (verb === "x") {
    await editTelegramMessageText(chatId, messageId, "Скасовано. Оформити знову — /absence.");
    return;
  }
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

  // Ранній вихід для груп і каналів. Бот там не працює й не має працювати:
  // зв'язка людини тримається на chat_id, а в групі це id ГРУПИ, тож кожен
  // учасник для бота «не підключений» — і на кожне повідомлення він відповідав
  // би «Акаунт не підключено». Гірше: «/start <nonce>» у групі записав би id
  // групи в персональні налаштування, після чого приватні сповіщення людини
  // полетіли б у загальний чат.
  const chat = update.message?.chat ?? update.callback_query?.message?.chat;
  if (!isPrivateChat(chat)) return ok();

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

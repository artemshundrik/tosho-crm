import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { escapeTelegramHtml, getTelegramBotToken, sendTelegramMessage } from "./_telegram";
import { isChannelEnabled } from "./_notificationCategories";

// Приймаємо реальний Supabase service-role клієнт (як його створюють reminder-функції).
type AdminClient = ReturnType<typeof createClient>;

type ChannelPrefs = Record<string, Record<string, boolean>>;

type NotificationInsertRow = {
  user_id: string;
  title: string;
  body: string | null;
  href: string | null;
  type: "info" | "success" | "warning";
};

type PushSubscriptionRow = {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  origin?: string | null;
  scope?: string | null;
  disabled_at?: string | null;
};

type UserSettingsRow = {
  user_id: string;
  telegram_chat_id: number | null;
  telegram_enabled: boolean | null;
  channel_prefs: ChannelPrefs | null;
};

type DeliverNotificationsOptions = {
  dedupeByHref?: boolean;
  // Категорія сповіщення (ключ із notificationCategories) — для гейтингу каналів
  // через user_notification_settings.channel_prefs. Одна категорія на батч.
  category?: string;
};

type DeliveryResult = {
  delivered: number;
  pushDelivered: number;
  pushFailed: number;
  telegramDelivered: number;
  telegramFailed: number;
};

function isDuplicateNotificationError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

async function insertNotificationRows(
  adminClient: AdminClient,
  rows: NotificationInsertRow[],
  options?: DeliverNotificationsOptions
) {
  if (!options?.dedupeByHref) {
    const { error } = await adminClient.from("notifications").insert(rows);
    if (error) throw new Error(error.message);
    return rows;
  }

  const insertedRows: NotificationInsertRow[] = [];
  for (const row of rows) {
    const { error } = await adminClient.from("notifications").insert([row]);
    if (error) {
      if (isDuplicateNotificationError(error)) continue;
      throw new Error(error.message);
    }
    insertedRows.push(row);
  }
  return insertedRows;
}

async function loadUserSettings(adminClient: AdminClient, userIds: string[]) {
  const map = new Map<string, UserSettingsRow>();
  const { data, error } = await adminClient
    .schema("tosho")
    .from("user_notification_settings")
    .select("user_id,telegram_chat_id,telegram_enabled,channel_prefs")
    .in("user_id", userIds);
  if (error || !data) return map;
  for (const row of (data as UserSettingsRow[])) {
    map.set(row.user_id, row);
  }
  return map;
}

async function deliverPush(
  adminClient: AdminClient,
  insertedRows: NotificationInsertRow[],
  settings: Map<string, UserSettingsRow>,
  category?: string
) {
  const vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:hello@tosho.agency";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return { pushDelivered: 0, pushFailed: 0 };
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const userIds = Array.from(new Set(insertedRows.map((row) => row.user_id)));
  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("push_subscriptions")
    .select("endpoint,user_id,p256dh,auth,origin,scope,disabled_at")
    .in("user_id", userIds)
    .is("disabled_at", null);

  if (subscriptionsError) {
    return { pushDelivered: 0, pushFailed: 0 };
  }

  const subscriptionsByUserId = new Map<string, PushSubscriptionRow[]>();
  for (const row of ((subscriptions ?? []) as PushSubscriptionRow[])) {
    const list = subscriptionsByUserId.get(row.user_id) ?? [];
    list.push(row);
    subscriptionsByUserId.set(row.user_id, list);
  }

  let pushDelivered = 0;
  let pushFailed = 0;

  for (const row of insertedRows) {
    // Гейтинг за налаштуваннями користувача (дефолт — увімкнено).
    if (!isChannelEnabled(settings.get(row.user_id)?.channel_prefs, category, "push")) continue;

    const userSubscriptions = subscriptionsByUserId.get(row.user_id) ?? [];
    const dedupedSubscriptions = Array.from(
      new Map(
        userSubscriptions.map((subscription) => [
          `${subscription.user_id}::${subscription.origin ?? ""}::${subscription.scope ?? ""}::${subscription.p256dh}::${subscription.auth}`,
          subscription,
        ])
      ).values()
    );
    for (const subscription of dedupedSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify({
            title: row.title,
            body: row.body ?? "",
            href: row.href ?? "/notifications",
            tag: row.href ?? `notification:${row.user_id}`,
          })
        );
        pushDelivered += 1;
      } catch (pushError) {
        pushFailed += 1;
        const statusCode =
          typeof pushError === "object" &&
          pushError !== null &&
          "statusCode" in pushError &&
          typeof (pushError as { statusCode?: unknown }).statusCode === "number"
            ? Number((pushError as { statusCode?: unknown }).statusCode)
            : null;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient
            .from("push_subscriptions")
            .update({ disabled_at: new Date().toISOString() })
            .eq("endpoint", subscription.endpoint);
        }
      }
    }
  }

  return { pushDelivered, pushFailed };
}

function buildTelegramUrl(href: string | null) {
  const base = process.env.PUBLIC_APP_URL || "https://tosho.pro";
  if (!href) return `${base}/notifications`;
  try {
    return new URL(href, base).toString();
  } catch {
    return `${base}/notifications`;
  }
}

async function deliverTelegram(
  adminClient: AdminClient,
  insertedRows: NotificationInsertRow[],
  settings: Map<string, UserSettingsRow>,
  category?: string
) {
  if (!getTelegramBotToken()) return { telegramDelivered: 0, telegramFailed: 0 };

  let telegramDelivered = 0;
  let telegramFailed = 0;

  for (const row of insertedRows) {
    const setting = settings.get(row.user_id);
    if (!setting || setting.telegram_chat_id == null) continue; // не підключено
    if (setting.telegram_enabled === false) continue; // глобальний тумблер вимкнено
    if (!isChannelEnabled(setting.channel_prefs, category, "telegram")) continue; // категорію вимкнено

    const chatId = setting.telegram_chat_id;
    const text = `<b>${escapeTelegramHtml(row.title)}</b>${row.body ? `\n${escapeTelegramHtml(row.body)}` : ""}`;
    const result = await sendTelegramMessage(chatId, text, {
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: [[{ text: "Відкрити в CRM", url: buildTelegramUrl(row.href) }]] },
    });

    if (result.ok) {
      telegramDelivered += 1;
      continue;
    }
    telegramFailed += 1;
    // 403 = бот заблокований користувачем → тиха відв'язка.
    if (result.status === 403 || result.errorCode === 403) {
      await adminClient
        .schema("tosho")
        .from("user_notification_settings")
        .update({ telegram_chat_id: null })
        .eq("user_id", row.user_id);
    }
  }

  return { telegramDelivered, telegramFailed };
}

export async function deliverNotifications(
  adminClient: AdminClient,
  rows: NotificationInsertRow[],
  options?: DeliverNotificationsOptions
): Promise<DeliveryResult> {
  const empty: DeliveryResult = {
    delivered: 0,
    pushDelivered: 0,
    pushFailed: 0,
    telegramDelivered: 0,
    telegramFailed: 0,
  };

  if (rows.length === 0) return empty;

  const insertedRows = await insertNotificationRows(adminClient, rows, options);
  if (insertedRows.length === 0) return empty;

  const userIds = Array.from(new Set(insertedRows.map((row) => row.user_id)));
  const settings = await loadUserSettings(adminClient, userIds);

  const push = await deliverPush(adminClient, insertedRows, settings, options?.category);
  const telegram = await deliverTelegram(adminClient, insertedRows, settings, options?.category);

  return {
    delivered: insertedRows.length,
    pushDelivered: push.pushDelivered,
    pushFailed: push.pushFailed,
    telegramDelivered: telegram.telegramDelivered,
    telegramFailed: telegram.telegramFailed,
  };
}

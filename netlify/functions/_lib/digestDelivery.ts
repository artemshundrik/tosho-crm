import { type SupabaseClient } from "@supabase/supabase-js";

import { isChannelEnabled, type NotificationCategoryKey } from "../_notificationCategories";
import { getTelegramBotToken, sendTelegramMessage } from "../_telegram";

/**
 * Кому йде звіт у Telegram і як він туди потрапляє.
 *
 * ЧОМУ ОКРЕМИМ МОДУЛЕМ (01.09.2026, REQ-239). Обидві половини — «зібрати
 * учасників із трьох джерел» і «доставити тим, у кого категорія ввімкнена» —
 * жили всередині daily-digest.ts і були потрібні новій ранковій підбірці
 * слово в слово. Копія тут коштувала б дорого не обсягом, а розходженням:
 * тиха відв'язка на 403, гейт за `channel_prefs` і правило «звільнених
 * виключаємо лише за явним статусом» мають бути ОДНІ на всі розсилки, інакше
 * одна з них колись відправить повідомлення людині, яка від нього відписалась.
 */

/**
 * Учасник, зібраний із memberships_view + team_member_profiles + team_members.
 *
 * Носить ОБИДВА id навмисно: memberships мають workspace_id, а бізнес-таблиці
 * (quotes/orders/leads/finance_expenses) скоупляться операційним team_id з
 * public.team_members, і плутати їх не можна.
 */
export type MemberRow = {
  userId: string;
  workspaceId: string;
  teamId: string | null;
  accessRole: string | null;
  jobRole: string | null;
  email: string | null;
  fullName: string | null;
};

type SettingsRow = {
  user_id: string;
  telegram_chat_id: number | null;
  telegram_enabled: boolean | null;
  channel_prefs: Record<string, Record<string, boolean>> | null;
};

// --- Отримувачі -------------------------------------------------------------

export type AdminClient = SupabaseClient;

export async function loadMembers(admin: AdminClient): Promise<MemberRow[]> {
  const [membershipsResult, profilesResult, teamsResult] = await Promise.all([
    admin
      .schema("tosho")
      .from("memberships_view")
      .select("workspace_id,user_id,access_role,job_role,email")
      .limit(10000),
    // Імена беремо тут, а НЕ з memberships_view.full_name: на проді та колонка
    // порожня майже у всіх, і розбивки по людях виходили б «—».
    admin
      .schema("tosho")
      .from("team_member_profiles")
      .select("user_id,employment_status,first_name,last_name")
      .limit(10000),
    admin.from("team_members").select("user_id,team_id").limit(10000),
  ]);
  if (membershipsResult.error) throw new Error(`memberships_view: ${membershipsResult.error.message}`);
  if (profilesResult.error) throw new Error(`team_member_profiles: ${profilesResult.error.message}`);
  if (teamsResult.error) throw new Error(`team_members: ${teamsResult.error.message}`);

  const statusByUser = new Map<string, string>();
  const nameByUserId = new Map<string, string>();
  for (const row of ((profilesResult.data ?? []) as Array<{
    user_id?: string | null;
    employment_status?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  }>)) {
    if (!row.user_id) continue;
    statusByUser.set(row.user_id, (row.employment_status ?? "").trim().toLowerCase());
    const name = [row.first_name, row.last_name].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
    if (name) nameByUserId.set(row.user_id, name);
  }

  const teamByUser = new Map<string, string>();
  for (const row of ((teamsResult.data ?? []) as Array<{ user_id?: string | null; team_id?: string | null }>)) {
    if (row.user_id && row.team_id) teamByUser.set(row.user_id, row.team_id);
  }

  const members: MemberRow[] = [];
  for (const row of ((membershipsResult.data ?? []) as Array<{
    workspace_id?: string | null;
    user_id?: string | null;
    access_role?: string | null;
    job_role?: string | null;
    email?: string | null;
  }>)) {
    if (!row.workspace_id || !row.user_id) continue;
    // Звільнені/відхилені не отримують нічого. Відсутній профіль не привід
    // виключати — виключаємо лише за явним статусом.
    const status = statusByUser.get(row.user_id);
    if (status === "inactive" || status === "rejected") continue;
    members.push({
      userId: row.user_id,
      workspaceId: row.workspace_id,
      teamId: teamByUser.get(row.user_id) ?? null,
      accessRole: row.access_role ?? null,
      jobRole: row.job_role ?? null,
      email: row.email ?? null,
      fullName: nameByUserId.get(row.user_id) ?? null,
    });
  }
  return members;
}

/** Операційні team_id для бізнес-таблиць (НЕ workspace_id). */
export function resolveTeamIds(members: MemberRow[]): string[] {
  return Array.from(new Set(members.map((m) => m.teamId).filter((v): v is string => Boolean(v))));
}

export async function sendDigest(
  admin: AdminClient,
  recipients: MemberRow[],
  category: NotificationCategoryKey,
  text: string,
  keyboard: Array<Array<{ text: string; url: string }>>
) {
  if (!getTelegramBotToken()) return { delivered: 0, failed: 0, eligible: 0 };

  const userIds = recipients.map((m) => m.userId);
  if (userIds.length === 0) return { delivered: 0, failed: 0, eligible: 0 };

  const { data, error } = await admin
    .schema("tosho")
    .from("user_notification_settings")
    .select("user_id,telegram_chat_id,telegram_enabled,channel_prefs")
    .in("user_id", userIds);
  if (error) throw new Error(`user_notification_settings: ${error.message}`);

  const settings = new Map<string, SettingsRow>();
  for (const row of ((data ?? []) as SettingsRow[])) settings.set(row.user_id, row);

  let delivered = 0;
  let failed = 0;
  let eligible = 0;

  for (const userId of userIds) {
    const setting = settings.get(userId);
    if (!setting || setting.telegram_chat_id == null) continue; // Telegram не підключено
    if (setting.telegram_enabled === false) continue; // глобальний тумблер вимкнено
    if (!isChannelEnabled(setting.channel_prefs, category, "telegram")) continue; // категорію вимкнено

    eligible += 1;
    const result = await sendTelegramMessage(setting.telegram_chat_id, text, {
      parseMode: "HTML",
      replyMarkup: { inline_keyboard: keyboard },
      disablePreview: true,
    });

    if (result.ok) {
      delivered += 1;
      continue;
    }
    failed += 1;
    // 403 = бот заблокований користувачем → тиха відв'язка (як у _notificationDelivery).
    if (result.status === 403 || result.errorCode === 403) {
      await admin
        .schema("tosho")
        .from("user_notification_settings")
        .update({ telegram_chat_id: null })
        .eq("user_id", userId);
    }
  }

  return { delivered, failed, eligible };
}

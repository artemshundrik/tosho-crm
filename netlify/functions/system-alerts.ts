import { createClient } from "@supabase/supabase-js";
import { assertCronAuthorized } from "./_cronAuth";
import { isChannelEnabled } from "./_notificationCategories";
import { escapeTelegramHtml, getTelegramBotToken, sendTelegramMessage } from "./_telegram";
import { collectSystemSignals, isProblem, type Signal } from "./_systemHealth";
import { mergeTeamMembers, resolveTeamIds, isDeliverable } from "./_lib/teamMembers";

// Миттєві алерти про критичні проблеми — не чекаючи ранкового дайджесту.
//
// Пороги й перевірки ті самі, що в дайджесті (_systemHealth), тож бот, звіт і
// алерт ніколи не розійдуться в оцінці.
//
// Головне тут — НЕ шуміти. Сигнал, який горить постійно, треба показати один
// раз: інакше його почнуть ігнорувати, і алерти стануть марними. Тому шлемо
// лише коли набір проблем змінився, або коли той самий набір висить довше за
// ALERT_COOLDOWN_HOURS. Окремо повідомляємо про відновлення — знати, що
// полагодилось, не менш важливо.

type HttpEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

const ALERT_KEY = "system_danger";
const ALERT_COOLDOWN_HOURS = 12;
const APP_URL = process.env.PUBLIC_APP_URL || "https://tosho.pro";
const CATEGORY = "admin_digest";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

/** Відбиток набору проблем: важливий склад, а не порядок. */
function fingerprint(signals: Signal[]): string {
  return signals
    .map((s) => s.text)
    .sort()
    .join("|");
}

export const handler = async (event: HttpEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });
  if (!process.env.CRON_SHARED_SECRET) return json(503, { error: "CRON_SHARED_SECRET is not configured" });
  const denial = assertCronAuthorized(event);
  if (denial) return denial;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing Supabase env vars" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const dryRun = event.queryStringParameters?.dry === "1";

  try {
    const now = new Date();

    const [membershipsResult, profilesResult, teamLinksResult, stateResult] = await Promise.all([
      admin.schema("tosho").from("memberships_view").select("user_id,workspace_id,access_role,job_role").limit(10000),
      admin.schema("tosho").from("team_member_profiles").select("user_id,employment_status,first_name,last_name").limit(10000),
      admin.from("team_members").select("user_id,team_id").limit(10000),
      admin.schema("tosho").from("alert_state").select("fingerprint,notified_at").eq("key", ALERT_KEY).maybeSingle(),
    ]);
    if (membershipsResult.error) throw new Error(`memberships_view: ${membershipsResult.error.message}`);

    const members = mergeTeamMembers({
      memberships: membershipsResult.data ?? [],
      profiles: profilesResult.data ?? [],
      teamLinks: teamLinksResult.data ?? [],
    });

    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
    const signals = await collectSystemSignals(admin, now, {
      aiFromIso: dayAgo,
      aiToIso: now.toISOString(),
      aiLabel: "за добу",
      teamIds: resolveTeamIds(members),
    });

    // Алертимо лише червоним. Жовте — робота ранкового дайджесту, інакше
    // сповіщення перетворяться на фон.
    const danger = signals.filter((s) => s.tone === "danger");
    const previous = (stateResult.data ?? null) as { fingerprint?: string; notified_at?: string } | null;
    const currentPrint = fingerprint(danger);
    const previousPrint = previous?.fingerprint ?? "";

    const hoursSinceNotified = previous?.notified_at
      ? (now.getTime() - new Date(previous.notified_at).getTime()) / 3_600_000
      : Number.POSITIVE_INFINITY;

    let message: string | null = null;
    if (danger.length > 0) {
      const changed = currentPrint !== previousPrint;
      if (changed || hoursSinceNotified >= ALERT_COOLDOWN_HOURS) {
        const lines = [`<b>🔴 Проблема в системі</b>`, ""];
        for (const s of danger) lines.push(`• ${escapeTelegramHtml(s.text)}`);
        const warnings = signals.filter((s) => isProblem(s) && s.tone === "warning");
        if (warnings.length > 0) {
          lines.push("", `Заразом жовтим: ${escapeTelegramHtml(warnings.map((s) => s.text).join(" · "))}`);
        }
        lines.push("", `${APP_URL}/admin/observability`);
        message = lines.join("\n");
      }
    } else if (previousPrint) {
      // Було червоне, стало чисто — про це варто сказати.
      message = "🟢 Проблеми зникли, система в нормі.";
    }

    if (!message) {
      return json(200, { success: true, danger: danger.length, sent: false, reason: "no change" });
    }
    if (dryRun) {
      return json(200, { success: true, dryRun: true, danger: danger.length, message });
    }

    // Отримувачі — власник (та сама аудиторія, що в тех-дайджесту).
    const owners = members.filter((m) => (m.accessRole ?? "").trim().toLowerCase() === "owner" && isDeliverable(m));
    let delivered = 0;
    if (getTelegramBotToken() && owners.length > 0) {
      const { data: settings } = await admin
        .schema("tosho")
        .from("user_notification_settings")
        .select("user_id,telegram_chat_id,telegram_enabled,channel_prefs")
        .in("user_id", owners.map((m) => m.userId));
      for (const row of ((settings ?? []) as Array<{
        user_id: string;
        telegram_chat_id: number | null;
        telegram_enabled: boolean | null;
        channel_prefs: Record<string, Record<string, boolean>> | null;
      }>)) {
        if (row.telegram_chat_id == null || row.telegram_enabled === false) continue;
        if (!isChannelEnabled(row.channel_prefs, CATEGORY, "telegram")) continue;
        const result = await sendTelegramMessage(row.telegram_chat_id, message, {
          parseMode: "HTML",
          disablePreview: true,
        });
        if (result.ok) delivered += 1;
      }
    }

    // Стан оновлюємо навіть якщо доставити не вдалося: інакше при збоях
    // Telegram той самий алерт полетить знову за годину.
    await admin
      .schema("tosho")
      .from("alert_state")
      .upsert(
        { key: ALERT_KEY, fingerprint: currentPrint, notified_at: now.toISOString(), updated_at: now.toISOString() },
        { onConflict: "key" }
      );

    return json(200, { success: true, danger: danger.length, sent: true, delivered });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(500, { error: message });
  }
};

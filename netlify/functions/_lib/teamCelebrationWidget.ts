import type { SupabaseClient } from "@supabase/supabase-js";

import { formatJobRole } from "../../../src/lib/jobRoles";
import { escapeTelegramHtml } from "../_telegram";

import { buildCardWidget, initials, loadMemberAvatar, type CardData } from "./cardWidget";
import { plural, type WidgetContent } from "./telegramWidgets";

/**
 * День народження й річниця в команді (REQ-356#p4, макети 5 і 6): велика
 * аватарка по центру, ім'я, посада. Річниця — велика рожева цифра років,
 * без смужок. Відмінювати імена не беремося («у Марини»): ім'я стоїть
 * окремим рядком у називному, а подія — над ним.
 */

const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

const clean = (value: string) => value.replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim();

function sinceLabel(startDate: string | null | undefined, withDay: boolean): string {
  const match = (startDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const month = Number(match[2]) - 1;
  return withDay ? `з ${Number(match[3])} ${MONTHS[month]} ${match[1]}` : `у команді з ${MONTHS[month]} ${match[1]}`;
}

export function celebrationCard(params: {
  kind: "birthday" | "anniversary";
  name: string;
  years?: number | null;
  jobRole?: string | null;
  startDate?: string | null;
}): CardData {
  const name = clean(params.name);
  const role = formatJobRole(params.jobRole);
  if (params.kind === "birthday") {
    return {
      x: "🎈🎂🎉",
      a: true,
      i: initials(name),
      h: "Сьогодні день народження",
      b: name,
      f: [role, sinceLabel(params.startDate, false)].filter(Boolean).join(" · ") || undefined,
    };
  }
  const years = Math.max(1, params.years ?? 1);
  return {
    a: true,
    i: initials(name),
    n: String(years),
    h: `${plural(years, ["рік", "роки", "років"])} з нами`,
    b: name,
    f: [role, sinceLabel(params.startDate, true)].filter(Boolean).join(" · ") || undefined,
  };
}

/** Нікнейм у Telegram — для кнопки «Написати»; лише валідний, інакше null. */
async function telegramUsername(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .schema("tosho")
    .from("user_notification_settings")
    .select("telegram_username")
    .eq("user_id", userId)
    .maybeSingle();
  const raw = ((data as { telegram_username?: string | null } | null)?.telegram_username ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{5,32}$/.test(raw) ? raw : null;
}

export type CelebrationBundle = {
  widget: WidgetContent | null;
  /** https://t.me/<нік> або null, якщо ніку немає. */
  chatUrl: string | null;
};

/** Один віджет на подію — спільний для всіх отримувачів. */
export async function loadCelebrationWidget(
  admin: SupabaseClient,
  params: {
    kind: "birthday" | "anniversary";
    userId: string;
    name: string;
    years?: number | null;
    jobRole?: string | null;
    startDate?: string | null;
    title: string;
    body: string;
  }
): Promise<CelebrationBundle> {
  try {
    const [avatar, username] = await Promise.all([
      loadMemberAvatar(admin, params.userId),
      telegramUsername(admin, params.userId).catch(() => null),
    ]);
    const widget = await buildCardWidget({
      data: celebrationCard(params),
      avatar,
      caption: `<b>${escapeTelegramHtml(params.title)}</b>\n${escapeTelegramHtml(params.body)}`,
    });
    return { widget, chatUrl: username ? `https://t.me/${username}` : null };
  } catch (error) {
    console.warn("[celebration-widget] build failed", error);
    return { widget: null, chatUrl: null };
  }
}

import { deflateSync } from "node:zlib";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { CARD_WIDGET_HTML } from "./telegramWidgetTemplates.generated";
import type { WidgetContent } from "./telegramWidgets";

/**
 * Картка по центру — один шаблон на кілька подій (REQ-356#p4):
 * рішення по відпустці співробітнику, день народження, річниця в команді.
 * Затверджені макети: один значок або одна аватарка, великий головний рядок,
 * плашки, дрібний рядок унизу. Жодних смужок і другого кружечка.
 *
 * Дані йдуть у сам HTML (`DN=`), а не в chat_data: віджет однаковий для всіх
 * отримувачів, і так не треба вміщатись у 1024 байти.
 */

const HTML_LIMIT = 3950;

export type CardData = {
  /** Рядок емодзі над значком: «🎈🎂🎉». */
  x?: string;
  /** Значок у кружку або ініціали, коли аватарки немає. */
  i: string;
  /** ok — зелений, no — червоний; для аватарки порожньо. */
  k?: "ok" | "no";
  /** Кружок — аватарка людини, а не значок. */
  a?: boolean;
  /** Велика рожева цифра (роки в команді). */
  n?: string;
  h?: string;
  b?: string;
  p?: string[];
  q?: string;
  f?: string;
};

const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
const compressed = (html: string) => deflateSync(Buffer.from(html), { level: 9 }).length;

/** Від найкращої до найскромнішої: перша, що влізла в ліміт, і йде. */
const AVATAR_STEPS: Array<[number, number]> = [
  [96, 40],
  [72, 32],
  [56, 26],
];

export async function avatarStyle(avatar: Buffer, px: number, quality: number): Promise<string> {
  const out = await sharp(avatar).resize(px, px, { fit: "cover" }).webp({ quality, effort: 6 }).toBuffer();
  return `<style>:root{--av:url(data:image/webp;base64,${out.toString("base64")})}</style>`;
}

export async function buildCardWidget(params: {
  data: CardData;
  avatar?: Buffer | null;
  caption: string;
}): Promise<WidgetContent | null> {
  const { data, caption } = params;
  const html = (style: string, withAvatar: boolean) =>
    `${style}<script>DN=${inlineJson({ ...data, av: withAvatar ? 1 : 0 })}</script>${CARD_WIDGET_HTML}`;

  if (params.avatar && data.a) {
    for (const [px, quality] of AVATAR_STEPS) {
      const style = await avatarStyle(params.avatar, px, quality).catch(() => null);
      if (!style) break;
      const candidate = html(style, true);
      if (compressed(candidate) <= HTML_LIMIT) return { html: candidate, chatData: "{}", caption };
    }
  }
  const plain = html("", false);
  return compressed(plain) <= HTML_LIMIT ? { html: plain, chatData: "{}", caption } : null;
}

/** Аватарка учасника команди з бакета avatars; немає чи не скачалась — null. */
export async function loadMemberAvatar(admin: SupabaseClient, userId: string): Promise<Buffer | null> {
  try {
    const { data } = await admin
      .schema("tosho")
      .from("team_member_profiles")
      .select("avatar_path")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const path = (data as { avatar_path?: string | null } | null)?.avatar_path?.trim();
    if (!path) return null;
    const { data: file } = await admin.storage.from("avatars").download(path);
    return file ? Buffer.from(await file.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** «Марина Коваль» → «МК». */
export function initials(name: string): string {
  const [first = "", second = ""] = name.replace(/[<>&"]/g, "").trim().split(/\s+/);
  return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase() || "•";
}

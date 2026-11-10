import { deflateSync } from "node:zlib";

import sharp from "sharp";

import type { DocumentReminderItem, ReminderDocument, ReminderSection } from "./orderDocumentReminders";
import { DOCS_WIDGET_HTML } from "./telegramWidgetTemplates.generated";

/**
 * «Документи замовникам» (менеджеру) і «Затримки з документами» (керівнику)
 * віджетом (REQ-356#p2). Менеджеру — за розділами, керівнику — за менеджерами
 * з аватарками. Аватарки важливіші за лого: керівник шукає людину, а не
 * замовника. Не влізло в ліміт — спершу зникають лого, потім аватарки, потім
 * рядки; не влізло зовсім — null, і піде текст.
 */

const HTML_LIMIT = 3950;
const AVATAR_PX = 26;
const LOGO_PX = 30;
/** Висота віджета ~560 px: стільки рядків видно без прокрутки. */
const MAX_ROWS = 10;
const MAX_GROUPS = 6;

const DOC_CODE: Record<ReminderDocument, string> = { contract: "c", specification: "s", invoice: "i", balance: "b" };
const SEC_CODE: Record<ReminderSection, string> = { unsent: "u", returned: "r", unsigned: "n", unpaid: "p" };
const SECTION_TITLES: Record<ReminderSection, string> = {
  unsent: "Не надіслано",
  returned: "Повернули з правками",
  unsigned: "Не підписано",
  unpaid: "Не оплачено",
};
const SECTION_ORDER: ReminderSection[] = ["unsent", "returned", "unsigned", "unpaid"];

export type DocsWidgetInput = {
  mode: "manager" | "head";
  items: DocumentReminderItem[];
  /** «10 листопада». */
  date: string;
  /** База для посилань у рядках: `${appUrl}/orders/production/`. */
  orderUrlPrefix: string;
  managerName?: (userId: string | null) => string;
  /** Аватарки менеджерів (керівнику) — уже завантажені. */
  avatars?: Map<string, Buffer | null>;
  /** Лого за orderId — уже завантажені. */
  logos?: Map<string, Buffer | null>;
};

const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
const compressedSize = (html: string) => deflateSync(Buffer.from(html), { level: 9 }).length;

async function sprite(images: Buffer[], px: number, variable: string, fit: "cover" | "contain"): Promise<string | null> {
  if (images.length === 0) return "";
  try {
    const tiles = await Promise.all(
      images.map((image) =>
        sharp(image).resize(px, px, { fit, background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer()
      )
    );
    const out = await sharp({ create: { width: px * tiles.length, height: px, channels: 3, background: "#ffffff" } })
      .composite(tiles.map((input, index) => ({ input, left: index * px, top: 0 })))
      .webp({ quality: 22, effort: 6 })
      .toBuffer();
    return `<style>:root{--${variable}:url(data:image/webp;base64,${out.toString("base64")})}</style>`;
  } catch {
    return null;
  }
}

type Group = { title: string; managerId: string | null; items: DocumentReminderItem[] };

export function groupDocsItems(input: Pick<DocsWidgetInput, "mode" | "items" | "managerName">): Group[] {
  if (input.mode === "manager") {
    let left = MAX_ROWS;
    return SECTION_ORDER.flatMap((section) => {
      const own = input.items.filter((item) => item.section === section).slice(0, Math.max(left, 0));
      left -= own.length;
      return own.length ? [{ title: SECTION_TITLES[section], managerId: null, items: own }] : [];
    });
  }
  const byManager = new Map<string, Group>();
  for (const item of input.items) {
    const key = item.managerUserId ?? "";
    const group = byManager.get(key) ?? { title: input.managerName?.(item.managerUserId) ?? "Без менеджера", managerId: item.managerUserId, items: [] };
    group.items.push(item);
    byManager.set(key, group);
  }
  return Array.from(byManager.values())
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, MAX_GROUPS)
    .map((group) => ({ ...group, items: group.items.slice(0, MAX_ROWS) }));
}

export async function buildDocsWidget(input: DocsWidgetInput): Promise<string | null> {
  const groups = groupDocsItems(input);
  if (groups.length === 0) return null;
  const shownItems = groups.flatMap((group) => group.items);

  const avatarIds = input.mode === "head" ? groups.map((g) => g.managerId).filter((id): id is string => !!id && !!input.avatars?.get(id)) : [];
  const logoOrders = Array.from(new Set(shownItems.map((item) => item.orderId).filter((id) => !!input.logos?.get(id))));

  const build = (avatarCount: number, logoCount: number) => {
    const avatarIndex = new Map(avatarIds.slice(0, avatarCount).map((id, index) => [id, index]));
    const logoIndex = new Map(logoOrders.slice(0, logoCount).map((id, index) => [id, index]));
    return {
      t: input.mode === "head" ? "Затримки з документами" : "Документи замовникам",
      d: input.date,
      u: input.orderUrlPrefix,
      n: logoCount,
      k: avatarCount,
      m: input.mode === "head" ? 1 : 0,
      g: groups.map((group) => {
        const rows = group.items.map((item) => [
          item.orderId,
          item.orderNumber?.trim() || "замовлення",
          (item.customerName ?? "").trim() || "Без замовника",
          DOC_CODE[item.document],
          SEC_CODE[item.section],
          item.detail,
          item.escalate ? 1 : 0,
          logoIndex.get(item.orderId) ?? -1,
        ]);
        return input.mode === "head" ? [group.title, rows, group.managerId ? (avatarIndex.get(group.managerId) ?? -1) : -1] : [group.title, rows];
      }),
    };
  };

  const avatarImages = avatarIds.map((id) => input.avatars!.get(id) as Buffer);
  const logoImages = logoOrders.map((id) => input.logos!.get(id) as Buffer);
  const avatarSteps = Array.from({ length: avatarImages.length + 1 }, (_, i) => avatarImages.length - i);
  for (const avatarCount of avatarSteps) {
    const avatarStyle = await sprite(avatarImages.slice(0, avatarCount), AVATAR_PX, "av", "cover");
    if (avatarStyle === null) continue;
    // Лого — по одному з кінця; аватарки тримаємо, доки є хоч якийсь шанс.
    for (let logoCount = logoImages.length; logoCount >= 0; logoCount -= logoCount > 4 ? 2 : 1) {
      const logoStyle = await sprite(logoImages.slice(0, logoCount), LOGO_PX, "lg", "contain");
      if (logoStyle === null) continue;
      const html = `${avatarStyle}${logoStyle}<script>DN=${inlineJson(build(avatarCount, logoCount))}</script>${DOCS_WIDGET_HTML}`;
      if (compressedSize(html) <= HTML_LIMIT) return html;
      if (logoCount === 0) break;
    }
  }
  return null;
}

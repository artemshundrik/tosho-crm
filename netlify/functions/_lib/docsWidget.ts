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
const DATA_LIMIT = 1024;
const AVATAR_PX = 26;
const LOGO_PX = 30;
const MAX_GROUPS = 6;
/**
 * Скільки рядків нести: менеджеру — разом, керівнику — на кожного менеджера.
 * Віджет гортає їх сторінками, тож висота не межа; межа — 4096 байтів коду
 * після zlib. Від щедрого до скупого: перше, що влізло, і йде.
 */
const ROW_CAPS = { manager: [30, 20, 14, 10, 7, 5], head: [12, 8, 6, 4, 3, 2] };
/** З аватарками рядки ріжемо лише до цієї межі; далі аватарки поступаються рядкам. */
const AVATAR_FLOOR = 6;

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

/** Спрайт у base64 (порожній рядок — нема картинок, null — sharp не впорався). */
async function sprite(images: Buffer[], px: number, fit: "cover" | "contain"): Promise<string | null> {
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
    return out.toString("base64");
  } catch {
    return null;
  }
}

type Group = { title: string; managerId: string | null; items: DocumentReminderItem[]; total: number };

export function groupDocsItems(
  input: Pick<DocsWidgetInput, "mode" | "items" | "managerName">,
  cap: number = ROW_CAPS[input.mode][0]
): Group[] {
  if (input.mode === "manager") {
    let left = cap;
    return SECTION_ORDER.flatMap((section) => {
      const all = input.items.filter((item) => item.section === section);
      const own = all.slice(0, Math.max(left, 0));
      left -= own.length;
      // Розділ, якому не дісталось рядків, лишається з підсумком: інакше «ще N — у CRM» недорахує.
      return all.length ? [{ title: SECTION_TITLES[section], managerId: null, items: own, total: all.length }] : [];
    });
  }
  const byManager = new Map<string, Group>();
  for (const item of input.items) {
    const key = item.managerUserId ?? "";
    const group = byManager.get(key) ?? { title: input.managerName?.(item.managerUserId) ?? "Без менеджера", managerId: item.managerUserId, items: [], total: 0 };
    group.items.push(item);
    group.total += 1;
    byManager.set(key, group);
  }
  return Array.from(byManager.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_GROUPS)
    .map((group) => ({ ...group, items: group.items.slice(0, cap) }));
}

const countBy = <K extends string>(keys: K[]) => {
  const counts: Partial<Record<K, number>> = {};
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
};

export type DocsWidget = { html: string; chatData: string };

export async function buildDocsWidget(input: DocsWidgetInput): Promise<DocsWidget | null> {
  if (groupDocsItems(input).length === 0) return null;
  const head = input.mode === "head";
  // Плашки вгорі рахуються з УСІХ документів, а не лише з тих, що влізли у віджет.
  const summary = [
    input.items.filter((item) => item.escalate).length,
    countBy(input.items.map((item) => SEC_CODE[item.section])),
    countBy(input.items.map((item) => DOC_CODE[item.document])),
  ];

  const build = (groups: Group[], avatarIds: string[], logoOrders: string[]) => {
    const avatarIndex = new Map(avatarIds.map((id, index) => [id, index]));
    const logoIndex = new Map(logoOrders.map((id, index) => [id, index]));
    return {
      t: head ? "Затримки з документами" : "Документи замовникам",
      d: input.date,
      u: input.orderUrlPrefix,
      n: logoOrders.length,
      k: avatarIds.length,
      m: head ? 1 : 0,
      s: summary,
      g: groups.map((group) => [
        group.title,
        group.items.map((item) => [
          item.orderId,
          item.orderNumber?.trim() || "замовлення",
          (item.customerName ?? "").trim() || "Без замовника",
          DOC_CODE[item.document],
          SEC_CODE[item.section],
          item.detail,
          item.escalate ? 1 : 0,
          logoIndex.get(item.orderId) ?? -1,
        ]),
        group.managerId ? (avatarIndex.get(group.managerId) ?? -1) : -1,
        group.total,
      ]),
    };
  };

  /**
   * Картинки не стискаються, тож їхній base64 їде в chat_data (1024 Б, які
   * інакше стояли б порожні), а хвіст, що не вліз, — у код. Аватарки й лого —
   * один потік: спершу аватарки (вони важливіші), за ними лого; шаблон ділить
   * його назад за довжиною аватарок `c`. Так код лишається під рядки.
   */
  const pack = (groups: Group[], avatarIds: string[], avatarB64: string, logoOrders: string[], logoB64: string) => {
    const images = avatarB64 + logoB64;
    const room = DATA_LIMIT - '{"v":""}'.length;
    const cut = Math.min(images.length, room);
    const rest = images.slice(cut);
    const chatData = JSON.stringify(cut ? { v: images.slice(0, cut) } : {});
    const dn = { ...build(groups, avatarIds, logoOrders), c: avatarB64.length, ...(rest ? { w: rest } : {}) };
    const html = `<script>DN=${inlineJson(dn)}</script>${DOCS_WIDGET_HTML}`;
    return compressedSize(html) <= HTML_LIMIT ? { html, chatData } : null;
  };

  /** Чим жертвуємо: спершу лого, далі рядки до AVATAR_FLOOR, далі аватарки, і лише потім решта рядків. */
  const attempt = async (cap: number, withAvatars: boolean, withLogos: boolean): Promise<DocsWidget | null> => {
    const groups = groupDocsItems(input, cap);
    const avatarIds = withAvatars ? groups.map((g) => g.managerId).filter((id): id is string => !!id && !!input.avatars?.get(id)) : [];
    const avatarB64 = await sprite(avatarIds.map((id) => input.avatars!.get(id) as Buffer), AVATAR_PX, "cover");
    if (avatarB64 === null) return null;
    const allLogos = withLogos
      ? Array.from(new Set(groups.flatMap((g) => g.items).map((item) => item.orderId).filter((id) => !!input.logos?.get(id))))
      : [];
    for (let logoCount = allLogos.length; logoCount >= 0; logoCount -= logoCount > 4 ? 2 : 1) {
      const logoOrders = allLogos.slice(0, logoCount);
      const logoB64 = await sprite(logoOrders.map((id) => input.logos!.get(id) as Buffer), LOGO_PX, "contain");
      if (logoB64 === null) continue;
      const done = pack(groups, avatarIds, avatarB64, logoOrders, logoB64);
      if (done) return done;
    }
    return null;
  };

  const caps = ROW_CAPS[input.mode];
  const hasAvatars = head && (input.avatars?.size ?? 0) > 0;
  const steps: Array<[number, boolean, boolean]> = [
    [caps[0], hasAvatars, true],
    ...(hasAvatars ? caps.slice(1).filter((cap) => cap >= AVATAR_FLOOR).map((cap): [number, boolean, boolean] => [cap, true, false]) : []),
    ...caps.slice(hasAvatars ? 0 : 1).map((cap): [number, boolean, boolean] => [cap, false, false]),
  ];
  for (const [cap, withAvatars, withLogos] of steps) {
    const done = await attempt(cap, withAvatars, withLogos);
    if (done) return done;
  }
  return null;
}

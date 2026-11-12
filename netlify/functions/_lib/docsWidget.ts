import { deflateSync } from "node:zlib";

import sharp from "sharp";

import type { DocumentReminderItem, ReminderDocument, ReminderSection } from "./orderDocumentReminders";
import { DOCS_WIDGET_HTML } from "./telegramWidgetTemplates.generated";

/**
 * «Документи замовникам» (менеджеру) і «Затримки з документами» (керівнику)
 * віджетом (REQ-356#p2). Менеджеру — за розділами, керівнику — за менеджерами
 * з аватарками. Аватарки важливіші за лого: керівник шукає людину, а не
 * замовника. Картинки їдуть у chat_data і коду майже не коштують, а код
 * з'їдають рядки (кожен несе id замовлення для посилання). Тож не влізло —
 * спершу м'якшають і дрібнішають картинки, потім ріжуться рядки до LOGO_FLOOR
 * (решта — «ще N — у CRM»), далі лишається частина лого, потім жодного, і лише
 * в крайньому разі зникають аватарки;
 * не влізло зовсім — null, і піде текст.
 */

const HTML_LIMIT = 3950;
const DATA_LIMIT = 1024;
const MAX_GROUPS = 6;
/**
 * Скільки рядків нести: менеджеру — разом, керівнику — на кожного менеджера.
 * Віджет гортає їх сторінками, тож висота не межа; межа — 4096 байтів коду
 * після zlib. Від щедрого до скупого: перше, що влізло, і йде.
 */
const ROW_CAPS = { manager: [30, 20, 14, 10, 7, 5], head: [12, 8, 6, 4, 3, 2] };
/**
 * Спрайти від найчіткіших: [плитка аватарки, плитка лого, якість webp]. На
 * екрані кружок 26 px і квадрат 30 px за будь-якої плитки — дрібніша лише
 * трохи м'якша, зате аватарки й лого разом влазять у chat_data. Замір 12.11.2026
 * на справжньому зведенні (5 менеджерів, 7 різних лого): 26/30 — 3 лого, 20/22 — 6.
 */
const SPRITE_STEPS: Array<[number, number, number]> = [
  [26, 30, 22],
  [26, 30, 12],
  [22, 24, 12],
  [22, 24, 6],
  [20, 22, 6],
];
/** Заради лого рядки ріжемо лише до цієї межі (менеджеру — разом, керівнику — на групу); далі лого поступаються рядкам. */
const LOGO_FLOOR = { manager: 10, head: 4 };

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
async function sprite(images: Buffer[], px: number, fit: "cover" | "contain", quality: number): Promise<string | null> {
  if (images.length === 0) return "";
  try {
    const tiles = await Promise.all(
      images.map((image) =>
        sharp(image).resize(px, px, { fit, background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer()
      )
    );
    const out = await sharp({ create: { width: px * tiles.length, height: px, channels: 3, background: "#ffffff" } })
      .composite(tiles.map((input, index) => ({ input, left: index * px, top: 0 })))
      .webp({ quality, effort: 6 })
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

  /** Плитки лого: одне лого на замовника, хоч би скільки в нього замовлень у списку. */
  const logoTiles = (orders: string[]) => {
    const files: Buffer[] = [];
    const index = new Map<string, number>();
    for (const id of orders) {
      const file = input.logos!.get(id) as Buffer;
      let at = files.indexOf(file);
      if (at < 0) at = files.push(file) - 1;
      index.set(id, at);
    }
    return { files, index };
  };

  const build = (groups: Group[], avatarIds: string[], logoIndex: Map<string, number>, logoCount: number) => {
    const avatarIndex = new Map(avatarIds.map((id, index) => [id, index]));
    return {
      t: head ? "Затримки з документами" : "Документи замовникам",
      d: input.date,
      u: input.orderUrlPrefix,
      n: logoCount,
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
  const pack = (groups: Group[], avatarIds: string[], avatarB64: string, logos: ReturnType<typeof logoTiles>, logoB64: string) => {
    const images = avatarB64 + logoB64;
    const room = DATA_LIMIT - '{"v":""}'.length;
    const cut = Math.min(images.length, room);
    const rest = images.slice(cut);
    const chatData = JSON.stringify(cut ? { v: images.slice(0, cut) } : {});
    const dn = { ...build(groups, avatarIds, logos.index, logos.files.length), c: avatarB64.length, ...(rest ? { w: rest } : {}) };
    const html = `<script>DN=${inlineJson(dn)}</script>${DOCS_WIDGET_HTML}`;
    return compressedSize(html) <= HTML_LIMIT ? { html, chatData } : null;
  };

  /** logos: "all" — лого всіх видимих рядків, "some" — скільки влізе з початку списку, "none" — без лого. */
  const attempt = async (cap: number, withAvatars: boolean, logos: "all" | "some" | "none"): Promise<DocsWidget | null> => {
    const withLogos = logos !== "none";
    const groups = groupDocsItems(input, cap);
    const avatarIds = withAvatars ? groups.map((g) => g.managerId).filter((id): id is string => !!id && !!input.avatars?.get(id)) : [];
    const logoOrders = withLogos
      ? Array.from(new Set(groups.flatMap((g) => g.items).map((item) => item.orderId).filter((id) => !!input.logos?.get(id))))
      : [];
    if (withLogos && logoOrders.length === 0) return null;
    // Лого — за порядком рядків: не влізли всі, лишаються в перших (керівник бачить їх першими).
    // Як у «Команді»: краще більше картинок трохи м'якших, ніж менше чітких.
    const avatarFiles = avatarIds.map((id) => input.avatars!.get(id) as Buffer);
    const avatarSprites = new Map<string, string | null>();
    const fewest = logos === "all" ? logoOrders.length : withLogos ? 1 : 0;
    for (let count = logoOrders.length; count >= fewest; count -= 1) {
      const shown = logoTiles(logoOrders.slice(0, count));
      for (const [avatarPx, logoPx, quality] of SPRITE_STEPS) {
        const key = `${avatarPx}/${quality}`;
        if (!avatarSprites.has(key)) avatarSprites.set(key, await sprite(avatarFiles, avatarPx, "cover", quality));
        const avatarB64 = avatarSprites.get(key);
        const logoB64 = await sprite(shown.files, logoPx, "contain", quality);
        if (avatarB64 == null || logoB64 === null) return null;
        const done = pack(groups, avatarIds, avatarB64, shown, logoB64);
        if (done) return done;
      }
    }
    return null;
  };

  const caps = ROW_CAPS[input.mode];
  const hasAvatars = head && (input.avatars?.size ?? 0) > 0;
  const logoCaps = caps.filter((cap) => cap >= LOGO_FLOOR[input.mode]);
  // Спершу всі лого (рядки ріжуться до LOGO_FLOOR), потім скільки влізе, потім без лого.
  const steps: Array<[number, boolean, "all" | "some" | "none"]> = [
    ...logoCaps.map((cap): [number, boolean, "all"] => [cap, hasAvatars, "all"]),
    ...logoCaps.map((cap): [number, boolean, "some"] => [cap, hasAvatars, "some"]),
    ...caps.map((cap): [number, boolean, "none"] => [cap, hasAvatars, "none"]),
    ...(hasAvatars ? caps.map((cap): [number, boolean, "none"] => [cap, false, "none"]) : []),
  ];
  for (const [cap, withAvatars, logos] of steps) {
    const done = await attempt(cap, withAvatars, logos);
    if (done) return done;
  }
  return null;
}

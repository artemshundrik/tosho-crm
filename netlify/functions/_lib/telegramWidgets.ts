import { deflateSync } from "node:zlib";

import sharp from "sharp";

import type { InlineKeyboard } from "../_telegram";

import { EVENING_WIDGET_HTML, TEAM_WIDGET_HTML } from "./telegramWidgetTemplates.generated";

/**
 * Звіти як віджети Telegram (Bot API 10.4): справжній HTML у повідомленні з
 * анімацією й вкладками, а не картинка.
 *
 * ДВА ЛІМІТИ, ОБИДВА ЖОРСТКІ. Код віджета — до 4096 байтів після zlib, дані
 * (chat_data) — до 1024 байтів. Перевищив — Telegram відхилить повідомлення, і
 * звіт піде запасним шляхом. Тому тут усе міряється до відправки: дані
 * стискаються, аватарки по одній замінюються ініціалами, доки не влізе.
 *
 * Шаблони — у _lib/widgets/*.html; стиснені копії генерує
 * scripts/build-telegram-widgets.mjs.
 */

/** Telegram рахує 4096; запас — на різницю між zlib Node і серверним. */
const HTML_LIMIT = 3950;
const DATA_LIMIT = 1024;

export type WidgetContent = {
  html: string;
  chatData: string;
  /** Підпис під віджетом, parse_mode=HTML. Його бачать і старі клієнти. */
  caption: string;
  /** Посилання під віджетом. Вкладки — усередині віджета, не кнопками. */
  keyboard?: InlineKeyboard;
};

function compressedSize(html: string): number {
  return deflateSync(Buffer.from(html), { level: 9 }).length;
}

function bytes(value: string): number {
  return Buffer.byteLength(value);
}

/** Імена потрапляють у розмітку віджета: кутові дужки там не потрібні нікому. */
function plain(value: string): string {
  return value.replace(/[<>&"]/g, "").trim();
}

/** Українська множина: 1 лід, 2 ліди, 5 лідів. */
export function plural(count: number, forms: [string, string, string]): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return forms[2];
  if (units === 1) return forms[0];
  if (units >= 2 && units <= 4) return forms[1];
  return forms[2];
}

/** Підпис Telegram обмежений 1024 символами: відкидаємо хвостові блоки. */
export function fitCaption(blocks: string[], limit = 1000): string {
  const visible = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "&").length;
  const kept = [...blocks];
  while (kept.length > 1 && visible(kept.join("\n\n")) > limit) kept.pop();
  const caption = kept.join("\n\n");
  return visible(caption) > limit ? caption.replace(/<[^>]+>/g, "").slice(0, limit - 1) + "…" : caption;
}

// --- Вечір ------------------------------------------------------------------

export type EveningPeriod = {
  /** Затверджено за період, діапазон у гривнях. */
  total: { min: number; max: number };
  /** Верхня межа того самого відрізка минулого періоду. */
  previousMax: number;
  /** Наростаючий підсумок по днях, у гривнях (верхня межа). */
  current: number[];
  previous: number[];
  totalPoints: number;
  label: string;
  against: string;
};

export function buildEveningWidget(data: {
  title: string;
  date: string;
  month: EveningPeriod;
  week: EveningPeriod;
  tiles: Array<[number, string]>;
  caption: string;
  keyboard?: InlineKeyboard;
}): WidgetContent | null {
  const thousands = (values: number[]) => values.map((value) => Math.round(value / 1000));
  const period = (p: EveningPeriod) => ({
    v: [Math.round(p.total.min), Math.round(p.total.max)],
    p: Math.round(p.previousMax),
    c: thousands(p.current),
    q: thousands(p.previous),
    n: p.totalPoints,
    l: p.label,
    x: p.against,
  });
  const chatData = JSON.stringify({ t: data.title, d: data.date, m: period(data.month), w: period(data.week), s: data.tiles });
  if (bytes(chatData) > DATA_LIMIT || compressedSize(EVENING_WIDGET_HTML) > HTML_LIMIT) return null;
  return { html: EVENING_WIDGET_HTML, chatData, caption: data.caption, keyboard: data.keyboard };
}

// --- Команда ----------------------------------------------------------------

export type TeamWidgetPerson = {
  name: string;
  minutes: number;
  /** Відрізки присутності, хвилини від початку доби за Києвом. */
  spans: Array<{ from: number; to: number }>;
  avatar: Buffer | null;
};

const SLOT_MINUTES = 10;
const SLOTS = 72; // 12 годин
const SLOT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** Більше рядків не влізе у 600 px висоти, які Telegram дає віджету. */
const MAX_ROWS = 12;
/** Хто пробув менше — не рядок, а ім'я в підсумковому рядку. */
const SHORT_VISIT = 5;
/** Перерва, яку ще вважаємо тим самим заходом: відрізки ріжуться по хвилині простою. */
const SAME_RUN_GAP = 3;
const AVATAR_PX = 26;
const AVATAR_QUALITY = 22;

function shortName(name: string): string {
  const [first, second] = plain(name).split(/\s+/);
  const short = second ? `${first} ${second[0]}.` : first;
  return short.length > 10 ? first : short;
}

/** Кожен слот — рівень 0-3 (скільки з десяти хвилин людина була); три слоти на символ. */
function encodeSlots(spans: TeamWidgetPerson["spans"], windowStart: number): string {
  const minutes = new Array<number>(SLOTS).fill(0);
  for (const span of spans) {
    for (let minute = span.from; minute < span.to; minute += 1) {
      const slot = Math.floor((minute - windowStart) / SLOT_MINUTES);
      if (slot >= 0 && slot < SLOTS) minutes[slot] += 1;
    }
  }
  const levels = minutes.map((value) => (value ? Math.min(3, Math.ceil((value / SLOT_MINUTES) * 3)) : 0));
  let encoded = "";
  for (let i = 0; i < SLOTS; i += 3) encoded += SLOT_ALPHABET[(levels[i] << 4) | (levels[i + 1] << 2) | levels[i + 2]];
  return encoded;
}

function longestRun(spans: TeamWidgetPerson["spans"]): number {
  let best = 0;
  let start = spans[0].from;
  let end = spans[0].to;
  for (const span of spans.slice(1)) {
    if (span.from - end <= SAME_RUN_GAP) end = Math.max(end, span.to);
    else {
      best = Math.max(best, end - start);
      start = span.from;
      end = span.to;
    }
  }
  return Math.max(best, end - start);
}

async function avatarSprite(avatars: Buffer[]): Promise<string> {
  const tiles = await Promise.all(
    avatars.map((avatar) => sharp(avatar).resize(AVATAR_PX, AVATAR_PX, { fit: "cover" }).png().toBuffer())
  );
  const sprite = await sharp({
    create: { width: AVATAR_PX * tiles.length, height: AVATAR_PX, channels: 3, background: "#888888" },
  })
    .composite(tiles.map((input, index) => ({ input, left: index * AVATAR_PX, top: 0 })))
    .webp({ quality: AVATAR_QUALITY, effort: 6 })
    .toBuffer();
  return `<style>:root{--av:url(data:image/webp;base64,${sprite.toString("base64")})}</style>`;
}

function formatShort(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} г${minutes % 60 ? ` ${minutes % 60} хв` : ""}` : `${minutes} хв`;
}

export async function buildTeamWidget(data: {
  date: string;
  people: TeamWidgetPerson[];
  /** «Олена Б. — відпустка до 14.11». */
  absent: string[];
  caption: string;
  keyboard?: InlineKeyboard;
}): Promise<WidgetContent | null> {
  const people = [...data.people].filter((p) => p.spans.length > 0).sort((a, b) => b.minutes - a.minutes);
  const long = people.filter((p) => p.minutes >= SHORT_VISIT);
  const short = people.filter((p) => p.minutes < SHORT_VISIT);
  if (long.length === 0) return null;

  const firstMinute = Math.min(...long.map((p) => p.spans[0].from));
  // Вікно — 12 годин від першого заходу; пізніше 12:00 не починається, щоб влізти в добу.
  const startHour = Math.min(Math.floor(firstMinute / 60), 12);

  let rows = long.slice(0, MAX_ROWS);
  const footer = (overflow: TeamWidgetPerson[]) =>
    [
      overflow.length ? `Ще: ${overflow.map((p) => `${shortName(p.name)} ${formatShort(p.minutes)}`).join(", ")}` : "",
      short.length ? `Заходили ненадовго: ${short.map((p) => shortName(p.name)).join(", ")}` : "",
      data.absent.length ? `Не було: ${data.absent.map(plain).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  // Аватарки — у спрайті за порядком рядків; без фото — ініціали (-1).
  const withAvatar = (count: number) => {
    let index = 0;
    return rows.map((p) => (p.avatar && index < count ? index++ : -1));
  };
  const chatDataFor = (avatarIndex: number[]) => {
    const overflow = long.slice(rows.length);
    return JSON.stringify({
      d: data.date,
      a: startHour,
      p: rows.map((p, i) => [
        shortName(p.name),
        p.minutes,
        encodeSlots(p.spans, startHour * 60),
        avatarIndex[i],
        p.spans[0].from,
        p.spans[p.spans.length - 1].to,
        longestRun(p.spans),
      ]),
      o: footer(overflow),
    });
  };

  // Дані не влізли — останній рядок переїжджає в підсумковий рядок.
  let chatData = chatDataFor(withAvatar(0));
  while (bytes(chatData) > DATA_LIMIT && rows.length > 1) {
    rows = rows.slice(0, -1);
    chatData = chatDataFor(withAvatar(0));
  }
  if (bytes(chatData) > DATA_LIMIT) return null;

  // Аватарки — найдорожче: забираємо з кінця списку, доки не влізе.
  const photos = rows.filter((p) => p.avatar).map((p) => p.avatar as Buffer);
  for (let count = photos.length; count >= 0; count -= 1) {
    const sprite = count > 0 ? await avatarSprite(photos.slice(0, count)).catch(() => null) : "";
    if (sprite === null) continue;
    const html = sprite + TEAM_WIDGET_HTML;
    if (compressedSize(html) <= HTML_LIMIT) {
      return { html, chatData: chatDataFor(withAvatar(count)), caption: data.caption, keyboard: data.keyboard };
    }
  }
  return null;
}

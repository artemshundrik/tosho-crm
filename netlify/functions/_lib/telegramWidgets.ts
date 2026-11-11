import { deflateSync } from "node:zlib";

import sharp from "sharp";

import type { InlineKeyboard } from "../_telegram";

import {
  ABSENCE_WIDGET_HTML,
  EVENING_WIDGET_HTML,
  MORNING_WIDGET_HTML,
  TEAM_WIDGET_HTML,
} from "./telegramWidgetTemplates.generated";

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

// --- Ранок -------------------------------------------------------------------

export type MorningWidgetData = {
  /** «вт, 10 листопада». */
  date: string;
  /** YYYY-MM-DD за Києвом: маркер «зараз» показується лише в той самий день. */
  dayKey: string;
  /** «🎉 Сьогодні свято — …» або порожньо. */
  holiday: string;
  /** Дедлайни прорахунків сьогодні: хвилина доби за Києвом. */
  quoteDeadlines: number[];
  today: { quotesDue: number; designDue: number; quotesOverdue: number; designOverdue: number; revisions: number };
  funnel: {
    awaiting: number;
    awaitingStale: number;
    oldestDays: number;
    estimated: number;
    monthQuotes: number;
    /** «1,2–1,4 млн грн» — сума нових прорахунків за місяць. */
    monthSum: string;
    staleLeads: number;
    recentLeads: number;
  };
  thresholds: { pipelineStaleDays: number; leadStaleDays: number };
  /** Відсутні сьогодні: [«Олена Б.», «відпустка · до 14.11»]. */
  out: Array<[string, string]>;
  /** Решта рядків вкладки «Команда», від важливого до менш важливого. */
  teamLines: string[];
  footer: string;
  caption: string;
  keyboard?: InlineKeyboard;
};

export function buildMorningWidget(data: MorningWidgetData): WidgetContent | null {
  // Кілька дедлайнів на одну годину — одна кулька з числом, а не стос.
  const byMinute = new Map<number, number>();
  for (const minute of data.quoteDeadlines) byMinute.set(minute, (byMinute.get(minute) ?? 0) + 1);
  const t = data.today;
  const f = data.funnel;
  let out = data.out.map(([name, label]) => [plain(name), plain(label)] as [string, string]);
  let lines = data.teamLines.map(plain);
  const chatDataFor = () =>
    JSON.stringify({
      d: data.date,
      k: data.dayKey,
      h: plain(data.holiday),
      q: [...byMinute.entries()].sort((a, b) => a[0] - b[0]),
      s: [t.quotesDue, t.designDue, t.quotesOverdue, t.designOverdue, t.revisions],
      f: [f.awaiting, f.awaitingStale, f.oldestDays, f.estimated, f.monthQuotes, f.staleLeads, f.recentLeads],
      fm: plain(f.monthSum),
      S: [data.thresholds.pipelineStaleDays, data.thresholds.leadStaleDays],
      o: out,
      t: lines,
      x: plain(data.footer),
    });
  // Не влізло — спершу менш важливі рядки команди, потім відсутні з кінця.
  let chatData = chatDataFor();
  while (bytes(chatData) > DATA_LIMIT && (lines.length > 0 || out.length > 0)) {
    if (lines.length > 0) lines = lines.slice(0, -1);
    else out = out.slice(0, -1);
    chatData = chatDataFor();
  }
  if (bytes(chatData) > DATA_LIMIT || compressedSize(MORNING_WIDGET_HTML) > HTML_LIMIT) return null;
  return { html: MORNING_WIDGET_HTML, chatData, caption: data.caption, keyboard: data.keyboard };
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
/** Хто пробув менше — не рядок, а ім'я в підсумковому рядку. */
const SHORT_VISIT = 5;
/** Перерва, яку ще вважаємо тим самим заходом: відрізки ріжуться по хвилині простою. */
const SAME_RUN_GAP = 3;
const AVATAR_PX = 26;
const AVATAR_QUALITY = 22;
/** Так звіт позначає людину без відпустки й лікарняного, яка просто не заходила. */
export const NOT_IN_CRM = "не було в CRM";

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

/** `</script>` у чужому тексті не має закрити наш скрипт. */
const inlineJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

type TeamRow = [string, number, string, number, number, number, number];

export async function buildTeamWidget(data: {
  date: string;
  people: TeamWidgetPerson[];
  /** Кого не було: причина — «відпустка до 14.11» або «не було в CRM». */
  absent: Array<{ name: string; reason: string }>;
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

  // Підсумкові рядки під списком: [підпис, імена]. Хто просто не заходив —
  // одним рядком імен, без «(не було в CRM)» біля кожного.
  const away = data.absent.filter((a) => a.reason !== NOT_IN_CRM);
  const silent = data.absent.filter((a) => a.reason === NOT_IN_CRM);
  const footer: Array<[string, string]> = [
    ["Ненадовго:", short.map((p) => shortName(p.name)).join(", ")],
    ["Відсутні:", away.map((a) => `${plain(a.name)} (${plain(a.reason)})`).join(", ")],
    ["Не заходили:", silent.map((a) => plain(a.name)).join(", ")],
  ].filter((line): line is [string, string] => line[1].length > 0);

  // Аватарки — у спрайті за порядком рядків; без фото — ініціали (-1).
  const rowsFor = (shown: TeamWidgetPerson[], avatars: number): TeamRow[] => {
    let index = 0;
    return shown.map((p) => [
      shortName(p.name),
      p.minutes,
      encodeSlots(p.spans, startHour * 60),
      p.avatar && index < avatars ? index++ : -1,
      p.spans[0].from,
      p.spans[p.spans.length - 1].to,
      longestRun(p.spans),
    ]);
  };
  const chatDataFor = (rows: TeamRow[]) => JSON.stringify({ d: data.date, a: startHour, p: rows });

  // Показуємо ВСІХ: скільки рядків влізе в 1024 байти chat_data — їдуть там,
  // решта разом із підсумковими рядками — у самому HTML, де текст ще й стискається.
  // Міряємо без аватарок: «-1» не коротше за жоден номер у спрайті.
  let inChat = long.length;
  while (inChat > 1 && bytes(chatDataFor(rowsFor(long.slice(0, inChat), 0))) > DATA_LIMIT) inChat -= 1;
  if (bytes(chatDataFor(rowsFor(long.slice(0, inChat), 0))) > DATA_LIMIT) return null;

  // Не влізло — спершу з кінця зникають аватарки, і лише потім останні рядки.
  for (let shown = long.length; shown >= inChat; shown -= 1) {
    const rows = long.slice(0, shown);
    const hidden = long.length - shown;
    const lines = hidden > 0 ? [...footer, ["Ще:", `${hidden} ${plural(hidden, ["людина", "людини", "людей"])} — у «Пульсі команди»`]] : footer;
    const photos = rows.filter((p) => p.avatar).map((p) => p.avatar as Buffer);
    for (let count = shown === long.length ? photos.length : 0; count >= 0; count -= 1) {
      const sprite = count > 0 ? await avatarSprite(photos.slice(0, count)).catch(() => null) : "";
      if (sprite === null) continue;
      const all = rowsFor(rows, count);
      const extra = { p: all.slice(inChat), o: lines };
      const html = `${sprite}<script>DN=${inlineJson(extra)}</script>${TEAM_WIDGET_HTML}`;
      if (compressedSize(html) <= HTML_LIMIT) {
        return { html, chatData: chatDataFor(all.slice(0, inChat)), caption: data.caption, keyboard: data.keyboard };
      }
    }
  }
  return null;
}

// --- Заявка на відсутність ---------------------------------------------------

export type AbsenceWidgetData = {
  /** «Заявка · відпустка». */
  title: string;
  /** «⏳ стартує завтра» — для нагадувань; у свіжої заявки порожньо. */
  urgent: string;
  name: string;
  /** «17 лист. – 28 лист.». */
  range: string;
  /** «12 кал. дн.» / «3 роб. дн.» або порожньо. */
  days: string;
  comment: string;
  /** Понеділок, з якого починається календар. */
  windowStart: string;
  length: number;
  /** Вихідні й свята — номери днів від windowStart. */
  offDays: number[];
  todayIndex: number;
  requester: { from: number; to: number };
  others: Array<{ name: string; kind: string; from: number; to: number; pending: boolean }>;
  caption: string;
  /** `<style>` з --av заявника; не влізе в ліміт — лишаться ініціали. */
  avatarStyle?: string;
};

/** Більше рядків календар не вміщує у висоту віджета. */
const MAX_ABSENCE_ROWS = 7;

export function buildAbsenceWidget(data: AbsenceWidgetData): WidgetContent | null {
  // Спершу ті, хто перетинається із заявкою: саме заради них віджет і є.
  const overlaps = (o: { from: number; to: number }) => o.from <= data.requester.to && o.to >= data.requester.from;
  const others = [...data.others].sort((a, b) => Number(overlaps(b)) - Number(overlaps(a)) || a.from - b.from);
  let rows = others.slice(0, MAX_ABSENCE_ROWS);
  const chatDataFor = () => {
    const rest = others.slice(rows.length);
    return JSON.stringify({
      t: plain(data.title),
      e: plain(data.urgent),
      n: plain(data.name),
      r: plain(data.range),
      c: plain(data.days),
      m: plain(data.comment).slice(0, 140),
      s: data.windowStart,
      L: data.length,
      o: data.offDays,
      y: data.todayIndex,
      p: [
        [shortName(data.name), "", data.requester.from, data.requester.to, 0],
        ...rows.map((o) => [shortName(o.name), plain(o.kind), o.from, o.to, o.pending ? 1 : 0]),
      ],
      z: rest.length ? `Ще: ${rest.map((o) => shortName(o.name)).join(", ")}` : "",
    });
  };
  let chatData = chatDataFor();
  while (bytes(chatData) > DATA_LIMIT && rows.length > 0) {
    rows = rows.slice(0, -1);
    chatData = chatDataFor();
  }
  if (bytes(chatData) > DATA_LIMIT || compressedSize(ABSENCE_WIDGET_HTML) > HTML_LIMIT) return null;
  // Аватарка — у самому HTML: прапорець у даних, щоб шаблон знав, що малювати.
  if (data.avatarStyle) {
    const html = data.avatarStyle + ABSENCE_WIDGET_HTML;
    const withFlag = chatData.replace(/^\{/, '{"a":1,');
    if (compressedSize(html) <= HTML_LIMIT && bytes(withFlag) <= DATA_LIMIT) return { html, chatData: withFlag, caption: data.caption };
  }
  return { html: ABSENCE_WIDGET_HTML, chatData, caption: data.caption };
}

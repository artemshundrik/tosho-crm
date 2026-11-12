import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import opentype from "opentype.js";
import sharp from "sharp";

/**
 * Брендові картки для Telegram: PNG, який вставляється в Rich Message.
 *
 * ЧОМУ ТЕКСТ КОНТУРАМИ. У середовищі функцій немає системних шрифтів, а sharp
 * малює SVG-текст саме ними: кирилиця вийшла б квадратиками. Тому кожен рядок
 * перетворюється на контур зі шрифту, що їде разом із функцією
 * (included_files у netlify.toml).
 *
 * Рожевий — лише акцент: крапка в заголовку, те, на що треба дивитись першим,
 * і лінія поточного періоду. Усі картки мають той самий чорний вигляд.
 */

const WIDTH = 720;
const PAD = 36;
const BRAND = "#E6007E";
const INK = "#FFFFFF";
const SOFT = "#C9C9C9";
const MUTED = "#A8A8A8";

type Font = opentype.Font;
let fonts: { regular: Font; bold: Font } | null = null;

function loadFont(file: string): Font {
  const dirs = [join(process.cwd(), "src/assets/fonts"), "/var/task/src/assets/fonts"];
  const dir = dirs.find((candidate) => existsSync(join(candidate, file)));
  if (!dir) throw new Error(`font not found: ${file}`);
  const data = readFileSync(join(dir, file));
  return opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
}

function getFonts() {
  fonts ??= { regular: loadFont("Roboto-Regular.ttf"), bold: loadFont("Roboto-Bold.ttf") };
  return fonts;
}

type TextOptions = { size: number; fill?: string; bold?: boolean; anchor?: "start" | "end" | "middle" };

function textWidth(value: string, options: TextOptions): number {
  const { regular, bold } = getFonts();
  return (options.bold ? bold : regular).getAdvanceWidth(value, options.size);
}

function text(value: string, x: number, y: number, options: TextOptions): string {
  const { regular, bold } = getFonts();
  const font = options.bold ? bold : regular;
  const width = font.getAdvanceWidth(value, options.size);
  const left = options.anchor === "end" ? x - width : options.anchor === "middle" ? x - width / 2 : x;
  return `<path fill="${options.fill ?? INK}" d="${font.getPath(value, left, y, options.size).toPathData(1)}"/>`;
}

/** Обрізає рядок із трикрапкою, щоб довге ім'я не наїхало на сусідній стовпчик. */
function fit(value: string, maxWidth: number, options: TextOptions): string {
  if (textWidth(value, options) <= maxWidth) return value;
  let cut = value;
  while (cut.length > 1 && textWidth(`${cut}…`, options) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function header(title: string, date: string): string {
  return (
    `<circle cx="${PAD + 7}" cy="${PAD + 11}" r="7" fill="${BRAND}"/>` +
    text(title, PAD + 26, PAD + 19, { size: 26, bold: true }) +
    text(date, WIDTH - PAD, PAD + 19, { size: 24, fill: MUTED, anchor: "end" })
  );
}

async function toPng(body: string, height: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><rect width="${WIDTH}" height="${height}" fill="#0B0B0B"/>${body}</svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

// --- Ранок ------------------------------------------------------------------

export async function renderPlanCard(data: {
  date: string;
  overdue: number;
  dueToday: number;
  revisions: number;
}): Promise<Buffer> {
  const columnWidth = (WIDTH - PAD * 2) / 3;
  const tiles: Array<{ value: number; label: string; hot?: boolean }> = [
    { value: data.overdue, label: "прострочено", hot: data.overdue > 0 },
    { value: data.dueToday, label: "на сьогодні" },
    { value: data.revisions, label: "правки" },
  ];
  let body = header("План на день", data.date);
  tiles.forEach((tile, index) => {
    const x = PAD + columnWidth * index + (index > 0 ? 24 : 0);
    if (index > 0) body += `<rect x="${PAD + columnWidth * index}" y="104" width="1" height="104" fill="#333333"/>`;
    body += text(String(tile.value), x, 170, { size: 72, bold: true, fill: tile.hot ? BRAND : INK });
    body += text(tile.label, x, 204, { size: 26, fill: SOFT });
  });
  return toPng(body, 240);
}

// --- Вечір ------------------------------------------------------------------

export type SummaryCardData = {
  title: string;
  date: string;
  /** Головне число, напр. «870–940». */
  value: string;
  /** Одиниця поруч, напр. «тис. грн». Знака ₴ у Roboto немає: вийшов би квадратик. */
  unit: string;
  caption: string;
  /** Наростаючий підсумок поточного періоду; може бути коротшим за previous. */
  current: number[];
  previous: number[];
  /** Скільки точок має вісь: цілий місяць чи тиждень. */
  totalPoints: number;
};

function linePath(values: number[], totalPoints: number, maxValue: number, top: number, height: number): string {
  const left = PAD + 2;
  const width = WIDTH - PAD * 2 - 4;
  const stepX = width / Math.max(1, totalPoints - 1);
  return values
    .map((value, index) => {
      const x = left + stepX * index;
      const y = top + height - (maxValue > 0 ? (value / maxValue) * height : 0);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export async function renderSummaryCard(data: SummaryCardData): Promise<Buffer> {
  let body = header(data.title, data.date);
  const valueOptions: TextOptions = { size: 68, bold: true };
  body += text(data.value, PAD, 156, valueOptions);
  body += text(data.unit, PAD + textWidth(data.value, valueOptions) + 14, 156, { size: 32, fill: SOFT });
  body += text(data.caption, PAD, 198, { size: 25, fill: SOFT });

  const top = 228;
  const chartHeight = 120;
  const maxValue = Math.max(1, ...data.current, ...data.previous);
  if (data.previous.length > 1) {
    body += `<path d="${linePath(data.previous, data.totalPoints, maxValue, top, chartHeight)}" fill="none" stroke="#6A6A6A" stroke-width="3"/>`;
  }
  if (data.current.length > 1) {
    body += `<path d="${linePath(data.current, data.totalPoints, maxValue, top, chartHeight)}" fill="none" stroke="${BRAND}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (data.current.length > 0) {
    const index = data.current.length - 1;
    const x = PAD + 2 + ((WIDTH - PAD * 2 - 4) / Math.max(1, data.totalPoints - 1)) * index;
    const y = top + chartHeight - (data.current[index] / maxValue) * chartHeight;
    body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${BRAND}"/>`;
  }
  return toPng(body, top + chartHeight + 36);
}

// --- Команда ----------------------------------------------------------------

export type TeamCardPerson = { name: string; minutes: number; avatar: Buffer | null };
export type TeamCardAbsent = { name: string; reason: string; avatar: Buffer | null };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function avatar(
  person: { name: string; avatar: Buffer | null },
  cx: number,
  cy: number,
  radius: number,
  id: string,
  dim: boolean
): string {
  if (!person.avatar) {
    return (
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${dim ? "#262626" : "#3A3A3A"}"/>` +
      text(initials(person.name), cx, cy + 8, { size: 22, fill: dim ? MUTED : INK, anchor: "middle" })
    );
  }
  const data = `data:image/png;base64,${person.avatar.toString("base64")}`;
  return (
    `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath>` +
    `<image x="${cx - radius}" y="${cy - radius}" width="${radius * 2}" height="${radius * 2}" xlink:href="${data}" href="${data}" clip-path="url(#${id})"/>`
  );
}

function shortDuration(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} хв`;
  return minutes > 0 ? `${hours} г ${minutes}` : `${hours} г`;
}

/** Смужка заповнюється від восьмигодинного дня, а не від найактивнішого. */
const FULL_DAY_MINUTES = 8 * 60;
const ROW_HEIGHT = 64;

export async function renderTeamCard(data: {
  date: string;
  people: TeamCardPerson[];
  absent: TeamCardAbsent[];
}): Promise<Buffer> {
  let body = header("Команда вчора", data.date);
  let y = 92;
  const barLeft = 262;
  const barRight = WIDTH - PAD - 110;
  const nameOptions: TextOptions = { size: 26 };

  [...data.people]
    .sort((a, b) => b.minutes - a.minutes)
    .forEach((person, index) => {
      const middle = y + ROW_HEIGHT / 2;
      const filled = Math.max(8, Math.min(1, person.minutes / FULL_DAY_MINUTES) * (barRight - barLeft));
      body += avatar(person, PAD + 26, middle, 26, `p${index}`, false);
      body += text(fit(person.name, barLeft - PAD - 76, nameOptions), PAD + 66, middle + 9, nameOptions);
      body += `<rect x="${barLeft}" y="${middle - 6}" width="${barRight - barLeft}" height="12" rx="6" fill="#1F1F1F"/>`;
      body += `<rect x="${barLeft}" y="${middle - 6}" width="${filled.toFixed(1)}" height="12" rx="6" fill="${BRAND}"/>`;
      body += text(shortDuration(person.minutes), WIDTH - PAD, middle + 9, { size: 26, anchor: "end" });
      y += ROW_HEIGHT;
    });

  if (data.absent.length > 0) {
    y += 8;
    body += `<rect x="${PAD}" y="${y}" width="${WIDTH - PAD * 2}" height="1" fill="#333333"/>`;
    y += 8;
    data.absent.forEach((person, index) => {
      const middle = y + ROW_HEIGHT / 2;
      body += avatar(person, PAD + 26, middle, 26, `a${index}`, true);
      body += text(fit(person.name, barLeft - PAD - 76, nameOptions), PAD + 66, middle + 9, { ...nameOptions, fill: SOFT });
      body += text(fit(person.reason, WIDTH - PAD - barLeft, { size: 24 }), WIDTH - PAD, middle + 8, {
        size: 24,
        fill: MUTED,
        anchor: "end",
      });
      y += ROW_HEIGHT;
    });
  }
  return toPng(body, y + 20);
}

/**
 * Ключ аватарки в бакеті avatars. Звичайно це avatar_path; у профілів, що
 * пережили міграцію, буває лише avatar_url — там той самий ключ
 * («avatars/<uuid>/…») або повна адреса нашого сховища. Чужі адреси
 * (https://… не з нашого сховища) не беремо: бот ходить лише у своє сховище.
 */
export function avatarStorageKey(profile: { avatar_path?: string | null; avatar_url?: string | null }): string | null {
  const path = profile.avatar_path?.trim();
  if (path) return path;
  const url = profile.avatar_url?.trim() ?? "";
  const stored = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/avatars\/([^?#]+)/.exec(url);
  if (stored) return decodeURIComponent(stored[1]);
  return url && !url.includes("://") && !url.startsWith("/") ? url : null;
}

/** Аватарка зі сховища → маленький PNG для картки. Будь-який збій = ініціали. */
export async function prepareAvatar(source: Buffer | null): Promise<Buffer | null> {
  if (!source) return null;
  try {
    return await sharp(source).resize(104, 104, { fit: "cover" }).png().toBuffer();
  } catch {
    return null;
  }
}

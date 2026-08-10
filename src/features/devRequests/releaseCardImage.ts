import { getAgencyLogo } from "@/lib/agencyAssets";
import { MODULE_DEFINITIONS, MODULE_GROUP_LABELS } from "@/lib/moduleAccess";
import { moduleKeyLabel } from "@/lib/projectMap";
import type { RequestKind, RequestZone } from "./types";
import { ZONE_LABELS, ZONE_TONE } from "./types";

/**
 * Кольори тонів у ТЕМНІЙ темі, як у index.css.
 *
 * Тут вони числами, а не через CSS-змінні, свідомо: картинка малюється на
 * canvas і живе поза деревом документа, тож `hsl(var(--…))` там не існує. Ці
 * значення — дзеркало dark-блоку index.css; міняючи тон там, поміняйте й тут.
 */
const TONE_COLORS: Record<string, { bg: string; fg: string }> = {
  info: { bg: "hsl(216 30% 16%)", fg: "hsl(216 100% 70%)" },
  accent: { bg: "hsl(263 34% 19%)", fg: "hsl(263 100% 81%)" },
  teal: { bg: "hsl(181 30% 15%)", fg: "hsl(176 74% 60%)" },
  festive: { bg: "hsl(338 32% 17%)", fg: "hsl(340 85% 74%)" },
  danger: { bg: "hsl(356 34% 16%)", fg: "hsl(356 100% 70%)" },
  success: { bg: "hsl(145 28% 15%)", fg: "hsl(143 62% 56%)" },
  warning: { bg: "hsl(33 40% 16%)", fg: "hsl(41 100% 64%)" },
  neutral: { bg: "hsl(0 0% 13%)", fg: "hsl(0 0% 63%)" },
};

/**
 * Іконка зони — ті самі значки lucide, що на картці в CRM, але вмальовані як
 * SVG-контури.
 *
 * ЧОМУ НЕ З КОМПОНЕНТА. Спершу малювали прямо з `ZONE_ICONS` через
 * `renderToStaticMarkup` — щоб джерело було одне. У браузерній збірці це
 * мовчки не спрацювало: помилки немає, картинка малюється, а іконки просто
 * нема. Перевірено окремо, що сам шлях «SVG у data-URL → Image → canvas»
 * робочий, тож справа саме в серверному рендерері. Тримати красиву ідею, яка
 * не працює, гірше за просту, яка працює.
 *
 * Контури скопійовані з lucide-react (`swatch-book`, `mouse-pointer-click`,
 * `workflow`, `database`, `key-round`, `gauge`). Міняючи іконку зони в
 * ZONE_ICONS, поміняйте й тут — інакше значок на картинці лишиться старим.
 */
const ZONE_ICON_SVG: Record<RequestZone, string> = {
  polish:
    '<path d="M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z"/><path d="M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7"/><path d="M 7 17h.01"/><path d="m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8"/>',
  ux: '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>',
  logic:
    '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  data: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  access:
    '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  speed: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
};

async function loadZoneIcon(zone: RequestZone, color: string): Promise<HTMLImageElement | null> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" ` +
    `stroke-linejoin="round">${ZONE_ICON_SVG[zone]}</svg>`;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Витягає розділ зі структурованого тіла картки.
 *
 * Розбір складає опис за сталою формою — «Що не так: … Де видно: … Як має
 * бути: …», — і саме звідти беруться три рядки картинки. Для карток, писаних
 * руками, розділів немає, і тоді працюють запасні варіанти нижче.
 */
function pickSection(body: string, heading: string): string {
  const pattern = new RegExp(`${heading}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*\\n|$)`, "i");
  const match = body.match(pattern);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

/** Перший абзац — запасний варіант, коли розділів у тілі немає. */
function firstParagraph(body: string): string {
  const [first] = body.split(/\n\s*\n/);
  return (first ?? "").replace(/\s+/g, " ").trim();
}

/** Що було не так. Беремо з розділу розбору, інакше — перший абзац опису. */
export function suggestBefore(body: string): string {
  return pickSection(body, "Що не так") || firstParagraph(body);
}

/**
 * Що тепер працює. «Як має бути» з розбору — це буквально опис результату,
 * тож він лягає сюди без переписування. Якщо розділу немає, лишаємо порожнім:
 * вигадувати за людину, що саме тепер працює, не можна.
 */
export function suggestAfter(body: string): string {
  return pickSection(body, "Як має бути");
}

export function suggestHowToCheck(moduleKey: string | null, body = ""): string {
  // «Де видно» з розбору конкретніше за шлях у меню: там названо саме те місце,
  // де людина це побачила.
  const seen = pickSection(body, "Де видно");
  if (seen) return seen;
  const label = moduleKeyLabel(moduleKey);
  if (!label) return "";
  const definition = MODULE_DEFINITIONS.find((item) => item.key === moduleKey);
  if (!definition) return label;
  const group = MODULE_GROUP_LABELS[definition.group];
  return group && !group.startsWith(label) ? `${group} → ${label}` : label;
}

/**
 * Картка «виправлено» як PNG — щоб кинути в чат тому, хто просив.
 *
 * ЧОМУ CANVAS, А НЕ БІБЛІОТЕКА. Тут малюється рівно один прямокутник із
 * чотирма рядками тексту. Готові html-to-image тягнуть за собою клонування
 * дерева, збирання стилів і шрифтів — заради картинки, яку простіше намалювати
 * руками, ніж описати бібліотеці. Плюс жодної нової залежності в бандлі.
 *
 * ЧОМУ ТІЛЬКИ ТЕМНА. Рішення власника: у світлому Telegram біла картка
 * зливається з тлом і читається як скріншот, а не як картка. Тому тема тут
 * зашита й НЕ залежить від теми застосунку.
 *
 * ЧОМУ ОДРАЗУ В БУФЕР. Картинку кидають у чат руками, тож файл на диску —
 * зайвий крок. Пишемо PNG у буфер обміну, далі Ctrl+V.
 */

/** Малюємо у подвійному масштабі: на екранах з високою щільністю інакше мило. */
const SCALE = 2;
const W = 560;
const PAD = 26;

const COLORS = {
  bgTop: "#171a1f",
  bgBottom: "#101216",
  border: "#2a2f38",
  title: "#ececf1",
  muted: "#8f8f9d",
  faint: "#6b6b78",
  divider: "#262b33",
  // М'яка заливка замість суцільної: зелений прямокутник на пів картки читався
  // як наліпка, наклеєна зверху. Тепер це підсвітка під текстом того ж кольору.
  //
  // Кольори — РІВНО тон `success` із темної теми, той самий, що в мітки зони
  // «швидкість». Доти позначка мала власний зелений, і на одній картці стояли
  // два різні відтінки одного кольору.
  badgeBg: "hsl(145 28% 15%)",
  badgeBorder: "hsl(145 30% 24%)",
  badgeText: "hsl(143 62% 56%)",
  chipBorder: "#2f3540",
  chipText: "#9aa1ad",
  accent: "#31c48d",
} as const;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif';

/** Що написати на позначці: тип картки каже, чим саме була робота. */
export const RELEASE_BADGE_LABELS: Record<RequestKind, string> = {
  bug: "Виправлено",
  friction: "Покращено",
  feature: "Додано",
};

export type ReleaseCardInput = {
  number: number;
  kind: RequestKind;
  title: string;
  /** Що було не так. Порожньо — рядок не малюється. */
  before: string;
  /** Що тепер працює інакше — одним-двома реченнями. */
  summary: string;
  /** Як переконатись. Порожньо — рядок не малюється. */
  howToCheck: string;
  /** Дата викочування; порожньо — беремо сьогодні. */
  releasedAt: string | null;
  /**
   * Мітки під назвою — ТІ САМІ й у тому ж порядку, що в нижньому ряду картки
   * на дошці: зона → тема → напрямок. Порожні не малюються.
   */
  zone: RequestZone | null;
  theme: string | null;
  moduleKey: string | null;
};

const DATE_FMT = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatDate(iso: string | null): string {
  const parsed = iso ? new Date(iso) : new Date();
  return Number.isNaN(parsed.getTime()) ? DATE_FMT.format(new Date()) : DATE_FMT.format(parsed);
}

/** Розбиває текст на рядки по ширині. Повертає рівно `maxLines`, останній з «…». */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length === maxLines) {
    // Обрізаємо ОСТАННІЙ рядок, поки трикрапка не влізе: інакше вона з'їжджає
    // за межу картки й обрізається сама.
    const rest = words.join(" ");
    const shown = lines.join(" ");
    if (shown.length < rest.length) {
      let last = lines[maxLines - 1];
      while (last && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1).trimEnd();
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

/** Галочка в позначці: маленька, у два штрихи, тим самим кольором що й текст. */
function checkMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.55);
  ctx.lineTo(x + size * 0.38, y + size * 0.9);
  ctx.lineTo(x + size, y + size * 0.12);
  ctx.stroke();
  ctx.restore();
}

/**
 * Мітка під назвою — рівно та сама, що на картці в CRM.
 *
 * Зона кольорова й з іконкою (там колір має ТІЛЬКИ вона), напрямок контурний.
 * Раніше обидві були сірими без значків, і картинка виглядала як чужа копія
 * дошки, а не як її продовження.
 */
function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  tone: { bg: string; fg: string } | null,
  icon: HTMLImageElement | null
): number {
  ctx.font = `500 11.5px ${FONT}`;
  const iconSpace = icon ? 19 : 0;
  const width = ctx.measureText(text).width + 22 + iconSpace;
  roundedRect(ctx, x, y, width, 22, 11);
  if (tone) {
    ctx.fillStyle = tone.bg;
    ctx.fill();
  } else {
    ctx.strokeStyle = COLORS.chipBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (icon) ctx.drawImage(icon, x + 9, y + 6, 11, 11);
  ctx.fillStyle = tone ? tone.fg : COLORS.chipText;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 11 + iconSpace, y + 12);
  ctx.textBaseline = "alphabetic";
  return width;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** SVG-логотип у растр. Same-origin, тож canvas не «псується» і toBlob працює. */
async function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = getAgencyLogo("dark");
  });
}

/**
 * Малює картку й повертає PNG.
 *
 * Висота рахується по факту: скільки рядків забрали назва й підписи, стільки
 * картка й буде. Фіксована висота або різала б довгі назви, або лишала б
 * порожнечу під короткими.
 */
export async function renderReleaseCard(input: ReleaseCardInput): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Перший прохід — лише щоб порахувати рядки й дізнатись висоту.
  const measure = (font: string, text: string, maxWidth: number, maxLines: number) => {
    ctx.font = font;
    return wrap(ctx, text, maxWidth, maxLines);
  };

  const inner = W - PAD * 2;
  const titleFont = `620 21px ${FONT}`;
  const bodyFont = `400 14px ${FONT}`;

  const titleLines = measure(titleFont, input.title, inner, 3);
  const LABEL_W = 84;
  const summaryLines = input.summary.trim() ? measure(bodyFont, input.summary, inner - LABEL_W, 3) : [];
  const beforeLines = input.before.trim() ? measure(bodyFont, input.before, inner - LABEL_W, 2) : [];
  const checkLines = input.howToCheck.trim() ? measure(bodyFont, input.howToCheck, inner - LABEL_W, 2) : [];

  const titleBlock = titleLines.length * 28;
  const summaryBlock = summaryLines.length ? summaryLines.length * 21 + 10 : 0;
  const beforeBlock = beforeLines.length ? beforeLines.length * 21 + 10 : 0;
  const checkBlock = checkLines.length ? checkLines.length * 21 + 10 : 0;
  const zoneTone = input.zone ? TONE_COLORS[ZONE_TONE[input.zone]] ?? null : null;
  const zoneIcon = input.zone && zoneTone ? await loadZoneIcon(input.zone, zoneTone.fg) : null;
  const chips: Array<{ text: string; tone: { bg: string; fg: string } | null; icon: HTMLImageElement | null }> = [];
  if (input.zone && zoneTone) chips.push({ text: ZONE_LABELS[input.zone], tone: zoneTone, icon: zoneIcon });
  if (input.theme) chips.push({ text: input.theme, tone: null, icon: null });
  const moduleLabel = moduleKeyLabel(input.moduleKey);
  if (moduleLabel) chips.push({ text: moduleLabel, tone: null, icon: null });
  const chipsBlock = chips.length ? 22 + 14 : 0;
  const height =
    PAD + 26 + 18 + titleBlock + chipsBlock + 8 + beforeBlock + summaryBlock + checkBlock + 28 + 34 + PAD - 8;

  canvas.width = W * SCALE;
  canvas.height = Math.round(height) * SCALE;
  ctx.scale(SCALE, SCALE);

  // Тло з ледь помітним переходом — щоб картка не читалась як плоский блок.
  const gradient = ctx.createLinearGradient(0, 0, W, height);
  gradient.addColorStop(0, COLORS.bgTop);
  gradient.addColorStop(1, COLORS.bgBottom);
  roundedRect(ctx, 0.5, 0.5, W - 1, height - 1, 18);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  let y = PAD;

  // Позначка + номер і дата в один рядок.
  const badge = RELEASE_BADGE_LABELS[input.kind];
  ctx.font = `600 12px ${FONT}`;
  const badgeWidth = ctx.measureText(badge).width + 38;
  roundedRect(ctx, PAD, y, badgeWidth, 24, 12);
  ctx.fillStyle = COLORS.badgeBg;
  ctx.fill();
  ctx.strokeStyle = COLORS.badgeBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  checkMark(ctx, PAD + 12, y + 7, 10, COLORS.badgeText);
  ctx.fillStyle = COLORS.badgeText;
  ctx.textBaseline = "middle";
  ctx.fillText(badge, PAD + 28, y + 12.5);

  ctx.font = `500 12px ${FONT}`;
  ctx.fillStyle = COLORS.faint;
  ctx.textAlign = "right";
  ctx.fillText(`REQ-${input.number} · ${formatDate(input.releasedAt)}`, W - PAD, y + 12);
  ctx.textAlign = "left";
  y += 24 + 18;

  // Назва.
  ctx.font = titleFont;
  ctx.fillStyle = COLORS.title;
  ctx.textBaseline = "alphabetic";
  for (const line of titleLines) {
    y += 21;
    ctx.fillText(line, PAD, y);
    y += 7;
  }
  y += 7;

  // Мітки: що чіпали й де. Стоять під назвою, як на самій картці в CRM.
  if (chips.length) {
    let chipX = PAD;
    for (const chip of chips) {
      chipX += drawChip(ctx, chipX, y, chip.text, chip.tone, chip.icon) + 7;
    }
    y += 22 + 14;
  }

  // «Було» і «Перевірити» — з підписом ліворуч, щоб читались як пояснення, а
  // не як продовження попереднього абзацу.
  const labelledRow = (label: string, lines: string[], startY: number): number => {
    if (!lines.length) return startY;
    let rowY = startY + 10;
    ctx.font = `600 12.5px ${FONT}`;
    ctx.fillStyle = COLORS.faint;
    ctx.fillText(label, PAD, rowY + 15);
    ctx.font = bodyFont;
    ctx.fillStyle = COLORS.muted;
    for (const line of lines) {
      rowY += 15;
      ctx.fillText(line, PAD + LABEL_W, rowY);
      rowY += 6;
    }
    return rowY;
  };

  // Три однакові рядки — «Було → Тепер → Перевірити». Раніше «тепер» висів
  // окремим абзацом без підпису, і картка читалась як опис проблеми з двома
  // примітками, а не як розповідь про зміну.
  y = labelledRow("Було", beforeLines, y);
  y = labelledRow("Тепер", summaryLines, y);
  y = labelledRow("Перевірити", checkLines, y);

  // Підвал: лінія й логотип.
  y += 20;
  // Від краю до краю: лінія з відступами ділила текст, а не картку, і виглядала
  // як ще один елемент верстки замість межі підвалу.
  ctx.strokeStyle = COLORS.divider;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
  y += 20;

  const logo = await loadLogo();
  if (logo && logo.width > 0) {
    const logoHeight = 18;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    ctx.drawImage(logo, PAD, y, logoWidth, logoHeight);
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/**
 * Кладе картинку в буфер обміну.
 *
 * Пишемо саме через ClipboardItem: writeText сюди не годиться, а зберігати
 * файл і просити людину його знайти — зайвий крок у сценарії «скинути в чат».
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

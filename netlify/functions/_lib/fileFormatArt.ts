/**
 * Види файлів і фірмові ілюстрації форматів для сторінки замовника (картка 357).
 * Ілюстрація одразу в розмітці: окремий запит заради значка не вартий затримки.
 */

export type FileKind = "image" | "pdf" | "source" | "other";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "tif", "tiff", "bmp", "heic"]);
const SOURCE_OPENS_IN: Record<string, string> = {
  ai: "Adobe Illustrator",
  cdr: "CorelDRAW",
  eps: "Adobe Illustrator або CorelDRAW",
  psd: "Adobe Photoshop",
};

export function fileExtension(name: string): string {
  return /\.([a-z0-9]{1,5})$/i.exec(name.trim())?.[1]?.toLowerCase() ?? "";
}

export function fileKind(name: string): FileKind {
  const extension = fileExtension(name);
  if (extension === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return SOURCE_OPENS_IN[extension] ? "source" : "other";
}

export function sourceOpensIn(name: string): string | null {
  return SOURCE_OPENS_IN[fileExtension(name)] ?? null;
}

const textLines = (color: string, ys: number[]) =>
  ys
    .map((y, i) => `<rect x="34" y="${y}" width="${i % 3 === 2 ? 32 : 52}" height="4" rx="2" fill="${color}" opacity=".32"/>`)
    .join("");

const vector = (c: string) =>
  `<path d="M34 80C42 44 74 44 86 72" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/><path d="M28 50H66" stroke="${c}" stroke-width="1.6" opacity=".45"/><circle cx="28" cy="50" r="3.4" fill="#fff" stroke="${c}" stroke-width="1.8"/><circle cx="66" cy="50" r="3.4" fill="#fff" stroke="${c}" stroke-width="1.8"/><rect x="29.5" y="75.5" width="9" height="9" rx="2" fill="#fff" stroke="${c}" stroke-width="2"/><rect x="81.5" y="67.5" width="9" height="9" rx="2" fill="#fff" stroke="${c}" stroke-width="2"/>`;

const layers = (c: string) =>
  `<path d="M60 36l28 15-28 15-28-15z" fill="${c}" opacity=".85"/><path d="M32 63l28 15 28-15" fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round" opacity=".55"/><path d="M32 75l28 15 28-15" fill="none" stroke="${c}" stroke-width="3.5" stroke-linejoin="round" opacity=".3"/>`;

const document_ = (c: string) =>
  `<rect x="34" y="42" width="34" height="7" rx="3.5" fill="${c}"/>${textLines(c, [54, 63, 72, 81, 90])}`;

const pdf = (c: string) =>
  `<rect x="34" y="42" width="52" height="26" rx="4" fill="${c}" opacity=".16"/><path d="M38 62l11-11 8 7 6-5 13 9" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>${textLines(c, [74, 83, 92])}`;

const table = (c: string) =>
  `<rect x="34" y="42" width="52" height="50" rx="5" fill="${c}" opacity=".12"/><path d="M39 42h42a5 5 0 0 1 5 5v8H34v-8a5 5 0 0 1 5-5z" fill="${c}" opacity=".85"/><path d="M34 67.5H86M34 80H86M51.5 55V92M68.5 55V92" stroke="${c}" stroke-width="2" opacity=".55"/>`;

const archive = (c: string) =>
  `${[42, 52, 62]
    .map((y) => `<rect x="54" y="${y}" width="6" height="5" fill="${c}"/><rect x="60" y="${y + 5}" width="6" height="5" fill="${c}" opacity=".6"/>`)
    .join("")}<rect x="51" y="74" width="18" height="18" rx="4" fill="${c}"/><rect x="56" y="82" width="8" height="4" rx="2" fill="#fff"/>`;

const slides = (c: string) =>
  `<rect x="32" y="44" width="56" height="36" rx="4" fill="${c}" opacity=".14"/><rect x="39" y="52" width="24" height="5" rx="2.5" fill="${c}"/><rect x="39" y="62" width="34" height="4" rx="2" fill="${c}" opacity=".4"/><path d="M60 80v10M50 92h20" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;

const video = (c: string) =>
  `<rect x="32" y="46" width="56" height="42" rx="6" fill="${c}" opacity=".14"/><path d="M54 57.5v19a2 2 0 0 0 3 1.7l15-9.5a2 2 0 0 0 0-3.4l-15-9.5a2 2 0 0 0-3 1.7z" fill="${c}"/>`;

const picture = (c: string) =>
  `<rect x="32" y="44" width="56" height="46" rx="6" fill="${c}" opacity=".14"/><circle cx="48" cy="58" r="5" fill="${c}"/><path d="M36 86l16-16 10 9 8-7 14 14" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;

type Art = readonly [string, (color: string) => string];

const FORMAT_ART: Record<string, Art> = {
  pdf: ["#E5322D", pdf],
  ai: ["#F08A00", vector],
  cdr: ["#1E9E5A", vector],
  eps: ["#6B4FD8", vector],
  psd: ["#1F7FD6", layers],
  doc: ["#2B62C9", document_],
  docx: ["#2B62C9", document_],
  rtf: ["#2B62C9", document_],
  xls: ["#17844F", table],
  xlsx: ["#17844F", table],
  csv: ["#17844F", table],
  ppt: ["#D24726", slides],
  pptx: ["#D24726", slides],
  zip: ["#B7791F", archive],
  rar: ["#B7791F", archive],
  "7z": ["#B7791F", archive],
  mp4: ["#7A3FD1", video],
  mov: ["#7A3FD1", video],
  avi: ["#7A3FD1", video],
  webm: ["#7A3FD1", video],
};

const NEUTRAL = "#6A6A65";

/** Аркуш із загнутим кутом, малюнком формату й плашкою розширення. */
export function renderFormatArt(name: string, className = "art"): string {
  const extension = fileExtension(name);
  const label = (extension || "файл").toUpperCase();
  const [color, art]: Art =
    FORMAT_ART[extension] ?? (IMAGE_EXTENSIONS.has(extension) ? [NEUTRAL, picture] : [NEUTRAL, document_]);
  const badgeWidth = 16 + label.length * 9.4;
  return `<svg class="${className}" aria-hidden="true" viewBox="0 0 120 140"><defs><linearGradient id="fsp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#F7F7F4"/></linearGradient></defs><path d="M28 8h48l30 30v86a10 10 0 0 1-10 10H28a10 10 0 0 1-10-10V18A10 10 0 0 1 28 8z" fill="url(#fsp)" stroke="#DEDED8" stroke-width="1.5"/><path d="M76 8l30 30H86a10 10 0 0 1-10-10z" fill="${color}" opacity=".9"/>${art(color)}<rect x="${60 - badgeWidth / 2}" y="108" width="${badgeWidth}" height="20" rx="10" fill="${color}"/><text x="60" y="122.5" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" letter-spacing=".6" fill="#fff">${label}</text></svg>`;
}

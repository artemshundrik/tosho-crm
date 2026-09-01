/**
 * Витяг og-тегів зі сторінки товару — БЕЗ моделі (REQ-233).
 *
 * ЧОМУ РЕГУЛЯРКАМИ, А НЕ ПАРСЕРОМ DOM. Нам треба рівно три поля з `<head>`, а
 * повноцінний парсер — це ще одна залежність у функції, яка бігає по тридцяти
 * сайтах поспіль. І чому не AI: тут нема чого розуміти, є що прочитати —
 * дослідження тридцяти лінків моделлю коштувало б стільки ж, скільки сам
 * розбір таблиці, і за нуль користі.
 */

export type OgTags = {
  title: string | null;
  imageUrl: string | null;
};

/** Далі `<head>` шукати немає сенсу, а великі сторінки заганяти в регулярки — дорого. */
const HEAD_SCAN_LIMIT = 300_000;

const META_TAG = /<meta\b[^>]*>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? "").trim();
}

function collectMeta(html: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of html.matchAll(META_TAG)) {
    const tag = match[0];
    const key = (readAttribute(tag, "property") ?? readAttribute(tag, "name") ?? "").toLowerCase();
    if (!key) continue;
    const content = readAttribute(tag, "content");
    if (!content) continue;
    // Перший виграє: сайти люблять дублювати og:image під різні розміри, і
    // перший у розмітці — той, який вони вважають головним.
    if (!found.has(key)) found.set(key, content);
  }
  return found;
}

/**
 * Прочитати назву й картинку товару.
 *
 * `baseUrl` потрібен, бо половина магазинів пише og:image відносним шляхом, і
 * без нього ми качали б `/img/mug.jpg` з нізвідки.
 */
export function extractOgTags(html: string, baseUrl: string): OgTags {
  const head = html.slice(0, HEAD_SCAN_LIMIT);
  const meta = collectMeta(head);

  const rawTitle =
    meta.get("og:title") ??
    meta.get("twitter:title") ??
    head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    null;

  const rawImage =
    meta.get("og:image") ??
    meta.get("og:image:secure_url") ??
    meta.get("og:image:url") ??
    meta.get("twitter:image") ??
    meta.get("twitter:image:src") ??
    null;

  const title = rawTitle ? decodeEntities(rawTitle).replace(/\s+/g, " ").trim() || null : null;

  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      const resolved = new URL(rawImage.trim(), baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        imageUrl = resolved.toString();
      }
    } catch {
      imageUrl = null;
    }
  }

  return { title, imageUrl };
}

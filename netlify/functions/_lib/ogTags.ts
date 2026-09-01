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
  /** Звідки взялась картинка — щоб у логах було видно, який шлях працює. */
  imageSource: "og" | "link" | "json-ld" | "itemprop" | "img" | null;
};

/** Далі `<head>` шукати немає сенсу, а великі сторінки заганяти в регулярки — дорого. */
const HEAD_SCAN_LIMIT = 300_000;

/**
 * Скільки тіла сторінки читаємо заради товарного `<img>`.
 *
 * ЗВІДКИ ЦЕ ВЗЯЛОСЬ. На файлі KMZ із двадцяти семи позицій сім лишились без
 * картинки, і flash-market.com.ua серед них: сторінка жива, фото товару в
 * розмітці є (`<img id="BigImage" src="/media/watermarked/…">`), а жодного
 * og-тега на сайті немає взагалі. Половина українських магазинів сувенірки —
 * такого ж віку, тож og як єдине джерело картинки — це відмова за формою.
 */
const BODY_SCAN_LIMIT = 400_000;

const META_TAG = /<meta\b[^>]*>/gi;
const LINK_TAG = /<link\b[^>]*>/gi;
const IMG_TAG = /<img\b[^>]*>/gi;
const JSON_LD_BLOCK = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/**
 * Службова графіка, яку не можна плутати з товаром.
 *
 * `watermark` тут навмисно НЕМАЄ: у flash-market фото товару лежить саме за
 * шляхом `/media/watermarked/`, і відкинути його означало б знову лишити
 * позицію порожньою.
 */
const NON_PRODUCT_IMAGE = /(logo|icon|sprite|favicon|banner|header|footer|pixel|blank|spacer|placeholder|loader|avatar|captcha)/i;

/** Класи й ідентифікатори, якими магазини підписують головне фото товару. */
const PRODUCT_IMAGE_HINT = /(bigimage|big-image|main-image|mainimage|product-image|productimage|product_photo|gallery|zoom|detail-image)/i;

/**
 * Ознаки картинки-заглушки в підписах самого тега.
 *
 * e-suvenir.com.ua без JavaScript віддає сторінку з єдиним зображенням
 * `alt="JavaScript is disabled"` — і без цієї перевірки саме воно поїхало б у
 * прорахунок як фото ручки. Порожнє місце чесніше за чужу заглушку.
 */
const STUB_IMAGE_HINT = /(javascript|disabled|fallback|error|stub|no-?image|noimage)/i;

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

function collectLinkHref(html: string, rel: string): string | null {
  for (const match of html.matchAll(LINK_TAG)) {
    const tag = match[0];
    if ((readAttribute(tag, "rel") ?? "").toLowerCase() !== rel) continue;
    const href = readAttribute(tag, "href");
    if (href) return href;
  }
  return null;
}

/** Перше рядкове `image` з будь-якого JSON-LD: у Schema.org воно і рядок, і масив, і об'єкт. */
function findJsonLdImage(html: string): string | null {
  for (const block of html.matchAll(JSON_LD_BLOCK)) {
    const raw = block[1];
    if (!raw || !/"image"/i.test(raw)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const found = walkForImage(parsed, 0);
    if (found) return found;
  }
  return null;
}

function walkForImage(node: unknown, depth: number): string | null {
  if (depth > 6 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = walkForImage(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  const image = record.image ?? record.contentUrl;
  if (typeof image === "string" && image.trim()) return image.trim();
  if (Array.isArray(image)) {
    const first = image.find((entry) => typeof entry === "string" && entry.trim());
    if (typeof first === "string") return first.trim();
    const nested = walkForImage(image, depth + 1);
    if (nested) return nested;
  }
  if (image && typeof image === "object") {
    const nested = walkForImage(image, depth + 1);
    if (nested) return nested;
  }
  for (const value of Object.values(record)) {
    const nested = walkForImage(value, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function findItempropImage(html: string): string | null {
  for (const match of html.matchAll(META_TAG)) {
    const tag = match[0];
    if ((readAttribute(tag, "itemprop") ?? "").toLowerCase() !== "image") continue;
    const content = readAttribute(tag, "content");
    if (content) return content;
  }
  for (const match of html.matchAll(IMG_TAG)) {
    const tag = match[0];
    if ((readAttribute(tag, "itemprop") ?? "").toLowerCase() !== "image") continue;
    const src = readAttribute(tag, "src") ?? readAttribute(tag, "data-src");
    if (src) return src;
  }
  return null;
}

/**
 * Товарне фото зі звичайного `<img>` — останній шлях, коли розмітки для
 * соцмереж на сайті немає взагалі.
 *
 * Спершу шукаємо картинку, яку сайт сам підписав як головну (`id="BigImage"`,
 * `class="product-image"` тощо), і лише потім беремо першу-ліпшу, відкинувши
 * очевидну службову графіку. Ліниві `data-src` рахуються нарівні з `src`: на
 * сайтах із відкладеним завантаженням у `src` лежить прозорий однопіксельник.
 */
function findProductImage(html: string): string | null {
  let fallback: string | null = null;
  for (const match of html.matchAll(IMG_TAG)) {
    const tag = match[0];
    const src = (readAttribute(tag, "src") ?? readAttribute(tag, "data-src") ?? "").trim();
    if (!src || src.startsWith("data:")) continue;
    if (NON_PRODUCT_IMAGE.test(src)) continue;

    const marker = [
      readAttribute(tag, "id") ?? "",
      readAttribute(tag, "class") ?? "",
      readAttribute(tag, "alt") ?? "",
    ].join(" ");
    if (STUB_IMAGE_HINT.test(marker)) continue;
    if (PRODUCT_IMAGE_HINT.test(marker) || PRODUCT_IMAGE_HINT.test(src)) return src;
    if (!fallback && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(src)) fallback = src;
  }
  return fallback;
}

function absoluteUrl(raw: string | null, baseUrl: string): string | null {
  if (!raw) return null;
  try {
    const resolved = new URL(decodeEntities(raw).trim(), baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Прочитати назву й картинку товару.
 *
 * `baseUrl` потрібен, бо половина магазинів пише og:image відносним шляхом, і
 * без нього ми качали б `/img/mug.jpg` з нізвідки.
 *
 * ЧОТИРИ ЗАПАСНІ ДЖЕРЕЛА КАРТИНКИ після og — не перестраховка, а замір: на
 * референсному файлі KMZ og-тегів не мала третина сайтів, серед них ті, де
 * фото товару лежить у звичайному `<img>` за два кліки від людини.
 */
export function extractOgTags(html: string, baseUrl: string): OgTags {
  const head = html.slice(0, HEAD_SCAN_LIMIT);
  const body = html.slice(0, BODY_SCAN_LIMIT);
  const meta = collectMeta(head);

  const rawTitle =
    meta.get("og:title") ??
    meta.get("twitter:title") ??
    head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    null;

  const title = rawTitle ? decodeEntities(rawTitle).replace(/\s+/g, " ").trim() || null : null;

  const candidates: Array<[OgTags["imageSource"], string | null]> = [
    [
      "og",
      meta.get("og:image") ??
        meta.get("og:image:secure_url") ??
        meta.get("og:image:url") ??
        meta.get("twitter:image") ??
        meta.get("twitter:image:src") ??
        null,
    ],
    ["link", collectLinkHref(head, "image_src")],
    ["json-ld", findJsonLdImage(body)],
    ["itemprop", findItempropImage(body)],
    ["img", findProductImage(body)],
  ];

  for (const [source, raw] of candidates) {
    const imageUrl = absoluteUrl(raw, baseUrl);
    if (imageUrl) return { title, imageUrl, imageSource: source };
  }

  return { title, imageUrl: null, imageSource: null };
}

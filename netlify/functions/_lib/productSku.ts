/**
 * Артикул товару зі сторінки постачальника (REQ-247).
 *
 * ЧОМУ ОКРЕМИЙ МОДУЛЬ, А НЕ ПОЛЕ В `ogTags`. Назва й фото — прикраса: не
 * доїхали, менеджер бачить порожнє місце й вписує сам. Артикул інший: за ним
 * замовляють у постачальника, і його ніхто не перевіряє очима. Тому в нього
 * своя вимога — НІКОЛИ НЕ ВГАДУВАТИ — і свій набір тестів, де половина
 * випадків негативні. Змішати це з пошуком картинки, де «взяли не ту» коштує
 * нуль, означало б розмити саме цю вимогу.
 *
 * ЧОМУ ТІЛЬКИ РОЗМІТКА ТОВАРУ. Замір 04.09.2026 на десятьох останніх адресах
 * постачальників із проду: артикул чесно лежить у розмітці в bergamo.ua,
 * ray-market.com.ua, hugo.com.ua (JSON-LD `sku`) і totobi.com.ua
 * (`itemprop="sku"`). Наївний пошук рядка `"sku"` по всій сторінці ловить у
 * dnipro-m.ua запис `"sku":"Код товару:"` — це словник перекладів інтерфейсу,
 * і в прорахунок поїхав би артикул «Код товару:». Тому JSON-LD читаємо лише
 * всередині `<script type="application/ld+json">` і лише під вузлом, у якого
 * `@type` містить слово product.
 *
 * ЧОМУ НЕ ЗІ СЛАГА АДРЕСИ. У flash-market.com.ua артикул є лише в адресі
 * (`/flash/S0801-6`), і спокуса дістати його звідти велика. Але той самий
 * прийом на totobi дає «uk-6» із
 * `/parasolya-trostina-odessa-tm-totobi-uk-6/`. Неправильний артикул гірший за
 * порожній: порожній видно, а неправильний мовчки їде в замовлення.
 */

export type ProductSku = {
  value: string;
  /** Звідки взяли — щоб у логах було видно, який шлях працює на якому сайті. */
  source: "json-ld" | "itemprop" | "meta" | "label";
};

/**
 * Скільки сторінки переглядаємо.
 *
 * ЧОМУ ТАК БАГАТО, коли `ogTags` обходиться 400 кілобайтами. Розмітка товару
 * лежить НЕ на початку сторінки: у bergamo.ua блок `"@type":"Product"` стоїть
 * на 733-й кілобайті з 783 (замір 04.09.2026) — тобто зі старою межею артикул
 * не знаходився взагалі, хоч у розмітці був. Дві мегабайти покривають
 * найважчу сторінку з проду (midocean, 1,4 МБ) із запасом, а самі регулярки
 * тут прості: один прохід по тексту без повернень.
 */
const SCAN_LIMIT = 2_000_000;

const META_TAG = /<meta\b[^>]*>/gi;
const JSON_LD_BLOCK = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Ключі Schema.org у порядку довіри: `sku` — артикул продавця, далі запасні. */
const PRODUCT_ID_KEYS = ["sku", "mpn", "productid"] as const;

/**
 * Заглушки, які магазини кладуть у поле артикула замість порожнього значення.
 *
 * `0` тут не випадковий: bergamo.ua віддає `"mpn":"0"` поруч зі справжнім
 * `"sku":"50040138-01"`, і без цієї перевірки нуль став би артикулом на будь-
 * якому сайті, де `sku` немає, а `mpn` є.
 */
const PLACEHOLDER_SKU = /^(0+|-+|n\/?a|none|null|undefined|немає|нет|відсутній)$/i;

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

/**
 * Схоже це на артикул чи на випадковий текст.
 *
 * Пропускаємо тільки те, що виглядає як код товару: латиниця/цифри з
 * розділювачами, обов'язково з цифрою всередині. «Кепка тракер» цю перевірку
 * не проходить, і це головне, чого від неї треба: у полі `sku` магазини
 * трапляється й назва, і категорія, і слово «Артикул».
 */
function sanitizeSku(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return sanitizeSku(String(raw));
  if (typeof raw !== "string") return null;

  const value = decodeEntities(raw).replace(/\s+/g, " ").trim().replace(/^[:№#]\s*/, "");
  if (value.length < 2 || value.length > 40) return null;
  if (PLACEHOLDER_SKU.test(value)) return null;
  // Артикул із двох слів буває («S0801 6»), із п'яти — це вже опис товару.
  if (value.split(" ").length > 2) return null;
  if (!/\d/.test(value)) return null;
  // Кирилиця в артикулі трапляється, але суцільне слово кирилицею — це підпис
  // («Код товару»), а не код. Дозволяємо лише як частину коду з латиницею/цифрами.
  if (!/[A-Za-z0-9]/.test(value)) return null;
  if (/[<>"'`\\]/.test(value)) return null;
  return value;
}

function walkForProductId(node: unknown, depth: number): string | null {
  if (depth > 6 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = walkForProductId(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  const type = String(record["@type"] ?? "").toLowerCase();
  if (type.includes("product")) {
    // Ключі читаємо без огляду на регістр: у розмітці трапляється і `productID`,
    // і `productId`, і `Sku`.
    const lowered = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
    for (const key of PRODUCT_ID_KEYS) {
      const value = sanitizeSku(lowered.get(key));
      if (value) return value;
    }
  }

  for (const value of Object.values(record)) {
    const found = walkForProductId(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function fromJsonLd(html: string): string | null {
  for (const block of html.matchAll(JSON_LD_BLOCK)) {
    const raw = block[1];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const found = walkForProductId(parsed, 0);
    if (found) return found;
  }
  return null;
}

/** Мікророзмітка: `<meta itemprop="sku">` у totobi, `<span itemprop="sku">` в інших. */
function fromItemprop(html: string): string | null {
  for (const match of html.matchAll(META_TAG)) {
    const tag = match[0];
    if ((readAttribute(tag, "itemprop") ?? "").toLowerCase() !== "sku") continue;
    const value = sanitizeSku(readAttribute(tag, "content"));
    if (value) return value;
  }

  const element = html.match(
    /<(span|div|p|b|strong|dd|td)\b[^>]*\bitemprop\s*=\s*["']sku["'][^>]*>([\s\S]{0,160}?)<\/\1>/i
  );
  if (element) {
    const text = element[2].replace(/<[^>]*>/g, " ");
    const value = sanitizeSku(text);
    if (value) return value;
  }
  return null;
}

/** Товарні meta-теги Facebook, якими користуються магазини на готових рушіях. */
function fromMeta(html: string): string | null {
  for (const match of html.matchAll(META_TAG)) {
    const tag = match[0];
    const key = (readAttribute(tag, "property") ?? readAttribute(tag, "name") ?? "").toLowerCase();
    if (key !== "product:retailer_item_id" && key !== "product:sku") continue;
    const value = sanitizeSku(readAttribute(tag, "content"));
    if (value) return value;
  }
  return null;
}

/**
 * Артикул словами у видимому тексті: «Артикул: S0801-6», «Код товару 12345».
 *
 * НАЙНЕБЕЗПЕЧНІШИЙ ШЛЯХ, і тому останній. У першій пробі 04.09.2026 він
 * повертав `vachi` і `nits` — уламки випадкових слів, бо `SKU` без меж слова
 * ловиться всередині чужих слів, а `<script>` повний схожого сміття. Тому:
 * скрипти й стилі вирізаються, підпис мусить стояти окремим словом, а те, що
 * знайшлось, проходить `sanitizeSku` нарівні з рештою.
 */
const LABEL_PATTERN = new RegExp(
  String.raw`(?:^|[\s>(\[])(?:артикул(?:\s+товару)?|код\s+товару|код\s+товара|арт\.?|sku)\s*[:№#]?\s*` +
    String.raw`(?:<[^>]*>\s*){0,3}([A-Za-z0-9][A-Za-z0-9._\/-]{1,38})`,
  "i"
);

function fromLabel(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const match = text.match(LABEL_PATTERN);
  return match ? sanitizeSku(match[1]) : null;
}

/**
 * Прочитати артикул зі сторінки товару.
 *
 * Порядок джерел — від найнадійнішого до найбруднішого. Нічого не знайшлось —
 * `null`, і це нормальна відповідь: у flash-market.com.ua артикула на сторінці
 * справді немає, і порожнє поле чесніше за вигадане.
 */
export function extractProductSku(html: string): ProductSku | null {
  const page = html.slice(0, SCAN_LIMIT);

  const candidates: Array<[ProductSku["source"], string | null]> = [
    ["json-ld", fromJsonLd(page)],
    ["itemprop", fromItemprop(page)],
    ["meta", fromMeta(page)],
    ["label", fromLabel(page)],
  ];

  for (const [source, value] of candidates) {
    if (value) return { value, source };
  }
  return null;
}

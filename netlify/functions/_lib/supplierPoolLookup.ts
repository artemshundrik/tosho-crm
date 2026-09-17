import type { SupabaseClient } from "@supabase/supabase-js";

import { isTrackingParam } from "../../../src/features/quotes/quote-import/productUrl";
import { baseProductName, type SupplierPoolRow } from "../../../src/lib/supplierPoolRows";

/**
 * Товар за посиланням шукається СПЕРШУ В НАШОМУ ПУЛІ (REQ-285).
 *
 * ЩО БУЛО НЕ ТАК. Менеджер вставляв посилання, і CRM бігла шкребти чужий сайт
 * навіть тоді, коли той самий товар уже лежав у `tosho.supplier_products` —
 * з назвою, фото, артикулом і НАШОЮ ціною. Найгірше це виглядало на
 * e-suvenir.com.ua: їхній сайт — Magento PWA Studio, тобто будь-яка адреса
 * віддає ту саму оболонку на 2312 байтів із кодом 200. Розбирач чесно доходив
 * до `<title>` і клав у прорахунок «Сувенірна продукція для рекламних агенцій
 * | Е-Сувенір UA» без фото — при тому, що в пулі лежала «Записна книжка
 * 'Туксон' А5 кольоровий зріз Mem'O! ТМ» за 287,70 з чотирма кольорами.
 *
 * ЗАМІРЯНО НА ПРОДІ 16.09.2026, на всіх 22 посиланнях, які менеджери справді
 * вставляли: 17 знайшлись у пулі простим порівнянням рядка — це ВСІ 17, що
 * вели на наші сайти. П'ять промахів (borsa, epicentrk, hotline, lavasta) —
 * магазини, яких у пулі немає й бути не може, і для них третя сходинка
 * (og-теги) лишається єдиним шляхом.
 *
 * ЧОМУ АДРЕСА, А НЕ АРТИКУЛ. Спокуса взяти артикул велика — він «універсальний
 * ключ товару». На наших даних він таким не є:
 *   • 3781 артикул із 40 876 (9,2%) зустрічається БІЛЬШ НІЖ В ОДНОГО
 *     постачальника — це 7656 рядків, тобто кожен одинадцятий підтягнув би
 *     ціну не того магазину;
 *   • усередині постачальника він теж не ключ: у Берітекса 2184 рядки на 77
 *     артикулів, у Топтайма 1823 на 166 — там це код моделі на всі кольори;
 *   • його ще треба вичитати зі сторінки, а це відмовляє рівно там, де
 *     потрібно найбільше: на порожній оболонці Е-Сувеніра артикула немає.
 * Тому артикул — ДРУГА сходинка й обов'язково звужена до одного постачальника
 * з того ж домену. У цих межах він однозначний.
 *
 * ЧОМУ БЕЗ `security definer`, хоч сусідній `search_supplier_pool` його має.
 * Там причина конкретна: RLS не пускає `ILIKE` у тригрaмний покажчик, бо
 * `texticlike` не leakproof. Тут порівняння рівністю, а `texteq` leakproof —
 * планувальник зводить його в `Index Cond` і під політикою теж. Тобто
 * звичайного клієнта користувача досить, і чужої команди він, як і раніше, не
 * побачить.
 */

/**
 * Скільки рядків пулу тягнемо за одним посиланням.
 *
 * Стеля не декоративна: у Берітекса на одну адресу припадає 28 рядків, у Треле
 * 12, у Топтайма 11 — це кольори й розміри того самого товару. Сотня з запасом
 * покриває найширшу картку й лишається дешевою.
 */
const MAX_ROWS = 100;

/**
 * Колонки, які беремо. `attrs` цілком НЕ БЕРЕМО навмисно: на avanprint воно
 * важить 5,3 МБ (там описи під документи), і тягти його заради кольору означало
 * б качати мегабайти на кожну вставку посилання. Колір і розмір дістаємо
 * точково — так само, як це робить `search_supplier_pool`.
 */
const SELECT_COLUMNS =
  "id,supplier_slug,article,name,vendor,category,price,currency,price_kind,url,image_url,is_active,color:attrs->>color,size:attrs->>size";

export type SupplierPoolMatch = {
  supplierSlug: string;
  /** Якою сходинкою драбинки знайшлось — це видно менеджеру й лежить у metadata. */
  matchedBy: "url" | "article";
  /** Назва без хвоста в дужках: у дужках постачальники пишуть колір. */
  name: string;
  /**
   * Артикул — АБО спільний на всі варіанти, АБО жодного.
   *
   * Артикул це те, чим замовляють. У Е-Сувеніра кольори одного товару мають
   * РІЗНІ артикули (`16225008/1`, `16225002/1`), тож узяти перший-ліпший
   * означало б тихо замовити не той колір — помилка, яку видно вже на складі.
   * Порожнє поле менеджер помітить і заповнить; чужий артикул він прийме за
   * правильний. Коли колір справді оберуть (`rows`), артикул приїде разом
   * із ним.
   */
  article: string | null;
  /** Артикули варіантів розійшлись — значить, колір ще не обрано. */
  ambiguousArticle: boolean;
  imageUrl: string | null;
  /** Найменша серед варіантів: у картці це орієнтир «від». */
  price: number | null;
  currency: string | null;
  priceKind: SupplierPoolRow["price_kind"] | null;
  /** Рядок, за яким підставляється собівартість. */
  rowId: string;
  /** Усі варіанти за цим посиланням — з них збирається вибір кольору. */
  rows: SupplierPoolRow[];
};

type PoolQueryRow = SupplierPoolRow & { is_active?: boolean | null };

/**
 * Адреса в тих написаннях, у яких вона могла лягти в пул.
 *
 * НОРМАЛІЗУЄМО ОБИДВА БОКИ НЕ МОЖНА — тому й кандидати. Порівняння в базі має
 * лишитись рівністю (див. заголовок модуля про leakproof), а привести збережені
 * адреси до канонічного вигляду означало б або обчислювану колонку, або
 * дублювання цієї логіки в SQL. Дешевше й чесніше надіслати список написань і
 * спитати одним `in`.
 *
 * ЩО САМЕ ВАРІЮЄМО — з заміру збережених адрес 16.09.2026 (43 987 рядків):
 * 30 155 із кінцевим слешем і 13 832 без; 6456 із `www.` (увесь Папірус);
 * жодної з параметрами чи якорем; жодної на `http://`. Регістр шляху НЕ
 * чіпаємо: 4204 адреси мають великі літери, і в ENEY це шістнадцяткові коди
 * кирилиці (`51%D0%BA050s07`) — зведення до малих зламало б рівно їх.
 */
export function buildUrlCandidates(raw: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return [];
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return [];

  const host = parsed.host.toLowerCase();
  const bareHost = host.replace(/^www\./, "");
  const hosts = [host, bareHost, `www.${bareHost}`];

  const keptParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    if (!isTrackingParam(key)) keptParams.append(key, value);
  }
  const queries = [parsed.search, keptParams.toString() ? `?${keptParams}` : "", ""];

  const path = parsed.pathname;
  const paths = path.endsWith("/") ? [path, path.replace(/\/+$/, "")] : [path, `${path}/`];

  const schemes = parsed.protocol === "http:" ? ["https:", "http:"] : ["https:"];

  const candidates = new Set<string>();
  // Порядок навмисний: перший кандидат — адреса як є (з точністю до домену в
  // малих літерах), далі розходимось. Це не впливає на пошук (`in` шукає всі
  // одразу), зате робить перший рядок у логах упізнаваним.
  for (const scheme of schemes) {
    for (const h of hosts) {
      for (const p of paths) {
        for (const q of queries) {
          candidates.add(`${scheme}//${h}${p || "/"}${q}`);
        }
      }
    }
  }
  return [...candidates];
}

/**
 * Постачальник за доменом. Ключі пулу — це самі домени (`eney.com.ua`,
 * `papirus-opt.com`), тож списку відповідностей не треба й заводити: він би
 * протух на першому ж новому джерелі. Домену, якого в пулі немає, просто нічого
 * не знайдеться.
 */
export function supplierSlugForUrl(raw: string): string | null {
  try {
    return new URL(raw.trim()).host.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Головний рядок і його варіанти.
 *
 * ФОТО ВИРІШУЄ, а не порядок: рядок без картинки цілком може стояти першим, і
 * взяти його означало б лишити позицію без фото при повному пулі під рукою.
 *
 * ЧУЖОГО ПОСТАЧАЛЬНИКА ВІДКИДАЄМО. Адреса належить одному магазину за
 * побудовою, але артикульна сходинка теоретично може принести рядки з двох —
 * і тоді картка склеїла б кольори різних товарів із різними цінами.
 */
export function pickPoolMatch(rows: PoolQueryRow[], matchedBy: SupplierPoolMatch["matchedBy"]): SupplierPoolMatch | null {
  if (rows.length === 0) return null;

  const active = rows.filter((entry) => entry.is_active !== false);
  const pool = active.length > 0 ? active : rows;

  const supplierSlug = pool[0].supplier_slug;
  const mine = pool.filter((entry) => entry.supplier_slug === supplierSlug).slice(0, MAX_ROWS);

  const primary = mine.find((entry) => entry.image_url) ?? mine[0];
  const prices = mine.map((entry) => entry.price).filter((value): value is number => typeof value === "number");
  const articles = new Set(mine.map((entry) => entry.article).filter((value): value is string => Boolean(value)));
  const ambiguousArticle = articles.size > 1;

  return {
    supplierSlug,
    matchedBy,
    name: baseProductName(primary.name),
    article: ambiguousArticle ? null : primary.article,
    ambiguousArticle,
    imageUrl: primary.image_url,
    price: prices.length > 0 ? Math.min(...prices) : null,
    currency: primary.currency ?? null,
    priceKind: primary.price_kind ?? null,
    rowId: primary.id,
    rows: mine.map(({ is_active: _ignored, ...row }) => row),
  };
}

/**
 * ПЕРША СХОДИНКА — точний збіг адреси.
 *
 * Не знайшлось — повертаємо `null`, і викликач іде читати сторінку, як робив
 * досі. Помилка запиту теж дає `null`: пул — це прискорювач, і його відмова не
 * має валити імпорт.
 */
export async function findPoolByUrl(client: SupabaseClient, url: string): Promise<SupplierPoolMatch | null> {
  const candidates = buildUrlCandidates(url);
  if (candidates.length === 0) return null;

  const { data, error } = await client
    .schema("tosho")
    .from("supplier_products")
    .select(SELECT_COLUMNS)
    .in("url", candidates)
    .limit(MAX_ROWS);
  if (error) {
    console.error("supplierPoolLookup: url lookup failed", error.message);
    return null;
  }
  return pickPoolMatch((data ?? []) as unknown as PoolQueryRow[], "url");
}

/**
 * ДРУГА СХОДИНКА — артикул, обов'язково в межах постачальника з того ж домену.
 *
 * Кличеться ПІСЛЯ читання сторінки, і це не недогляд, а порядок речей: артикул
 * узятись більше нізвідки. Тобто ця сходинка не економить похід по сайту — вона
 * рятує вже прочитану сторінку, з якої вийшов логотип замість фото або
 * заголовок магазину замість назви.
 */
export async function findPoolByArticle(
  client: SupabaseClient,
  url: string,
  sku: string | null | undefined
): Promise<SupplierPoolMatch | null> {
  const article = sku?.trim();
  const slug = supplierSlugForUrl(url);
  if (!article || !slug) return null;

  const { data, error } = await client
    .schema("tosho")
    .from("supplier_products")
    .select(SELECT_COLUMNS)
    .eq("supplier_slug", slug)
    .eq("article", article)
    .limit(MAX_ROWS);
  if (error) {
    console.error("supplierPoolLookup: article lookup failed", error.message);
    return null;
  }
  return pickPoolMatch((data ?? []) as unknown as PoolQueryRow[], "article");
}

/** Обидві сходинки поспіль — для викликача, у якого артикул уже на руках. */
export async function findInSupplierPool(
  client: SupabaseClient,
  params: { url: string; sku?: string | null }
): Promise<SupplierPoolMatch | null> {
  return (await findPoolByUrl(client, params.url)) ?? (await findPoolByArticle(client, params.url, params.sku));
}

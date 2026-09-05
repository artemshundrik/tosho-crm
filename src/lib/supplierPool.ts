/**
 * Пул товарів постачальників — читальний шар агрегатора (REQ-250#p3).
 * Таблиця: tosho.supplier_products (scripts/catalog-supplier-products.sql).
 *
 * НАВІЩО ОКРЕМИЙ МОДУЛЬ, А НЕ ЩЕ ОДИН ЗАПИТ У СТОРІНЦІ. Пул — це інше джерело,
 * ніж каталог: тисячі рядків, серверний пошук, свої правила показу. Каталог
 * лишається каталогом (250 перевірених моделей), пул — поруч. Змішати їх у
 * одному запиті означало б утопити перевірене прайсом (рішення 04.09, §6а).
 *
 * ДВІ РЕЧІ, ЯКІ ТУТ РОБЛЯТЬСЯ НАВМИСНО:
 *
 * 1. ГРУПУВАННЯ ЗА АРТИКУЛОМ. У фіді один товар лежить рядком на кожен розмір і
 *    колір: berrytex — 2098 рядків на 74 артикули. Показати менеджеру 2098
 *    позицій означає показати той самий JHK POLO сорок разів. Тому назовні йде
 *    один запис на артикул із лічильником варіантів і діапазоном цін.
 *
 * 2. ЛАТИНИЦЯ ↔ КИРИЛИЦЯ. Заміряно живцем: пошук «поло» давав НУЛЬ, бо в базі
 *    назва «JHK KID POLO LS». Менеджер набирає кирилицею те, що в постачальника
 *    записано латиницею. Тому запит іде і за оригіналом, і за транслітерацією.
 *    Це не заміна `unaccent` (його в базі досі немає, §7), а те, що працює вже.
 */

import { db } from "@/lib/supabaseClient";

export type SupplierPoolRow = {
  id: string;
  supplier_slug: string;
  article: string | null;
  name: string;
  vendor: string | null;
  category: string | null;
  price: number | null;
  currency: string;
  price_kind: "retail" | "wholesale";
  url: string | null;
  image_url: string | null;
};

/** Один товар для показу: артикул із згорнутими в нього варіантами. */
export type SupplierPoolProduct = {
  key: string;
  supplierSlug: string;
  article: string | null;
  name: string;
  vendor: string | null;
  category: string | null;
  url: string | null;
  imageUrl: string | null;
  currency: string;
  priceKind: "retail" | "wholesale";
  /** Мінімальна й максимальна ціна серед варіантів (часто однакові). */
  priceMin: number | null;
  priceMax: number | null;
  variantCount: number;
};

/**
 * Кирилиця → латиниця для пошукового терміна. Свідомо груба: мета не
 * транслітерувати правильно, а зловити «поло» → «polo», «джхк» → «dzhkhk» тощо.
 * Багатолітерні поєднання йдуть першими, інакше «ж» з'їсть «зг».
 */
const TRANSLIT: Array<[RegExp, string]> = [
  [/щ/g, "shch"], [/ж/g, "zh"], [/ч/g, "ch"], [/ш/g, "sh"], [/ю/g, "yu"], [/я/g, "ya"],
  [/є/g, "ie"], [/ї/g, "i"], [/х/g, "kh"], [/ц/g, "ts"], [/й/g, "i"],
  [/а/g, "a"], [/б/g, "b"], [/в/g, "v"], [/г/g, "h"], [/ґ/g, "g"], [/д/g, "d"],
  [/е/g, "e"], [/з/g, "z"], [/и/g, "y"], [/і/g, "i"], [/к/g, "k"], [/л/g, "l"],
  [/м/g, "m"], [/н/g, "n"], [/о/g, "o"], [/п/g, "p"], [/р/g, "r"], [/с/g, "s"],
  [/т/g, "t"], [/у/g, "u"], [/ф/g, "f"], [/ь/g, ""], [/'/g, ""],
];

export function transliterateSearchTerm(term: string): string {
  let out = term.toLowerCase();
  for (const [from, to] of TRANSLIT) out = out.replace(from, to);
  return out;
}

/** PostgREST `or=` не любить коми й дужки всередині значення — прибираємо. */
const sanitize = (term: string) => term.replace(/[,()*%\\]/g, " ").trim();

/**
 * Знайти товари постачальників. Порожній запит повертає порожньо: пул великий,
 * і показувати «все підряд» у вікні прорахунку сенсу немає.
 */
export async function searchSupplierPool(
  rawTerm: string,
  options: { limit?: number } = {}
): Promise<SupplierPoolProduct[]> {
  const term = sanitize(rawTerm);
  if (term.length < 2) return [];

  const variants = new Set<string>([term.toLowerCase()]);
  const translit = transliterateSearchTerm(term);
  if (translit && translit !== term.toLowerCase()) variants.add(translit);

  const filters: string[] = [];
  for (const value of variants) {
    filters.push(`name.ilike.*${value}*`);
    filters.push(`article.ilike.*${value}*`);
  }

  // Беремо із запасом: після згортання за артикулом записів стане помітно менше.
  const rowLimit = (options.limit ?? 40) * 12;

  const { data, error } = await db
    .from("supplier_products" as never)
    .select("id,supplier_slug,article,name,vendor,category,price,currency,price_kind,url,image_url")
    .eq("is_active", true)
    .or(filters.join(","))
    .limit(rowLimit);

  if (error) throw error;
  return groupSupplierPoolRows((data ?? []) as unknown as SupplierPoolRow[], options.limit ?? 40);
}

/**
 * Згорнути рядки в товари. Ключ — артикул у межах постачальника; коли артикула
 * немає (мапа сайту, ручний запис), товар лишається сам собою за id.
 */
export function groupSupplierPoolRows(rows: SupplierPoolRow[], limit: number): SupplierPoolProduct[] {
  const byKey = new Map<string, SupplierPoolProduct>();

  for (const row of rows) {
    const key = row.article ? `${row.supplier_slug}::${row.article}` : `id::${row.id}`;
    const existing = byKey.get(key);
    const price = typeof row.price === "number" ? row.price : null;

    if (!existing) {
      byKey.set(key, {
        key,
        supplierSlug: row.supplier_slug,
        article: row.article,
        // Назва варіанта несе «(колір …, розмір …)» — для картки товару, що
        // згортає всі варіанти, це шум. Ріжемо від ПЕРШОЇ дужки до кінця, а не
        // «останню пару»: у berrytex дужки вкладені — «(колір білий (WH),
        // розмір 1/2)», і акуратний зріз пари їх не бере (видно в прев'ї).
        name: row.name.replace(/\s*\(.*$/, "").trim() || row.name,
        vendor: row.vendor,
        category: row.category,
        url: row.url,
        imageUrl: row.image_url,
        currency: row.currency,
        priceKind: row.price_kind,
        priceMin: price,
        priceMax: price,
        variantCount: 1,
      });
      continue;
    }

    existing.variantCount += 1;
    if (price !== null) {
      existing.priceMin = existing.priceMin === null ? price : Math.min(existing.priceMin, price);
      existing.priceMax = existing.priceMax === null ? price : Math.max(existing.priceMax, price);
    }
    if (!existing.imageUrl && row.image_url) existing.imageUrl = row.image_url;
  }

  return [...byKey.values()].slice(0, limit);
}

/** «544,84 грн» або «544,84 – 612,00 грн», коли варіанти коштують по-різному. */
export function formatSupplierPoolPrice(product: SupplierPoolProduct): string | null {
  if (product.priceMin === null) return null;
  const money = (value: number) =>
    value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const suffix = product.currency === "UAH" ? "грн" : product.currency;
  if (product.priceMax !== null && product.priceMax !== product.priceMin) {
    return `${money(product.priceMin)} – ${money(product.priceMax)} ${suffix}`;
  }
  return `${money(product.priceMin)} ${suffix}`;
}

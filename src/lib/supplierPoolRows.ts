/**
 * Пул постачальників — типи й чиста логіка показу. Окремо від `supplierPool.ts`
 * навмисно: там запит до бази, а він тягне `supabaseClient`, який на старті
 * чіпає `window`. Тести чистої логіки бігають у `node` (vitest.config.ts), і без
 * цього поділу вони падали б на браузерній глобалі, а не на самій логіці.
 *
 * ГРУПУВАННЯ ЗА НАЗВОЮ. У фіді один товар лежить рядком на кожен розмір і
 * колір: berrytex — 2098 рядків на 74 товари, totobi — 3150 на 679. Показати
 * менеджеру 3150 позицій означає показати ту саму «Футболку SoftStyle 153»
 * 55 разів. Тому назовні йде один запис на товар із варіантами всередині.
 *
 * Ключ саме назва, а НЕ артикул, хоч так було спочатку. У berrytex колірні
 * рядки ділять один артикул, і групування за ним працювало; у totobi кожен
 * колір має СВІЙ `vendorCode` — за артикулом там згорталось би нічого.
 * Перевірено на живих даних: за назвою berrytex дає ті самі 74 картки, а
 * bergamo (2655 унікальних кодів) — ті самі 2655. Тобто заміна ключа нічого не
 * зламала в наявних постачальниках і полагодила нового.
 *
 * Наслідок для артикула картки: він показується, лише коли ВСІ варіанти ділять
 * один код. Інакше на картці стояв би артикул випадкового кольору — саме те
 * число, яке менеджер скопіює в замовлення й привезе не той товар.
 *
 * ЛАТИНИЦЯ ↔ КИРИЛИЦЯ. Заміряно живцем: пошук «поло» давав НУЛЬ, бо в базі
 * назва «JHK KID POLO LS». Менеджер набирає кирилицею те, що в постачальника
 * записано латиницею. Тому запит іде і за оригіналом, і за транслітерацією.
 * Це не заміна `unaccent` (його в базі досі немає, §7), а те, що працює вже.
 */

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
  /** `attrs->>color` з фіда, а не вся `attrs`: там ще лежать розміри, і тягти
   *  їх у типовий пошук означало б качати сотні кілобайт заради підпису. */
  color: string | null;
};

/** Одне виконання товару — здебільшого колір. Те, що менеджер зрештою замовляє. */
export type SupplierPoolVariant = {
  id: string;
  article: string | null;
  /** «чорний», «колір білий (WH), розмір 1/2» — як його називає постачальник. */
  label: string | null;
  price: number | null;
  imageUrl: string | null;
  url: string | null;
};

/** Один товар для показу: назва зі згорнутими в неї варіантами. */
export type SupplierPoolProduct = {
  key: string;
  supplierSlug: string;
  /** Лише коли всі варіанти ділять один код; інакше артикул живе у варіантах. */
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
  variants: SupplierPoolVariant[];
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
export const sanitizeSearchTerm = (term: string) => term.replace(/[,()*%\\]/g, " ").trim();

/**
 * Назва товару без «(колір …, розмір …)». Ріжемо від ПЕРШОЇ дужки до кінця, а
 * не «останню пару»: у berrytex дужки вкладені — «(колір білий (WH), розмір
 * 1/2)», і акуратний зріз пари їх не бере (видно в прев'ї).
 */
export function baseProductName(name: string): string {
  return name.replace(/\s*\(.*$/, "").trim() || name;
}

/**
 * Підпис варіанта. Порядок джерел — від точного до запасного: колір із фіда,
 * потім дужковий хвіст назви (berrytex несе колір і розмір саме там), потім
 * артикул. Порожній підпис кращий за вигаданий, тому в кінці null.
 */
function variantLabel(row: SupplierPoolRow): string | null {
  const color = row.color?.trim();
  if (color) return color;
  const tail = row.name.match(/\(([\s\S]*)\)\s*$/)?.[1]?.trim();
  if (tail) return tail;
  return row.article ?? null;
}

/**
 * Згорнути рядки в товари. Ключ — назва в межах постачальника (чому саме вона —
 * у шапці модуля). Товар без назви лишається сам собою за id: у базі поле not
 * null, але порожній рядок туди пролізти може.
 */
export function groupSupplierPoolRows(rows: SupplierPoolRow[], limit: number): SupplierPoolProduct[] {
  const byKey = new Map<string, SupplierPoolProduct>();

  for (const row of rows) {
    const name = baseProductName(row.name);
    const key = name ? `${row.supplier_slug}::${name.toLowerCase()}` : `id::${row.id}`;
    const existing = byKey.get(key);
    const price = typeof row.price === "number" ? row.price : null;
    const variant: SupplierPoolVariant = {
      id: row.id,
      article: row.article,
      label: variantLabel(row),
      price,
      imageUrl: row.image_url,
      url: row.url,
    };

    if (!existing) {
      byKey.set(key, {
        key,
        supplierSlug: row.supplier_slug,
        article: row.article,
        name,
        vendor: row.vendor,
        category: row.category,
        url: row.url,
        imageUrl: row.image_url,
        currency: row.currency,
        priceKind: row.price_kind,
        priceMin: price,
        priceMax: price,
        variantCount: 1,
        variants: [variant],
      });
      continue;
    }

    existing.variantCount += 1;
    existing.variants.push(variant);
    // Артикул лишається на картці, лише поки він у всіх варіантів однаковий.
    if (existing.article !== row.article) existing.article = null;
    if (price !== null) {
      existing.priceMin = existing.priceMin === null ? price : Math.min(existing.priceMin, price);
      existing.priceMax = existing.priceMax === null ? price : Math.max(existing.priceMax, price);
    }
    if (!existing.imageUrl && row.image_url) existing.imageUrl = row.image_url;
    if (!existing.vendor && row.vendor) existing.vendor = row.vendor;
    if (!existing.category && row.category) existing.category = row.category;
  }

  // ПОРЯДОК: спершу ті, у кого відома ціна. Показуємо 40 карток зі 120 знайдених
  // («футболка» на проді), тож саме сортування вирішує, кого менеджер побачить,
  // а кого ні. За абеткою в цю сорокову лізли самі лише назви з мапи avanprint —
  // рядки без ціни, з яких нічого не порахуєш, — а 32 картки totobi з цінами не
  // влізали жодного разу. Ціна тут не «краще», а «є з чим працювати».
  return [...byKey.values()]
    .sort((a, b) => {
      const byPrice = Number(b.priceMin !== null) - Number(a.priceMin !== null);
      if (byPrice !== 0) return byPrice;
      return a.name.localeCompare(b.name, "uk");
    })
    .slice(0, limit);
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

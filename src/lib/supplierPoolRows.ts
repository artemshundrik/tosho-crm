/**
 * Пул постачальників — типи й чиста логіка показу. Окремо від `supplierPool.ts`
 * навмисно: там запит до бази, а він тягне `supabaseClient`, який на старті
 * чіпає `window`. Тести чистої логіки бігають у `node` (vitest.config.ts), і без
 * цього поділу вони падали б на браузерній глобалі, а не на самій логіці.
 *
 * ЗГОРТАННЯ ЙДЕ У ДВА ЗАХОДИ, і плутати їх не можна.
 *
 * ЗАХІД ПЕРШИЙ — РЯДКИ В КАРТКУ, ЗА НАЗВОЮ. У фіді один товар лежить рядком на
 * кожен розмір і колір: berrytex — 2098 рядків на 74 товари, totobi — 3150 на
 * 679. Показати менеджеру 3150 позицій означає показати ту саму «Футболку
 * SoftStyle 153» 55 разів. Ключ саме назва, а НЕ артикул: у berrytex колірні
 * рядки ділять один код, а в totobi кожен колір має СВІЙ — за артикулом там
 * згорталось би нічого, і одна футболка розсипалась би на дев'ять карток.
 *
 * ЗАХІД ДРУГИЙ — КАРТКИ МІЖ СОБОЮ, ЗА АРТИКУЛОМ (правило Артема 08.09.2026).
 * Аванпринт — наш магазин, і він перепродає товар тих самих оптовиків, лишаючи
 * їхні коди. Заміряно на проді: спільні артикули є ТІЛЬКИ між Аванпринтом і
 * оптовиками (2341 з Тотобі, 344 з Бергамо), між оптовиками — жодного. Тобто
 * збіг коду тут не випадковість, а та сама річ на тому самому складі: «812-01»
 * це чорний і в Тотобі, і в Аванпринті. По НАЗВІ зливати не можна — перевірено
 * раніше, «Рушник Nensi» і «Рушник Dora» обидва тягнуться до «Рушник NARA».
 *
 * ЩО ЗЛИТА КАРТКА БЕРЕ ЗВІДКИ. Назва, фото й підписи кольорів — з Аванпринта
 * (наш магазин, наш текст); ціна — від оптовика, бо в Аванпринта її просто
 * немає (усі 10234 рядки без ціни, вона в нього довідкова). Посилання показуємо
 * НА ОБИДВА сайти: `sources`. Разом із ціною переїжджає і її підпис
 * (`priceKind`) — інакше оптова ціна стояла б під словом «роздріб», тобто
 * картка брехала б про гроші.
 *
 * КОЛЬОРИ ОБ'ЄДНУЮТЬСЯ, А НЕ ПЕРЕТИНАЮТЬСЯ. У «Stage» Тотобі має дев'ять
 * кольорів, Аванпринт сім: картка мусить показати дев'ять, інакше злиття з'їсть
 * sage й orchid і вийде гірше за дві окремі картки.
 *
 * ЧОГО ТУТ ЩЕ НЕМАЄ. Кнопки «це різні товари». Із 706 пар, які дає це правило
 * на живих даних, одна хибна: артикул «4028-10» в Аванпринта стоїть на рюкзаку
 * «COOPER», а в Бергамо — на кепці. Поки пари не підтверджує людина, така
 * картка склеїться неправильно; це відомо й лежить наступним кроком.
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

/**
 * Наш магазин серед постачальників. Аванпринт тут не «ще одне джерело», а
 * окрема роль: його текст і фото ми показуємо, його ціну — ні (її немає).
 * Слуг вписаний, бо роль справді одна й вона не про дані, а про те, чий це
 * сайт; у фіді немає поля, з якого це можна було б вивести.
 */
export const SHOP_SUPPLIER_SLUG = "avanprint.ua";

/**
 * Як джерело звуть люди. Потрібне там, де домен не годиться — на кнопці картки
 * позиції: «Постачальник» не каже нічого, а «Тотобі» каже все (Артем,
 * 08.09.2026). Назви короткі, а не з `contractors.name`: у картці підрядника
 * лежить «ТОВ «ТоТобі»» й «Бергамо Україна» — юридичні, задовгі для кнопки.
 * Незнайомий домен повертається як є: показати «bergamo.ua» чесніше, ніж
 * промовчати.
 */
const SUPPLIER_NAMES: Record<string, string> = {
  "avanprint.ua": "Аванпринт",
  "totobi.com.ua": "Тотобі",
  "bergamo.ua": "Бергамо",
  "berrytex.com.ua": "Беррітекс",
};

/** Назва джерела з адреси товару; `null`, якщо адреса не розбирається. */
export function supplierNameFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return SUPPLIER_NAMES[host] ?? host;
  } catch {
    return null;
  }
}

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

/**
 * Де цю річ продають. Після злиття за артикулом джерел у картки кілька, і
 * менеджеру потрібні всі: в оптовика ціна, в Аванпринті наш опис і фото.
 * `name` тут — як цю саму річ називає САМЕ ЦЕЙ сайт: картка носить назву
 * Аванпринта, і без чужої назви поруч менеджер не впізнає товар, який щойно
 * знайшов за словом оптовика («Худі «LENNY»» ‖ «Реглан LENNY, TM Floyd»).
 */
export type SupplierPoolSource = {
  supplierSlug: string;
  name: string;
  url: string | null;
};

/** Один товар для показу: назва зі згорнутими в неї варіантами. */
export type SupplierPoolProduct = {
  key: string;
  /** Чия назва на картці. Він же визначає чергу показу між постачальниками. */
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
  /** Усі варіанти названі кольором — тоді й підпис на картці «кольори». */
  variantsAreColors: boolean;
  /** Сайти, де ця річ є. Перший — той, чия ціна показана. Ніколи не порожній. */
  sources: SupplierPoolSource[];
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

/**
 * Прибираємо те, що зіпсувало б сам пошук: `%` і `\` — це підстановні знаки
 * ilike, і термін «50%» без чистки збігся б із половиною пулу. Коми й дужки
 * лишились із часів, коли пошук ішов через PostgREST `or=` (він їх не терпів
 * усередині значення); тепер це RPC, і для нього вони нешкідливі — але й не
 * потрібні в назвах, тож не вертаємо.
 */
export const sanitizeSearchTerm = (term: string) => term.replace(/[,()*%\\]/g, " ").trim();

/**
 * Артикул у порівнянному вигляді. Регістр і краї не значущі — усе інше значуще:
 * дефіси й пробіли всередині коду («18000-CG 3C») це частина коду, а не сміття.
 * Заміряно: на живому пулі нормалізація дає рівно ті самі 2341 і 344 збіги, що
 * й точне порівняння, тобто вона нічого не приклеює зайвого.
 */
export function normalizeArticle(article: string | null | undefined): string | null {
  const trimmed = article?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

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

/** Картка одного постачальника — проміжний стан між рядками й показом. */
type SupplierPoolDraft = {
  key: string;
  supplierSlug: string;
  name: string;
  vendor: string | null;
  category: string | null;
  url: string | null;
  imageUrl: string | null;
  currency: string;
  priceKind: "retail" | "wholesale";
  variants: SupplierPoolVariant[];
  variantsAreColors: boolean;
};

/** Захід перший: рядки → картки постачальника за назвою. */
function collectDraftsByName(rows: SupplierPoolRow[]): SupplierPoolDraft[] {
  const byKey = new Map<string, SupplierPoolDraft>();

  for (const row of rows) {
    const name = baseProductName(row.name);
    // Товар без назви лишається сам собою за id: у базі поле not null, але
    // порожній рядок туди пролізти може.
    const key = name ? `${row.supplier_slug}::${name.toLowerCase()}` : `id::${row.id}`;
    const variant: SupplierPoolVariant = {
      id: row.id,
      article: row.article,
      label: variantLabel(row),
      price: typeof row.price === "number" ? row.price : null,
      imageUrl: row.image_url,
      url: row.url,
    };

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        supplierSlug: row.supplier_slug,
        name,
        vendor: row.vendor,
        category: row.category,
        url: row.url,
        imageUrl: row.image_url,
        currency: row.currency,
        priceKind: row.price_kind,
        variants: [variant],
        variantsAreColors: Boolean(row.color?.trim()),
      });
      continue;
    }

    existing.variants.push(variant);
    if (!row.color?.trim()) existing.variantsAreColors = false;
    if (!existing.imageUrl && row.image_url) existing.imageUrl = row.image_url;
    if (!existing.vendor && row.vendor) existing.vendor = row.vendor;
    if (!existing.category && row.category) existing.category = row.category;
  }

  return [...byKey.values()];
}

/**
 * Захід другий: картки, що ділять хоч один артикул, — це одна річ.
 *
 * Об'єднання ТРАНЗИТИВНЕ, і це не недогляд. В Аванпринта трапляються здвоєні
 * картки через одрук у назві («Парасолька складна «LIDO»» і «Парасолька
 * скоадна «LIDO»»); кожна ділить артикули з тією самою карткою оптовика, тож
 * через неї склеюються й між собою. Тобто злиття заразом прибирає й дублі
 * нашого ж магазину.
 */
function clusterDraftsByArticle(drafts: SupplierPoolDraft[]): SupplierPoolDraft[][] {
  const parent = drafts.map((_, index) => index);
  const find = (index: number): number => {
    let node = index;
    while (parent[node] !== node) {
      parent[node] = parent[parent[node]];
      node = parent[node];
    }
    return node;
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  const firstSeenAt = new Map<string, number>();
  drafts.forEach((draft, index) => {
    for (const variant of draft.variants) {
      const article = normalizeArticle(variant.article);
      if (!article) continue;
      const seen = firstSeenAt.get(article);
      if (seen === undefined) firstSeenAt.set(article, index);
      else union(seen, index);
    }
  });

  // Порядок гнізд — за першою карткою кожного, тобто за порядком приходу
  // рядків. Стабільний вихід робить передбачуваними і кеш, і очі.
  const clusters = new Map<number, SupplierPoolDraft[]>();
  drafts.forEach((draft, index) => {
    const root = find(index);
    const bucket = clusters.get(root);
    if (bucket) bucket.push(draft);
    else clusters.set(root, [draft]);
  });
  return [...clusters.values()];
}

/** Гніздо карток → одна картка на показ. */
function mergeCluster(cluster: SupplierPoolDraft[]): SupplierPoolProduct {
  const isShop = (draft: SupplierPoolDraft) => draft.supplierSlug === SHOP_SUPPLIER_SLUG;
  const hasPrice = (draft: SupplierPoolDraft) => draft.variants.some((variant) => variant.price !== null);

  // ВМІСТ — з нашого магазину. Серед його ж карток перемагає найповніша: у
  // здвоєних через одрук друга картка це зазвичай один заблуканий колір.
  const byContent = [...cluster].sort(
    (a, b) => Number(isShop(b)) - Number(isShop(a)) || b.variants.length - a.variants.length
  );
  const primary = byContent[0];

  // ПОСИЛАННЯ — спершу той, чия ціна показана. Інакше поруч із цифрою стояв би
  // домен сайту, на якому цієї цифри немає.
  const byLink = [...cluster].sort(
    (a, b) => Number(hasPrice(b)) - Number(hasPrice(a)) || Number(isShop(b)) - Number(isShop(a))
  );

  /**
   * Кольори ОБ'ЄДНУЮТЬСЯ за артикулом — але тільки МІЖ картками, ніколи
   * всередині однієї. Це не педантизм: у berrytex усі колірні рядки одного
   * товару ділять ОДИН код, і дедуплікація «в лоб» схлопнула б 2098 рядків у
   * 74 однобарвні картки. Тому свої варіанти картка дописує гуртом, уже після
   * того, як зіставилась із попередніми, і сама себе не ловить.
   *
   * Варіант без артикула зіставити нема з чим — лишається собою: гірше
   * показати колір двічі, ніж загубити його.
   */
  const variants: SupplierPoolVariant[] = [];
  const byArticle = new Map<string, SupplierPoolVariant[]>();
  for (const draft of byContent) {
    const claimed = new Set<SupplierPoolVariant>();
    const own: SupplierPoolVariant[] = [];

    for (const variant of draft.variants) {
      const article = normalizeArticle(variant.article);
      // Один колір з попередньої картки забирає рівно один колір із цієї —
      // інакше два рядки з однаковим кодом злились би в той самий варіант.
      const twin = article
        ? byArticle.get(article)?.find((existing) => !claimed.has(existing))
        : undefined;
      if (!twin) {
        own.push({ ...variant });
        continue;
      }
      claimed.add(twin);
      // Той самий колір з іншого сайту: добираємо те, чого бракує. Ціна так
      // приходить від оптовика сама — в Аванпринта її немає.
      if (twin.price === null && variant.price !== null) twin.price = variant.price;
      if (!twin.imageUrl && variant.imageUrl) twin.imageUrl = variant.imageUrl;
      if (!twin.label && variant.label) twin.label = variant.label;
      if (!twin.url && variant.url) twin.url = variant.url;
    }

    for (const variant of own) {
      variants.push(variant);
      const article = normalizeArticle(variant.article);
      if (!article) continue;
      const bucket = byArticle.get(article);
      if (bucket) bucket.push(variant);
      else byArticle.set(article, [variant]);
    }
  }

  const prices = variants.map((variant) => variant.price).filter((price): price is number => price !== null);
  // Підпис ціни їде разом із ціною: у Аванпринта стоїть `retail`, і взявши
  // його з первинної картки, ми підписали б оптову ціну словом «роздріб».
  const priceOwner = byLink.find(hasPrice) ?? primary;

  const sources: SupplierPoolSource[] = [];
  const seenSlugs = new Set<string>();
  for (const draft of byLink) {
    if (seenSlugs.has(draft.supplierSlug)) continue;
    seenSlugs.add(draft.supplierSlug);
    sources.push({ supplierSlug: draft.supplierSlug, name: draft.name, url: draft.url });
  }

  const articles = new Set(variants.map((variant) => normalizeArticle(variant.article)));

  return {
    key: primary.key,
    supplierSlug: primary.supplierSlug,
    // Артикул на картці — лише коли він у всіх варіантів один; інакше менеджер
    // скопіює код випадкового кольору.
    article: articles.size === 1 ? (variants[0]?.article ?? null) : null,
    name: primary.name,
    vendor: byContent.find((draft) => draft.vendor)?.vendor ?? null,
    category: byContent.find((draft) => draft.category)?.category ?? null,
    url: sources[0]?.url ?? null,
    imageUrl: byContent.find((draft) => draft.imageUrl)?.imageUrl ?? null,
    currency: priceOwner.currency,
    priceKind: priceOwner.priceKind,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    variantCount: variants.length,
    variants,
    variantsAreColors: byContent.every((draft) => draft.variantsAreColors),
    sources,
  };
}

/** Згорнути рядки в товари: назва в межах постачальника, потім артикул поміж. */
export function groupSupplierPoolRows(rows: SupplierPoolRow[], limit: number): SupplierPoolProduct[] {
  const products = clusterDraftsByArticle(collectDraftsByName(rows)).map(mergeCluster);

  // ПОРЯДОК: спершу ті, у кого відома ціна. Показуємо 40 карток зі 120 знайдених
  // («футболка» на проді), тож саме сортування вирішує, кого менеджер побачить,
  // а кого ні. За абеткою в цю сорокову лізли самі лише назви з мапи avanprint —
  // рядки без ціни, з яких нічого не порахуєш, — а 32 картки totobi з цінами не
  // влізали жодного разу. Ціна тут не «краще», а «є з чим працювати».
  const ordered = [...products].sort((a, b) => {
    const byPrice = Number(b.priceMin !== null) - Number(a.priceMin !== null);
    if (byPrice !== 0) return byPrice;
    return a.name.localeCompare(b.name, "uk");
  });

  /**
   * ПО ЧЕРЗІ МІЖ ПОСТАЧАЛЬНИКАМИ, і це та сама біда, що в SQL, лише на рівень
   * вище. Квоту рядків уже роздано чесно (`tosho.search_supplier_pool`), але
   * карток у вікні візарда всього шість — і сортування вище віддавало всі
   * шість одному: у Бергамо назви на «Д» і «Ф» ішли за абеткою першими серед
   * тих, у кого є ціна, тож Тотобі знову не було видно (перевірено в прев'ї
   * 08.09.2026 на запиті «футболка»).
   *
   * Тому обхід по колу: спершу найкраща картка кожного постачальника, потім
   * друга кожного, і так далі. Порядок УСЕРЕДИНІ постачальника не міняється —
   * там і далі спершу ті, у кого відома ціна. Шість місць на три джерела
   * стають двома-двома-двома замість шести-нуля-нуля.
   *
   * Черга йде за `supplierSlug`, тобто за тим, чия НАЗВА на картці. Злита
   * картка стоїть у черзі Аванпринта — і це правильно: показуємо ми саме його
   * картку, просто з чужою ціною й другим посиланням.
   */
  const queues = new Map<string, SupplierPoolProduct[]>();
  for (const product of ordered) {
    const queue = queues.get(product.supplierSlug);
    if (queue) queue.push(product);
    else queues.set(product.supplierSlug, [product]);
  }

  const roundRobin: SupplierPoolProduct[] = [];
  // Порядок самих постачальників — за їхньою найкращою карткою: джерело з
  // цінами йде попереду джерела без цін, бо його перша картка стоїть вище.
  const lanes = [...queues.values()];
  for (let depth = 0; roundRobin.length < limit; depth += 1) {
    let added = false;
    for (const lane of lanes) {
      if (depth >= lane.length) continue;
      roundRobin.push(lane[depth]);
      added = true;
      if (roundRobin.length >= limit) break;
    }
    if (!added) break;
  }
  return roundRobin;
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

/**
 * Звузити товар до одного варіанта. Потрібне там, де вибір кольору веде далі —
 * у позицію прорахунку поїде артикул саме цього кольору, його фото й ціна, а не
 * першого-ліпшого з групи. Колір дописується до назви: окремого поля під нього
 * в позиції немає, а «яка це футболка» має лишитись видимим після вибору.
 *
 * `sources` лишаються цілими: колір звузився, але продають його й далі обидва
 * сайти, і посилання на них однаково потрібні.
 */
export function applySupplierVariant(
  product: SupplierPoolProduct,
  variant: SupplierPoolVariant
): SupplierPoolProduct {
  return {
    ...product,
    name: variant.label ? `${product.name} · ${variant.label}` : product.name,
    article: variant.article,
    // ФОТО МОДЕЛІ КОЛЬОРУ НЕ ПІДХОДИТЬ. Раніше тут стояв простий запасний
    // варіант «немає свого — бери батьківське», і на розмірах він доречний:
    // XL виглядає як S. Але на КОЛЬОРАХ він бреше — вибираєш «чорний
    // антрацит», а в позицію лягає знімок синьої футболки (спіймано на
    // Бергамо 08.09.2026, у чиїх колірних рядків власного фото немає).
    // Порожня плитка чесніша за чужий колір: її видно й про неї спитають.
    imageUrl: variant.imageUrl ?? (product.variantsAreColors ? null : product.imageUrl),
    url: variant.url ?? product.url,
    priceMin: variant.price,
    priceMax: variant.price,
    variantCount: 1,
    variants: [variant],
  };
}

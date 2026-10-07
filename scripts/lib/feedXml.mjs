/**
 * Розбір XML-фідів постачальників: спільні помічники завантажувача
 * (scripts/load-supplier-feed.mjs) і те, що потрібно автоперенесенню на сайт
 * (REQ-311#p3, docs/superpowers/specs/2026-10-01-site-autolisting-design.md §2).
 *
 * Окремим модулем, а не всередині завантажувача, бо той на імпорті одразу
 * розбирає аргументи й лізе в мережу — тестові його не імпортувати.
 */

export function unesc(s) {
  return s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}

export function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unesc(m[1].trim()) : "";
}

/**
 * Точна пара тегів, без атрибутів. Навмисно НЕ `tag()`: той бере `<price[^>]*>`
 * і в CS-Cart чіпляє `<price_type>Базова ціна</price_type>`, який стоїть ВИЩЕ
 * за `<price>`. Ціна тоді дорівнює рядку «Базова ціна» — і мовчки стає null
 * при `::numeric`. Видно лише на живому фіді, тому окремий помічник.
 */
export function exactTag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? unesc(m[1].trim()) : "";
}

export function param(block, name) {
  const m = block.match(new RegExp(`<param name="${name}">([\\s\\S]*?)</param>`));
  return m ? unesc(m[1].trim()) : "";
}

/**
 * Числові сутності (`&#039;`, `&#x27;`). `unesc` знає лише `&#39;` — а Тотобі
 * пише апостроф із нулем попереду: параметр «Об&#039;єм» без цього кроку
 * ліг би в характеристики саме так, і мовна модель переписала б його в опис.
 * Окремою функцією, а не всередині `unesc`: та розбирає назви, артикули й
 * адреси всіх джерел, і міняти їх заради нових полів ніхто не просив.
 */
export function decodeNumericEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

/** Усі `<param>` пропозиції об'єктом `{ назва: значення }`; порожні — геть. */
export function feedParams(block) {
  const out = {};
  for (const p of block.matchAll(/<param name="([^"]*)"[^>]*>([\s\S]*?)<\/param>/g)) {
    const name = decodeNumericEntities(unesc(p[1]));
    const value = decodeNumericEntities(unesc(p[2]));
    if (name && value) out[name] = value;
  }
  return out;
}

/**
 * Те, що `parseCscart` раніше викидав, а чернетці картки сайту потрібне:
 *   isNew       — `<is_new>Y</is_new>`, новинка постачальника (черга ставить їх угору);
 *   textile     — `<textile>Y</textile>`: на сторінці Тотобі тоді є таблиця
 *                 розмірів і примітка про ±5%, і опис сайту мусить їх мати;
 *   description — `<description>` як є (2896 з 3150 пропозицій);
 *   params      — УСІ `<param>`: матеріал, розмір, вага, упаковка тощо.
 * Прапорці кладемо лише коли вони «так»: відсутнє поле читається як «ні»
 * (див. `coalesce` у scripts/site-listing.sql), а 2500 зайвих `false` — це
 * просто вага в кожному заливі.
 */
export function cscartListingExtras(block) {
  const extras = {};
  if (/<is_new>\s*Y\s*<\/is_new>/i.test(block)) extras.isNew = true;
  if (/<textile>\s*Y\s*<\/textile>/i.test(block)) extras.textile = true;
  const description = decodeNumericEntities(exactTag(block, "description"));
  if (description) extras.description = description;
  const params = feedParams(block);
  if (Object.keys(params).length) extras.params = params;
  return extras;
}

/**
 * Повні шляхи розділів сайту: id → «Батьківський/Дочірній/…» з дерева
 * `<category parentId>`. Без шляху розділ у файл імпорту не покласти: Хорошоп
 * приймає `Раздел` саме так (перевірено пробною пачкою 01.10.2026), а назви
 * листків бувають однакові в різних гілках.
 */
export function horoshopCategoryPaths(xml) {
  const nodes = new Map();
  for (const m of xml.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>/g)) {
    const id = (m[1].match(/\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    const parentId = (m[1].match(/\bparentId="([^"]+)"/) || [])[1] || null;
    nodes.set(id, { name: unesc(m[2].trim()), parentId });
  }
  const paths = new Map();
  const resolve = (id, seen) => {
    if (paths.has(id)) return paths.get(id);
    const node = nodes.get(id);
    if (!node) return null;
    // Петля в дереві (батько посилається на нащадка) — фід зламаний, але
    // зависати через це завантажувач не має: обриваємо на собі.
    if (seen.has(id)) return node.name;
    seen.add(id);
    const parent = node.parentId ? resolve(node.parentId, seen) : null;
    const path = parent ? `${parent}/${node.name}` : node.name;
    paths.set(id, path);
    return path;
  };
  for (const id of nodes.keys()) resolve(id, new Set());
  return paths;
}

#!/usr/bin/env node
/**
 * Завантажити товарний фід постачальника в пул tosho.supplier_products
 * (REQ-250#p3, двигун агрегатора). Дизайн — docs/CATALOG_DESIGN.md §5/§5б.
 *
 * НАВІЩО ОКРЕМИЙ СКРИПТ, А НЕ РАЗОВИЙ ПАРСЕР. Фіди оновлюються (berrytex,
 * totobi — щодня), тож завантаження має бути ІДЕМПОТЕНТНИМ: ганяєш скільки
 * треба, рядок оновлюється за ключем (supplier_slug, external_key), а не
 * дублюється. Це той самий принцип, що в db-apply: одна транзакція, чесний слід.
 *
 * ЩО РОБИТЬ. Тягне фід постачальника → розбирає в рядки → COPY у тимчасову
 * таблицю → один upsert у пул. Зниклі з фіда товари гасяться is_active=false
 * (не видаляються — на них можуть посилатися старі прорахунки).
 *
 * ФІДА МОЖЕ Й НЕ БУТИ. Тоді в реєстрі стоїть `crawl`, і замість одного файлу
 * скрипт бере з мапи сайту перелік адрес і обходить сторінки по одній
 * (bergamo). Розбирач такої сторінки живе в `PAGE_PARSERS`.
 *
 * ЩО СТЕРЕЖЕ ВІД ТИХОЇ БІДИ. Порожній або обірваний прогін НЕ МОЖНА заливати:
 * гасіння зниклих працює за часом, тож нуль рядків вимкнув би всього
 * постачальника, а виглядало б це як «постачальник зник із пошуку». Три
 * рубежі: `curl -f` (404 падає вголос), `maxFailRatio` в обході (частковий
 * обхід не доходить до запису) і `minRows` у реєстрі (нижня межа рядків).
 *
 * ЦІНА. За замовчуванням у пул лягає ціна вітрини як price_kind='retail'. Якщо
 * в постачальника є домовленість — вона стоїть у його записі реєстру полем
 * `priceRule`, і тоді в `price` лягає вже НАША ціна (price_kind='wholesale'), а
 * ціна сайту лишається поруч в `attrs.sitePrice`. Правило — дані, не код: щоб
 * змінити відсотки, правиш реєстр і переганяєш фід.
 *
 * ЧОГО НЕ РОБИТЬ. Не чіпає catalog_models (перевірений каталог).
 *
 * Запуск (потрібен BACKUP_DB_URL, як у db:apply):
 *   set -a; . ./.env.backup; set +a
 *   node scripts/load-supplier-feed.mjs berrytex
 *   node scripts/load-supplier-feed.mjs berrytex --dry   (показати, не писати)
 *   node scripts/load-supplier-feed.mjs bergamo --dry --limit=20  (коротка проба обходу)
 *   node scripts/load-supplier-feed.mjs --list           (перелік постачальників)
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PSQL = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/**
 * Реєстр постачальників. Додати нового — рядок сюди, а не новий скрипт.
 * slug — домен (ключ прив'язки до contractors.website і до пулу).
 * format — як розбирати: 'prom' (YML/Prom.ua XML) поки єдиний.
 */
const SUPPLIERS = {
  berrytex: {
    slug: "berrytex.com.ua",
    feed: "https://berrytex.com.ua/prom.xml",
    format: "prom",
    source: "feed:prom",
    minRows: 1600, // у фіді 2083 (08.09.2026)
  },
  avanprint: {
    slug: "avanprint.ua",
    // Профіль вивантаження в адмінці Хорошопа (Товари → Експорт → YML, валюта
    // UAH, автогенерація «Так»), заведений 08.09.2026. До нього тут стояла мапа
    // сайту: вона давала лише назву й фото — 1851 рядок БЕЗ артикула, ціни й
    // кольору. Профіль дає 10234 пропозиції, кожна модифікація окремим рядком
    // зі своїм vendorCode і своєю ціною.
    //
    // Адреса непостійна: Хорошоп зашиває в неї хеш профілю. Зникне файл —
    // не вигадуй нову адресу, а візьми готову в адмінці, у списку «Всі варіанти
    // експорту» (avanprint.ua/adminLegacy/data.php?handler=261).
    feed: "https://avanprint.ua/content/export/c15ef418f98917515ed67a4f4bb26657.xml",
    format: "horoshop",
    source: "feed:horoshop",
    minRows: 8000, // у фіді 10234 (08.09.2026)
    // ЦІНА АВАНПРИНТА — НЕ ЦІНА, А ДОВІДКА. avanprint.ua це наша власна
    // вітрина, і число у фіді — наш РОЗДРІБ. Купуємо ми не в себе: товар
    // береться в постачальників (Артем, 08.09.2026), тож рахувати
    // собівартість від власної вітрини не можна — вийде накрутка на накрутку.
    //
    // Тому роздріб лягає в `attrs.sitePrice` (є з чим звіряти й видно, коли
    // ціна на сайті поїхала), а `price` лишається порожнім. Фактична ціна
    // прийде звідти ж, звідки товар, — парою «позиція Аванпринта → позиція
    // постачальника», за правилом того постачальника (Тотобі −44/−40/−50%).
    // До підтвердження пари чесніше не показувати ціни взагалі, ніж показати
    // чужу: порожнє поле менеджер помітить, а неправильне число — ні.
    priceIsReference: true,
  },
  bergamo: {
    slug: "bergamo.ua",
    // Мапа сайту тут — не фід, а ПЕРЕЛІК АДРЕС: назви, ціни й фото беруться зі
    // сторінок товарів (`crawl` нижче). Фіда в Бергамо немає, і це перевірено,
    // а не припущено (08.09.2026): prom.xml, yml.xml, google.xml,
    // route=feed/*, extension/feed/yandex_yml — 404; extension/feed/google_base
    // віддає 200 і нуль байтів; extension/feed/google_sitemap — та сама мапа.
    // В акаунті «Файли для завантаження» порожні, checkout/cart/export віддає
    // xlsx самого кошика. Сторінки опису вигрузок, як у Тотобі, у них немає.
    feed: "https://bergamo.ua/sitemap.xml",
    format: "opencart-page",
    source: "crawl:opencart",
    // Обхід сторінок замість одного файлу. `index` каже, як дістати перелік
    // адрес із мапи; далі кожна адреса тягнеться окремо.
    crawl: { index: "sitemap-sku", concurrency: 4, retries: 1, delayMs: 250, maxFailRatio: 0.05 },
    minRows: 2100, // у мапі 2658 (08.09.2026)
    // ДИЛЕРСЬКА ЦІНА = ЦІНА САЙТУ × 0,525 (−47,5%). Заміряно 08.09.2026 на 10
    // товарах із різних розділів — сувенірка, одяг, робочий одяг, термокружки,
    // від 35 до 21 000 грн: коефіцієнт СКРІЗЬ однаковий, поділу за категоріями
    // немає (на відміну від Тотобі). Це не оцінка й не домовленість зі слів:
    // Бергамо сама показує цю ціну під нашим логіном, поруч із закресленою
    // публічною.
    //
    // `agreedOn: null` — саме тому, що підтвердження «ставка стала, а не акція»
    // від СЕО ще немає (питання відкрите з 08.09.2026). Коли назвуть іншу
    // цифру — правиш множник, і ціни перераховуються з `attrs.sitePrice`
    // одним UPDATE, без повторного обходу 2658 сторінок:
    //   update tosho.supplier_products
    //      set price = round((attrs->>'sitePrice')::numeric * <множник>, 2)
    //    where supplier_slug = 'bergamo.ua' and attrs ? 'sitePrice';
    priceRule: {
      agreedOn: null,
      rules: [{ multiplier: 0.525, label: "дилерська −47,5%" }],
    },
  },
  totobi: {
    slug: "totobi.com.ua",
    // Адреса взята зі сторінки totobi.com.ua/opis-vigruzok/ — постачальник
    // публікує її сам. Ключ у ній не наш і не секретний: фід відкритий, логін
    // не потрібен. 05.09.2026 я записав «ні фіда, ні мапи — усе 404»: шукав
    // /sitemap.xml і /prom.xml, а вивантаження в CS-Cart живе під dispatch.
    feed: "https://totobi.com.ua/index.php?dispatch=yml.get&access_key=lg3bjy2gvww",
    format: "cscart",
    source: "feed:cscart",
    minRows: 2500, // у фіді 3150 (08.09.2026)
    // Фід віддає адреси картинок і товарів через http, хоч сайт працює по https
    // (перевірено: та сама картинка по https віддає 200). На проді ми під https,
    // тож http-картинка — це mixed content, який браузер просто НЕ покаже.
    forceHttps: true,
    // НАША ЦІНА = ЦІНА САЙТУ × МНОЖНИК. Домовленість із Тотобі, підтверджена
    // 08.09.2026: сувенірка −44%, одяг −40%, а де стоїть статус «Єдина ціна» —
    // стандартний прайс 50% від сайту. Правило лежить ТУТ, а не в коді розбору:
    // зміняться відсотки — правиш три числа й переганяєш фід (він однаково
    // оновлюється щогодини).
    //
    // Порядок важливий: «Єдина ціна» б'є категорію. З 1353 товарів розділу
    // «Одяг» 606 мають саме її, і за категорією вони отримали б −40% замість
    // −50%. Останнє правило без `when` — це «все інше».
    //
    // Ціни у фіді з ПДВ, тому й наші з ПДВ (Артем, 08.09.2026).
    priceRule: {
      agreedOn: "2026-09-08",
      rules: [
        { when: { priceType: "Єдина ціна" }, multiplier: 0.5, label: "єдина ціна −50%" },
        // Головні убори Артем відніс до одягу (08.09.2026) — 288 товарів.
        { when: { section: ["Одяг", "Головні убори"] }, multiplier: 0.6, label: "одяг −40%" },
        { multiplier: 0.56, label: "сувенірка −44%" },
      ],
    },
  },
  // НЕ ДОДАНИЙ, і причина в ньому, а не в коді (перевірено 05.09.2026):
  //   eney (OpenCart) — точка фіда index.php?route=extension/feed/google_base
  //                     віддає 200 і НУЛЬ байт: розширення є, фід вимкнено в
  //                     їхній адмінці. Мапа є, але без назв — самі адреси.
  // Досить, щоб постачальник увімкнув вивантаження в себе; тоді сюди лягає
  // рядок, а для google_base — ще й свій розбір (це Merchant XML, не YML).
};

const args = process.argv.slice(2);
if (args.includes("--list") || args.length === 0) {
  console.log("Постачальники:", Object.keys(SUPPLIERS).join(", ") || "(порожньо)");
  if (args.length === 0) process.exit(1);
  process.exit(0);
}
const dry = args.includes("--dry");
// `--limit N` — коротка пробіжка обходом, щоб подивитись, що взагалі
// розбирається, не тягнучи 2658 сторінок. ЗАПИС ІЗ НЕЮ ЗАБОРОНЕНИЙ: неповний
// набір рядків погасив би весь решту каталогу постачальника як «зниклий».
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? args[args.indexOf(limitArg) + 1], 10) : 0;
if (limitArg && (!Number.isFinite(limit) || limit <= 0)) {
  console.error("--limit чекає додатне число: --limit=20");
  process.exit(1);
}
if (limit && !dry) {
  console.error("--limit можна лише разом із --dry: неповний обхід, залитий у базу, погасить решту каталогу.");
  process.exit(1);
}
const key = args.find((a) => !a.startsWith("--") && a !== String(limit));
const cfg = SUPPLIERS[key];
if (!cfg) {
  console.error(`Немає постачальника «${key}». Доступні: ${Object.keys(SUPPLIERS).join(", ")}`);
  process.exit(1);
}

const dbUrl = process.env.BACKUP_DB_URL || "";
if (!dbUrl && !dry) {
  console.error("Немає BACKUP_DB_URL. Підвантажте: set -a; . ./.env.backup; set +a");
  process.exit(1);
}

// ── розбір ──────────────────────────────────────────────────────────────────
function unesc(s) {
  return s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unesc(m[1].trim()) : "";
}

function parseProm(xml) {
  // Правила цін тут поки не застосовуються: у berrytex домовленості ще немає.
  const cats = {};
  for (const m of xml.matchAll(/<category id="(\d+)"[^>]*>([\s\S]*?)<\/category>/g)) {
    cats[m[1]] = unesc(m[2].trim());
  }
  const rows = [];
  for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
    const attrsStr = m[1];
    const b = m[2];
    const idm = attrsStr.match(/\bid="([^"]+)"/);
    const pics = [...b.matchAll(/<picture>([^<]+)<\/picture>/g)].map((p) => p[1].trim());
    const name = tag(b, "name");
    if (!name) continue;
    rows.push({
      external_key: idm ? idm[1] : tag(b, "url"),
      article: tag(b, "code") || null,
      name,
      vendor: tag(b, "vendor") || null,
      category: cats[tag(b, "categoryId")] || null,
      price: tag(b, "price") || null,
      currency: tag(b, "currencyId") || "UAH",
      url: tag(b, "url") || null,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
    });
  }
  return rows;
}

/**
 * Точна пара тегів, без атрибутів. Навмисно НЕ `tag()`: той бере `<price[^>]*>`
 * і в CS-Cart чіпляє `<price_type>Базова ціна</price_type>`, який стоїть ВИЩЕ
 * за `<price>`. Ціна тоді дорівнює рядку «Базова ціна» — і мовчки стає null
 * при `::numeric`. Видно лише на живому фіді, тому окремий помічник.
 */
function exactTag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? unesc(m[1].trim()) : "";
}

function param(block, name) {
  const m = block.match(new RegExp(`<param name="${name}">([\\s\\S]*?)</param>`));
  return m ? unesc(m[1].trim()) : "";
}

/**
 * CS-Cart YML (totobi). Багатший за prom-фід, і дві його особливості визначають
 * усе інше в цьому розборі.
 *
 * 1. КОЛІР — ОКРЕМИЙ ТОВАР. 3150 пропозицій на 679 назв: кожен колір має свій
 *    `vendorCode`, за яким його й замовляють. Тому рядок у пулі — колір, а не
 *    «модель»; згортає їх назад у одну картку вже читальний шар (supplierPool).
 *
 * 2. У ТЕКСТИЛЮ ЦІНА НЕ В `<price>`. У 1367 товарів там 0.00, а справжня ціна
 *    лежить в атрибуті `modifier` кожного розміру (у розмірів і свої артикули).
 *    Беремо мінімальну з них — це ціна найдешевшого розміру, і саме її бачить
 *    менеджер на сайті. Без цього кроку ціну втратили б у 43% фіда.
 *
 * `attrs` несе те, чого в колонках пулу немає, але шкода загубити до наступного
 * заливу: колір, групу нанесення (у фіді вона заповнена в 3142 з 3150 — це те,
 * що в нашому каталозі досі виколупується з описів) і розміри з їхніми кодами.
 */
function applyPriceRule(rule, price, ctx) {
  if (!rule || price == null) return { price, label: null };
  for (const item of rule.rules) {
    const when = item.when;
    if (when) {
      if (when.priceType && when.priceType !== ctx.priceType) continue;
      if (when.section && !when.section.includes(ctx.section)) continue;
    }
    // Округлення до копійки: множення на 0.56 дає хвости на 12 знаків, а ціна
    // з такими хвостами лізе в документи й у порівняння «ціна не змінилась».
    return { price: Math.round(price * item.multiplier * 100) / 100, label: item.label };
  }
  return { price, label: null };
}

function parseCscart(xml, cfg) {
  const secure = (value) => (cfg.forceHttps && value ? value.replace(/^http:\/\//i, "https://") : value);
  const cats = {};
  for (const m of xml.matchAll(/<category id="(\d+)"[^>]*>([\s\S]*?)<\/category>/g)) {
    cats[m[1]] = unesc(m[2].trim());
  }
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const rows = [];
  for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
    const b = m[2];
    const name = exactTag(b, "name");
    if (!name) continue;

    const sizes = [...b.matchAll(/<size\b([^>]*)>([\s\S]*?)<\/size>/g)].map((s) => ({
      size: unesc(s[2].trim()),
      code: (s[1].match(/\bproduct_code="([^"]*)"/) || [])[1] || null,
      price: num((s[1].match(/\bmodifier="([^"]*)"/) || [])[1]),
    }));

    const sitePrice = num(exactTag(b, "price")) ?? sizes.map((s) => s.price).filter(Boolean).sort((a, z) => a - z)[0] ?? null;
    // «Базова ціна» і порожній тип — те саме відро (Артем, 08.09.2026).
    const priceType = exactTag(b, "price_type") || "Базова ціна";
    const section = param(b, "Розділ у каталозі");
    const ruled = applyPriceRule(cfg.priceRule, sitePrice, { priceType, section });
    const price = ruled.price;
    const pics = [...b.matchAll(/<picture>([^<]+)<\/picture>/g)].map((p) => secure(p[1].trim()));
    const attrs = {};
    // «Група Кольорів» — запасний варіант, а не синонім: вона грубша («Сірий»
    // замість «ash grey»), зате стоїть там, де точного кольору постачальник не
    // вказав. Без неї частина карток лишилась би з безіменними варіантами.
    const color = param(b, "Колір") || param(b, "Група Кольорів");
    const methods = param(b, "Група нанесення");
    if (color) attrs.color = color;
    if (methods) attrs.methods = methods;
    // Ціну сайту тримаємо поруч навмисно. Показуємо в пошуку тільки нашу (так
    // просив Артем — «не засмічувати»), але без вихідної цифри неможливо ні
    // перевірити правило, ні побачити, що постачальник підняв ціну.
    if (ruled.label) {
      attrs.sitePrice = sitePrice;
      attrs.priceRule = ruled.label;
    }
    attrs.priceType = priceType;
    if (section) attrs.section = section;
    if (sizes.length) {
      attrs.sizes = sizes.map((s) => ({
        ...s,
        price: applyPriceRule(cfg.priceRule, s.price, { priceType, section }).price,
      }));
    }

    rows.push({
      external_key: (m[1].match(/\bid="([^"]+)"/) || [])[1] || exactTag(b, "url"),
      article: exactTag(b, "vendorCode") || null,
      name,
      vendor: param(b, "ТМ") || null,
      category: cats[exactTag(b, "categoryId")] || null,
      price,
      currency: exactTag(b, "currencyId") || "UAH",
      url: secure(exactTag(b, "url")) || null,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
      attrs: JSON.stringify(attrs),
    });
  }
  return rows;
}

/**
 * Мапа сайту з картинками (avanprint). Дає назву, фото й адресу — але НЕ дає
 * ціни й артикула: вони на сторінках за анти-бот захистом, і чистий шлях до них
 * — експорт з адмінки (docs/CATALOG_DESIGN.md §6а). Для пошуку агрегатора назви
 * й фото вже корисні: менеджер бачить, що така річ у нас є, і відкриває її.
 */
function parseSitemap(xml) {
  const rows = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const b = m[1];
    const loc = b.match(/<loc>([^<]+)<\/loc>/);
    if (!loc) continue;
    const url = loc[1].trim();
    if (url.includes("/en/")) continue; // англійський дубль тієї ж картки
    const pics = [...b.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((p) => p[1].trim());
    const titleMatch = b.match(/<image:title><!\[CDATA\[([\s\S]*?)\]\]><\/image:title>/);
    const name = titleMatch ? unesc(titleMatch[1]) : "";
    if (!name) continue; // без назви рядок у пошуку марний
    rows.push({
      external_key: url,
      article: null,
      name,
      vendor: null,
      category: null,
      price: null,
      currency: "UAH",
      url,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
    });
  }
  return rows;
}

/**
 * Мапа, у якій немає ні назв, ні фото, зате АДРЕСА товару — це його артикул
 * (bergamo: bergamo.ua/V3447-03). Такий рядок не знайдеться за назвою, але
 * знайдеться за кодом — а артикул вставляють не рідше, ніж набирають назву.
 *
 * Назвою ставимо сам артикул: у базі поле not null, а вигадувати назву з коду
 * означало б показати менеджеру те, чого постачальник не казав.
 */
function parseSitemapSku(xml) {
  const rows = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1].trim();
    const slug = url.replace(/\/+$/, "").split("/").pop() || "";
    // Артикул — це код, а не слово: цифри в ньому обов'язкові. Так відсіюються
    // сторінки на кшталт /about, /catalog і головна.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*$/.test(slug)) continue;
    rows.push({
      external_key: url,
      article: slug,
      name: slug,
      vendor: null,
      category: null,
      price: null,
      currency: "UAH",
      url,
      image_url: null,
      images: "[]",
    });
  }
  return rows;
}

/**
 * Хорошоп (avanprint) — YML із профілю вивантаження. Формат близький до
 * prom-фіда, але три речі відрізняють його настільки, що спільний розбирач
 * вийшов би плутанішим за окремий.
 *
 * 1. КЛЮЧ — АДРЕСА, А НЕ `id`. У пулі вже лежить 1851 рядок avanprint, залитий
 *    свого часу з мапи сайту, і ключем там стоїть саме адреса товару. Звірено
 *    перед заміною: усі 1851 адреси є і в новому фіді, розбіжностей нуль — тож
 *    старі рядки ОНОВЛЮЮТЬСЯ на місці, дописуючи собі артикул, ціну й колір.
 *    Взяли б `id` (він у фіді теж унікальний) — дістали б 10234 нові рядки, а
 *    1851 старий згас би як «зниклий з фіда»: у пошуку це виглядало б як
 *    дублі впереміш із дірами, і причину шукали б у показі, а не в ключі.
 *
 * 2. МОДИФІКАЦІЯ — ОКРЕМА ПРОПОЗИЦІЯ, як у CS-Cart: 10234 пропозиції на ~1836
 *    товарів, у кожної свій `vendorCode` і своя ціна. Згортає їх назад у одну
 *    картку читальний шар (`supplierPoolRows`), за назвою.
 *
 * 3. ХАРАКТЕРИСТИК У ЦЬОМУ ФІДІ ПРАКТИЧНО НЕМАЄ, і це варто знати заздалегідь.
 *    `<param>` рівно двох видів — «Цвет» (9603 товари) і «Гарантия» (7216); ні
 *    розмірів, ні матеріалу, ні методів нанесення. Справжня специфікація живе
 *    в шаблоні даних «КАТАЛОГ: Товар» (`h_product_characteristics`) і
 *    віддається окремою кнопкою «Експорт характеристик» — разовим xlsx, без
 *    автогенерації й без сталої адреси. Тобто «характеристики з Аванпринта»
 *    цим фідом НЕ закриваються: колір закривається, специфікація ні.
 *
 * Опис кладемо в `attrs.description` навмисно, хоч на весь фід це 5,3 МБ: за
 * розподілом ролей (08.09.2026) текст для документів беремо саме з Аванпринта —
 * це наш магазин і наші слова. У вікно пошуку він не поїде: `supplierPool`
 * вибирає з `attrs` лише `color`, а не всю колонку.
 */
function parseHoroshop(xml, cfg) {
  const cats = {};
  for (const m of xml.matchAll(/<category id="(\d+)"[^>]*>([\s\S]*?)<\/category>/g)) {
    cats[m[1]] = unesc(m[2].trim());
  }
  const num = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const SKIP_PARAMS = new Set(["Цвет", "Колір", "Гарантия", "Гарантія"]);
  const rows = [];
  for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
    const b = m[2];
    const rawName = exactTag(b, "name");
    const url = exactTag(b, "url");
    // Без адреси рядок нічим не приткнути: вона тут одночасно ключ і посилання.
    if (!rawName || !url) continue;

    const pics = [...b.matchAll(/<picture>([^<]+)<\/picture>/g)].map((p) => p[1].trim());
    const attrs = {};
    // exactTag, а не tag: `<oldprice>` стоїть поруч, і регулярка з `[^>]*`
    // рано чи пізно чіпляє сусіда — на CS-Cart цим уже обпікались.
    const listed = num(exactTag(b, "price"));
    // Довідкову ціну тримаємо завжди, робочу — лише коли фід дає саме її.
    if (listed != null) attrs.sitePrice = listed;
    const color = param(b, "Цвет") || param(b, "Колір");
    if (color) attrs.color = color;

    // КОЛІР ЗАШИТИЙ У НАЗВУ, і це доводиться прибирати тут. CS-Cart лишає
    // модифікаціям спільну назву й віддає колір окремим полем — Хорошоп у
    // частини товарів пише «Футболка «ACTION» жіноча, Бежевий». Читальний шар
    // згортає картку САМЕ ЗА НАЗВОЮ, тож така пара розсипається на десяток
    // майже однакових рядків: у прев'ї одна футболка з'їла вісім рядків із
    // сорока, і в тій сороковці не лишилось місця нікому іншому.
    //
    // Ріжемо тільки тоді, коли хвіст ДОСЛІВНО дорівнює кольору з <param>.
    // Здогадуватись «усе після коми — колір» не можна: 60 назв мають кому не
    // про колір, і вони втратили б половину себе. Зачіпає 743 пропозиції з
    // 10234 — вони згортаються у 120 карток замість 743.
    const suffix = color ? `, ${color}` : "";
    const name =
      suffix && rawName.toLowerCase().endsWith(suffix.toLowerCase())
        ? rawName.slice(0, rawName.length - suffix.length).trim() || rawName
        : rawName;
    const warranty = param(b, "Гарантия") || param(b, "Гарантія");
    if (warranty) attrs.warranty = warranty;
    const description = exactTag(b, "description");
    if (description) attrs.description = description;
    // Решта параметрів — на виріст: сьогодні їх нуль, але щойно в Аванпринті
    // заповнять характеристики, вони приїдуть самі, без правки цього коду.
    const rest = {};
    for (const p of b.matchAll(/<param name="([^"]*)"[^>]*>([\s\S]*?)<\/param>/g)) {
      const pname = unesc(p[1]);
      if (SKIP_PARAMS.has(pname)) continue;
      rest[pname] = unesc(p[2].trim());
    }
    if (Object.keys(rest).length) attrs.params = rest;
    // `available="true"` Хорошоп ставить лише тим, що в наявності (9852 з
    // 10234); решті атрибут просто не пише. Тому дивимось на присутність
    // «true», а не шукаємо "false" — його у фіді немає взагалі.
    attrs.available = /\bavailable="true"/.test(m[1]);

    rows.push({
      external_key: url,
      article: exactTag(b, "vendorCode") || null,
      name,
      vendor: exactTag(b, "vendor") || null,
      category: cats[exactTag(b, "categoryId")] || null,
      price: cfg?.priceIsReference ? null : listed,
      currency: exactTag(b, "currencyId") || "UAH",
      url,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
      attrs: JSON.stringify(attrs),
    });
  }
  return rows;
}

/**
 * OpenCart (bergamo) — розбір ОДНІЄЇ сторінки товару. Викликається обходом, а
 * не по фіду: фіда в Бергамо немає (див. запис у реєстрі).
 *
 * ⚠️ ГОЛОВНА ПАСТКА, І ВОНА ТИХА. На сторінці є ДВІ ціни, і найзручніша з них
 * неправильна. `application/ld+json` (`offers.price`) віддає ПУБЛІЧНУ ціну —
 * і віддає її навіть залогіненому дилеру. Наша ціна живе тільки в DOM:
 * `.product-price-old` — публічна, `.product-price` — наша. Тобто розбирач, який
 * взяв би ціну звідти ж, звідки бере назву, бренд і фото (а це найприродніше
 * рішення), мовчки записав би ціни майже вдвічі більші, і виглядало б це
 * абсолютно нормально. Формою це той самий випадок, що `<price_type>` у CS-Cart
 * і `<oldprice>` у Хорошопа: сусід, який ловиться раніше за потрібне поле.
 *
 * ТОМУ МИ ХОДИМО АНОНІМНО І МНОЖИМО. Публічну ціну беремо з JSON-LD (вона там
 * чесна), а нашу рахує `priceRule` реєстру. Так обхід не потребує ані кукі, ані
 * логіна — ні на ноутбуці, ні в кроні, де сесії взятись нізвідки. Публічна ціна
 * лишається в `attrs.sitePrice`: зміниться ставка — перерахунок робиться з неї
 * одним UPDATE, без повторного обходу.
 *
 * ГАЛЕРЕЯ — ЗА ПРЕФІКСОМ ГОЛОВНОГО ФОТО. На сторінці 46 адрес `catalog_images`,
 * але майже всі — супутні товари й банери блогу. Кадри саме цього товару ділять
 * шлях і основу імені з головним фото (`.../voyager/v3447_03_a-1000x1000.jpg`),
 * розрізняючись хвостом `_a`/`_b` і розміром. Тому беремо ті, що починаються з
 * тієї самої основи, і зрізаємо `-WxH`, щоб не тягти п'ять копій одного кадру.
 *
 * КАТЕГОРІЇ ТУТ НЕМАЄ, і це не недогляд. Хлібні крихти на сторінці товару
 * містять лише його власну назву — розділ у них не потрапляє. Розділ можна
 * дістати обходом 279 сторінок категорій із мапи, але це окрема робота на
 * стільки ж запитів, тож поки `category: null`.
 */
function parseOpencartPage(html, ctx) {
  const ld = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      ld.push(JSON.parse(m[1].trim()));
    } catch {
      // Битий JSON-LD — не привід втрачати сторінку: нижче є запасні шляхи.
    }
  }
  const product = ld.find((d) => d && d["@type"] === "Product");
  if (!product) return null;

  const name = typeof product.name === "string" ? product.name.trim() : "";
  if (!name) return null;

  const offers = product.offers && !Array.isArray(product.offers) ? product.offers : (product.offers || [])[0];
  const sitePriceRaw = offers ? Number.parseFloat(offers.price) : Number.NaN;
  const sitePrice = Number.isFinite(sitePriceRaw) && sitePriceRaw > 0 ? sitePriceRaw : null;

  const mainImage = typeof product.image === "string" ? product.image : (product.image || [])[0] || null;
  // Основа імені: без «-1000x1000» і без кадрового хвоста «_a».
  const stripSize = (u) => u.replace(/-\d+x\d+[a-z]*\.(jpg|jpeg|png|webp)$/i, "");
  let images = [];
  if (mainImage) {
    const base = stripSize(mainImage).replace(/_[a-z]$/i, "");
    // Один кадр лежить у кількох розмірах: -250x250, -550x550, -600x315w. Хвіст
    // «w» — соцмережевий кроп, широкий і з обрізаним товаром, і саме він
    // трапляється в розмітці ПЕРШИМ (це og:image). Тому «перший, що трапився»
    // брати не можна: на картці стояла б обрізана картинка. Для кожного кадру
    // лишаємо найбільший КВАДРАТНИЙ варіант.
    //
    // Головне фото додаємо окремо: у JSON-LD слеші екрановані (`https:\/\/`),
    // тож у сирому тексті сторінки регулярка його не бачить, а саме там лежить
    // найбільший розмір (1000x1000).
    const rankOf = (url) => {
      const m = url.match(/-(\d+)x(\d+)([a-z]*)\.(?:jpg|jpeg|png|webp)$/i);
      if (!m) return 1; // без розміру — оригінал, кращий за будь-який кроп
      const [w, h] = [Number(m[1]), Number(m[2])];
      return (w === h ? 1e9 : 0) + w * h;
    };
    const best = new Map();
    const offer = (url) => {
      const frame = stripSize(url);
      if (!frame.startsWith(base)) return;
      const prev = best.get(frame);
      const rank = rankOf(url);
      if (!prev || rank > prev.rank) best.set(frame, { url, rank });
    };
    offer(mainImage);
    for (const m of html.matchAll(/https:\/\/[^\s"'\\)]*?\/image\/cache\/[^\s"'\\)]+?\.(?:jpg|jpeg|png|webp)/gi)) offer(m[0]);
    images = [...best.keys()].sort().map((k) => best.get(k).url);
    if (!images.length) images = [mainImage];
  }

  const ruled = applyPriceRule(ctx.cfg.priceRule, sitePrice, {});
  const attrs = {};
  if (sitePrice != null) attrs.sitePrice = sitePrice;
  if (ruled.label) attrs.priceRule = ruled.label;
  if (product.description) attrs.description = String(product.description).trim();
  if (product.model) attrs.model = String(product.model).trim();
  // schema.org/InStock vs OutOfStock — єдиний сигнал наявності на сторінці.
  if (offers?.availability) attrs.available = /InStock/i.test(String(offers.availability));

  /**
   * КОЛІР ЗАШИТИЙ У НАЗВУ, А РЕШТА КОЛЬОРІВ — У РОЗМІТЦІ СТОРІНКИ.
   *
   * У мапі сайту рівно ОДНА адреса на модель, і вона веде на один колір
   * (у футболок Printer Prime це завжди `…5360`, темно-синій). Через це в пулі
   * кожна річ лежала одним кольором, хоч на сайті їх шість — і виглядало це як
   * «Бергамо бідний», хоч насправді ми просто не спитали.
   *
   * Решта кольорів є ТУТ ЖЕ, у блоці `#hpmodel`: у кожного своя адреса, свій
   * код і назва в `title` («6053 - синій»). Тобто повне покриття кольорів
   * коштує НУЛЬ додаткових запитів — треба лише прочитати те, що вже завантажено.
   * Обходити ще й кожну колірну сторінку окремо було б у шість разів довше й
   * поклало б на чужий сайт зайве навантаження заради того, що вже в руках.
   *
   * ФОТО В КОЛЬОРІВ НЕ БУДЕ, і це перевірено, а не припущено. Ім'я файлу
   * містить артикул (`22640315360_a-674x800.jpg`), тож напрошується підставити
   * чужий код і дістати фото. Спробував три — усі 404: шлях кешу в них інший.
   * Тому в братів `image_url` порожній, а на картці стоїть фото моделі. Краще
   * без фото, ніж помаранчева футболка з темно-синім знімком.
   */
  const colorTail = name.match(/,\s*колір\s+(.+?)(?:\s+-\s+\S+)?\s*$/iu);
  const baseName = colorTail ? name.slice(0, colorTail.index).trim() || name : name;
  const selfArticle = typeof product.sku === "string" && product.sku.trim() ? product.sku.trim() : null;
  if (colorTail) attrs.color = colorTail[1].trim();

  const self = {
    external_key: ctx.url,
    article: selfArticle,
    name: baseName,
    vendor: product.brand?.name ? String(product.brand.name).trim() : null,
    category: null,
    price: ruled.price,
    currency: offers?.priceCurrency || "UAH",
    url: ctx.url,
    image_url: images[0] || mainImage || null,
    images: JSON.stringify(images),
    attrs: JSON.stringify(attrs),
  };

  const rows = [self];
  const seen = new Set([ctx.url]);
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const body = m[2];
    if (!body.includes("hcol-attribute")) continue;
    const href = m[1].trim();
    // Активний колір — це сама сторінка, у нього href="javascript:void(0)".
    if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
    const title = (body.match(/title="([^"]*)"/) || [])[1] || "";
    // «6053 - синій» → назва кольору без коду; код і так є в артикулі.
    const label = title.includes(" - ") ? title.slice(title.indexOf(" - ") + 3).trim() : title.trim();
    if (!label) continue;
    // Спершу відрізаємо запит і якір, і лише ПОТІМ ділимо шляхом. Навпаки не
    // можна: `[/?#].*$` зрізає від першого слеша, тобто від «https://», і
    // артикул виходив «https:» (спіймано на сухій пробіжці).
    const slug = href.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() || "";
    seen.add(href);
    rows.push({
      ...self,
      external_key: href,
      article: /\d/.test(slug) ? slug : null,
      url: href,
      image_url: null,
      images: "[]",
      attrs: JSON.stringify({ ...attrs, color: label }),
    });
  }
  return rows;
}

const PARSERS = { prom: parseProm, cscart: parseCscart, sitemap: parseSitemap, "sitemap-sku": parseSitemapSku, horoshop: parseHoroshop };
const PAGE_PARSERS = { "opencart-page": parseOpencartPage };

// ── тягнемо фід ─────────────────────────────────────────────────────────────
console.log(`Фід: ${cfg.feed}`);
let xml;
try {
  // `-f` тут не косметика. Без нього 404 повертає HTML-сторінку помилки з
  // нульовим кодом виходу: розбирач знаходить нуль товарів, залив «успішно»
  // пише нуль рядків — і гасить УСЬОГО постачальника, бо зниклі з фіда
  // вимикаються за часом. Адреси вивантажень непостійні (Хорошоп зашиває в них
  // хеш профілю), тож це не гіпотетичний випадок. З `-f` curl падає вголос.
  xml = execFileSync("curl", ["-fsS", "--max-time", "60", "-A", UA, cfg.feed], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  console.error("Не вдалося завантажити фід:", e.message);
  process.exit(1);
}

/**
 * Обхід сторінок для постачальників без фіда. Мапа сайту дає лише перелік
 * адрес, тож кожну сторінку доводиться тягти окремо.
 *
 * ТЕМП НАВМИСНО ВВІЧЛИВИЙ. Це сайт партнера, а не наш: 4 паралельні запити з
 * паузою чверть секунди — приблизно 11 запитів на секунду, 2658 сторінок
 * проходять хвилин за чотири. Ганяти швидше немає ніякої потреби: обхід
 * ходить раз на тиждень.
 *
 * І ГОЛОВНЕ — ЧАСТКОВИЙ ОБХІД НЕ МОЖНА ЗАЛИВАТИ. Якщо мережа відвалиться на
 * 1500-й сторінці, у нас на руках півтори тисячі товарів замість 2658, і
 * звичайний залив погасив би решту 1158 як «зниклі з фіда». У пошуку це
 * виглядало б як «половина Бергамо зникла», а причина була б у мережі. Тому
 * рахуємо частку невдач і при перевищенні `maxFailRatio` падаємо ДО запису.
 */
async function crawlPages(indexXml, cfg) {
  const { concurrency = 4, retries = 1, delayMs = 250, maxFailRatio = 0.05 } = cfg.crawl;
  const parsePage = PAGE_PARSERS[cfg.format];
  if (!parsePage) throw new Error(`Немає посторінкового розбирача «${cfg.format}»`);

  const all = PARSERS[cfg.crawl.index](indexXml, cfg).map((r) => r.url);
  const urls = limit ? all.slice(0, limit) : all;
  console.log(`Адрес у мапі: ${all.length}${limit ? ` (беремо перші ${urls.length} — --limit)` : ""}`);

  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const rows = [];
  const failures = [];
  let skipped = 0;
  let done = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= urls.length) return;
      const url = urls[i];
      let html = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          html = await res.text();
          break;
        } catch (e) {
          if (attempt === retries) failures.push(`${url} — ${e.message}`);
          else await nap(600);
        }
      }
      if (html) {
        const parsed = parsePage(html, { url, cfg });
        // Сторінка може дати БІЛЬШЕ як один рядок: у Бергамо на картці товару
        // висить перелік усіх його кольорів, і кожен колір — окремий товар зі
        // своїм кодом. Тому розбирач повертає масив.
        //
        // `null` (або порожньо) — сторінка без товару (розділ, стаття). Це не
        // збій: у мапі такі адреси теж є, просто вони не проходять фільтр
        // «код з цифрою».
        const produced = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        if (produced.length) rows.push(...produced);
        else skipped++;
      }
      done++;
      if (done % 250 === 0 || done === urls.length) {
        console.log(`  пройдено ${done}/${urls.length} — товарів ${rows.length}, без товару ${skipped}, невдач ${failures.length}`);
      }
      await nap(delayMs);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (failures.length) {
    console.log(`Не відповіли ${failures.length} сторінок, перші три:`);
    for (const f of failures.slice(0, 3)) console.log(`  ${f}`);
  }
  const ratio = urls.length ? failures.length / urls.length : 0;
  if (ratio > maxFailRatio) {
    console.error(
      `Обхід обірвався: не відповіли ${failures.length} з ${urls.length} сторінок ` +
        `(${(ratio * 100).toFixed(1)}%, межа ${(maxFailRatio * 100).toFixed(1)}%). ` +
        `Заливати частковий обхід НЕ можна — він погасив би решту каталогу.`
    );
    process.exit(1);
  }
  return rows;
}

const rows = cfg.crawl ? await crawlPages(xml, cfg) : PARSERS[cfg.format](xml, cfg);
console.log(`Розібрано товарів: ${rows.length}`);
console.log(
  `  з артикулом: ${rows.filter((r) => r.article).length}, ` +
    `з ціною: ${rows.filter((r) => r.price).length}, ` +
    `з фото: ${rows.filter((r) => r.image_url).length}`
);
// Розкладка за правилом ціни. Показуємо, бо мовчазний промах правила виглядає
// так само, як усе гаразд: ціни на місці, просто не наші. «(без правила)» на
// весь фід означає, що постачальник перейменував розділ або тип ціни.
if (cfg.priceRule) {
  const byLabel = {};
  for (const r of rows) {
    let label = null;
    try {
      label = JSON.parse(r.attrs || "{}").priceRule ?? null;
    } catch {
      // Битий attrs — рахуємо як «без правила», це й так сигнал.
    }
    const k = label || "(без правила)";
    byLabel[k] = (byLabel[k] || 0) + 1;
  }
  const parts = Object.entries(byLabel).map(([k, v]) => `${k} — ${v}`);
  console.log(`  за правилом ціни: ${parts.join(", ")}`);
  if (!cfg.priceRule.agreedOn) {
    console.log(`  ⚠ ставку «${key}» ще не підтверджено (agreedOn: null) — цифри робочі, але не остаточні`);
  }
}
// дедуп за external_key усередині фіда (ON CONFLICT не любить дублів у одному COPY)
const seen = new Set();
const uniq = rows.filter((r) => (r.external_key && !seen.has(r.external_key) ? (seen.add(r.external_key), true) : false));
if (uniq.length !== rows.length) console.log(`  унікальних за ключем: ${uniq.length}`);

/**
 * ПОРІГ РЯДКІВ. Останній рубіж перед записом, і найважливіший у цьому скрипті.
 *
 * Зниклі з фіда товари гасяться за часом: «усе, чого не торкнулись у цьому
 * прогоні, — вимкнути». Це правильно, поки прогін чесний. Але якщо фід віддав
 * порожнечу — змінилась адреса вивантаження, постачальник перебудував сайт,
 * обхід обірвався — то залив «успішно» запише нуль рядків і ПОГАСИТЬ УСЬОГО
 * ПОСТАЧАЛЬНИКА. Симптом («Аванпринт зник із пошуку») не схожий на причину
 * (хеш у адресі), і шукали б його в показі.
 *
 * Тому кожен постачальник має в реєстрі `minRows` — грубу нижню межу з запасом
 * від живого розміру фіда. Менше — це не «мало товарів», це зламане джерело:
 * не пишемо нічого й падаємо вголос. Каталог у базі лишається таким, як був.
 */
if (cfg.minRows && !limit && uniq.length < cfg.minRows) {
  console.error(
    `Розібрано ${uniq.length} товарів, а нижня межа для «${key}» — ${cfg.minRows}. ` +
      `Схоже, джерело зламалось: адреса вивантаження, розмітка сайту або обхід. ` +
      `Нічого не записано, каталог постачальника не погашено.`
  );
  process.exit(1);
}

if (dry) {
  console.log("--- dry: перші 3 рядки ---");
  console.log(uniq.slice(0, 3));
  process.exit(0);
}

// ── у базу: TSV → тимчасова таблиця → upsert ────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "feed-"));
const tsv = join(dir, "rows.tsv");
const esc = (v) => (v == null ? "\\N" : String(v).replace(/\\/g, "\\\\").replace(/\t/g, " ").replace(/\n/g, " ").replace(/\r/g, ""));
const cols = ["external_key", "article", "name", "vendor", "category", "price", "currency", "url", "image_url", "images", "attrs"];
writeFileSync(tsv, uniq.map((r) => cols.map((c) => esc(r[c])).join("\t")).join("\n"));

const sql = `
\\set ON_ERROR_STOP on
begin;

create temp table _feed (
  external_key text, article text, name text, vendor text, category text,
  price text, currency text, url text, image_url text, images text, attrs text
) on commit drop;

\\copy _feed (${cols.join(", ")}) from '${tsv}' with (format text, null '\\N')

-- Немає картки постачальника — падаємо ГУЧНО. Без цього CROSS JOIN нижче дав би
-- порожньо, і залив «успішно» вставив би нуль рядків: рівно той тихий збій, на
-- якому в цьому проєкті вже обпікались (SQL, що не поїхав, при зелених джобах).
do $$
begin
  if not exists (select 1 from tosho.contractors where website ilike '%${cfg.slug}%') then
    raise exception 'Немає картки підрядника з доменом %. Заведіть її (kind=supplier, website), інакше вставляти нема під кого.', '${cfg.slug}';
  end if;
end
$$;

-- team_id і contractor_id беремо з картки постачальника за доменом.
with sup as (
  select team_id, id as contractor_id
  from tosho.contractors
  where website ilike '%${cfg.slug}%'
  order by (kind = 'supplier') desc
  limit 1
)
insert into tosho.supplier_products
  (team_id, supplier_slug, contractor_id, source, external_key,
   article, name, vendor, category, price, currency, price_kind, url, image_url, images, attrs, observed_at, is_active)
select
  sup.team_id, '${cfg.slug}', sup.contractor_id, '${cfg.source}', f.external_key,
  nullif(f.article,''), f.name, nullif(f.vendor,''), nullif(f.category,''),
  nullif(f.price,'')::numeric, coalesce(nullif(f.currency,''),'UAH'), '${cfg.priceRule ? "wholesale" : "retail"}',
  nullif(f.url,''), nullif(f.image_url,''), coalesce(f.images::jsonb,'[]'::jsonb),
  coalesce(f.attrs::jsonb,'{}'::jsonb), now(), true
from _feed f cross join sup
on conflict (supplier_slug, external_key) do update set
  article = excluded.article, name = excluded.name, vendor = excluded.vendor,
  category = excluded.category, price = excluded.price, currency = excluded.currency,
  price_kind = excluded.price_kind,
  url = excluded.url, image_url = excluded.image_url, images = excluded.images,
  attrs = excluded.attrs,
  contractor_id = excluded.contractor_id, observed_at = now(), is_active = true,
  updated_at = now();

-- Зниклі з фіда — гасимо, не видаляємо (посилання зі старих прорахунків).
update tosho.supplier_products p set is_active = false, updated_at = now()
where p.supplier_slug = '${cfg.slug}' and p.observed_at < now() - interval '1 minute' and p.is_active;

select '${cfg.slug}' as supplier, count(*) as total,
       count(*) filter (where is_active) as active
from tosho.supplier_products where supplier_slug = '${cfg.slug}';

commit;
notify pgrst, 'reload schema';
`;
const sqlFile = join(dir, "load.sql");
writeFileSync(sqlFile, sql);

/**
 * РЯДОК ПІДКЛЮЧЕННЯ НЕ КЛАДЕМО В АРГУМЕНТИ. Раніше він ішов першим аргументом
 * `psql`, і на будь-якій помилці сюди друкувався `e.message`, куди Node вкладає
 * всю команду з аргументами — тобто пароль від бази. Відколи цей скрипт ганяє
 * крон у GitHub Actions, це друк у ПУБЛІЧНИЙ лог (репозиторій відкритий).
 * GitHub замальовує точне значення секрета сам, але будь-яке перетворення
 * рядка це замальовування промахує, а на ноутбуці замальовувати нікому взагалі.
 *
 * Тому підключення передається змінними оточення (їх libpq читає так само), і
 * в argv не лишається нічого таємного. Якщо в рядку трапиться параметр, якого
 * ми не знаємо, — не викидаємо його мовчки, а чесно вертаємось до старого
 * способу; на цей випадок увесь вивід проціджується через `redact`.
 */
const PG_PARAMS = { sslmode: "PGSSLMODE", options: "PGOPTIONS", connect_timeout: "PGCONNECT_TIMEOUT", application_name: "PGAPPNAME" };
function pgEnvFrom(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
  const env = {};
  if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname);
  if (u.port) env.PGPORT = u.port;
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const db = u.pathname.replace(/^\//, "");
  if (db) env.PGDATABASE = decodeURIComponent(db);
  for (const [k, v] of u.searchParams) {
    const name = PG_PARAMS[k];
    if (!name) return null; // незнайомий параметр — краще старий шлях, ніж тихо його загубити
    env[name] = v;
  }
  return env.PGHOST ? env : null;
}
const redact = (text) => String(text ?? "").replace(/postgres(ql)?:\/\/\S+/gi, "postgres://«приховано»");

const pgEnv = pgEnvFrom(dbUrl);
const psqlArgs = ["-X", "-v", "ON_ERROR_STOP=1", "-f", sqlFile];
if (!pgEnv) {
  console.log("Рядок підключення розібрати не вдалось — передаю як є (вивід проціджується).");
  psqlArgs.unshift(dbUrl);
}

try {
  const out = execFileSync(PSQL, psqlArgs, {
    encoding: "utf8",
    env: { ...process.env, ...(pgEnv || {}) },
  });
  console.log(redact(out).trim());
  console.log("✓ Пул оновлено.");
} catch (e) {
  console.error("psql помилка:", redact(e.stdout || e.message));
  process.exit(1);
}
